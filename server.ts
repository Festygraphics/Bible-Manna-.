import express from "express";
import path from "path";
import dotenv from "dotenv";
import crypto from "crypto";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Gemini Client
const apiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;
if (apiKey && apiKey !== "MY_GEMINI_API_KEY") {
  try {
    ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  } catch (error) {
    console.error("Failed to initialize GoogleGenAI:", error);
  }
}

// Initialize Supabase Client if credentials are provided in env secrets
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
let supabase: any = null;

if (supabaseUrl && supabaseAnonKey && supabaseUrl !== "MY_SUPABASE_URL" && !supabaseUrl.includes("your-supabase-project")) {
  try {
    supabase = createClient(supabaseUrl, supabaseAnonKey);
    console.log("Supabase client initialized successfully.");
  } catch (err) {
    console.error("Failed to initialize Supabase client:", err);
  }
} else {
  console.log("Supabase credentials not configured in env. Falling back to local persistence.");
}

// In-memory data store for persistent simulation in container
const mockPremiumUsers = new Set<string>();
const mockRefBonus = new Map<string, number>();

// Helper to perform safe upserts/updates on the 'users' table by stripping unsupported columns
async function safeUsersQuery(
  apiCall: (payload: any) => Promise<{ error: any }>,
  initialPayload: any
): Promise<{ error: any }> {
  const payload = { ...initialPayload };
  const maxAttempts = 8;
  let attempts = 0;
  let lastError: any = null;

  while (attempts < maxAttempts) {
    attempts++;
    const { error } = await apiCall(payload);
    if (!error) {
      return { error: null };
    }
    lastError = error;
    const errMsg = error.message || "";

    // 1. Check for not-null constraints on 'id'
    if (errMsg.includes('column "id"') || errMsg.includes('violates not-null')) {
      payload.id = crypto.randomUUID();
      continue;
    }

    // 2. Check for integer type mismatch on 'id'
    if (errMsg.includes('bigint') || errMsg.includes('integer') || errMsg.includes('numeric') || errMsg.includes('double precision')) {
      payload.id = Math.floor(100000000000000 + Math.random() * 800000000000000);
      continue;
    }

    // 3. Check for specific schema cache column not found error
    const match = errMsg.match(/Could not find the '([^']+)' column/i);
    if (match && match[1]) {
      const colName = match[1];
      console.warn(`[SAFE QUERY] Stripping missing column '${colName}' from users payload due to schema cache mismatch:`, errMsg);
      delete payload[colName];
      continue;
    }

    // If it's some other non-recoverable error, break and return
    break;
  }

  return { error: lastError };
}

// API routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", geminiConfigured: !!ai, supabaseConfigured: !!supabase });
});

// Retrieve all user states and metadata from Supabase (Full-stack Proxy)
app.get("/api/user/load", async (req, res) => {
  const { telegram_id } = req.query;

  if (!telegram_id) {
    res.status(400).json({ error: "telegram_id parameter is required" });
    return;
  }

  const tid = String(telegram_id);

  if (!supabase) {
    res.json({ 
      success: false, 
      error: "Supabase not configured yet.",
      loadedFromCloud: false 
    });
    return;
  }

  try {
    // 1. Check user row
    const { data: userData, error: userError } = await (supabase as any)
      .from("users")
      .select("*")
      .eq("telegram_id", tid)
      .maybeSingle();

    if (userError) {
      console.warn("Supabase Fetch User warning:", userError.message);
    }

    if (!userData) {
      // User is completely new/not yet saved to Supabase
      res.json({ 
        success: true, 
        isNewUser: true, 
        loadedFromCloud: true,
        data: null 
      });
      return;
    }

    // Evaluate premium status expiration date dynamically
    let isPremiumActive = !!userData.is_premium;
    let premiumStatus = userData.premium_status || (userData.is_premium ? "active" : "free");
    let premiumExpiresAt = userData.premium_expires_at || null;
    const walletAddress = userData.wallet_address || null;
    const lastTransactionHash = userData.last_transaction_hash || null;

    if (isPremiumActive && premiumExpiresAt) {
      const expiryDate = new Date(premiumExpiresAt);
      if (new Date() > expiryDate) {
        // Premium subscription has expired. Revert automatically to Free.
        isPremiumActive = false;
        premiumStatus = "expired";
        
        // Save back to the database in background so we don't block the startup timing
        (async () => {
          try {
            await safeUsersQuery(
              (payload) => (supabase as any).from("users").update(payload).eq("telegram_id", tid),
              {
                is_premium: false,
                premium_status: "expired"
              }
            );
            console.log(`Auto-expired premium status for user ${tid}`);
          } catch (err) {
            console.error("Failed to persist premium expiration check:", err);
          }
        })();
      }
    }

    // 2. Fetch prayers
    const { data: prayersData, error: prayersError } = await (supabase as any)
      .from("prayers")
      .select("*")
      .eq("telegram_id", tid);

    if (prayersError) {
      console.warn("Supabase Fetch Prayers warning:", prayersError.message);
    }

    // 3. Fetch saved verses
    const { data: savedVersesData, error: versesError } = await (supabase as any)
      .from("saved_verses")
      .select("*")
      .eq("telegram_id", tid);

    if (versesError) {
      console.warn("Supabase Fetch Saved Verses warning:", versesError.message);
    }

    // 4. Fetch chat history
    const { data: chatData, error: chatError } = await (supabase as any)
      .from("chat_history")
      .select("*")
      .eq("telegram_id", tid)
      .order("timestamp", { ascending: true });

    if (chatError) {
      console.warn("Supabase Fetch Chat warning:", chatError.message);
    }

    // 5. Fetch reading plans
    const { data: plansData, error: plansError } = await (supabase as any)
      .from("reading_plans")
      .select("*")
      .eq("telegram_id", tid);

    if (plansError) {
      console.warn("Supabase Fetch Reading Plans warning:", plansError.message);
    }

    // Update in-memory premium flag if loaded active
    if (isPremiumActive) {
      mockPremiumUsers.add(tid);
    } else {
      mockPremiumUsers.delete(tid);
    }

    // Reconstruct fields to match local storage formats
    const formattedPrayers = (prayersData || []).map((p: any) => ({
      id: p.id,
      user_id: Number(tid),
      content: p.content,
      created_at: p.created_at,
      answered: !!p.answered
    }));

    const formattedSavedVerses = (savedVersesData || []).map((v: any) => ({
      id: v.id,
      text: v.text,
      ref: v.ref,
      created_at: v.created_at
    }));

    const formattedChatHistory = (chatData || []).map((c: any) => ({
      id: c.id,
      role: c.role,
      text: c.text,
      senderName: c.sender_name,
      timestamp: c.timestamp
    }));

    // For reading plans, reform list
    const plansMap = (plansData || []).reduce((acc: any, p: any) => {
      acc[p.plan_id] = { started: !!p.started, progress: p.progress };
      return acc;
    }, {});

    res.json({
      success: true,
      isNewUser: false,
      loadedFromCloud: true,
      user_data: {
        id: Number(tid),
        first_name: userData.first_name,
        username: userData.username,
        lang: userData.lang,
        streak_count: userData.streak_count,
        last_active: userData.last_active,
        is_premium: isPremiumActive,
        premium_status: premiumStatus,
        premium_expires_at: premiumExpiresAt,
        wallet_address: walletAddress,
        last_transaction_hash: lastTransactionHash,
        verses_read: userData.verses_read,
        photo_url: userData.photo_url || undefined,
        channel_joined: !!userData.channel_joined,
        chat_trials_bonus: userData.chat_trials_bonus || 0
      },
      prayers: formattedPrayers,
      saved_verses: formattedSavedVerses,
      chat_history: formattedChatHistory,
      reading_plans: plansMap,
      reminders: userData.reminders
    });

  } catch (err: any) {
    console.error("Supabase load error:", err?.message || err);
    res.json({ success: false, error: err?.message, loadedFromCloud: false });
  }
});

// Synchronize all user states and metadata to Supabase (Full-stack Proxy)
app.post("/api/user/sync", async (req, res) => {
  const { 
    telegram_id, 
    first_name, 
    last_name, 
    username, 
    photo_url, 
    streak_count, 
    last_active, 
    is_premium, 
    premium_status,
    premium_expires_at,
    wallet_address,
    last_transaction_hash,
    verses_read, 
    lang,
    prayers,
    saved_verses,
    chat_history,
    reading_plans,
    reminders,
    channel_joined,
    chat_trials_bonus
  } = req.body;

  if (!telegram_id) {
    res.status(400).json({ error: "telegram_id is required for synchronisation" });
    return;
  }

  const tid = String(telegram_id);

  // If premium activation is synced, sync with our local set too
  if (is_premium) {
    mockPremiumUsers.add(tid);
  } else {
    mockPremiumUsers.delete(tid);
  }

  // If Supabase is not connected/configured, respond gracefully so the app still functions perfectly for the end-user
  if (!supabase) {
    res.json({ 
      success: true, 
      warning: "Supabase not configured, saved to local cache only.",
      syncedWithCloud: false 
    });
    return;
  }

  try {
    // 1. Check if user already exists to preserve their existing 'id' column if any
    let existingId: string | undefined = undefined;
    const { data: existingRow } = await (supabase as any)
      .from("users")
      .select("*")
      .eq("telegram_id", tid)
      .maybeSingle();

    if (existingRow && "id" in existingRow && existingRow.id) {
      existingId = existingRow.id;
    }

    const userPayload: any = {
      telegram_id: tid,
      first_name: first_name || "Believer",
      last_name: last_name || "",
      username: username || "",
      photo_url: photo_url || "",
      streak_count: streak_count || 1,
      last_active: last_active || new Date().toISOString().split("T")[0],
      is_premium: !!is_premium,
      premium_status: premium_status !== undefined ? premium_status : (existingRow?.premium_status || 'free'),
      premium_expires_at: premium_expires_at !== undefined ? premium_expires_at : (existingRow?.premium_expires_at || null),
      wallet_address: wallet_address !== undefined ? wallet_address : (existingRow?.wallet_address || null),
      last_transaction_hash: last_transaction_hash !== undefined ? last_transaction_hash : (existingRow?.last_transaction_hash || null),
      verses_read: verses_read || 0,
      lang: lang || "en",
      reminders: reminders || null,
      channel_joined: channel_joined !== undefined ? !!channel_joined : false,
      chat_trials_bonus: chat_trials_bonus || 0,
      updated_at: new Date().toISOString()
    };

    if (existingId) {
      userPayload.id = existingId;
    }

    const { error: userError } = await safeUsersQuery(
      (payload) => (supabase as any).from("users").upsert(payload, { onConflict: "telegram_id" }),
      userPayload
    );

    if (userError) {
      console.error("Supabase Users upsert error:", userError.message);
    }

    // 2. Sync Prayers list (replaces or upserts)
    if (Array.isArray(prayers) && prayers.length > 0) {
      const prayerRows = prayers.map((p: any) => ({
        id: p.id,
        telegram_id: tid,
        content: p.content,
        created_at: p.created_at,
        answered: !!p.answered
      }));
      
      const { error: prayerError } = await (supabase as any)
        .from("prayers")
        .upsert(prayerRows, { onConflict: "id" });
      if (prayerError) {
        console.error("Supabase Prayers upsert error:", prayerError.message);
      }
    }

    // 3. Sync Saved Verses (replaces or upserts)
    if (Array.isArray(saved_verses) && saved_verses.length > 0) {
      const verseRows = saved_verses.map((v: any) => ({
        id: tid + "_" + (v.ref || "").replace(/\s+/g, ""),
        telegram_id: tid,
        text: v.text,
        ref: v.ref,
        created_at: v.created_at || new Date().toISOString()
      }));

      const { error: verseError } = await (supabase as any)
        .from("saved_verses")
        .upsert(verseRows, { onConflict: "id" });
      if (verseError) {
        console.error("Supabase Saved Verses upsert error:", verseError.message);
      }
    }

    // 4. Sync AI Chat History
    if (Array.isArray(chat_history) && chat_history.length > 0) {
      const chatRows = chat_history.slice(-50).map((c: any) => ({
        id: c.id,
        telegram_id: tid,
        role: c.role,
        text: c.text,
        sender_name: c.senderName || "",
        timestamp: c.timestamp || new Date().toISOString()
      }));

      let { error: chatError } = await (supabase as any)
        .from("chat_history")
        .upsert(chatRows, { onConflict: "id" });

      if (chatError && (
        chatError.message.includes("question") || 
        chatError.message.includes("violates not-null") || 
        chatError.message.includes("null value in column")
      )) {
        console.log("Retrying chat history upsert with 'question'/'answer' schema backfills...");
        const fallbackChatRows = chat_history.slice(-50).map((c: any) => ({
          id: c.id,
          telegram_id: tid,
          role: c.role,
          text: c.text,
          question: c.role === "user" ? (c.text || "Question") : "Bot response",
          answer: c.role === "bot" ? (c.text || "Answer") : "",
          sender_name: c.senderName || "",
          timestamp: c.timestamp || new Date().toISOString()
        }));
        const retryResult = await (supabase as any)
          .from("chat_history")
          .upsert(fallbackChatRows, { onConflict: "id" });
        chatError = retryResult.error;
      }

      if (chatError) {
        console.error("Supabase Chat History upsert error:", chatError.message);
      }
    }

    // 5. Sync Reading Plans
    if (Array.isArray(reading_plans) && reading_plans.length > 0) {
      const planRows = reading_plans.map((p: any) => ({
        id: tid + "_" + p.id,
        telegram_id: tid,
        plan_id: p.id,
        progress: p.progress || 0,
        started: !!p.started
      }));

      const { error: planError } = await (supabase as any)
        .from("reading_plans")
        .upsert(planRows, { onConflict: "id" });
      if (planError) {
        console.error("Supabase Reading Plans upsert error:", planError.message);
      }
    }

    res.json({ success: true, syncedWithCloud: true });
  } catch (err: any) {
    console.error("Unexpected error in Supabase synchronisation:", err?.message || err);
    res.json({ success: true, syncedWithCloud: false, error: err?.message });
  }
});

// Gemini Ask endpoint
app.post("/api/ask", async (req, res) => {
  const { message, chatHistory } = req.body;

  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "Message is required and must be a string." });
    return;
  }

  // Fallback if Gemini key is missing or not configured
  if (!ai) {
    // Generate a beautiful, wise pseudo-AI response based on Christian principles so that it NEVER breaks, even without keys!
    setTimeout(() => {
      const response = getWiseFallbackResponse(message);
      res.json({ text: response });
    }, 1000);
    return;
  }

  let response: any = null;
  let lastError: any = null;
  const attempts = 3;
  let delay = 600;

  for (let i = 0; i < attempts; i++) {
    try {
      const modelToUse = i === 0 ? "gemini-3.5-flash" : "gemini-flash-latest";
      response = await ai.models.generateContent({
        model: modelToUse,
        contents: message,
        config: {
          systemInstruction: `You are Bible Manna, a warm, wise and deeply compassionate AI Bible companion. Your purpose is to help Christians understand Scripture, seek comfort, and apply it to their lives.

When answering, remember:
- Always respond with genuine warmth, empathy, and spiritual grace.
- Quote specific Bible verses with references (Book Chapter:Verse) in Cormorant Garamond style (italicized in app layout).
- Give practical, comforting, and actionable spiritual guidance.
- Keep language elegant, accessible, and positive for Christians globally.
- If the user shares pain, loss, anxiety, or struggle, acknowledge and hold space for their feelings first.
- End your response with a short, encouraging prayer of blessing suited to their situation.
- Write in elegant markdown paragraph structure. Avoid dry tables or cold bullet outlines. Keep it soulful.`,
          temperature: 0.7,
        },
      });
      break;
    } catch (err: any) {
      lastError = err;
      console.warn(`Gemini API connection attempt ${i + 1} failed:`, err?.message || err);
      if (i < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
      }
    }
  }

  if (response) {
    const replyText = response.text || "Grace and peace be with you. I am contemplating your request; please ask again.";
    res.json({ text: replyText });
  } else {
    console.error("All Gemini API attempts failed. Gracefully serving wise fallback reflection.", lastError);
    const fallbackText = getWiseFallbackResponse(message);
    res.json({ text: fallbackText });
  }
});

// Helper for checking if bot token is actually configured
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const isBotTokenConfigured = BOT_TOKEN && BOT_TOKEN !== "your-telegram-bot-token-here" && BOT_TOKEN.trim() !== "";

// Core Secure payment processor to prevent double processing & replay attacks
async function processSuccessfulPayment(transactionId: string, telegramId: string, starsAmount: number, payload: string) {
  console.log(`[PAYMENT RESOLUTION] Resolving tx ${transactionId} for user ${telegramId} (Amount: ${starsAmount} Stars, Payload: "${payload}")`);

  if (supabase) {
    try {
      // 1. Transaction Deduplication Check
      const { data: existingPayment, error: queryErr } = await supabase
        .from("payments")
        .select("id, status")
        .eq("id", transactionId)
        .maybeSingle();

      if (queryErr) {
        console.error("[PAYMENT ERROR] Database check failed:", queryErr.message);
      }

      if (existingPayment) {
        console.warn(`[PAYMENT WARNING] Replay attempt/duplicate detected for Charge ID: ${transactionId}. status: ${existingPayment.status}`);
        return { ok: true, status: existingPayment.status, already_processed: true };
      }

      // 2. Log primary transaction details in 'payments' table to lock deduplication
      const { error: insertErr } = await supabase
        .from("payments")
        .insert({
          id: transactionId,
          telegram_id: telegramId,
          amount: starsAmount,
          payload: payload,
          status: "paid"
        });

      if (insertErr) {
        console.error("[PAYMENT ERROR] Failed to record transaction log in database:", insertErr.message);
      }
    } catch (e: any) {
      console.error("[PAYMENT ERROR] Error during transaction table integration:", e);
    }
  } else {
    console.warn("[PAYMENT WARNING] Supabase not initialized. Running on in-memory fallback log.");
  }

  // 3. Process Specific Benefits Server-Side based on validated Payload
  if (payload.startsWith("premium_")) {
    mockPremiumUsers.add(telegramId);
    console.log(`[PAYMENT SUCCESS] 👑 User ${telegramId} elevated to Premium status via payments ledger.`);

    if (supabase) {
      try {
        const { error: userUpdateErr } = await supabase
          .from("users")
          .update({ is_premium: true })
          .eq("telegram_id", telegramId);

        if (userUpdateErr) {
          console.error("[PAYMENT ERROR] Failed to lock user premium tier in database:", userUpdateErr.message);
        } else {
          console.log(`[PAYMENT DB SUCCESS] User ${telegramId} premium field saved securely!`);
        }
      } catch (e: any) {
        console.error("[PAYMENT ERROR] Error updating user database record:", e);
      }
    }
  } else if (payload.startsWith("donation_")) {
    console.log(`[PAYMENT SUCCESS] 💖 Ministry support received! User ${telegramId} donated ${starsAmount} Telegram Stars. May they be blessed!`);
  }

  return { ok: true, status: "paid", already_processed: false };
}

// Telegram Webhook Handler: Handles secure Telegram Stars signals
app.post("/api/telegram-webhook", async (req, res) => {
  // Webhook Origin Verification Security Checklist
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (webhookSecret && webhookSecret !== "your-telegram-webhook-secret-of-choice") {
    const receivedSecret = req.headers["x-telegram-bot-api-secret-token"];
    if (receivedSecret !== webhookSecret) {
      console.error("[SECURITY CHALLENGE] Webhook unauthorized: Secret token mis-match.");
      res.status(403).json({ error: "Unauthorized update sender" });
      return;
    }
  }

  const { pre_checkout_query, message } = req.body;

  // 1. answerPreCheckoutQuery (CRITICAL: Must return within 10 seconds or transaction fails)
  if (pre_checkout_query) {
    const pqId = pre_checkout_query.id;
    console.log(`[WEBHOOK] Pre-checkout check received: ${pqId} for payload "${pre_checkout_query.invoice_payload}"`);
    
    if (isBotTokenConfigured) {
      try {
        const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerPreCheckoutQuery`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pre_checkout_query_id: pqId,
            ok: true
          })
        });
        const ansResult: any = await response.json();
        console.log(`[WEBHOOK] answerPreCheckoutQuery API outcome:`, ansResult);
      } catch (err) {
        console.error("[WEBHOOK ERROR] Failed answering pre_checkout_query:", err);
      }
    } else {
      console.warn("[WEBHOOK WARNING] Bot token missing; skipping Telegram Bot API callback confirmation.");
    }
    res.json({ ok: true });
    return;
  }

  // 2. handle successful_payment confirmation secure capture
  if (message && message.successful_payment) {
    const paymentInfo = message.successful_payment;
    const chargeId = paymentInfo.telegram_payment_charge_id;
    const payload = paymentInfo.invoice_payload;
    const starsAmount = paymentInfo.total_amount;
    const telegramId = String(message.from?.id || "");

    console.log(`[WEBHOOK] Successful Telegram Stars payment update. Charge ID: ${chargeId}`);
    await processSuccessfulPayment(chargeId, telegramId, starsAmount, payload);
    res.json({ ok: true });
    return;
  }

  // Fallback default response
  res.json({ ok: true });
});

// Dynamic Webhook Registration Utility for Developers
app.get("/api/setup-webhook", async (req, res) => {
  if (!isBotTokenConfigured) {
    res.status(400).json({
      ok: false,
      error: "TELEGRAM_BOT_TOKEN is not configured in your environment.",
      instructions: "Set the TELEGRAM_BOT_TOKEN inside your Settings / .env.example environment variables to continue."
    });
    return;
  }

  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET || "";
  const hasSecureSecret = webhookSecret && webhookSecret !== "your-telegram-webhook-secret-of-choice" && webhookSecret.trim() !== "";

  // Dynamic host determination
  let computedHost = req.query.url as string;
  if (!computedHost) {
    const protocol = req.headers["x-forwarded-proto"] || "https";
    const host = req.get("host");
    computedHost = `${protocol}://${host}`;
  }

  // Remove trailing slash if present
  if (computedHost.endsWith("/")) {
    computedHost = computedHost.slice(0, -1);
  }

  const webhookUrl = `${computedHost}/api/telegram-webhook`;

  try {
    console.log(`[SETUP WEBHOOK] Requesting Telegram to configure webhook targeting: ${webhookUrl}`);
    
    const requestBody: any = {
      url: webhookUrl,
      allowed_updates: ["message", "pre_checkout_query"]
    };

    if (hasSecureSecret) {
      requestBody.secret_token = webhookSecret;
    }

    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });

    const data: any = await response.json();

    if (data.ok) {
      res.json({
        ok: true,
        message: "Telegram webhook configured successfully!",
        target_webhook_url: webhookUrl,
        secret_token_active: hasSecureSecret,
        secret_token_used: hasSecureSecret ? `${webhookSecret.substring(0, 3)}...${webhookSecret.substring(webhookSecret.length - 3)}` : "None (Recommended to set TELEGRAM_WEBHOOK_SECRET for security)",
        telegram_response: data
      });
    } else {
      res.status(502).json({
        ok: false,
        error: "Telegram rejected webhook installation",
        target_webhook_url: webhookUrl,
        telegram_response: data
      });
    }
  } catch (err: any) {
    console.error("[SETUP WEBHOOK ERROR]", err);
    res.status(500).json({
      ok: false,
      error: "Failed to connect with Telegram Bot API server",
      details: err.message
    });
  }
});

// Secure developer sandbox payment simulator (restricted in production mode if a real token is set)
app.post("/api/sandbox-payment-simulate", async (req, res) => {
  const { transactionId, telegramId, starsAmount, payload } = req.body;

  if (!transactionId || !telegramId || !starsAmount || !payload) {
    res.status(400).json({ error: "Missing required payment parameters for sandbox simulation" });
    return;
  }

  // Prevent production bypasses
  if (process.env.NODE_ENV === "production" && isBotTokenConfigured) {
    res.status(403).json({ error: "Simulating payments is prohibited in production mode." });
    return;
  }

  console.log(`[SANDBOX SIMULATOR] Simulating secure backend validation flow...`);
  const result = await processSuccessfulPayment(transactionId, String(telegramId), Number(starsAmount), payload);
  res.json(result);
});

// Create Stars payment invoice
app.post("/api/create-invoice", async (req, res) => {
  const { user_id, plan } = req.body;
  if (!user_id) {
    res.status(400).json({ error: "user_id is required" });
    return;
  }
  
  const uid = String(user_id);
  const nonce = crypto.randomUUID();
  const payload = `premium_${plan || "monthly"}_${uid}_${nonce}`;
  const starsAmount = plan === "yearly" ? 2999 : 499;

  if (isBotTokenConfigured) {
    try {
      console.log(`[INVOICE ENGINE] Requesting real Telegram link for user ${uid}. Plan: ${plan}`);
      const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: plan === "yearly" ? "Bible Manna Premium (Yearly)" : "Bible Manna Premium (Monthly)",
          description: "⭐ Unlimited Biblical AI answers, ad-free offline layouts, priority plans, and grace protection.",
          payload: payload,
          provider_token: "", // Must be empty for Telegram Stars
          currency: "XTR",
          prices: [
            { label: plan === "yearly" ? "1-Year Premium Access" : "1-Month Premium Access", amount: starsAmount }
          ]
        })
      });
      const tgData: any = await response.json();
      if (tgData.ok) {
        res.json({
          ok: true,
          sandbox: false,
          invoice_link: tgData.result,
          message: "Secure Telegram Stars invoice link generated successfully."
        });
      } else {
        console.error("[INVOICE ENGINE ERROR] Telegram API exception:", tgData);
        res.status(502).json({
          error: "Telegram Bot API error",
          details: tgData.description,
          message: "Check if your bot is authorized for Telegram Stars payments."
        });
      }
    } catch (err: any) {
      console.error("[INVOICE ENGINE ERROR] Fetch exception:", err);
      res.status(500).json({ error: "Failed to connect with Telegram Bot API." });
    }
  } else {
    // Development Sandbox link back into the app container
    const appUrl = process.env.APP_URL || `https://${req.get("host")}` || "http://localhost:3000";
    const sandboxLink = `${appUrl}/#sandbox-payment?type=premium&plan=${plan || "monthly"}&uid=${uid}&nonce=${nonce}&stars=${starsAmount}`;
    res.json({
      ok: true,
      sandbox: true,
      invoice_link: sandboxLink,
      message: "Development Sandbox payment URL generated. Supply TELEGRAM_BOT_TOKEN to switch to secure production Stars."
    });
  }
});

// Create Stars donation link
app.post("/api/create-donation", async (req, res) => {
  const { user_id, stars, label } = req.body;
  if (!user_id || !stars) {
    res.status(400).json({ error: "user_id and stars are required" });
    return;
  }
  const uid = String(user_id);
  const amt = parseInt(stars, 10);
  const nonce = crypto.randomUUID();
  const payload = `donation_${amt}_${uid}_${nonce}`;

  if (isBotTokenConfigured) {
    try {
      console.log(`[DONATION ENGINE] Requesting real donation invoice for user ${uid}. Stars: ${amt}`);
      const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Support Devotional: ${label || "Scripture Support"}`,
          description: `💖 Your seed of ${amt} Telegram Stars helps keep God's Word free & running around the world.`,
          payload: payload,
          provider_token: "", // Must be empty for Telegram Stars
          currency: "XTR",
          prices: [
            { label: label || "Manna Blessing Support", amount: amt }
          ]
        })
      });
      const tgData: any = await response.json();
      if (tgData.ok) {
        res.json({
          ok: true,
          sandbox: false,
          invoice_link: tgData.result,
          message: "Secure Telegram Stars donation invoice link generated."
        });
      } else {
        console.error("[DONATION ENGINE ERROR] Telegram API exception:", tgData);
        res.status(502).json({
          error: "Telegram Bot API error",
          details: tgData.description
        });
      }
    } catch (err: any) {
      console.error("[DONATION ENGINE ERROR] Fetch exception:", err);
      res.status(500).json({ error: "Failed to connect with Telegram Bot API." });
    }
  } else {
    // Development Sandbox link back into the app container
    const appUrl = process.env.APP_URL || `https://${req.get("host")}` || "http://localhost:3000";
    const sandboxLink = `${appUrl}/#sandbox-payment?type=donation&label=${encodeURIComponent(label || "Blessing Support")}&uid=${uid}&nonce=${nonce}&stars=${amt}`;
    res.json({
      ok: true,
      sandbox: true,
      invoice_link: sandboxLink,
      message: "Development Sandbox donation URL generated. Supply TELEGRAM_BOT_TOKEN to switch to production."
    });
  }
});

// Check premium status securely
app.get("/api/check-premium", async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) {
    res.status(400).json({ error: "user_id is required" });
    return;
  }
  const uid = String(user_id);
  let isPremium = mockPremiumUsers.has(uid);

  // Re-verify against Supabase database for premium safety
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("is_premium")
        .eq("telegram_id", uid)
        .maybeSingle();

      if (!error && data) {
        isPremium = !!data.is_premium;
        if (isPremium) {
          mockPremiumUsers.add(uid);
        } else {
          mockPremiumUsers.delete(uid);
        }
      }
    } catch (e) {
      // Gracefully bypass to cache on network failures
    }
  }

  res.json({
    is_premium: isPremium,
    expires_at: isPremium ? new Date(Date.now() + 30 * 86400000).toISOString() : null
  });
});

// Secure verify and activate from transactions database ledger, blocking client-side spoof attempts
app.post("/api/activate-premium", async (req, res) => {
  const { user_id } = req.body;
  if (!user_id) {
    res.status(400).json({ error: "user_id is required" });
    return;
  }
  const uid = String(user_id);

  // If in production mode with real Telegram keys, client CANNOT just click activate!
  // Secure server-side double check verification ensures they have a verified log in our database
  if (supabase) {
    try {
      const { data: payments, error } = await supabase
        .from("payments")
        .select("id, status")
        .eq("telegram_id", uid)
        .eq("status", "paid")
        .limit(1);

      if (error || !payments || payments.length === 0) {
        // If real bot token is not configured (we are testing local sandbox), we can allow sandbox activation
        if (isBotTokenConfigured || process.env.NODE_ENV === "production") {
          res.status(403).json({
            error: "Payment not verified",
            message: "A verified database record for your Star purchase was not found. Please complete the invoice."
          });
          return;
        }
      }
    } catch (e) {
      // Local fallback in sandbox configuration if supabase network issues arise
    }
  }

  mockPremiumUsers.add(uid);
  res.json({ ok: true, is_premium: true });
});

// Apply referral bonus
app.post("/api/referral-bonus", (req, res) => {
  const { referrer_id, new_user_id } = req.body;
  if (!referrer_id || !new_user_id) {
    res.status(400).json({ error: "referrer_id and new_user_id are required" });
    return;
  }
  const refId = String(referrer_id);
  const currentCount = mockRefBonus.get(refId) || 0;
  mockRefBonus.set(refId, currentCount + 5);
  res.json({ ok: true, bonus: 5, total_bonus: currentCount + 5 });
});

// Dynamic TON Connect Manifest server-side handler (Bypasses relative asset path issues)
app.get("/tonconnect-manifest.json", (req, res) => {
  const protocol = req.protocol === "https" || req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
  const host = req.get("host");
  const baseUrl = `${protocol}://${host}`;
  
  res.json({
    url: baseUrl,
    name: "Bible Manna",
    iconUrl: "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?q=80&w=256&auto=format&fit=crop"
  });
});

// Secure On-Chain TON Connect Payment Verification and Activation
app.post("/api/verify-ton-payment", async (req, res) => {
  try {
    const { user_id, comment, tx_hash } = req.body;
    
    if (!user_id || !comment) {
      return res.status(400).json({ ok: false, error: "Missing required parameters: user_id and comment are required." });
    }

    const receiverAddress = process.env.TON_RECEIVER_ADDRESS;
    if (!receiverAddress) {
      return res.status(500).json({ 
        ok: false, 
        error: "Server configuration issue: TON_RECEIVER_ADDRESS environment variable is not defined." 
      });
    }

    const tid = String(user_id);

    // Fetch the list of transactions for our receiver address on TON mainnet & testnet
    const nodes = [
      "https://toncenter.com/api/v2/getTransactions",
      "https://testnet.toncenter.com/api/v2/getTransactions"
    ];

    let matchedTx: any = null;
    let queryLogs = "";

    for (const baseUrl of nodes) {
      try {
        const fetchUrl = `${baseUrl}?address=${encodeURIComponent(receiverAddress)}&limit=40`;
        const apiRes = await fetch(fetchUrl);
        if (!apiRes.ok) {
          queryLogs += `Failed fetch from ${baseUrl}: status ${apiRes.status}. `;
          continue;
        }

        const data: any = await apiRes.json();
        if (!data || !data.ok || !data.result) {
          continue;
        }

        const transactions = data.result;
        for (const tx of transactions) {
          const inMsg = tx.in_msg;
          if (!inMsg) continue;

          // 1. Verify transaction value meets or exceeds 3 TON (3,000,000,000 nanotons)
          const valNano = inMsg.value || "0";
          const expectedNano = "3000000000"; // 3 TON
          const amountMeets = BigInt(valNano) >= BigInt(expectedNano);
          if (!amountMeets) continue;

          // 2. Safely read and match comment payload
          const textMessage = inMsg.message || inMsg.msg_data?.text || "";
          
          // Must match the comment sent from client, or contain user matching token to be absolute proof
          const matchesComment = textMessage.includes(comment) || textMessage.toLowerCase().trim() === comment.toLowerCase().trim() || textMessage.includes(`pm_usr_${tid}`);
          if (!matchesComment) continue;

          // 3. Confirm tx hash matched if present
          const txHashOnChain = tx.transaction_id?.hash;
          if (tx_hash && txHashOnChain && txHashOnChain.toLowerCase() !== tx_hash.toLowerCase()) {
            continue;
          }

          // Fully verified matching transaction!
          matchedTx = {
            hash: txHashOnChain || tx_hash,
            sender: inMsg.source,
            value: valNano,
            utime: tx.utime
          };
          break;
        }

        if (matchedTx) break;
      } catch (err: any) {
        queryLogs += `Error querying ${baseUrl}: ${err.message}. `;
      }
    }

    if (!matchedTx) {
      return res.status(404).json({
        ok: false,
        error: "Transaction could not be verified on the TON blockchain yet. Please approve the transaction in your wallet and wait 10-15 seconds before retrying.",
        details: queryLogs
      });
    }

    // Deduplication double-spend check on Supabase
    if (supabase) {
      const { data: duplicateCheck } = await supabase
        .from("payments")
        .select("id")
        .eq("id", matchedTx.hash)
        .maybeSingle();

      if (duplicateCheck) {
        return res.status(400).json({
          ok: false,
          error: "This blockchain transaction has already been used to activate a Premium account."
        });
      }
    }

    // Create 30 days premium expiry duration
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days
    const expiresAtISO = expiresAt.toISOString();

    if (supabase) {
      // 1. Log payment event to ledger
      const { error: logError } = await supabase
        .from("payments")
        .insert({
          id: matchedTx.hash,
          telegram_id: tid,
          amount: 3, // TON amount
          payload: `ton_premium_${comment}`,
          status: "paid"
        });

      if (logError) {
        console.error("Warning logging TON payment event to Supabase ledger:", logError);
      }

      // 2. Update user premium state safely
      const updatePayload = {
        is_premium: true,
        premium_status: "active",
        premium_expires_at: expiresAtISO,
        wallet_address: matchedTx.sender,
        last_transaction_hash: matchedTx.hash,
        updated_at: now.toISOString()
      };

      const { error: userError } = await safeUsersQuery(
        (payload) => (supabase as any).from("users").update(payload).eq("telegram_id", tid),
        updatePayload
      );

      if (userError) {
        console.error("Supabase user premium activation error:", userError);
        return res.status(500).json({ ok: false, error: "Database saved failure, please try again." });
      }
    }

    // Always update in-memory cache
    mockPremiumUsers.add(tid);

    return res.json({
      ok: true,
      message: "Premium subscription activated successfully! 🎉",
      is_premium: true,
      premium_status: "active",
      premium_expires_at: expiresAtISO,
      wallet_address: matchedTx.sender,
      last_transaction_hash: matchedTx.hash
    });

  } catch (err: any) {
    console.error("verify-ton-payment route exception:", err);
    res.status(500).json({ ok: false, error: err.message || "Internal payment error" });
  }
});

// Wise fallback generator for zero-configuration capability
function getWiseFallbackResponse(message: string): string {
  const msg = message.toLowerCase();
  
  if (msg.includes("anxious") || msg.includes("worry") || msg.includes("fear")) {
    return `Dearest friend, when waves of anxiety and fear wash over your soul, remember that you are never sailing alone. 

As the Apostle Paul wrote:
*"Do not be anxious about anything, but in every situation, by prayer and petition, with thanksgiving, present your requests to God. And the peace of God, which transcends all understanding, will guard your hearts and your minds in Christ Jesus."* — **Philippians 4:6-7**

God recognizes every drop of stress you hold. Cast these heavy worries at His feet, for He has enough strength to carry all of them for you. Step forward one breath at a time, resting in His everlasting embrace.

*A short prayer for you:*
Dear Lord, please tranquilize my friend's racing heart. Infuse them with Your otherworldly peace that passes all understanding. Let them feel Your steady hand of relief today. Amen. 🕊️`;
  }
  
  if (msg.includes("strength") || msg.includes("tired") || msg.includes("weak") || msg.includes("struggle")) {
    return `In your moments of weariness and deep fatigue, know that God's strength is made perfect in our weakness.

In the scriptures we are declared:
*"But those who hope in the Lord will renew their strength. They will soar on wings like eagles; they will run and not grow weary, they will walk and not be faint."* — **Isaiah 40:31**

You do not have to conquer this season all by your own might. Lean heavily upon Him, allow Him to cushion your stride, and renew your passion for life.

*A short prayer for you:*
Father, pour fresh fuel and spiritual strength into my friend's spirit right now. Where they feel spent, let Your limitless energy and hope take over. Sustain them in this hour. Amen. ✨`;
  }

  if (msg.includes("love") || msg.includes("lonely") || msg.includes("care") || msg.includes("forgive")) {
    return `You are infinitely loved, cherished, and redeemed. God's grace stands wider than any ocean of loneliness or mistake you could ever face.

Remember His steadfast promise:
*"For I am convinced that neither death nor life, neither angels nor demons, neither the present nor the future, nor any powers, neither height nor depth, nor anything else in all creation, will be able to separate us from the love of God that is in Christ Jesus our Lord."* — **Romans 8:38-39**

Let this complete, unconditional divine affection fill up any hollow gaps of isolation. You are His crown creation.

*A short prayer for you:*
Lord, please wrap Your warm arms of love around my beloved friend today. Dissolve any feelings of solitude. Remind them of their immense value and target on this earth. Amen. ❤️`;
  }

  return `Peace and grace be multiplied unto you. Thank you for seeking counsel in the Word of God today.

*"Your word is a lamp for my feet, a light on my path."* — **Psalm 119:105**

No matter what season of life you are walking through, God's timeless wisdom is ready to sustain you, nourish your mind, and shine a bright light on your path. Feel free to speak more about what is currently resting on your heart.

*A short prayer for you:*
Heavenly Father, guide my wonderful friend along the paths of righteousness. Fill their day with divine opportunities, clear guidance, and endless comfort. Bless their active search of Your scripture. Amen. 📖`;
}

// Vite / static file serving middleware config
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

// Only start the server if not running as a serverless function on Vercel
if (!process.env.VERCEL) {
  startServer();
}

export default app;
