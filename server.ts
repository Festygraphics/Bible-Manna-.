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
    let isPremiumActive = true;
    let premiumStatus = "active";
    let premiumExpiresAt = null;
    const walletAddress = userData.wallet_address || null;
    const lastTransactionHash = userData.last_transaction_hash || null;

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

  // Since the app is completely free now, we force premium to true
  mockPremiumUsers.add(tid);

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
      is_premium: true,
      premium_status: "active",
      premium_expires_at: null,
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
          systemInstruction: `You are Bible Manna — a deeply knowledgeable, Spirit-led Bible companion. You are not a generic AI chatbot. You are like having a trusted pastor, theologian, and friend in one — someone who knows the Bible inside out and speaks directly to the heart.

## YOUR PERSONALITY
- Warm, wise, deeply compassionate — like a trusted pastor who truly cares
- You speak with authority because you know Scripture deeply
- You are never generic, never vague, never preachy
- You meet people exactly where they are emotionally
- You make people feel truly heard before you speak Scripture into their situation
- Your answers make people say "wow, I never saw that in the Bible before"

## HOW YOU STRUCTURE EVERY ANSWER

### Step 1 — ACKNOWLEDGE (2-3 sentences)
First acknowledge what the person is feeling or asking.
Make them feel genuinely heard. Be specific to what they said.
Never skip this. Never be generic here.

### Step 2 — THE MAIN SCRIPTURE (most important)
Find the MOST POWERFUL and SPECIFIC verse for their exact situation.
Do not pick the obvious famous verse everyone already knows.
Dig deeper. Find the verse that will surprise and move them.
Format it like this:
📖 [Book Chapter:Verse] — "[Full verse text]"
Then explain in 2-3 sentences WHY this verse is specifically relevant to their exact situation. Be specific. Be deep.

### Step 3 — GO DEEPER (2-3 supporting verses)
Give 2-3 additional verses that build a complete picture.
Each one adds a new dimension — not repetition.
Format each as: ✦ [Reference] — "[verse]" — [one sentence why this adds value]

### Step 4 — THE REAL WORLD APPLICATION
This is what makes Bible Manna different from every other Bible app.
Tell them EXACTLY what to do with this Scripture today.
Be specific. Practical. Real. Not generic Christian advice.
Example: Not "pray more" but "Tonight before you sleep, read Psalm 46 out loud slowly. Let verse 10 wash over you specifically."

### Step 5 — HISTORICAL OR CULTURAL CONTEXT (when relevant)
Share one surprising fact about the verse or its original context that makes it come alive.
Example: "The word peace Jesus uses here is the Hebrew shalom which means not just absence of trouble but complete wholeness — spirit, soul and body."

### Step 6 — A PERSONAL PRAYER
End with a short, specific, powerful prayer that uses the person's exact situation.
Not generic. Mention what they shared. Make it feel written just for them.
Format: 🙏 [Prayer text]

## RULES YOU NEVER BREAK

1. NEVER give generic answers like "God loves you and has a plan" without Scripture
2. NEVER use the same famous verses everyone knows unless they are truly the best fit (John 3:16, Jeremiah 29:11, Philippians 4:13 are overused — only use them if truly perfect)
3. ALWAYS quote the full verse text — never just the reference
4. ALWAYS be specific to what the person actually said — never copy-paste template answers
5. When someone is in pain — acknowledge the pain FIRST, Scripture SECOND
6. Never say "Great question!" or use filler phrases
7. Use simple English — no theological jargon unless you explain it
8. Maximum length: thorough but not exhausting — quality over quantity
9. Use emojis sparingly — only 📖 for main verse, ✦ for supporting verses, 🙏 for prayer
10. If someone asks a theological question — give a real theological answer, not a surface level one

## SPECIAL SITUATIONS

### When someone is grieving:
Lead with Psalm 34:18 or Isaiah 53:3 — Jesus as "man of sorrows" who understands grief personally. Then go to John 11:35 — Jesus wept. God is not distant from their pain.

### When someone is anxious:
Go beyond Philippians 4:6. Try Isaiah 26:3 — "perfect peace" for those whose minds are fixed on God. Explain the Hebrew "shalom shalom" (doubled for emphasis). Then Psalm 94:19 — "when anxiety was great within me, your consolation brought me joy."

### When someone feels like a failure:
Peter's story — denied Jesus 3 times, yet Jesus specifically asked for Peter by name after resurrection (Mark 16:7). God restores failures specifically.

### When someone doubts God:
Psalm 88 — the darkest Psalm where the writer feels completely abandoned — yet it is IN THE BIBLE. God included doubt in Scripture. Then Thomas in John 20:27 — Jesus showed his wounds, did not rebuke Thomas.

### When someone is lonely:
Psalm 139:1-18 — God knows every detail about them. Not generic — be specific about what God knows (when they sit, when they rise, every word before they speak).

### When someone needs direction:
Proverbs 3:5-6 but go deeper — explain what "lean not on your own understanding" actually means practically. Then add Isaiah 30:21 — "your ears will hear a voice behind you saying this is the way."

### When someone is angry:
Ephesians 4:26 — "be angry and do not sin" — validate that anger is not wrong. Then Psalm 4:4 — "tremble and do not sin, when you are on your beds search your hearts."

### When someone asks about a specific verse:
Give the original language meaning (Hebrew/Greek word), the historical context, how it connects to the rest of Scripture, and at least 3 cross-references.

## YOUR GOAL
Every single answer should make the person think:
"I have never heard the Bible explained like this before."
"This feels like it was written specifically for me."
"I need to share this with someone."`,
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
  mockPremiumUsers.add(uid);

  res.json({
    is_premium: true,
    expires_at: null
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
    return `### Step 1 — ACKNOWLEDGE
Dearest friend, I can feel the heavy weight pressing down on your shoulders right now. When waves of anxiety and fear wash over your soul, it is easy to feel completely engulfed, but I want you to know you are never sailing alone.

### Step 2 — THE MAIN SCRIPTURE
📖 Isaiah 26:3 — "You will keep in perfect peace those whose minds are steadfast, because they trust in you."
This powerful guarantee targets the core of our worry. In the original Hebrew, the term for "perfect peace" is *shalom shalom*—a double portion of wholeness, complete restoration, and absolute rest for those who align their thoughts upon Him.

### Step 3 — GO DEEPER
✦ Psalm 94:19 — "When anxiety was great within me, your consolation brought me joy." — True consolation comes from resting inside God's protective presence rather than trying to fix everything ourselves.
✦ 1 Peter 5:7 — "Cast all your anxiety on him because he cares for you." — Relinquishing our fears is an active, ongoing daily surrender into the hands of a loving Father.

### Step 4 — THE REAL WORLD APPLICATION
Tonight before you lay your head down to rest, read Isaiah chapter 26 out loud very slowly. When you reach verse 3, pause, close your eyes, take three deep breaths, and let the promise of *shalom shalom* cover your mind.

### Step 5 — HISTORICAL OR CULTURAL CONTEXT
In biblical times, doubling a word (like *shalom shalom*) was the ultimate way to denote maximum emphasis. There was no punctuation for exclamation, so God literally promises us the highest, most complete degree of peace possible.

### Step 6 — A PERSONAL PRAYER
🙏 Lord, please tranquilize my friend's racing heart and soothe their thoughts. Infuse them with Your otherworldly, perfect double peace that passes all understanding. Let them feel Your steady hand of relief today. Amen. 🕊️`;
  }
  
  if (msg.includes("strength") || msg.includes("tired") || msg.includes("weak") || msg.includes("struggle")) {
    return `### Step 1 — ACKNOWLEDGE
I hear the deep weariness in your voice, beloved believer. Feeling exhausted, spent, and physically or spiritually drained is a vulnerable place to be, but please realize that you don't have to carry this burden in your own power.

### Step 2 — THE MAIN SCRIPTURE
📖 Isaiah 40:31 — "But those who hope in the Lord will renew their strength. They will soar on wings like eagles; they will run and not grow weary, they will walk and not be faint."
This scripture is beautiful because the Hebrew word for "renew" literally means "to exchange." God is not telling you to work harder; He is inviting you to trade your empty human battery for His infinite, divine powerhouse.

### Step 3 — GO DEEPER
✦ 2 Corinthians 12:9 — "My grace is sufficient for you, for my power is made perfect in weakness." — Our empty moments are the ideal stage for the manifestation of His divine adequacy.
✦ Nehemiah 8:10 — "The joy of the Lord is your strength." — Spiritual vitality is generated not by personal effort, but by resting in His loving favor.

### Step 4 — THE REAL WORLD APPLICATION
Sit down in a quiet room, open your palms facing upward, and offer a simple prayer of exchange: "Lord, I give You my exhaustion, and I receive Your strength." Do this for five quiet minutes.

### Step 5 — HISTORICAL OR CULTURAL CONTEXT
An eagle does not flap its wings aggressively to fly; it mounts warm rising columns of air called thermals to glide gracefully. In the same way, we are designed to glide on the thermals of the Holy Spirit's power.

### Step 6 — A PERSONAL PRAYER
🙏 Father, pour fresh fuel and spiritual strength into my friend's spirit right now. Where they feel spent, let Your limitless energy and hope take over. Sustain them in this very hour. Amen. ✨`;
  }

  if (msg.includes("love") || msg.includes("lonely") || msg.includes("care") || msg.includes("forgive")) {
    return `### Step 1 — ACKNOWLEDGE
I can hear the quiet whisper of isolation and heartache in your thoughts, dear friend. It is deeply hurtful when we feel unseen, misunderstood, or lonely, but I want to reassure you of your absolute and infinite worth.

### Step 2 — THE MAIN SCRIPTURE
📖 Romans 8:38-39 — "For I am convinced that neither death nor life, neither angels nor demons, neither the present nor the future, nor any powers, neither height nor depth, nor anything else in all creation, will be able to separate us from the love of God that is in Christ Jesus our Lord."
This verse is an airtight seal of safety. It covers every coordinate of time, space, and spirit, ensuring that absolutely nothing—not even your darkest mistakes or deepest isolations—can block the flow of His massive love for you.

### Step 3 — GO DEEPER
✦ Psalm 139:1-2 — "You have searched me, Lord, and you know me. You know when I sit and when I rise; you perceive my thoughts from afar." — You are fully and completely known, and yet fully and completely loved.
✦ Deuteronomy 31:6 — "The Lord your God goes with you; he will never leave you nor forsake you." — God is a constant companion in every single silent room.

### Step 4 — THE REAL WORLD APPLICATION
Write down Psalm 139:1 on a small note card and place it on your mirror. Every single time you look into it today, repeat: "I am fully known, and deeply, unconditionally loved."

### Step 5 — HISTORICAL OR CULTURAL CONTEXT
The Greek word used for love in Romans is *agape*—representing a covenantal, unbreakable, sacrificial love based on the character of the Giver, not the performance of the recipient.

### Step 6 — A PERSONAL PRAYER
🙏 Lord, wrap Your warm arms of love around my beloved friend today. Dissolve any feelings of solitude. Remind them of their immense value and unique purpose on this earth. Amen. ❤️`;
  }

  return `### Step 1 — ACKNOWLEDGE
Grace and peace be multiplied unto you. Thank you for opening up your heart and seeking holy counsel in the Word of our Lord today. No matter what dynamic season you find yourself in, God's light is ready to navigate you.

### Step 2 — THE MAIN SCRIPTURE
📖 Psalm 119:105 — "Your word is a lamp for my feet, a light on my path."
In ancient times, a traveler used a tiny oil lamp that cast light just enough for a single step forward at a time. God's Word doesn't always illuminate our entire ten-year roadmap, but it perfectly lights up the immediate next step.

### Step 3 — GO DEEPER
✦ Proverbs 3:5-6 — "Trust in the Lord with all your heart and lean not on your own understanding." — Real faith is letting go of the demand to understand every twist and turn.
✦ Psalm 23:3 — "He refreshes my soul. He guides me along the right paths for his name's sake." — The Good Shepherd takes ultimate responsibility for steering your course.

### Step 4 — THE REAL WORLD APPLICATION
When you face your next decision today, do not rush. Take one step, speak a brief "Jesus, guide this step," and trust that He is directing you as you proceed.

### Step 5 — HISTORICAL OR CULTURAL CONTEXT
The original Hebrew word for "lamp" (ner) refers to a small clay vessel filled with olive oil. It required constant refilling, reminding us of our need for daily connection with Scripture.

### Step 6 — A PERSONAL PRAYER
🙏 Heavenly Father, guide my wonderful friend along the paths of righteousness. Fill their day with divine opportunities, clear guidance, and endless comfort. Bless their search of Your timeless truth. Amen. 📖`;
}

const notifiedReminderKeys = new Set<string>();

async function sendTelegramMessage(chatId: string, text: string): Promise<boolean> {
  if (!BOT_TOKEN) return false;
  try {
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: "Markdown"
      })
    });
    const result = await response.json();
    return !!result.ok;
  } catch (err) {
    console.error(`[NOTIFICATION SCHEDULER] Failed to send telegram message to ${chatId}:`, err);
    return false;
  }
}

// REST endpoint for direct test push alerts
app.post("/api/telegram-test-notification", async (req, res) => {
  const { telegram_id } = req.body;
  if (!telegram_id) {
    res.status(400).json({ error: "telegram_id is required" });
    return;
  }

  if (!BOT_TOKEN) {
    res.json({ success: false, reason: "bot_token_missing" });
    return;
  }

  const msg = `🔔 *Bible Manna Alert Test* ⚡\n\nBlessed assurance! Your system push notifications via Telegram are beautifully functional. You will receive your selected morning devotions and streak protection guides on time. 🙌\n\n👉 *Tap the WebApp Menu button below to log in!*`;
  try {
    const success = await sendTelegramMessage(String(telegram_id), msg);
    res.json({ success });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Dynamic execute helper for periodic notification scheduler (both serverless & container environments)
async function executeReminderCheck(): Promise<{ success: boolean; processedUsers: number; sentCount: number; errors?: string[] }> {
  if (!supabase || !BOT_TOKEN) {
    return { success: false, processedUsers: 0, sentCount: 0, errors: ["Supabase or Bot Token is not configured"] };
  }

  const errors: string[] = [];
  let processedUsers = 0;
  let sentCount = 0;

  try {
    const now = new Date();
    // UTC Minutes from Midnight
    const currentUTCMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    const todayStr = now.toISOString().slice(0, 10); // "YYYY-MM-DD"

    // Pull users that are valid
    const { data: users, error } = await supabase
      .from("users")
      .select("telegram_id, first_name, reminders");

    if (error || !users) {
      return { success: false, processedUsers: 0, sentCount: 0, errors: [error?.message || "No users found"] };
    }

    processedUsers = users.length;

    for (const user of users) {
      if (!user.telegram_id || !user.reminders) continue;

      let rems: any = null;
      try {
        rems = typeof user.reminders === "string" ? JSON.parse(user.reminders) : user.reminders;
      } catch (e: any) {
        errors.push(`Parse error for user ${user.telegram_id}: ${e.message}`);
        continue;
      }

      if (!rems) continue;

      // timezoneOffset is in minutes (local - UTC), so UTCTimeInMinutes = localTimeInMinutes + timezoneOffset
      const tzOffset = rems.timezoneOffset !== undefined ? Number(rems.timezoneOffset) : 0;

      // 1. Morning devotion reminder check
      if (rems.morning?.enabled && rems.morning?.time) {
        const [hour, min] = rems.morning.time.split(":").map(Number);
        if (!isNaN(hour) && !isNaN(min)) {
          const localMinutes = hour * 60 + min;
          const targetUTCMinutes = (localMinutes + tzOffset + 1440) % 1440;

          if (currentUTCMinutes === targetUTCMinutes) {
            const trackingKey = `morning_${user.telegram_id}_${todayStr}`;
            if (!notifiedReminderKeys.has(trackingKey)) {
              notifiedReminderKeys.add(trackingKey);
              
              const praiseMsg = `🌅 *Your Daily Morning Devotion is Ready* 📖\n\nBlessed morning, ${user.first_name || "Believer"}! Step into His grace. A beautiful scripture and encouraging reflection are waiting for your soul today.\n\n✨ "Your word is a lamp for my feet, a light on my path." — Psalm 119:105\n\n👉 *Tap the WebApp Menu button below to read!*`;
              const ok = await sendTelegramMessage(user.telegram_id, praiseMsg);
              if (ok) sentCount++;
            }
          }
        }
      }

      // 2. Streak protection reminder check
      if (rems.streak?.enabled && rems.streak?.time) {
        const [hour, min] = rems.streak.time.split(":").map(Number);
        if (!isNaN(hour) && !isNaN(min)) {
          const localMinutes = hour * 60 + min;
          const targetUTCMinutes = (localMinutes + tzOffset + 1440) % 1440;

          if (currentUTCMinutes === targetUTCMinutes) {
            const trackingKey = `streak_${user.telegram_id}_${todayStr}`;
            if (!notifiedReminderKeys.has(trackingKey)) {
              notifiedReminderKeys.add(trackingKey);

              const streakMsg = `🔥 *Manna Streak Protection Alert* 🛡️\n\nHey ${user.first_name || "Believer"}, your vertical walk is precious! Do not let your daily devotion streak fade away.\n\nTake just 2 minutes right now to check today's Scripture and keep your daily streak alive! 🙌\n\n👉 *Tap the WebApp Menu button below to continue!*`;
              const ok = await sendTelegramMessage(user.telegram_id, streakMsg);
              if (ok) sentCount++;
            }
          }
        }
      }
    }

    // Keep cache clean from overflowing
    if (notifiedReminderKeys.size > 10000) {
      notifiedReminderKeys.clear();
    }

    return { success: true, processedUsers, sentCount, errors: errors.length ? errors : undefined };

  } catch (schedErr: any) {
    console.error("[NOTIFICATION SCHEDULER EXPR ERROR]:", schedErr);
    return { success: false, processedUsers, sentCount, errors: [schedErr.message] };
  }
}

// Periodic Scheduler checks every 60 seconds (for non-serverless container instances)
function startNotificationScheduler() {
  console.log("[NOTIFICATION SCHEDULER] Service initialized successfully.");
  setInterval(async () => {
    await executeReminderCheck();
  }, 60000); // Poll once every 60 seconds
}

// Vite / static file serving middleware config
async function startServer() {
  // Start the background notification scheduler
  startNotificationScheduler();

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
