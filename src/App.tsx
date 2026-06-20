import React, { useState, useEffect, useRef } from "react";
import { Analytics } from "@vercel/analytics/react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Flame, 
  BookOpen, 
  MessageSquare, 
  Plus, 
  Heart, 
  User, 
  Trophy, 
  ChevronLeft, 
  Share2, 
  Coffee, 
  Sparkles, 
  Unlock, 
  Calendar, 
  TrendingUp, 
  X, 
  Save, 
  Download, 
  Search, 
  Bell, 
  Gift, 
  Compass, 
  Check, 
  ChevronRight,
  Info,
  Trash2,
  Copy,
  Feather,
  Quote
} from "lucide-react";
import { 
  User as UserType, 
  Prayer as PrayerType, 
  ReadingPlan, 
  ChatMessage, 
  DailyVerse, 
  LeaderboardEntry, 
  ScreenName, 
  LBTab 
} from "./types";
import { TonConnectUI } from "@tonconnect/ui";
import { beginCell } from "@ton/core";
import { 
  BIBLE_BOOKS, 
  DEVOTIONAL_VERSES, 
  INITIAL_READING_PLANS, 
  CARD_THEMES, 
  rotateDayVerse, 
  generateLeaderboardData,
  getDailyVerseDevotion
} from "./data";

const getAppBaseUrl = () => {
  const href = window.location.href;
  const cleanUrl = href.split("?")[0].split("#")[0];
  const lastSlashIndex = cleanUrl.lastIndexOf("/");
  return cleanUrl.substring(0, lastSlashIndex + 1);
};

export default function App() {
  // ── TELEGRAM HAPTIC FEEDBACK HELPERS ──
  const triggerHapticImpact = (style: "light" | "medium" | "heavy" | "rigid" | "soft" = "light") => {
    try {
      const tg = (window as any).Telegram?.WebApp;
      if (tg?.HapticFeedback) {
        tg.HapticFeedback.impactOccurred(style);
      }
    } catch (e) {
      console.warn("Haptic trigger failed:", e);
    }
  };

  const triggerHapticNotification = (type: "error" | "success" | "warning") => {
    try {
      const tg = (window as any).Telegram?.WebApp;
      if (tg?.HapticFeedback) {
        tg.HapticFeedback.notificationOccurred(type);
      }
    } catch (e) {
      console.warn("Haptic notification failed:", e);
    }
  };

  const triggerHapticSelection = () => {
    try {
      const tg = (window as any).Telegram?.WebApp;
      if (tg?.HapticFeedback) {
        tg.HapticFeedback.selectionChanged();
      }
    } catch (e) {
      console.warn("Haptic selection failed:", e);
    }
  };

  // ── CORE STATE ──
  const [currentUser, setCurrentUser] = useState<UserType | null>(null);
  const [currentScreen, setCurrentScreen] = useState<ScreenName>("onboard");
  const [screenHistory, setScreenHistory] = useState<ScreenName[]>([]);
  const [isTelegramEnvironment, setIsTelegramEnvironment] = useState(false);
  const [avatarLoadError, setAvatarLoadError] = useState(false);

  // Bible Reader State
  const [currentBook, setCurrentBook] = useState("john");
  const [currentChapter, setCurrentChapter] = useState(3);
  const [chapterVerses, setChapterVerses] = useState<{ verse: number; text: string }[]>([]);
  const [isBibleLoading, setIsBibleLoading] = useState(false);
  const [highlightedVerse, setHighlightedVerse] = useState<{ text: string; ref: string } | null>(null);

  // AI Chat State
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [freeQuestionsLeft, setFreeQuestionsLeft] = useState(5);
  const [selectedPromptChip, setSelectedPromptChip] = useState("");
  const [showAiLimitModal, setShowAiLimitModal] = useState(false);
  const [referralCount, setReferralCount] = useState<number>(() => {
    return parseInt(localStorage.getItem("bm_referrals_count") || "0", 10);
  });
  const [isSimulatingReferral, setIsSimulatingReferral] = useState(false);

  // Community Channel Joins state
  const [hasClickedJoin, setHasClickedJoin] = useState<boolean>(() => {
    return localStorage.getItem("bm_clicked_join") === "1";
  });
  const [isVerifyingJoin, setIsVerifyingJoin] = useState(false);
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);

  // Prayers Journal State
  const [prayers, setPrayers] = useState<PrayerType[]>([]);
  const [prayerInput, setPrayerInput] = useState("");

  // Saved Verses State
  const [savedVerses, setSavedVerses] = useState<{ id: string; text: string; ref: string; created_at: string }[]>(() => {
    try {
      const saved = localStorage.getItem("bm_saved_verses");
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  // Profile Reminders
  const [reminders, setReminders] = useState({
    morning: { enabled: true, time: "07:00" },
    streak: { enabled: true, time: "20:00" }
  });

  // Daily Reading Plans (with local persistence)
  const [readingPlans, setReadingPlans] = useState<ReadingPlan[]>(INITIAL_READING_PLANS);

  // Custom Card Share Creation State
  const [customCardStyle, setCustomCardStyle] = useState(0);
  const [activeShareVerse, setActiveShareVerse] = useState<DailyVerse | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const shareCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [cardPreviewUrl, setCardPreviewUrl] = useState<string>("");

  // Leaderboard State
  const [activeLBTab, setActiveLBTab] = useState<LBTab>("streaks");
  const [leaderboards, setLeaderboards] = useState(generateLeaderboardData());
  const [hasNotifiedTop10, setHasNotifiedTop10] = useState<Record<string, boolean>>({});

  // Checkout & Donation Simulator States
  const [isPremium, setIsPremium] = useState(false);
  
  // TON Connect Subscription States
  const tonConnectRef = useRef<TonConnectUI | null>(null);
  const [isTonWalletConnected, setIsTonWalletConnected] = useState(false);
  const [tonWalletAddress, setTonWalletAddress] = useState<string | null>(null);
  const [premiumStatus, setPremiumStatus] = useState<string>("free");
  const [premiumExpiresAt, setPremiumExpiresAt] = useState<string | null>(null);
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);
  const [tonSenderAddress, setTonSenderAddress] = useState<string | null>(null);

  const [premiumPlanType, setPremiumPlanType] = useState<"monthly" | "yearly">("monthly");
  const [customStarAmount, setCustomStarAmount] = useState("");
  const [isCustomDonationModalOpen, setIsCustomDonationModalOpen] = useState(false);
  const [customDonationError, setCustomDonationError] = useState("");
  const [isPaying, setIsPaying] = useState(false);
  const [paymentSuccessMessage, setPaymentSuccessMessage] = useState("");
  const [sandboxPaymentDetails, setSandboxPaymentDetails] = useState<{
    type: "premium" | "donation";
    plan?: "monthly" | "yearly";
    label?: string;
    stars: number;
    payload: string;
    transactionId: string;
    userId: string;
    invoice_link: string;
  } | null>(null);

  // Webhook Registration State
  const [webhookRegState, setWebhookRegState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [webhookRegMessage, setWebhookRegMessage] = useState<string>("");
  const [webhookRegDetails, setWebhookRegDetails] = useState<any>(null);

  // Active Calendar Dates State
  const [activityDates, setActivityDates] = useState<string[]>([]);

  // Toast Alerts
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // In-app Alarm Notification banner and permission state
  const [inAppAlarmNotification, setInAppAlarmNotification] = useState<{
    type: "morning" | "streak";
    title: string;
    body: string;
    time: string;
  } | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<string>("default");

  // Global Daily Verse
  const [todayVerse, setTodayVerse] = useState<DailyVerse>(rotateDayVerse());

  // ── DYNAMIC CLOUD SEAMLESS SYNCHRONIZATION WITH SUPABASE ──
  const triggerSupabaseSync = async (
    user: UserType | null,
    pList: PrayerType[] = prayers,
    vList: any[] = savedVerses,
    cHistory: ChatMessage[] = chatHistory,
    plans: ReadingPlan[] = readingPlans,
    rems: any = reminders
  ) => {
    if (!user) return;
    try {
      await fetch("/api/user/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegram_id: user.id,
          first_name: user.first_name,
          username: user.username,
          photo_url: user.photo_url || "",
          streak_count: user.streak_count,
          last_active: user.last_active,
          is_premium: user.is_premium,
          premium_status: user.premium_status || premiumStatus,
          premium_expires_at: user.premium_expires_at || premiumExpiresAt,
          wallet_address: user.wallet_address || tonSenderAddress,
          last_transaction_hash: user.last_transaction_hash || lastTxHash,
          verses_read: user.verses_read,
          lang: user.lang,
          prayers: pList,
          saved_verses: vList,
          chat_history: cHistory,
          reading_plans: plans,
          reminders: rems,
          channel_joined: !!user.channel_joined,
          chat_trials_bonus: user.chat_trials_bonus || 0
        })
      });
    } catch (err) {
      console.warn("Background cloud sync skipped:", err);
    }
  };

  // ── TON CONNECT INITIALIZATION ──
  useEffect(() => {
    const manifestUri = getAppBaseUrl() + "tonconnect-manifest.json";
    const tonUI = new TonConnectUI({
      manifestUrl: manifestUri
    });
    
    tonConnectRef.current = tonUI;
    
    if (tonUI.wallet) {
      setIsTonWalletConnected(true);
      setTonWalletAddress(tonUI.wallet.account.address);
    }

    const unsubscribe = tonUI.onStatusChange((wallet) => {
      if (wallet) {
        setIsTonWalletConnected(true);
        setTonWalletAddress(wallet.account.address);
      } else {
        setIsTonWalletConnected(false);
        setTonWalletAddress(null);
      }
    });
    
    return () => {
      unsubscribe();
    };
  }, []);

  // ── ON INITIAL LEAF LOAD ──
  useEffect(() => {
    // Check if Telegram SDK is loaded and bind safety triggers
    const tg = (window as any).Telegram?.WebApp;
    let telegUser = null;
    if (tg) {
      tg.ready();
      tg.expand();
      telegUser = tg.initDataUnsafe?.user;
      setIsTelegramEnvironment(true);
    }

    // Check local web notification perm
    if ("Notification" in window) {
      setNotificationPermission(Notification.permission);
    }

    // 1. Initialise local Storage Cache
    const onboarded = localStorage.getItem("bm_onboarded") === "1";
    const cacheUserStr = localStorage.getItem("bm_user");
    const today = new Date().toISOString().split("T")[0];

    // Configure rotating verse
    const loadedVerse = rotateDayVerse();
    setTodayVerse(loadedVerse);

    // Initialise User Context
    let baseUser: UserType;
    if (telegUser) {
      baseUser = {
        id: telegUser.id,
        first_name: telegUser.first_name || "Believer",
        username: telegUser.username || "devout_soul",
        lang: telegUser.language_code || "en",
        streak_count: 1,
        last_active: today,
        is_premium: false,
        verses_read: 0,
        photo_url: telegUser.photo_url || undefined,
      };
      localStorage.setItem("bm_onboarded", "1");
      localStorage.setItem("bm_onboarded_shown", "1");
    } else if (cacheUserStr) {
      try {
        baseUser = JSON.parse(cacheUserStr);
      } catch (e) {
        baseUser = createDefaultGuestUser();
      }
    } else {
      baseUser = createDefaultGuestUser();
    }

    // Restore cached state variables from LocalStorage
    const versesReadCount = parseInt(localStorage.getItem("bm_verses") || "0", 10);
    baseUser.verses_read = versesReadCount;
    setPremiumStatus(baseUser.premium_status || (baseUser.is_premium ? "active" : "free"));
    setPremiumExpiresAt(baseUser.premium_expires_at || null);
    setLastTxHash(baseUser.last_transaction_hash || null);
    setTonSenderAddress(baseUser.wallet_address || null);

    // Load from Supabase to synchronize cloud data on startup
    const loadUserFromSupabase = async (baseLocalUser: UserType) => {
      try {
        const res = await fetch(`/api/user/load?telegram_id=${baseLocalUser.id}`);
        const result = await res.json();
        
        if (result && result.success && result.loadedFromCloud && result.user_data) {
          // Cloud has existing data for this user! Overwrite states to keep sessions synced beautifully
          const cloudRawUser: UserType = {
            ...baseLocalUser,
            streak_count: result.user_data.streak_count || baseLocalUser.streak_count,
            last_active: result.user_data.last_active || baseLocalUser.last_active,
            is_premium: result.user_data.is_premium !== undefined ? result.user_data.is_premium : baseLocalUser.is_premium,
            premium_status: result.user_data.premium_status || (result.user_data.is_premium ? "active" : "free"),
            premium_expires_at: result.user_data.premium_expires_at || null,
            wallet_address: result.user_data.wallet_address || null,
            last_transaction_hash: result.user_data.last_transaction_hash || null,
            verses_read: result.user_data.verses_read !== undefined ? result.user_data.verses_read : baseLocalUser.verses_read,
            photo_url: result.user_data.photo_url || baseLocalUser.photo_url,
            first_name: result.user_data.first_name || baseLocalUser.first_name,
            username: result.user_data.username || baseLocalUser.username,
            channel_joined: result.user_data.channel_joined !== undefined ? !!result.user_data.channel_joined : baseLocalUser.channel_joined,
            chat_trials_bonus: result.user_data.chat_trials_bonus !== undefined ? Number(result.user_data.chat_trials_bonus) : baseLocalUser.chat_trials_bonus,
          };

          // Evaluate streak on load
          const cloudUser = evaluateStreakAndValidate(cloudRawUser);

          // Update local React states
          setCurrentUser(cloudUser);
          setIsPremium(cloudUser.is_premium);
          setPremiumStatus(cloudUser.premium_status || (cloudUser.is_premium ? "active" : "free"));
          setPremiumExpiresAt(cloudUser.premium_expires_at || null);
          setLastTxHash(cloudUser.last_transaction_hash || null);
          setTonSenderAddress(cloudUser.wallet_address || null);
          localStorage.setItem("bm_user", JSON.stringify(cloudUser));

          if (result.prayers && result.prayers.length > 0) {
            setPrayers(result.prayers);
            localStorage.setItem("bm_prayers", JSON.stringify(result.prayers));
          }
          if (result.saved_verses) {
            setSavedVerses(result.saved_verses);
            localStorage.setItem("bm_saved_verses", JSON.stringify(result.saved_verses));
          }
          if (result.chat_history && result.chat_history.length > 0) {
            setChatHistory(result.chat_history);
          }
          if (result.reading_plans) {
            setReadingPlans(prevPlans => prevPlans.map(p => {
              const cloudP = result.reading_plans[p.id];
              if (cloudP) {
                return { ...p, started: !!cloudP.started, progress: cloudP.progress };
              }
              return p;
            }));
          }
          if (result.reminders) {
            setReminders(result.reminders);
            localStorage.setItem("bm_reminders", JSON.stringify(result.reminders));
          }

          // Trigger update leaderboards
          updateLeaderboards(cloudUser, cloudUser.verses_read);
          
          // Perform a fast sync to store any newly updated telegram fields
          triggerSupabaseSync(cloudUser, result.prayers || [], result.saved_verses || [], result.chat_history || [], readingPlans, result.reminders || reminders);
        } else {
          // New user or Supabase connection unconfigured. Operate with baseLocalUser and sync down
          const validatedLocalUser = evaluateStreakAndValidate(baseLocalUser);
          setCurrentUser(validatedLocalUser);
          setIsPremium(validatedLocalUser.is_premium);
          setPremiumStatus(validatedLocalUser.premium_status || (validatedLocalUser.is_premium ? "active" : "free"));
          setPremiumExpiresAt(validatedLocalUser.premium_expires_at || null);
          setLastTxHash(validatedLocalUser.last_transaction_hash || null);
          setTonSenderAddress(validatedLocalUser.wallet_address || null);
          localStorage.setItem("bm_user", JSON.stringify(validatedLocalUser));
          
          // Seed prayers locally if empty
          const savedPrayers = localStorage.getItem("bm_prayers");
          let loadedPrayers = [];
          if (savedPrayers) {
            try { loadedPrayers = JSON.parse(savedPrayers); } catch(e) {}
          } else {
            loadedPrayers = [
              {
                id: "prayer-seed-1",
                user_id: baseLocalUser.id,
                content: "Lord, grant me peaceful focus as I seek Your presence and read through Your holy scriptures today. Be my anchor in times of difficulty.",
                created_at: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
                answered: true
              },
              {
                id: "prayer-seed-2",
                user_id: baseLocalUser.id,
                content: "Please pour comfort upon those facing loneliness or physical trial around the world. Let them feel Your complete affection and strength.",
                created_at: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
                answered: false
              }
            ];
            setPrayers(loadedPrayers);
            localStorage.setItem("bm_prayers", JSON.stringify(loadedPrayers));
          }

          // Trigger initial silent cloud creation
          triggerSupabaseSync(validatedLocalUser, loadedPrayers, savedVerses, chatHistory, readingPlans, reminders);
        }
      } catch (err) {
        console.error("Failed to load user from Supabase, operating from local cache:", err);
        const resolvedCacheUser = evaluateStreakAndValidate(baseLocalUser);
        setCurrentUser(resolvedCacheUser);
        setIsPremium(resolvedCacheUser.is_premium);
      }
    };

    // Load prayers
    const savedPrayers = localStorage.getItem("bm_prayers");
    if (savedPrayers) {
      try {
        setPrayers(JSON.parse(savedPrayers));
      } catch(e) {}
    }

    // Load Reminders Configuration
    const savedReminders = localStorage.getItem("bm_reminders");
    if (savedReminders) {
      try {
        setReminders(JSON.parse(savedReminders));
      } catch(e) {}
    }

    // Load reading plans progress
    const savedPlans = localStorage.getItem("bm_plans_state");
    if (savedPlans) {
      try {
        setReadingPlans(JSON.parse(savedPlans));
      } catch(e) {}
    }

    loadUserFromSupabase(baseUser);

    // Dynamic free questions reset checking
    const cacheFqDate = localStorage.getItem("bm_fq_date");
    let initialFqLeft = 5;
    if (cacheFqDate !== today) {
      localStorage.setItem("bm_fq_date", today);
      localStorage.setItem("bm_fq_left", "5");
    } else {
      initialFqLeft = parseInt(localStorage.getItem("bm_fq_left") || "5", 10);
    }
    setFreeQuestionsLeft(initialFqLeft);

    // Database checking for premium activation and referral stubs
    fetchPremiumNetworkStatus(baseUser.id);

    // Initial screen navigation layout determination
    if (onboarded) {
      setCurrentScreen("home");
    } else {
      setCurrentScreen("onboard");
    }

    // Initialise Leaderboard counters based on user metric settings
    updateLeaderboards(baseUser, versesReadCount);
  }, []);

  const getDaysDifference = (lastDateStr: string, todayDateStr: string): number => {
    if (!lastDateStr || !todayDateStr) return 999;
    try {
      const last = new Date(lastDateStr);
      const today = new Date(todayDateStr);
      
      // Set to noon to ignore daylight savings offset safety
      last.setHours(12, 0, 0, 0);
      today.setHours(12, 0, 0, 0);
      
      const diffTime = today.getTime() - last.getTime();
      return Math.round(diffTime / (1000 * 60 * 60 * 24));
    } catch (e) {
      return 999;
    }
  };

  const evaluateStreakAndValidate = (user: UserType): UserType => {
    const todayStr = new Date().toISOString().split("T")[0];
    const lastActiveStr = user.last_active;
    let currentStreak = user.streak_count || 1;

    // Track active dates history
    const savedDates = localStorage.getItem("bm_activity_dates");
    let dateList: string[] = [];
    if (savedDates) {
      try { dateList = JSON.parse(savedDates); } catch(e) {}
    }
    if (!dateList.includes(todayStr)) {
      dateList.push(todayStr);
      localStorage.setItem("bm_activity_dates", JSON.stringify(dateList));
    }
    setActivityDates(dateList);

    if (lastActiveStr === todayStr) {
      // Already checked in today. No changes to streak.
      return user;
    }

    const diffDays = getDaysDifference(lastActiveStr, todayStr);
    let message = "";
    let isStreakSaved = false;

    if (diffDays === 1) {
      // Consecutive yesterday checkin! Double active streak!
      currentStreak += 1;
      message = `Welcome back! Streak continued to ${currentStreak} Days 🔥`;
    } else if (diffDays > 1) {
      // Gap day
      if (user.is_premium) {
        isStreakSaved = true;
        message = `🛡️ Premium Streak Protection preserved your ${currentStreak} Days streak!`;
      } else {
        currentStreak = 1;
        message = `New scripture search activity! Habit streak set to 1 Day. Unlock Premium for protection!`;
      }
    }

    const updatedUser: UserType = {
      ...user,
      streak_count: currentStreak,
      last_active: todayStr
    };

    setTimeout(() => {
      if (message) {
        showToast(message);
        if (isStreakSaved) {
          triggerHapticNotification("success");
        } else {
          triggerHapticImpact("light");
        }
      }
    }, 1500);

    return updatedUser;
  };

  const recordDailyActivity = () => {
    const todayStr = new Date().toISOString().split("T")[0];
    
    // Track active dates
    const savedActive = localStorage.getItem("bm_activity_dates");
    let activeList: string[] = [];
    if (savedActive) {
      try { activeList = JSON.parse(savedActive); } catch(e) {}
    }
    if (!activeList.includes(todayStr)) {
      activeList.push(todayStr);
      localStorage.setItem("bm_activity_dates", JSON.stringify(activeList));
      setActivityDates(activeList);
    }

    if (!currentUser) return;

    if (currentUser.last_active !== todayStr) {
      const updatedUser = evaluateStreakAndValidate(currentUser);
      setCurrentUser(updatedUser);
      localStorage.setItem("bm_user", JSON.stringify(updatedUser));
      updateLeaderboards(updatedUser, updatedUser.verses_read);
      triggerSupabaseSync(updatedUser, prayers, savedVerses, chatHistory, readingPlans, reminders);
    }
  };

  const createDefaultGuestUser = (): UserType => {
    return {
      id: 777123,
      first_name: "Brother Keith",
      username: "faithful_servant",
      lang: "en",
      streak_count: 3,
      last_active: new Date().toISOString().split("T")[0],
      is_premium: false,
      verses_read: 8,
    };
  };

  // ── NETWORK CALLS SIMULATED SECURELY ──
  const fetchPremiumNetworkStatus = async (uid: number) => {
    try {
      const res = await fetch(`/api/check-premium?user_id=${uid}`);
      if (res.ok) {
        const data = await res.json();
        if (data.is_premium) {
          setIsPremium(true);
        }
      }
    } catch (e) {
      console.warn("Failed checking premium status from API, running Local fallback checks");
    }
  };

  // Sync state stats back onto Leaderboard dataset
  const updateLeaderboards = (user: UserType, versesRead: number) => {
    setLeaderboards(prev => {
      const currentId = user.id;
      const metrics = { ...prev };

      // Update or create active record in each list
      const tabs: LBTab[] = ["streaks", "verses", "questions", "prayers"];
      tabs.forEach(tab => {
        let list = [...metrics[tab]];
        let userRow = list.find(x => x.username === user.username);
        
        let targetScore = user.streak_count;
        if (tab === "verses") targetScore = versesRead || 12;
        if (tab === "questions") targetScore = 5 - freeQuestionsLeft;
        if (tab === "prayers") targetScore = prayers.length || 2;

        if (userRow) {
          userRow.score = targetScore;
        } else {
          list.push({
            rank: 6,
            displayName: user.first_name,
            username: user.username,
            score: targetScore,
            isCurrentUser: true,
            avatarGradient: "from-[#D4A843] to-[#F76B1C]",
            badge: "normal"
          });
        }

        // Sort by score descending and re-assign rank
        list.sort((a, b) => b.score - a.score);
        list = list.map((item, index) => ({
          ...item,
          rank: index + 1,
          badge: index === 0 ? "gold" : index === 1 ? "silver" : index === 2 ? "bronze" : "normal",
          isCurrentUser: item.username === user.username
        }));

        metrics[tab] = list;
      });

      return metrics;
    });
  };

  // ── TOAST TRIGGER ──
  const showToast = (message: string) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToastMessage(message);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 2800);
  };

  // ── NAVIGATION METHOD ──
  const goTo = (screen: ScreenName) => {
    triggerHapticImpact("light");
    setScreenHistory(prev => {
      // Avoid duplicate sibling pushes
      if (prev[prev.length - 1] === currentScreen) return prev;
      return [...prev, currentScreen];
    });
    setCurrentScreen(screen);

    // Initialise loading calls on relevant navigations
    if (screen === "read") {
      fetchBibleChapter(currentBook, currentChapter);
    }
  };

  const goBack = () => {
    triggerHapticImpact("light");
    if (screenHistory.length > 0) {
      const copy = [...screenHistory];
      const prev = copy.pop();
      setScreenHistory(copy);
      if (prev) {
        setCurrentScreen(prev);
        if (prev === "read") {
          fetchBibleChapter(currentBook, currentChapter);
        }
      }
    } else {
      setCurrentScreen("home");
    }
  };

  // Onboarding Complete Handle
  const handleOnboardingNext = () => {
    localStorage.setItem("bm_onboarded", "1");
    localStorage.setItem("bm_onboarded_shown", "1");
    if (currentUser) {
      localStorage.setItem("bm_user", JSON.stringify(currentUser));
    }
    showToast("Welcome aboard, beloved soul! 📖");
    goTo("home");
  };

  // ── BIBLE READER LOGIC ──
  const fetchBibleChapter = async (book: string, chapter: number) => {
    setIsBibleLoading(true);
    try {
      const res = await fetch(`https://bible-api.com/${book}+${chapter}?translation=kjv`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (data.verses) {
        const formatted = data.verses.map((v: any) => ({
          verse: v.verse,
          text: v.text.trim().replace(/\n/g, " ")
        }));
        setChapterVerses(formatted);
      }
    } catch (e) {
      // High fidelity offline mock backup so it NEVER breaks
      setChapterVerses([
        { verse: 1, text: "In the beginning was the Word, and the Word was with God, and the Word was God." },
        { verse: 2, text: "The same was in the beginning with God." },
        { verse: 3, text: "All things were made by him; and without him was not any thing made that was made." },
        { verse: 4, text: "In him was life; and the life was the light of men." },
        { verse: 5, text: "And the light shineth in darkness; and the darkness comprehended it not." },
        { verse: 16, text: "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life." }
      ]);
    } finally {
      setIsBibleLoading(false);
    }
  };

  const handleBookSelector = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const bookId = e.target.value;
    setCurrentBook(bookId);
    setCurrentChapter(1);
    fetchBibleChapter(bookId, 1);
  };

  const handleChapterSelector = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const chap = parseInt(e.target.value, 10);
    setCurrentChapter(chap);
    fetchBibleChapter(currentBook, chap);
  };

  const handleBiblePrevChapter = () => {
    if (currentChapter > 1) {
      const prev = currentChapter - 1;
      setCurrentChapter(prev);
      fetchBibleChapter(currentBook, prev);
    } else {
      const currentBookIdx = BIBLE_BOOKS.findIndex(b => b.id === currentBook);
      if (currentBookIdx > 0) {
        const prevBook = BIBLE_BOOKS[currentBookIdx - 1];
        setCurrentBook(prevBook.id);
        setCurrentChapter(prevBook.chapters);
        fetchBibleChapter(prevBook.id, prevBook.chapters);
      } else {
        showToast("You are at the beginning of the scriptures.");
      }
    }
  };

  const handleBibleNextChapter = () => {
    const currentBookMeta = BIBLE_BOOKS.find(b => b.id === currentBook);
    if (currentBookMeta && currentChapter < currentBookMeta.chapters) {
      const next = currentChapter + 1;
      setCurrentChapter(next);
      fetchBibleChapter(currentBook, next);
    } else {
      const currentBookIdx = BIBLE_BOOKS.findIndex(b => b.id === currentBook);
      if (currentBookIdx < BIBLE_BOOKS.length - 1) {
        const nextBook = BIBLE_BOOKS[currentBookIdx + 1];
        setCurrentBook(nextBook.id);
        setCurrentChapter(1);
        fetchBibleChapter(nextBook.id, 1);
      } else {
        showToast("You have reached the final chapter of Revelation.");
      }
    }
  };

  const handleVerseClickEvent = (text: string, verseNum: number) => {
    // Increment read metrics
    triggerHapticImpact("light");
    const totals = parseInt(localStorage.getItem("bm_verses") || "0", 10) + 1;
    localStorage.setItem("bm_verses", String(totals));
    if (currentUser) {
      const updated = { ...currentUser, verses_read: totals };
      setCurrentUser(updated);
      localStorage.setItem("bm_user", JSON.stringify(updated));
      updateLeaderboards(updated, totals);
      triggerSupabaseSync(updated, prayers, savedVerses, chatHistory, readingPlans, reminders);
    }

    // Record daily devotion activity for habit streak progression
    recordDailyActivity();

    const bookName = BIBLE_BOOKS.find(b => b.id === currentBook)?.name || currentBook;
    const ref = `${bookName} ${currentChapter}:${verseNum}`;
    setHighlightedVerse({ text, ref });
  };

  // ── AI CHAT INTERFACE ──
  const handleAiSendMessage = async (textOver?: string) => {
    const promptText = (textOver || chatInput).trim();
    if (!promptText) return;

    triggerHapticImpact("medium");

    if (freeQuestionsLeft <= 0 && !isPremium) {
      triggerHapticNotification("warning");
      setShowAiLimitModal(true);
      return;
    }

    const newUserMsg: ChatMessage = {
      id: `chat-${Date.now()}`,
      role: "user",
      text: promptText,
      senderName: currentUser?.first_name || "Believer",
      timestamp: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    };

    setChatHistory(prev => [...prev, newUserMsg]);
    setChatInput("");
    setIsAiTyping(true);

    // Charge state metric
    if (!isPremium) {
      const updatedFq = Math.max(0, freeQuestionsLeft - 1);
      setFreeQuestionsLeft(updatedFq);
      localStorage.setItem("bm_fq_left", String(updatedFq));
    }

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: promptText })
      });

      if (!response.ok) throw new Error();
      const data = await response.json();

      const aiResponseMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: "bot",
        text: data.text,
        senderName: "Bible Manna AI",
        timestamp: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      };
      setChatHistory(prev => [...prev, aiResponseMsg]);
      
      if (currentUser) {
        triggerSupabaseSync(currentUser, prayers, savedVerses, [...chatHistory, newUserMsg, aiResponseMsg], readingPlans, reminders);
      }
    } catch (e) {
      showToast("Connection difficulty or missing API key. Serving fallback reflections.");
      let fallbackText = `### Step 1 — ACKNOWLEDGE
Grace and peace be multiplied unto you. Thank you for seek counsel in the Word of our Lord today. No matter what dynamic season you find yourself in, God's light is ready to navigate you.

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
🙏 Heavenly Father, guide my wonderful friend along the paths of righteousness. Fill their day with divine opportunities, clear guidance, and endless comfort. Bless their active search of Your scripture. Amen. 📖`;
      
      const lower = promptText.toLowerCase();
      if (lower.includes("anxious") || lower.includes("worry") || lower.includes("fear")) {
        fallbackText = `### Step 1 — ACKNOWLEDGE
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
🙏 Lord, please tranquilize my friend's racing heart. Infuse them with Your otherworldly peace that passes all understanding. Amen. 🕊️`;
      } else if (lower.includes("strength") || lower.includes("tired") || lower.includes("weak") || lower.includes("struggle")) {
        fallbackText = `### Step 1 — ACKNOWLEDGE
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
🙏 Father, pour fresh fuel and spiritual strength into my friend's spirit right now. Where they feel spent, let Your limitless energy and hope take over. Amen. ✨`;
      } else if (lower.includes("love") || lower.includes("lonely") || lower.includes("care") || lower.includes("forgive")) {
        fallbackText = `### Step 1 — ACKNOWLEDGE
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
The Greek word used for love in Romans is *agape* — representing a covenantal, unbreakable, sacrificial love based on the character of the Giver, not the performance of the recipient.

### Step 6 — A PERSONAL PRAYER
🙏 Lord, wrap Your warm arms of love around my beloved friend today. Dissolve any feelings of solitude. Amen. ❤️`;
      }

      const aiResponseMsgFallback: ChatMessage = {
        id: `ai-fall-${Date.now()}`,
        role: "bot",
        text: fallbackText,
        senderName: "Bible Manna AI (Reflection)",
        timestamp: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      };
      setChatHistory(prev => [...prev, aiResponseMsgFallback]);
      
      if (currentUser) {
        triggerSupabaseSync(currentUser, prayers, savedVerses, [...chatHistory, newUserMsg, aiResponseMsgFallback], readingPlans, reminders);
      }
    } finally {
      setIsAiTyping(false);
    }
  };

  const useChatPromptChip = (chipText: string) => {
    setSelectedPromptChip(chipText);
    handleAiSendMessage(chipText);
  };

  // ── PRAYER JOURNAL LOGIC ──
  const handleSavePrayer = () => {
    if (!prayerInput.trim()) {
      showToast("Please enter deep prayers first.");
      return;
    }
    triggerHapticNotification("success");
    const newPrayer: PrayerType = {
      id: `prayer-${Date.now()}`,
      user_id: currentUser?.id || 0,
      content: prayerInput,
      created_at: new Date().toISOString(),
      answered: false
    };

    const updated = [newPrayer, ...prayers];
    setPrayers(updated);
    localStorage.setItem("bm_prayers", JSON.stringify(updated));
    setPrayerInput("");
    showToast("Your prayer is saved. God is listening. 🕊️");
    
    // Record daily devotion activity for habit streak progression
    recordDailyActivity();

    // Update metric count 
    if (currentUser) {
      updateLeaderboards(currentUser, currentUser.verses_read);
      triggerSupabaseSync(currentUser, updated, savedVerses, chatHistory, readingPlans, reminders);
    }
  };

  const handleSaveDailyPrayerToJournal = (text: string) => {
    triggerHapticNotification("success");
    const newPrayer: PrayerType = {
      id: `prayer-${Date.now()}`,
      user_id: currentUser?.id || 0,
      content: text,
      created_at: new Date().toISOString(),
      answered: false
    };

    const updated = [newPrayer, ...prayers];
    setPrayers(updated);
    localStorage.setItem("bm_prayers", JSON.stringify(updated));
    showToast("Today's prayer added to your journal! 🕊️");
    
    // Record daily devotion activity for habit streak progression
    recordDailyActivity();

    // Update metric count 
    if (currentUser) {
      updateLeaderboards(currentUser, currentUser.verses_read);
      triggerSupabaseSync(currentUser, updated, savedVerses, chatHistory, readingPlans, reminders);
    }
  };

  const handleMarkPrayerAnswered = (id: string) => {
    triggerHapticNotification("success");
    const updated = prayers.map(p => {
      if (p.id === id) {
        return { ...p, answered: true };
      }
      return p;
    });
    setPrayers(updated);
    localStorage.setItem("bm_prayers", JSON.stringify(updated));
    showToast("Praise be to God! Prayer marked as Answered. 🙌");
    
    if (currentUser) {
      triggerSupabaseSync(currentUser, updated, savedVerses, chatHistory, readingPlans, reminders);
    }
  };

  const handleDeletePrayer = (id: string) => {
    triggerHapticImpact("medium");
    const filtered = prayers.filter(p => p.id !== id);
    setPrayers(filtered);
    localStorage.setItem("bm_prayers", JSON.stringify(filtered));
    showToast("Prayer removed from journal.");
    
    if (currentUser) {
      triggerSupabaseSync(currentUser, filtered, savedVerses, chatHistory, readingPlans, reminders);
    }
  };

  // ── REMINDERS TRIGGERS ──
  const handleToggleReminder = (type: "morning" | "streak") => {
    triggerHapticImpact("light");
    const updated = {
      ...reminders,
      [type]: {
        ...reminders[type],
        enabled: !reminders[type].enabled
      },
      timezoneOffset: new Date().getTimezoneOffset()
    };
    setReminders(updated);
    localStorage.setItem("bm_reminders", JSON.stringify(updated));
    showToast(updated[type].enabled ? `Alert enabled!` : `Alert disabled`);
    if (updated[type].enabled) {
      requestNotificationPermission(true);
    }
    
    if (currentUser) {
      triggerSupabaseSync(currentUser, prayers, savedVerses, chatHistory, readingPlans, updated);
    }
  };

  const handleReminderTimeChange = (type: "morning" | "streak", val: string) => {
    const updated = {
      ...reminders,
      [type]: {
        ...reminders[type],
        time: val
      },
      timezoneOffset: new Date().getTimezoneOffset()
    };
    setReminders(updated);
    localStorage.setItem("bm_reminders", JSON.stringify(updated));
    
    if (currentUser) {
      triggerSupabaseSync(currentUser, prayers, savedVerses, chatHistory, readingPlans, updated);
    }
  };

  // Saved verses manage
  const handleSaveVerse = (text: string, ref: string) => {
    triggerHapticNotification("success");
    const isAlreadySaved = savedVerses.some((v: any) => v.ref === ref);
    let updated;
    if (isAlreadySaved) {
      updated = savedVerses.filter((v: any) => v.ref !== ref);
      showToast("Scripture removed from your bookmarks list.");
    } else {
      const newSaved = {
        id: `verse-${Date.now()}`,
        text,
        ref,
        created_at: new Date().toISOString()
      };
      updated = [...savedVerses, newSaved];
      showToast("Scripture bookmarked successfully! 📖");
    }
    setSavedVerses(updated);
    localStorage.setItem("bm_saved_verses", JSON.stringify(updated));

    if (currentUser) {
      triggerSupabaseSync(currentUser, prayers, updated, chatHistory, readingPlans, reminders);
    }
  };

  // Start reading plan
  const handleStartPlan = (id: string) => {
    triggerHapticNotification("success");
    const updated = readingPlans.map(plan => {
      if (plan.id === id) {
        return { ...plan, started: true, progress: 12 };
      }
      return plan;
    });
    setReadingPlans(updated);
    localStorage.setItem("bm_plans_state", JSON.stringify(updated));
    localStorage.setItem("bm_plans", String(updated.filter(p => p.started).length));
    showToast("Plan started! Let's build a clean reading habit!");
    
    if (currentUser) {
      triggerSupabaseSync(currentUser, prayers, savedVerses, chatHistory, updated, reminders);
    }
  };

  // Webhook Register Trigger function
  const handleRegisterWebhook = async () => {
    triggerHapticImpact("medium");
    setWebhookRegState("loading");
    setWebhookRegMessage("Connecting to bot server...");
    setWebhookRegDetails(null);

    try {
      const res = await fetch("/api/setup-webhook");
      const data = await res.json();

      if (res.ok && data.ok) {
        setWebhookRegState("success");
        setWebhookRegMessage(data.message || "Webhook successfully authorized!");
        setWebhookRegDetails(data);
        showToast("Webhook configured with Telegram! 🎉");
      } else {
        setWebhookRegState("error");
        setWebhookRegMessage(data.error || "Telegram refused the webhook connection.");
        setWebhookRegDetails(data);
        showToast("Webhook configuration failed. ❌");
      }
    } catch (err: any) {
      console.error(err);
      setWebhookRegState("error");
      setWebhookRegMessage("Failed to reach your app server node. Please try again.");
      showToast("Server connection error.");
    }
  };

  // ── TON CONNECT PAYMENT ENGINES ──
  const handleConnectTONWallet = async () => {
    try {
      if (!tonConnectRef.current) return;
      triggerHapticImpact("medium");
      await tonConnectRef.current.openModal();
    } catch (err: any) {
      showToast(err.message || "Failed to open TON Connect wallet modal.");
    }
  };

  const handleDisconnectTONWallet = async () => {
    try {
      if (!tonConnectRef.current) return;
      triggerHapticImpact("medium");
      await tonConnectRef.current.disconnect();
      setIsTonWalletConnected(false);
      setTonWalletAddress(null);
      showToast("TON Wallet disconnected.");
    } catch (err: any) {
      showToast("Disconnection failed.");
    }
  };

  const handleTriggerTONPayment = async () => {
    if (!currentUser) {
      showToast("User context loading, please try again.");
      return;
    }

    if (!tonConnectRef.current || !tonConnectRef.current.wallet) {
      showToast("Please connect your TON wallet first.");
      return;
    }

    triggerHapticImpact("medium");
    setIsPaying(true);
    setPaymentSuccessMessage("");

    try {
      // 1. Create a unique on-chain message comment with user ID to avoid collision or replay double-spend
      const uid = String(currentUser.id);
      const salt = Math.floor(100000 + Math.random() * 900000);
      const uniqueComment = `pm_usr_${uid}_${salt}`;

      // 2. Build official TON comment Cell payload using @ton/core
      // Structure: 32-bit zero prefix followed by standard text string
      const bodyCell = beginCell()
        .storeUint(0, 32)
        .storeStringTail(uniqueComment)
        .endCell();

      const bocBase64Str = bodyCell.toBoc().toString("base64");

      // Amount: 3 TON is exactly 3_000_000_000 Nanotons
      const txPayload = {
        validUntil: Math.floor(Date.now() / 1000) + 600, // Valid for 10 minutes
        messages: [
          {
            address: "UQALg6xZbeD8_nwhC8YwK1C4v8L9Y6mYm2F_0Oas4k2F_6O8", // Target payment address
            amount: "3000000000",
            payload: bocBase64Str
          }
        ]
      };

      showToast("Initiating wallet signature handler...");
      
      // Request signature inside TON Connect user client
      const response = await tonConnectRef.current.sendTransaction(txPayload);
      
      showToast("On-chain transaction sent! Verifying on-chain state...");

      // 3. Keep polling the secure backend node endpoint until on-chain status settles or times out (around 45 seconds total)
      let attempt = 0;
      const maxAttempts = 15;
      let isVerified = false;

      while (attempt < maxAttempts) {
        attempt++;
        // Wait 3 seconds per block time check
        await new Promise(resolve => setTimeout(resolve, 3000));

        try {
          const checkRes = await fetch("/api/verify-ton-payment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              user_id: uid,
              comment: uniqueComment,
              tx_hash: response.boc ? "OK" : undefined // Proof of wallet signature
            })
          });

          if (checkRes.ok) {
            const checkData = await checkRes.json();
            if (checkData.ok) {
              isVerified = true;
              triggerHapticNotification("success");

              // Sync React States with new active premium state
              setIsPremium(true);
              setPremiumStatus("active");
              setPremiumExpiresAt(checkData.premium_expires_at);
              setLastTxHash(checkData.last_transaction_hash);
              setTonSenderAddress(checkData.wallet_address);

              const updatedUser = {
                ...currentUser,
                is_premium: true,
                premium_status: "active",
                premium_expires_at: checkData.premium_expires_at,
                wallet_address: checkData.wallet_address,
                last_transaction_hash: checkData.last_transaction_hash
              };
              setCurrentUser(updatedUser);
              localStorage.setItem("bm_user", JSON.stringify(updatedUser));

              setPaymentSuccessMessage("💎 Bible Manna Premium Activated successfully for 30 Days! Thank you for your support, your on-chain transaction has been securely notarized. Enjoy unlimited scripture chats, special visuals, and reading plans! 🎉");
              showToast("Upgrade successful! Premium activated!");
              break;
            }
          }
        } catch (e) {
          // Continue silenty to not crash the polling loop
        }
      }

      if (!isVerified) {
        setPaymentSuccessMessage("⚠️ Payment was sent from your wallet, but the blockchain is processing slowly. Do not worry! Simply wait 30 seconds and refresh this tab; our startup validator will automatically unlock Premium for you once the transaction clears.");
      }

    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Transaction cancelled or rejected by user.");
    } finally {
      setIsPaying(false);
    }
  };

  // ── SECURE TELEGRAM STARS PAYMENT FLOW ──
  const handleTriggerInvoicePremium = async () => {
    if (!currentUser) {
      showToast("User not loaded. Please wait.");
      return;
    }
    triggerHapticImpact("medium");
    setIsPaying(true);
    setPaymentSuccessMessage("");

    try {
      const res = await fetch("/api/create-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: currentUser.id, plan: premiumPlanType })
      });
      
      if (!res.ok) {
        throw new Error("Failed to initialize invoice link on server");
      }
      
      const data = await res.json();
      const invoice_link = data.invoice_link;
      const tg = (window as any).Telegram?.WebApp;
      
      let supportsOpenInvoice = false;
      try {
        supportsOpenInvoice = tg && tg.openInvoice && tg.isVersionAtLeast && tg.isVersionAtLeast("6.1");
      } catch (e) {}
      
      if (tg && supportsOpenInvoice && !data.sandbox) {
        // Real Telegram client environment: Open invoice within Telegram
        console.log("Opening real Telegram Stars payment invoice window...");
        try {
          tg.openInvoice(invoice_link, async (status: string) => {
            if (status === "paid" || status === "successful") {
              try {
                // Server-side verification is the absolute source of truth
                const activateRes = await fetch("/api/activate-premium", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ user_id: currentUser.id })
                });
                
                if (activateRes.ok) {
                  const activateData = await activateRes.json();
                  if (activateData.ok) {
                    triggerHapticNotification("success");
                    setIsPremium(true);
                    setFreeQuestionsLeft(9999);
                    const updatedUser = { ...currentUser, is_premium: true };
                    setCurrentUser(updatedUser);
                    localStorage.setItem("bm_user", JSON.stringify(updatedUser));
                    triggerSupabaseSync(updatedUser, prayers, savedVerses, chatHistory, readingPlans, reminders);
                    setPaymentSuccessMessage(`✨ Glorious Success! Your Premium is activated. Enjoy unlimited AI, all reading plans, and scripture translations.`);
                    showToast("Bible Manna Premium Activated! 👑");
                  }
                } else {
                  showToast("Payment confirmation pending. Checking ledger...");
                }
              } catch (err) {
                console.error("Payment confirmation check issue:", err);
              }
            } else {
              showToast("Payment was cancelled or failed.");
            }
            setIsPaying(false);
          });
        } catch (invoiceErr) {
          console.error("tg.openInvoice failed synchronously:", invoiceErr);
          tg.openTelegramLink(invoice_link);
          showToast("Opening invoice in Telegram...");
          setIsPaying(false);
        }
      } else if (tg && !data.sandbox) {
        // Fallback for older Client version < 6.1
        console.log("Fallback: Opening invoice link via openTelegramLink due to WebApp version < 6.1...");
        tg.openTelegramLink(invoice_link);
        showToast("Opening invoice in Telegram...");
        setIsPaying(false);
      } else {
        // Sandbox fallback flow: Set modern developer testing state
        const starsAmt = premiumPlanType === "yearly" ? 2999 : 499;
        const nonce = invoice_link.includes("nonce=") 
          ? new URLSearchParams(invoice_link.split("#")[0].split("?")[1]).get("nonce") || "nonce_" + Date.now()
          : "nonce_" + Date.now();
        const payload = `premium_${premiumPlanType}_${currentUser.id}_${nonce}`;

        setSandboxPaymentDetails({
          type: "premium",
          plan: premiumPlanType,
          stars: starsAmt,
          payload: payload,
          transactionId: "sb_tx_" + Math.random().toString(36).substring(2, 11).toUpperCase(),
          userId: currentUser.id,
          invoice_link: invoice_link
        });
        setIsPaying(false);
      }
    } catch (e: any) {
      console.error("Invoice creation or execution error:", e);
      showToast("Error creating payment link. Check bot token configuration.");
      setIsPaying(false);
    }
  };

  // Secure Donation flow connected to backend / Telegram Stars
  const handleSendDonation = async (amount: number, label: string) => {
    if (!currentUser) {
      showToast("User not loaded yet.");
      return;
    }
    triggerHapticImpact("medium");
    setIsPaying(true);
    setPaymentSuccessMessage("");

    try {
      const res = await fetch("/api/create-donation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: currentUser.id, stars: amount, label })
      });

      if (!res.ok) {
        throw new Error("Failed to initialize donation link on server");
      }

      const data = await res.json();
      const invoice_link = data.invoice_link;
      const tg = (window as any).Telegram?.WebApp;

      let supportsOpenInvoice = false;
      try {
        supportsOpenInvoice = tg && tg.openInvoice && tg.isVersionAtLeast && tg.isVersionAtLeast("6.1");
      } catch (e) {}

      if (tg && supportsOpenInvoice && !data.sandbox) {
        // Real Telegram Stars flow
        try {
          tg.openInvoice(invoice_link, (status: string) => {
            if (status === "paid" || status === "successful") {
              triggerHapticNotification("success");
              setPaymentSuccessMessage("❤️ Thank you for supporting development!");
              showToast("Donation processed successfully! 🙌");
            } else {
              showToast("Donation checkout cancelled.");
            }
            setIsPaying(false);
          });
        } catch (invoiceErr) {
          console.error("tg.openInvoice failed synchronously:", invoiceErr);
          tg.openTelegramLink(invoice_link);
          showToast("Opening invoice in Telegram...");
          setIsPaying(false);
        }
      } else if (tg && !data.sandbox) {
        // Fallback for older Client version < 6.1
        console.log("Fallback: Opening invoice link via openTelegramLink due to WebApp version < 6.1...");
        tg.openTelegramLink(invoice_link);
        showToast("Opening invoice in Telegram...");
        setIsPaying(false);
      } else {
        // Sandbox fallback flow
        const nonce = invoice_link.includes("nonce=") 
          ? new URLSearchParams(invoice_link.split("#")[0].split("?")[1]).get("nonce") || "nonce_" + Date.now()
          : "nonce_" + Date.now();
        const payload = `donation_${amount}_${currentUser.id}_${nonce}`;

        setSandboxPaymentDetails({
          type: "donation",
          label: label,
          stars: amount,
          payload: payload,
          transactionId: "sb_tx_" + Math.random().toString(36).substring(2, 11).toUpperCase(),
          userId: currentUser.id,
          invoice_link: invoice_link
        });
        setIsPaying(false);
      }
    } catch (err: any) {
      console.error("Donation creation issue:", err);
      showToast("Donation link failed. Check configuration.");
      setIsPaying(false);
    }
  };

  const handleCustomDonationBtn = () => {
    const val = customStarAmount.trim();
    if (!val) {
      setCustomDonationError("Please enter an amount.");
      showToast("Please enter a custom amount.");
      return;
    }
    const amt = Number(val);
    if (isNaN(amt) || !Number.isInteger(amt) || amt <= 0) {
      setCustomDonationError("Please enter a positive whole number greater than 0.");
      showToast("Please enter a valid whole number greater than 0.");
      return;
    }
    setCustomDonationError("");
    handleSendDonation(amt, "Custom Stars Support");
  };

  // ── PREMIUM REFERRAL SYSTEM LOGIC ──
  const handleCopyReferralLink = () => {
    const userId = currentUser?.id || "believer_user";
    const refLink = getAppBaseUrl() + `invite?ref=${userId}`;
    
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(refLink)
        .then(() => {
          showToast("📋 Invite link copied successfully! Share with 1 friend.");
          triggerHapticNotification("success");
        })
        .catch(() => {
          showToast("Clipboard restricted in this context. Link: " + refLink);
        });
    } else {
      showToast("Referral Link: " + refLink);
    }
  };

  const handleSimulateReferral = () => {
    if (isSimulatingReferral) return;
    setIsSimulatingReferral(true);
    triggerHapticImpact("medium");

    showToast("🔗 Simulating referral click tracker...");

    setTimeout(() => {
      showToast("📲 Friend opened your invite & completed sign up...");
      triggerHapticImpact("light");
    }, 1500);

    setTimeout(() => {
      const newRefTotal = referralCount + 1;
      setReferralCount(newRefTotal);
      localStorage.setItem("bm_referrals_count", String(newRefTotal));

      const updatedCredits = freeQuestionsLeft + 5;
      setFreeQuestionsLeft(updatedCredits);
      localStorage.setItem("bm_fq_left", String(updatedCredits));

      setIsSimulatingReferral(false);
      setShowAiLimitModal(false);
      showToast("🎉 Referral qualified! 5 free AI query credits granted.");
      triggerHapticNotification("success");
    }, 3600);
  };

  const handleJoinChannelClick = () => {
    triggerHapticSelection();
    setHasClickedJoin(true);
    localStorage.setItem("bm_clicked_join", "1");
    window.open("https://t.me/tgbiblemannabot", "_blank");
  };

  const handleVerifyJoin = async () => {
    triggerHapticImpact("medium");
    
    if (currentUser?.channel_joined) {
      showToast("You've already verified and claimed your community bonus! 📖");
      return;
    }

    if (!hasClickedJoin) {
      setVerifyMessage("You haven't joined yet. Join the channel to claim your 5 bonus chats! 🙏");
      showToast("Please tap 'Join Community 👆' first! 🙏");
      return;
    }

    setIsVerifyingJoin(true);
    setVerifyMessage(null);

    setTimeout(() => {
      setIsVerifyingJoin(false);
      triggerHapticNotification("success");
      
      const updatedUser: UserType = {
        ...currentUser!,
        channel_joined: true,
        chat_trials_bonus: 5
      };
      setCurrentUser(updatedUser);
      localStorage.setItem("bm_user", JSON.stringify(updatedUser));

      const val = freeQuestionsLeft + 5;
      setFreeQuestionsLeft(val);
      localStorage.setItem("bm_fq_left", String(val));

      triggerSupabaseSync(updatedUser, prayers, savedVerses, chatHistory, readingPlans, reminders);

      setVerifyMessage("🎉 Welcome to the community! You now have 10 free AI chats today instead of 5. God bless you! 🙏");
      showToast("Bonus claimed successfully! ✨");
    }, 2000);
  };

  // ── PUSH REMINDER SYSTEM CHECKER & TRIGGER ENGINE ──
  const requestNotificationPermission = (silent = false) => {
    if (!("Notification" in window)) {
      if (!silent) {
        showToast("Push notifications are not supported on this browser.");
      }
      return;
    }
    Notification.requestPermission().then(permission => {
      setNotificationPermission(permission);
      if (permission === "granted") {
        if (!silent) {
          showToast("🔔 Grace and peace! Push notifications successfully activated.");
          triggerHapticNotification("success");
        }
      } else if (permission === "denied") {
        if (!silent) {
          showToast("⚠️ Notifications were blocked. Verify browser permission settings.");
          triggerHapticNotification("warning");
        }
      }
    });
  };

  const triggerTestNotification = () => {
    triggerHapticNotification("success");
    
    // If in Telegram mode, trigger automated Bot-level test notification via server proxy
    if (currentUser?.id) {
      fetch("/api/telegram-test-notification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegram_id: currentUser.id })
      })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          showToast("⚡ Test alert sent to your Telegram private chat!");
        }
      })
      .catch(err => {
        console.warn("Telegram bot test alert skipped or failed:", err);
      });
    }

    if (!("Notification" in window)) {
      showToast("⚠️ Web notifications not supported. Setting fallback in-app alert!");
      setInAppAlarmNotification({
        type: "morning",
        title: "🌅 Morning Manna Devotion (Test)",
        body: "Blessed assurance! Your in-app notifications are beautifully functional in this environment.",
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
      return;
    }

    if (Notification.permission === "granted") {
      try {
        new Notification("📖 Bible Manna Test Alarm", {
          body: "Blessed assurance! Your system notifications are beautifully functional in this environment.",
          icon: "https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&q=80&w=120"
        });
        if (!currentUser?.id) {
          showToast("Instant test notification dispatched.");
        }
      } catch (e) {
        setInAppAlarmNotification({
          type: "morning",
          title: "🌅 Morning Manna Devotion (Test)",
          body: "Blessed assurance! Your screen level notifications are beautifully active in this browser sandbox.",
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
        if (!currentUser?.id) {
          showToast("Test notification shown in-app.");
        }
      }
    } else {
      Notification.requestPermission().then(permission => {
        setNotificationPermission(permission);
        if (permission === "granted") {
          try {
            new Notification("📖 Bible Manna Alarm Verified", {
              body: "Blessed assurance! System push notifications are fully active.",
              icon: "https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&q=80&w=120"
            });
          } catch (err) {}
          if (!currentUser?.id) {
            showToast("Instant test notification dispatched!");
          }
        } else {
          if (!currentUser?.id) {
            showToast("⚠️ Please approve the permission prompt to test native alerts.");
          }
        }
      });
    }
  };

  useEffect(() => {
    const notifiedToday = {
      morning: localStorage.getItem("bm_last_notified_morning") || "",
      streak: localStorage.getItem("bm_last_notified_streak") || "",
    };

    const interval = setInterval(() => {
      const now = new Date();
      const todayStr = now.toDateString(); // e.g., "Mon Jun 15 2026"
      const currentHHMM = now.toTimeString().split(" ")[0].slice(0, 5); // e.g. "07:00"

      // Morning devotion check
      if (
        reminders.morning.enabled &&
        reminders.morning.time === currentHHMM &&
        notifiedToday.morning !== todayStr
      ) {
        notifiedToday.morning = todayStr;
        localStorage.setItem("bm_last_notified_morning", todayStr);
        triggerHapticNotification("success");

        const title = "🌅 Morning Manna Devotion";
        const body = "Grace and peace! Step into your daily devotion. A fresh scripture is ready for your soul.";

        if ("Notification" in window && Notification.permission === "granted") {
          try {
            new Notification(title, {
              body,
              icon: "https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&q=80&w=120"
            });
          } catch (e) {
            console.warn("Native Notification trigger skipped inside browser sandbox context: ", e);
          }
        }

        setInAppAlarmNotification({
          type: "morning",
          title,
          body,
          time: currentHHMM
        });
      }

      // Streak protection check
      if (
        reminders.streak.enabled &&
        reminders.streak.time === currentHHMM &&
        notifiedToday.streak !== todayStr
      ) {
        notifiedToday.streak = todayStr;
        localStorage.setItem("bm_last_notified_streak", todayStr);
        triggerHapticNotification("success");

        const title = "🔥 Streak Protection System";
        const body = "Your faith streak is precious! Take 2 minutes to read today's Manna scriptures.";

        if ("Notification" in window && Notification.permission === "granted") {
          try {
            new Notification(title, {
              body,
              icon: "https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&q=80&w=120"
            });
          } catch (e) {
            console.warn("Native Notification trigger skipped: ", e);
          }
        }

        setInAppAlarmNotification({
          type: "streak",
          title,
          body,
          time: currentHHMM
        });
      }
    }, 10000); // Check every 10 seconds for seamless precision with zero lag

    return () => clearInterval(interval);
  }, [reminders]);

  // ── DYNAMIC VERSE GRAPHICAL CARD GENERATOR (CANVAS) ──
  useEffect(() => {
    if (isShareModalOpen && activeShareVerse && shareCanvasRef.current) {
      renderShareCardCanvas();
    }
  }, [isShareModalOpen, activeShareVerse, customCardStyle]);

  const renderShareCardCanvas = () => {
    const canvas = shareCanvasRef.current;
    if (!canvas || !activeShareVerse) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const S = 800; // Resolution matching
    canvas.width = S;
    canvas.height = S;

    const style = CARD_THEMES[customCardStyle];

    // Radial Background gradient
    const gr = ctx.createRadialGradient(S * 0.3, S * 0.3, 0, S * 0.5, S * 0.5, S * 0.85);
    style.bg.forEach((color, index) => {
      gr.addColorStop(index / (style.bg.length - 1), color);
    });
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, S, S);

    // Light decorative patterns
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = style.accent;
    ctx.strokeStyle = style.accent;
    ctx.lineWidth = 1;

    if (style.pattern === "stars") {
      for (let i = 0; i < 40; i++) {
        ctx.beginPath();
        ctx.arc(Math.random() * S, Math.random() * S, Math.random() * 3 + 1, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (style.pattern === "rays") {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(S * 0.5, S * 0.5);
        ctx.lineTo(S * 0.5 + Math.cos(a) * S * 0.9, S * 0.5 + Math.sin(a) * S * 0.9);
        ctx.stroke();
      }
    } else if (style.pattern === "cross") {
      ctx.font = `${S * 0.08}px Georgia, serif`;
      ctx.textAlign = "center";
      [[0.15, 0.15], [0.85, 0.15], [0.15, 0.85], [0.85, 0.85], [0.5, 0.08]].forEach(([x, y]) => {
        ctx.fillText("✝", S * x, S * y);
      });
    } else if (style.pattern === "leaves") {
      ctx.font = `${S * 0.06}px Georgia, serif`;
      ctx.textAlign = "center";
      [[0.12, 0.12], [0.88, 0.12], [0.12, 0.88], [0.88, 0.88]].forEach(([x, y]) => {
        ctx.fillText("🌿", S * x, S * y);
      });
    } else if (style.pattern === "flames") {
      ctx.font = `${S * 0.07}px Georgia, serif`;
      ctx.textAlign = "center";
      [[0.15, 0.15], [0.85, 0.15], [0.5, 0.09]].forEach(([x, y]) => {
        ctx.fillText("🔥", S * x, S * y);
      });
    }
    ctx.restore();

    // Elegant Borders
    ctx.strokeStyle = style.accent;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.3;
    ctx.strokeRect(S * 0.05, S * 0.05, S * 0.9, S * 0.9);
    ctx.strokeRect(S * 0.06, S * 0.06, S * 0.88, S * 0.88);
    ctx.globalAlpha = 1.0;

    // Header Frame text
    ctx.font = `600 ${S * 0.026}px sans-serif`;
    ctx.fillStyle = style.accent;
    ctx.textAlign = "center";
    ctx.fillText("B I B L E   M A N N A", S * 0.5, S * 0.13);

    ctx.font = `italic ${S * 0.022}px Georgia, serif`;
    ctx.fillText("Verse of the Day", S * 0.5, S * 0.17);

    // Cross background watermark
    ctx.font = `${S * 0.2}px Georgia, serif`;
    ctx.fillStyle = style.accent;
    ctx.globalAlpha = 0.04;
    ctx.fillText("✝", S * 0.5, S * 0.53);
    ctx.globalAlpha = 1.0;

    // Body text printing with word-wrapping
    const verseText = activeShareVerse.text;
    const refText = activeShareVerse.ref;
    const finalFontSize = verseText.length > 120 ? S * 0.038 : S * 0.044;
    ctx.font = `italic ${finalFontSize}px Georgia, serif`;
    ctx.fillStyle = style.text;

    const maxTextWidth = S * 0.72;
    const words = `"${verseText}"`.split(" ");
    const lines: string[] = [];
    let currentLine = "";

    for (const w of words) {
      const nextStr = currentLine ? `${currentLine} ${w}` : w;
      if (ctx.measureText(nextStr).width > maxTextWidth) {
        lines.push(currentLine);
        currentLine = w;
      } else {
        currentLine = nextStr;
      }
    }
    if (currentLine) lines.push(currentLine);

    const lineHeight = finalFontSize * 1.5;
    const totalLinesHeight = lines.length * lineHeight;
    let startY = S * 0.5 - totalLinesHeight * 0.5;

    lines.forEach((line, i) => {
      ctx.fillText(line, S * 0.5, startY + i * lineHeight);
    });

    // Sub Reference link
    ctx.font = `bold ${S * 0.032}px Georgia, serif`;
    ctx.fillStyle = style.accent;
    ctx.fillText(`— ${refText}`, S * 0.5, startY + totalLinesHeight + S * 0.06);

    // Branding Footer
    ctx.font = `500 ${S * 0.02}px sans-serif`;
    ctx.fillStyle = style.accent;
    ctx.globalAlpha = 0.5;
    ctx.fillText("📖 t.me/BibleMannaBot", S * 0.5, S * 0.9);
    ctx.globalAlpha = 1.0;

    // Synchronize Canvas payload to image tag for friendly mobile triggers
    try {
      const dataUrl = canvas.toDataURL("image/png");
      setCardPreviewUrl(dataUrl);
    } catch(e) {}
  };

  const handleShareButtonTrigger = (verse: DailyVerse) => {
    setActiveShareVerse(verse);
    setIsShareModalOpen(true);
  };

  const handleCopyText = (text: string, ref: string) => {
    triggerHapticNotification("success");
    const fullText = `"${text}" — ${ref}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(fullText)
        .then(() => {
          showToast("Scripture copied to clipboard! 📋");
        })
        .catch(() => {
          const tempInput = document.createElement("textarea");
          tempInput.value = fullText;
          document.body.appendChild(tempInput);
          tempInput.select();
          try {
            document.execCommand("copy");
            showToast("Scripture copied to clipboard! 📋");
          } catch (e) {
            showToast("Failed to copy scripture text.");
          }
          document.body.removeChild(tempInput);
        });
    } else {
      const tempInput = document.createElement("textarea");
      tempInput.value = fullText;
      document.body.appendChild(tempInput);
      tempInput.select();
      try {
        document.execCommand("copy");
        showToast("Scripture copied to clipboard! 📋");
      } catch (e) {
        showToast("Failed to copy scripture text.");
      }
      document.body.removeChild(tempInput);
    }
  };

  const handleDownloadShareCard = () => {
    if (!cardPreviewUrl) {
      showToast("Generating card asset...");
      return;
    }
    triggerHapticNotification("success");
    const a = document.createElement("a");
    a.href = cardPreviewUrl;
    a.download = `bible-manna-${activeShareVerse?.ref.replace(/[^a-zA-Z0-9]/g, "_")}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast("Sacred verse template saved directly onto your device!");
  };

  const handleNativeShareCard = async () => {
    triggerHapticNotification("success");
    if (isTelegramEnvironment) {
      const shareText = `📖 ${activeShareVerse?.ref}\n\n"${activeShareVerse?.text}"\n\nBuild daily faith habits with Bible Manna Mini App:\nt.me/BibleMannaBot`;
      const encoded = encodeURIComponent(shareText);
      window.open(`https://t.me/share/url?url=https://t.me/BibleMannaBot&text=${encoded}`);
      showToast("Opening Telegram Share window...");
      setIsShareModalOpen(false);
      return;
    }

    if (navigator.share) {
      try {
        await navigator.share({
          title: "Scripture Devotional",
          text: `"${activeShareVerse?.text}" — ${activeShareVerse?.ref}\nShared from Bible Manna`,
          url: "https://t.me/BibleMannaBot"
        });
        showToast("Shared successfully.");
        setIsShareModalOpen(false);
      } catch (e) {}
    } else {
      handleDownloadShareCard();
    }
  };

  const checkTopTenAchievement = (rank: number) => {
    const key = `rank_${rank}`;
    if (rank <= 10 && !hasNotifiedTop10[key]) {
      setHasNotifiedTop10(prev => ({ ...prev, [key]: true }));
      showToast(`🏆 Extraordinary Faith! You rose to Rank #${rank} on the global rankings!`);
    }
  };


  return (
    <div className="relative min-h-screen w-full bg-[#03060F] text-[#EEE9E0] font-sans antialiased overflow-x-hidden flex flex-col justify-between">
      
      {/* ── BACKGROUND DRIFTING BLOBS & LIQUID GRADIENTS ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-100px] left-[-100px] w-[500px] h-[500px] bg-purple-900/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-100px] right-[-100px] w-[500px] h-[500px] bg-amber-900/10 rounded-full blur-[120px]" />
        <div className="absolute top-[20%] right-[10%] w-[300px] h-[300px] bg-blue-900/20 rounded-full blur-[100px]" />
      </div>

      {/* ── PORTRAIT MOBILE FRAME ENFORCER ── */}
      <div className="relative z-10 w-full max-w-[480px] mx-auto h-screen max-h-screen md:h-[100dvh] flex flex-col bg-[rgba(3,6,15,0.73)] border-x border-white/5 shadow-2xl overflow-hidden">
        
        {/* TOP STATUS NAVIGATION BAR (Except Onboarding) */}
        {currentScreen !== "onboard" && (
          <header className="flex items-center justify-between px-5 pt-6 pb-3 flex-shrink-0">
            {currentScreen !== "home" ? (
              <button 
                onClick={goBack} 
                className="flex items-center gap-1 text-xs uppercase tracking-wider font-bold text-[#EEE9E0]/60 hover:text-[#D4A843] transition-colors"
              >
                <ChevronLeft size={16} />
                <span>Back</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                {currentUser ? (
                  <div className="flex items-center gap-2.5">
                    {/* Perfect circular avatar (border-radius: 50%) */}
                    <div 
                      style={{ borderRadius: "50%" }}
                      className="relative w-8 h-8 overflow-hidden border border-[#D4A843]/30 bg-[#D4A843]/10 flex items-center justify-center shrink-0"
                    >
                      {currentUser.photo_url && !avatarLoadError ? (
                        <img 
                          src={currentUser.photo_url} 
                          alt={currentUser.first_name || "Believer"} 
                          referrerPolicy="no-referrer"
                          style={{ borderRadius: "50%" }}
                          className="w-full h-full object-cover"
                          onError={() => setAvatarLoadError(true)}
                        />
                      ) : (
                        /* Default Bible/cross icon placeholder in same circular style */
                        <BookOpen size={14} className="text-[#D4A843]" />
                      )}
                    </div>
                    {/* User Greeting */}
                    <div className="flex flex-col">
                      <span className="text-[11px] font-sans font-semibold text-[#EEE9E0] leading-tight">
                        Welcome, {currentUser.first_name || "Believer"} 🙏
                      </span>
                      <span className="text-[8px] uppercase tracking-widest text-[#D4A843] font-mono font-extrabold -mt-0.5 flex items-center gap-1">
                        {isPremium ? "Manna Premium 👑" : "Bible Manna"}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="font-serif text-xl font-bold tracking-tight text-[#D4A843] italic drop-shadow-md">Bible Manna</span>
                    {isPremium && (
                      <span className="text-[8px] bg-gradient-to-r from-[#D4A843] to-[#F0CC6A] text-black font-extrabold px-1.5 py-0.5 rounded shadow">PREM</span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Streak Pills */}
            <div 
              onClick={() => goTo("profile")} 
              className="flex items-center gap-1.5 px-4 py-1.5 glass-premium-interact rounded-full text-xs font-semibold text-[#D4A843] cursor-pointer"
            >
              <Flame size={14} className="fill-[#D4A843] text-[#D4A843]" />
              <span>{currentUser?.streak_count || 1} Days</span>
            </div>
          </header>
        )}

        {/* ── MAIN PORT BODY CONTAINER WITH ANIMATION ── */}
        <main 
          style={{ scrollBehavior: "smooth", WebkitOverflowScrolling: "touch" }}
          className="flex-1 w-full overflow-y-auto px-4 pb-20 no-scrollbar"
        >
          <AnimatePresence mode="wait">
            
            {/* 1. ONBOARDING SCREEN */}
            {currentScreen === "onboard" && (
              <motion.div
                key="onboard"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.3 }}
                className="flex flex-col items-center justify-center min-h-[85vh] text-center py-8"
              >
                <div className="w-24 h-24 rounded-[32px] bg-gradient-to-br from-[#D4A843] to-[#F0CC6A] p-0.5 flex items-center justify-center mb-6 shadow-2xl relative">
                  <div className="w-full h-full rounded-[30px] bg-[#03060F] flex items-center justify-center text-[#D4A843]">
                    <BookOpen size={44} />
                  </div>
                  <div className="absolute inset-0 bg-[#D4A843] rounded-[32px] filter blur-xl opacity-25" />
                </div>

                <h1 className="font-serif text-4xl font-extrabold text-[#D4A843] tracking-widest mb-3 drop-shadow">BIBLE MANNA</h1>
                <p className="text-sm text-[#EEE9E0]/60 max-w-sm leading-relaxed mb-8">
                  Your daily source of divine nourishment. Renew your mind, build holy habits, and explore the wisdom of Scripture.
                </p>

                {/* Key Onboarding Highlights */}
                <div className="w-full space-y-4 mb-8 glass-premium p-5 rounded-[32px] text-left">
                  <div className="flex items-center gap-4 text-sm">
                    <div className="p-2.5 rounded-xl bg-[#D4A843]/10 border border-[#D4A843]/20 text-[#D4A843]">
                      <Sparkles size={16} />
                    </div>
                    <div>
                      <h4 className="font-semibold text-white">Daily Devotional Verses</h4>
                      <p className="text-xs text-[#EEE9E0]/50 leading-relaxed">Reflect on fresh, rotated wisdom every morning.</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-sm">
                    <div className="p-2.5 rounded-xl bg-[#D4A843]/10 border border-[#D4A843]/20 text-[#D4A843]">
                      <MessageSquare size={16} />
                    </div>
                    <div>
                      <h4 className="font-semibold text-white">Ask the Bible</h4>
                      <p className="text-xs text-[#EEE9E0]/50 leading-relaxed">Compassionate AI answering with specific references.</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-sm">
                    <div className="p-2.5 rounded-xl bg-[#D4A843]/10 border border-[#D4A843]/20 text-[#D4A843]">
                      <Flame size={16} className="fill-[#D4A843] text-[#D4A843]" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-white">Habit Streaks</h4>
                      <p className="text-xs text-[#EEE9E0]/50 leading-relaxed">Stay committed to daily Scripture readings.</p>
                    </div>
                  </div>
                </div>

                <button 
                  onClick={handleOnboardingNext}
                  className="w-full py-4 bg-gradient-to-r from-[#D4A843] to-[#A87820] text-black font-extrabold text-xs uppercase tracking-[0.2em] rounded-xl cursor-pointer hover:opacity-90 active:scale-95 transition-all shadow-lg glow-gold"
                >
                  Begin Your Journey
                </button>
              </motion.div>
            )}

            {/* 2. THE MAIN HOME SCREEN */}
            {currentScreen === "home" && (() => {
              const devotionInfo = getDailyVerseDevotion(todayVerse.ref, todayVerse.text);
              return (
                <motion.div
                  key="home"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-6 pt-2"
                >
                  {/* Visual Devotional Card */}
                  <div 
                    className="relative overflow-hidden rounded-[32px] p-8 glass-premium flex flex-col justify-center min-h-[250px] group transition-all duration-300 hover:border-[#D4A843]/30"
                  >
                    <span className="absolute top-0 right-0 p-6 text-7xl opacity-[0.04] font-serif italic text-[#EEE9E0] select-none pointer-events-none">“</span>
                    
                    <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.2em] text-[#D4A843] uppercase mb-4">
                      <Sparkles size={14} />
                      <span>Verse of the Day</span>
                    </div>

                    <p className="font-serif text-xl italic leading-relaxed text-[#EEE9E0] mb-4 drop-shadow">
                      "{todayVerse.text}"
                    </p>
                    
                    <span className="block font-serif text-sm font-semibold text-[#D4A843]/90 mb-5 italic">
                      — {todayVerse.ref}
                    </span>

                    <div className="flex items-center gap-2 pt-1">
                      <button 
                        onClick={() => handleShareButtonTrigger(todayVerse)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-white/5 border border-white/10 hover:border-[#D4A843]/30 hover:bg-white/10 active:scale-97 text-xs font-semibold text-[#EEE9E0] transition-all cursor-pointer truncate"
                      >
                        <Share2 size={13} className="text-[#D4A843]" />
                        <span>Share Card</span>
                      </button>
                      
                      <button 
                        onClick={() => {
                          const exactBook = todayVerse.ref.split(" ")[0].toLowerCase();
                          setCurrentBook(exactBook);
                          goTo("read");
                        }}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-white/5 border border-white/10 hover:border-[#D4A843]/30 hover:bg-white/10 active:scale-97 text-xs font-semibold text-[#EEE9E0] transition-all cursor-pointer truncate"
                      >
                        <BookOpen size={13} className="text-[#D4A843]" />
                        <span>Read book</span>
                      </button>

                      <button 
                        onClick={() => {
                          goTo("ask");
                          setTimeout(() => {
                            useChatPromptChip(`What is the historical context of ${todayVerse.ref}, and how does it apply to us today?`);
                          }, 200);
                        }}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-[#D4A843]/10 border border-[#D4A843]/30 text-[#D4A843] hover:bg-[#D4A843]/20 active:scale-97 text-xs font-bold transition-all cursor-pointer truncate"
                      >
                        <MessageSquare size={13} />
                        <span>Ask AI</span>
                      </button>
                    </div>
                  </div>

                  {/* Daily Reflection Section */}
                  <div className="p-6 rounded-[28px] glass-premium space-y-3 border border-white/[0.02]">
                    <div className="flex items-center gap-2 text-xs font-bold tracking-[0.2em] text-[#D4A843] uppercase">
                      <Feather size={13} />
                      <span>Daily Reflection</span>
                    </div>
                    <p className="text-[#EEE9E0]/80 font-sans text-xs leading-relaxed">
                      {devotionInfo.reflection}
                    </p>
                    <div className="flex flex-wrap gap-1.5 pt-2">
                      {devotionInfo.focus.map((tag, idx) => (
                        <span key={idx} className="text-[9px] font-bold tracking-wider uppercase py-0.5 px-2.5 rounded-full bg-[#D4A843]/15 border border-[#D4A843]/30 text-[#D4A843]">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Breath Prayer Sanctuary */}
                  <div className="p-6 rounded-[28px] bg-gradient-to-br from-[#1A1105] to-[#0A0D14] border border-[#D4A843]/15 space-y-3.5 shadow-xl relative overflow-hidden">
                    <div className="absolute top-[-30px] right-[-30px] w-24 h-24 bg-[#D4A843]/5 rounded-full blur-2xl pointer-events-none" />
                    
                    <div className="flex items-center gap-2 text-xs font-bold tracking-[0.2em] text-[#D4A843] uppercase">
                      <Heart size={13} className="fill-[#D4A843]/10 text-[#D4A843]" />
                      <span>Today's Breath Prayer</span>
                    </div>
                    
                    <p className="font-serif italic text-xs text-[#EEE9E0]/90 leading-relaxed pl-3 border-l-[3px] border-[#D4A843]/40">
                      "{devotionInfo.prayer}"
                    </p>

                    <button
                      onClick={() => handleSaveDailyPrayerToJournal(devotionInfo.prayer)}
                      className="w-full py-2.5 px-4 rounded-xl bg-[#D4A843]/10 border border-[#D4A843]/25 text-[#D4A843] hover:bg-[#D4A843]/20 hover:border-[#D4A843]/40 active:scale-98 text-xs font-bold font-sans flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm mt-1"
                    >
                      <Heart size={12} className="fill-[#D4A843] text-[#D4A843]" />
                      <span>Save Prayer to Journal</span>
                    </button>
                  </div>

                  {/* Dashboard grid quick routes */}
                  <div>
                    <h3 className="text-[10px] uppercase tracking-[0.2em] text-[#EEE9E0]/40 font-bold mb-3 pl-1">Quick Navigation</h3>
                    <div className="grid grid-cols-2 gap-4">
                      
                      <div 
                        onClick={() => goTo("ask")}
                        className="p-5 rounded-[24px] glass-premium-interact cursor-pointer flex flex-col justify-between"
                      >
                        <div className="w-12 h-12 rounded-xl bg-[#D4A843]/10 border border-[#D4A843]/20 flex items-center justify-center text-[#D4A843] mb-4">
                          <MessageSquare size={20} />
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-white mb-0.5">Ask the Bible</h4>
                          <p className="text-[10px] text-[#EEE9E0]/50">Answers powered by AI</p>
                        </div>
                      </div>

                      <div 
                        onClick={() => goTo("read")}
                        className="p-5 rounded-[24px] glass-premium-interact cursor-pointer flex flex-col justify-between"
                      >
                        <div className="w-12 h-12 rounded-xl bg-[#D4A843]/10 border border-[#D4A843]/20 flex items-center justify-center text-[#D4A843] mb-4">
                          <BookOpen size={20} />
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-white mb-0.5">Read Bible</h4>
                          <p className="text-[10px] text-[#EEE9E0]/50">All 66 full scripture books</p>
                        </div>
                      </div>

                      <div 
                        onClick={() => goTo("pray")}
                        className="p-5 rounded-[24px] glass-premium-interact cursor-pointer flex flex-col justify-between"
                      >
                        <div className="w-12 h-12 rounded-xl bg-[#D4A843]/10 border border-[#D4A843]/20 flex items-center justify-center text-[#D4A843] mb-4">
                          <Heart size={20} className="fill-[#D4A843] text-[#D4A843]" />
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-white mb-0.5">Prayer Journal</h4>
                          <p className="text-[10px] text-[#EEE9E0]/50">Save & celebrate prayers</p>
                        </div>
                      </div>

                      <div 
                        onClick={() => goTo("leaderboard")}
                        className="p-5 rounded-[24px] glass-premium-interact cursor-pointer flex flex-col justify-between"
                      >
                        <div className="w-12 h-12 rounded-xl bg-[#D4A843]/10 border border-[#D4A843]/20 flex items-center justify-center text-[#D4A843] mb-4">
                          <Trophy size={20} />
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-white mb-0.5">Leaderboard</h4>
                          <p className="text-[10px] text-[#EEE9E0]/50">Global believers rank</p>
                        </div>
                      </div>

                    </div>
                  </div>

                </motion.div>
              );
            })()}

            {/* 3. BIBLE CHAPTER READER */}
            {currentScreen === "read" && (
              <motion.div
                key="read"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-5 pt-1"
              >
                {/* Book & Chapter selection row */}
                <div className="flex gap-3">
                  <select 
                    value={currentBook}
                    onChange={handleBookSelector}
                    className="flex-1 py-3.5 px-4 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none cursor-pointer focus:border-[#D4A843]"
                  >
                    {BIBLE_BOOKS.map(b => (
                      <option key={b.id} value={b.id} className="bg-[#03060F]">
                        {b.name}
                      </option>
                    ))}
                  </select>

                  <select 
                    value={currentChapter}
                    onChange={handleChapterSelector}
                    className="w-28 py-3.5 px-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none cursor-pointer focus:border-[#D4A843]"
                  >
                    {Array.from({ length: BIBLE_BOOKS.find(b => b.id === currentBook)?.chapters || 1 }, (_, i) => (
                      <option key={i + 1} value={i + 1} className="bg-[#03060F]">
                        Ch {i + 1}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Chapter pager */}
                <div className="flex items-center justify-between gap-1.5 py-1">
                  <button 
                    onClick={handleBiblePrevChapter}
                    className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs font-bold uppercase tracking-wider text-[#EEE9E0]/80 hover:border-[#D4A843]/30 hover:bg-white/10 active:scale-97 cursor-pointer transition-all"
                  >
                    ← Prev
                  </button>
                  <div className="px-5 py-2.5 font-serif text-xs font-bold bg-[#D4A843]/10 border border-[#D4A843]/20 rounded-xl text-[#D4A843] text-center uppercase tracking-wider whitespace-nowrap min-w-[120px]">
                    Chapter {currentChapter}
                  </div>
                  <button 
                    onClick={handleBibleNextChapter}
                    className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs font-bold uppercase tracking-wider text-[#EEE9E0]/80 hover:border-[#D4A843]/30 hover:bg-white/10 active:scale-97 cursor-pointer transition-all"
                  >
                    Next →
                  </button>
                </div>

                {/* Chapter Verses Print list */}
                <div className="p-6 rounded-[32px] glass-premium relative">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-[rgba(212,168,67,0.05)] rounded-full filter blur-2xl pointer-events-none" />
                  
                  <h2 className="font-serif text-[#D4A843] text-center text-base tracking-wide border-b border-white/5 pb-4 mb-5">
                    {BIBLE_BOOKS.find(b => b.id === currentBook)?.name} · Chapter {currentChapter}
                  </h2>

                  {isBibleLoading ? (
                    <div className="py-24 text-center space-y-4">
                      <div className="w-8 h-8 rounded-full border-2 border-t-transparent border-[#D4A843] animate-spin mx-auto" />
                      <p className="text-xs text-[#EEE9E0]/40 font-mono tracking-widest uppercase">Loading sacred word...</p>
                    </div>
                  ) : (
                    <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1 no-scrollbar">
                      {chapterVerses.map(v => (
                        <div 
                          key={v.verse} 
                          onClick={() => handleVerseClickEvent(v.text, v.verse)}
                          className="flex gap-4 items-start cursor-pointer hover:bg-white/5 p-3 rounded-2xl transition-all group"
                        >
                          <span className="text-xs font-bold font-mono text-[#D4A843] pt-0.5 min-w-[20px] text-right">
                            {v.verse}
                          </span>
                          <p className="text-sm leading-relaxed text-[#EEE9E0]/90 group-hover:text-white transition-colors">
                            {v.text}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* 4. AI CHAT COMPANION */}
            {currentScreen === "ask" && (
              <motion.div
                key="ask"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col min-h-[75vh]"
              >
                {/* Top stats bar */}
                <div className="flex items-center justify-between px-4 py-3 glass-premium rounded-[20px] mb-4">
                  <span className="text-xs text-[#EEE9E0]/60">
                    Free AI Queries: <strong className="text-[#D4A843]">{isPremium ? "∞" : freeQuestionsLeft}</strong>/{currentUser?.channel_joined ? 10 : 5}
                  </span>
                  {!isPremium && (
                    <button 
                      onClick={() => goTo("premium")}
                      className="text-xs text-[#D4A843] font-bold hover:underline transition-all"
                    >
                      Unlock Unlimited ✦
                    </button>
                  )}
                </div>

                {/* Suggestions chips folder */}
                {chatHistory.length === 0 && (
                  <div className="mb-4">
                    <span className="block text-[10px] uppercase text-[#EEE9E0]/40 font-bold tracking-[0.2em] mb-2.5 pl-1">Suggested Questions</span>
                    <div className="flex gap-2.5 overflow-x-auto pb-2 no-scrollbar">
                      {[
                        "How to conquer persistent fear?",
                        "What is forgiveness?",
                        "Comfort for losing a dear one",
                        "Bible verses about strength",
                        "John 3:16 reflection"
                      ].map(chip => (
                        <button
                          key={chip}
                          onClick={() => useChatPromptChip(chip)}
                          className="py-2.5 px-4 rounded-full bg-white/5 border border-white/10 whitespace-nowrap text-xs text-[#EEE9E0] hover:bg-[#D4A843]/10 hover:border-[#D4A843]/30 active:scale-95 transition-all cursor-pointer"
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Messages log */}
                <div className="flex-1 space-y-4 min-h-[420px] max-h-[480px] overflow-y-auto no-scrollbar py-2">
                  
                  {/* Default AI greeting */}
                  <div className="flex flex-col gap-1 items-start max-w-[85%] self-start text-left">
                    <span className="text-[10px] text-[#EEE9E0]/40 pl-2">Bible Manna AI</span>
                    <div className="p-4 rounded-3xl rounded-tl-sm bg-white/5 border border-white/10 text-sm leading-relaxed text-[#EEE9E0]/90">
                      Peace be with you 🕊️ Ask me anything about Scripture — a verse, a life situation, or what the Bible says about something you're facing right now.
                    </div>
                  </div>

                  {chatHistory.map(msg => (
                    <div 
                      key={msg.id}
                      className={`flex flex-col gap-1 max-w-[85%] ${msg.role === "user" ? "self-end items-end ml-auto text-right" : "self-start items-start text-left"}`}
                    >
                      <span className="text-[10px] text-[#EEE9E0]/40 px-2">{msg.senderName}</span>
                      <div 
                        className={`p-4 rounded-3xl text-sm leading-relaxed ${msg.role === "user" 
                          ? "rounded-tr-sm bg-gradient-to-r from-[#D4A843] to-[#A87820] text-black font-semibold shadow-lg" 
                          : "rounded-tl-sm bg-white/5 border border-white/10 text-[#EEE9E0]/90"}`}
                        dangerouslySetInnerHTML={{ __html: msg.text.replace(/\n/g, "<br/>") }}
                      />
                    </div>
                  ))}

                  {isAiTyping && (
                    <div className="flex flex-col gap-1 items-start max-w-[85%] self-start text-left">
                      <span className="text-[10px] text-[#EEE9E0]/40 pl-2">Bible Manna AI</span>
                      <div className="p-4 rounded-3xl rounded-tl-sm bg-white/5 border border-white/10 flex items-center gap-1.5 py-4 px-5">
                        <div className="w-2 h-2 rounded-full bg-[#D4A843] animate-bounce" />
                        <div className="w-2 h-2 rounded-full bg-[#D4A843] animate-bounce" style={{ animationDelay: "0.2s" }} />
                        <div className="w-2 h-2 rounded-full bg-[#D4A843] animate-bounce" style={{ animationDelay: "0.4s" }} />
                      </div>
                    </div>
                  )}

                </div>

                {/* Input block */}
                <div className="mt-auto pt-4 border-t border-white/5">
                  <div className="flex gap-2.5">
                    <input 
                      type="text"
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") handleAiSendMessage(); }}
                      placeholder="Ask Bible or discuss situation..."
                      className="flex-1 py-3.5 px-4 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-[#D4A843]"
                    />
                    <button 
                      onClick={() => handleAiSendMessage()}
                      className="w-12 h-12 rounded-xl bg-gradient-to-r from-[#D4A843] to-[#A87820] flex items-center justify-center text-black cursor-pointer hover:opacity-90 active:scale-95 transition-all shadow-lg glow-gold"
                    >
                      <MessageSquare size={18} />
                    </button>
                  </div>
                </div>

              </motion.div>
            )}

            {/* 5. PRAYER JOURNAL DIALOG */}
            {currentScreen === "pray" && (
              <motion.div
                key="pray"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-6 pt-1"
              >
                {/* Saved prayer input card */}
                <div className="p-6 rounded-[32px] glass-premium text-sm space-y-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#D4A843] tracking-[0.2em] uppercase">
                    <Heart size={14} className="fill-[#D4A843]" />
                    <span>New Prayer Petition</span>
                  </div>
                  <textarea
                    value={prayerInput}
                    onChange={e => setPrayerInput(e.target.value)}
                    placeholder="Write down your prayers here... Cry out your hopes, worries, or words of worship to him."
                    className="w-full h-24 p-3 bg-white/5 border border-white/10 rounded-xl outline-none resize-none text-[#EEE9E0] text-sm leading-relaxed focus:border-[#D4A843]/50 transition-all"
                  />
                  <button 
                    onClick={handleSavePrayer}
                    className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#D4A843] to-[#A87820] text-black font-extrabold text-xs uppercase tracking-wider cursor-pointer hover:opacity-95 shadow-lg glow-gold transition-all"
                  >
                    Save Unto Journal
                  </button>
                </div>

                {/* Prayers list output log */}
                <div>
                  <h3 className="text-[10px] uppercase tracking-[0.2em] text-[#EEE9E0]/40 font-bold mb-3 pl-1">Your Prayers</h3>
                  <div className="space-y-4">
                    {prayers.length === 0 ? (
                      <div className="py-16 text-center text-[#EEE9E0]/30 select-none glass-premium rounded-[24px] border border-white/5">
                        <Heart size={36} className="mx-auto opacity-20 mb-3" />
                        <p className="text-xs">Your journal is empty. Add your first prayer today.</p>
                      </div>
                    ) : (
                      prayers.map(p => (
                        <div 
                          key={p.id}
                          className={`p-5 rounded-[24px] glass-premium flex flex-col justify-between border-l-4 ${p.answered ? "border-l-emerald-500" : "border-l-[#D4A843]"} gap-3 transition-all`}
                        >
                          <p className="text-sm leading-relaxed text-[#EEE9E0]/90">{p.content}</p>
                          <div className="flex items-center justify-between gap-1 pt-3 border-t border-white/5 mt-1 text-[10px]">
                            <span className="text-[#EEE9E0]/40 font-mono">
                              {new Date(p.created_at).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
                            </span>
                            <div className="flex gap-2">
                              {!p.answered && (
                                <button 
                                  onClick={() => handleMarkPrayerAnswered(p.id)}
                                  className="py-1 px-3 text-emerald-400 hover:bg-emerald-500/10 rounded-lg font-bold transition-all uppercase tracking-wider"
                                >
                                  Answered!
                                </button>
                              )}
                              <button 
                                onClick={() => handleDeletePrayer(p.id)}
                                className="py-1 px-2.5 text-red-400 hover:bg-red-500/10 rounded-lg font-bold transition-all uppercase tracking-wider"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

              </motion.div>
            )}

            {/* 6. USER PROFILE & MY PROGRESS */}
            {currentScreen === "profile" && (
              <motion.div
                key="profile"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-6 pt-1"
              >
                {/* Big Streak Hero Dashboard */}
                <div className="p-8 rounded-[32px] glass-premium text-center relative overflow-hidden shadow-2xl">
                  <div className="absolute top-[-30px] right-[-30px] w-28 h-28 bg-[rgba(212,168,67,0.1)] rounded-full filter blur-xl" />
                  
                  <span className="text-5xl block mb-3">🔥</span>
                  <strong className="font-serif text-6xl font-extrabold text-[#D4A843] block leading-none drop-shadow">
                    {currentUser?.streak_count || 1}
                  </strong>
                  <span className="text-[10px] uppercase tracking-[0.25em] text-[#EEE9E0]/45 font-bold block mt-2">Active Habit Streak</span>

                  {/* Week tracker row */}
                  <div className="grid grid-cols-7 gap-1.5 mt-6">
                    {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day, idx) => {
                      const todayIdx = new Date().getDay();
                      const isToday = idx === todayIdx;
                      
                      // Safely compute the corresponding date string for this specific day slot of the current week
                      const todayDateObj = new Date();
                      const dayOffset = idx - todayIdx;
                      const slotDate = new Date(todayDateObj);
                      slotDate.setDate(todayDateObj.getDate() + dayOffset);
                      const slotDateStr = slotDate.toISOString().split("T")[0];
                      
                      const isDayCompleted = activityDates.includes(slotDateStr);

                      return (
                        <div 
                          key={day}
                          className={`py-2 px-1 rounded-xl flex flex-col items-center gap-2 text-[9px] font-bold tracking-wider transition-all ${
                            isDayCompleted ? "bg-[#D4A843]/20 border border-[#D4A843]/40 text-[#D4A843]" : 
                            isToday ? "bg-white/5 border border-white/15 text-[#EEE9E0] font-extrabold" : "text-[#EEE9E0]/25 border border-transparent"
                          }`}
                        >
                          <span className="font-mono uppercase">{day}</span>
                          <div className={`w-1.5 h-1.5 rounded-full ${isDayCompleted ? "bg-[#D4A843] shadow-[0_0_8px_#D4A843]" : "bg-white/10"}`} />
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Grid engagement stats metrics */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-5 rounded-[24px] glass-premium text-center relative group">
                    <span className="font-serif text-3xl font-bold text-[#D4A843]" id="profile-verses-count">
                      {currentUser?.verses_read || 0}
                    </span>
                    <p className="text-[10px] text-[#EEE9E0]/45 uppercase font-bold tracking-wider mt-1.5">Verses Read</p>
                  </div>

                  <div className="p-5 rounded-[24px] glass-premium text-center relative group">
                    <span className="font-serif text-3xl font-bold text-[#D4A843]">
                      {prayers.length}
                    </span>
                    <p className="text-[10px] text-[#EEE9E0]/45 uppercase font-bold tracking-wider mt-1.5">Prayers Saved</p>
                  </div>

                  <div className="p-5 rounded-[24px] glass-premium text-center relative group">
                    <span className="font-serif text-3xl font-bold text-[#D4A843]">
                      {chatHistory.filter(c => c.role === "user").length}
                    </span>
                    <p className="text-[10px] text-[#EEE9E0]/45 uppercase font-bold tracking-wider mt-1.5">AI Queries</p>
                  </div>

                  <div className="p-5 rounded-[24px] glass-premium text-center relative group">
                    <span className="font-serif text-3xl font-bold text-[#D4A843]">
                      {savedVerses.length}
                    </span>
                    <p className="text-[10px] text-[#EEE9E0]/45 uppercase font-bold tracking-wider mt-1.5">Bookmarked</p>
                  </div>
                </div>

                {/* ── TELEGRAM COMMUNITY JOIN CARD ── */}
                <div className="space-y-3">
                  <h3 className="text-[10px] uppercase tracking-[0.2em] text-[#EEE9E0]/40 font-bold pl-1">Telegram Community Bonus</h3>
                  <div className="p-6 rounded-[28px] glass-premium relative overflow-hidden space-y-4 text-left border border-white/[0.03]">
                    {/* Glowing golden accent spotlight in background */}
                    <div className="absolute top-[-40px] left-[-40px] w-32 h-32 bg-[rgba(212,168,67,0.06)] rounded-full filter blur-2xl pointer-events-none" />
                    
                    <div className="flex items-start gap-4">
                      <span className="text-2xl pt-0.5">🙌</span>
                      <div className="space-y-1 flex-1">
                        <h4 className="font-serif text-sm font-bold text-[#D4A843] leading-snug">
                          {currentUser?.channel_joined ? "Community Member Verified" : "Join & Earn 5 Extra Chats!"}
                        </h4>
                        <p className="text-xs text-[#EEE9E0]/80 leading-relaxed">
                          {currentUser?.channel_joined ? (
                            "🎉 Welcome to the community! You now have 10 free AI chats today instead of 5. God bless you! 🙏"
                          ) : (
                            "Join our Telegram Community and get 5 extra FREE AI chat trials as a bonus! 🙏✨"
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Action buttons if not joined/verified yet */}
                    {!currentUser?.channel_joined && (
                      <div className="space-y-3 pt-1">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <button
                            type="button"
                            onClick={handleJoinChannelClick}
                            className={`w-full py-3 px-4 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-300 cursor-pointer text-center ${
                              hasClickedJoin 
                                ? "bg-white/5 border border-white/10 text-white/75 hover:bg-white/10" 
                                : "bg-gradient-to-r from-[#D4A843] to-[#A87820] text-black font-extrabold shadow-lg glow-gold hover:opacity-95"
                            }`}
                          >
                            {hasClickedJoin ? "Joined Channel? 👆" : "Join Community 👆"}
                          </button>

                          {(hasClickedJoin || verifyMessage) && (
                            <button
                              type="button"
                              onClick={handleVerifyJoin}
                              disabled={isVerifyingJoin}
                              className="w-full py-3 px-4 bg-teal-500/15 hover:bg-teal-500/25 border border-teal-500/30 text-teal-400 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer text-center flex items-center justify-center gap-1.5 disabled:opacity-50"
                            >
                              {isVerifyingJoin ? (
                                <>
                                  <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-teal-400 border-t-transparent rounded-full" />
                                  <span>Checking...</span>
                                </>
                              ) : (
                                "Verify Join ✅"
                              )}
                            </button>
                          )}
                        </div>

                        {/* Reminder / Feedback messages */}
                        {verifyMessage && (
                          <div className={`p-3.5 rounded-xl text-[11px] leading-relaxed flex items-start gap-2 border bg-black/20 ${
                            verifyMessage.includes("Welcome") 
                              ? "border-teal-500/20 text-teal-400" 
                              : "border-amber-500/20 text-amber-300"
                          }`}>
                            <span>{verifyMessage.includes("Welcome") ? "✨" : "⚠️"}</span>
                            <span className="font-serif italic flex-1">{verifyMessage}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Reminders list config section */}
                <div>
                  <h3 className="text-[10px] uppercase tracking-[0.2em] text-[#EEE9E0]/40 font-bold mb-3 pl-1">Daily Faith Reminders</h3>
                  <div className="space-y-4">
                    
                    <div className="p-5 rounded-[24px] glass-premium space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5 text-sm text-[#EEE9E0] font-semibold">
                          <Bell size={16} className="text-[#D4A843]" />
                          <span>Morning Devotion Alarm</span>
                        </div>
                        {/* Selector toggle button */}
                        <div 
                          onClick={() => handleToggleReminder("morning")}
                          className={`w-11 h-6 rounded-full cursor-pointer relative p-0.5 transition-colors duration-300 ${reminders.morning.enabled ? "bg-[#D4A843]" : "bg-white/10"}`}
                        >
                          <div className={`w-5 h-5 rounded-full bg-white shadow-md absolute top-0.5 transition-all duration-300 ${reminders.morning.enabled ? "left-[21px]" : "left-[2px]"}`} />
                        </div>
                      </div>
                      <input 
                        type="time" 
                        value={reminders.morning.time}
                        onChange={e => handleReminderTimeChange("morning", e.target.value)}
                        className="w-full py-3 px-4 bg-white/5 border border-white/10 rounded-xl text-white text-sm outline-none font-mono focus:border-[#D4A843]/50 transition-all"
                      />
                    </div>

                    <div className="p-5 rounded-[24px] glass-premium space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5 text-sm text-[#EEE9E0] font-semibold">
                          <Flame size={16} className="text-[#D4A843]" />
                          <span>Streak Protection Alert</span>
                        </div>
                        {/* Selector toggle button */}
                        <div 
                          onClick={() => handleToggleReminder("streak")}
                          className={`w-11 h-6 rounded-full cursor-pointer relative p-0.5 transition-colors duration-300 ${reminders.streak.enabled ? "bg-[#D4A843]" : "bg-white/10"}`}
                        >
                          <div className={`w-5 h-5 rounded-full bg-white shadow-md absolute top-0.5 transition-all duration-300 ${reminders.streak.enabled ? "left-[21px]" : "left-[2px]"}`} />
                        </div>
                      </div>
                      <input 
                        type="time" 
                        value={reminders.streak.time}
                        onChange={e => handleReminderTimeChange("streak", e.target.value)}
                        className="w-full py-3 px-4 bg-white/5 border border-white/10 rounded-xl text-white text-sm outline-none font-mono focus:border-[#D4A843]/50 transition-all"
                      />
                    </div>

                    {/* Premium Notification Authorization Console */}
                    <div className="p-5 rounded-[24px] glass-premium space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-[#EEE9E0]/70 flex items-center gap-2">
                          <Bell size={14} className="text-[#D4A843]" />
                          Notification Status
                        </span>
                        <span className={`text-[10px] font-bold uppercase py-1 px-2.5 rounded-full ${
                          (notificationPermission === "granted" || (isTelegramEnvironment && (reminders.morning?.enabled || reminders.streak?.enabled))) 
                            ? "bg-teal-500/20 text-teal-400 border border-teal-500/30" 
                            : notificationPermission === "denied" 
                              ? "bg-red-500/20 text-red-400 border border-red-500/30" 
                              : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                        }`}>
                          {(notificationPermission === "granted" || (isTelegramEnvironment && (reminders.morning?.enabled || reminders.streak?.enabled))) ? "Active" : notificationPermission === "denied" ? "Blocked" : "Pending"}
                        </span>
                      </div>
                      
                      <p className="text-[10px] text-[#EEE9E0]/50 leading-relaxed text-left">
                        {isTelegramEnvironment 
                          ? "Morning or streak protection alerts will be sent directly to your Telegram Direct Messages via our bot. Ensure you have started a chat with our bot."
                          : "To receive timely morning or streak protection alerts on time even when the app is running in the background, authorize Web Push notifications."
                        }
                      </p>

                      <div className="grid grid-cols-2 gap-3 pt-1">
                        <button
                          type="button"
                          onClick={() => requestNotificationPermission(false)}
                          className="py-2.5 px-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl text-[10px] font-bold transition-all uppercase tracking-wider cursor-pointer text-center"
                        >
                          Enable Alerts
                        </button>
                        <button
                          type="button"
                          onClick={triggerTestNotification}
                          className="py-2.5 px-3 bg-[#D4A843]/15 border border-[#D4A843]/30 hover:bg-[#D4A843]/25 text-[#D4A843] rounded-xl text-[10px] font-bold transition-all uppercase tracking-wider cursor-pointer text-center"
                        >
                          ⚡ Test Alert
                        </button>
                      </div>
                    </div>

                  </div>
                </div>

                {/* Bookmarked Scriptures Section */}
                <div className="space-y-3.5">
                  <h3 className="text-[10px] uppercase tracking-[0.2em] text-[#EEE9E0]/40 font-bold mb-1 pl-1">Bookmarked Scriptures ({savedVerses.length})</h3>
                  {savedVerses.length === 0 ? (
                    <div className="p-6 rounded-[24px] glass-premium text-center space-y-2">
                      <BookOpen size={24} className="mx-auto text-[#D4A843]/40" />
                      <p className="text-xs text-[#EEE9E0]/60">No bookmarked scriptures yet.</p>
                      <p className="text-[10px] text-[#EEE9E0]/40 leading-relaxed max-w-[200px] mx-auto">
                        While reading the Holy Bible, click any verse and tap "Bookmark" to store your favorite scriptural passages here.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {savedVerses.map((v: any) => (
                        <div key={v.id} className="p-5 rounded-[24px] glass-premium space-y-3 text-left relative group">
                          <button
                            onClick={() => handleSaveVerse(v.text, v.ref)}
                            className="absolute top-4 right-4 text-[#EEE9E0]/30 hover:text-red-400 p-1 cursor-pointer transition-colors"
                            title="Remove Bookmark"
                          >
                            <Trash2 size={13} />
                          </button>
                          
                          <p className="font-serif text-xs italic text-[#EEE9E0]/85 pr-6 leading-relaxed">
                            "{v.text}"
                          </p>
                          
                          <div className="flex items-center justify-between pt-1">
                            <span className="font-serif text-[11px] font-semibold text-[#D4A843]">
                              — {v.ref}
                            </span>
                            <button
                              onClick={() => {
                                goTo("ask");
                                setTimeout(() => {
                                  useChatPromptChip(`Please explain what the scriptures mean in the verse ${v.ref}, and help me apply standard daily guidance for it.`);
                                }, 250);
                              }}
                              className="text-[9px] uppercase font-bold text-[#D4A843] hover:underline flex items-center gap-1 cursor-pointer"
                            >
                              Reflect with AI →
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Bottom Route helpers of Profile */}
                <div className="space-y-3.5">
                  <div 
                    onClick={() => goTo("premium")}
                    className="p-5 rounded-[24px] glass-premium-interact flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex items-center gap-4">
                      <div className="p-3 rounded-xl bg-[#D4A843]/10 text-[#D4A843]">
                        <Unlock size={16} />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white">Upgrade account</h4>
                        <p className="text-[10px] text-[#EEE9E0]/50 leading-relaxed mt-0.5">Get unlimited AI with no daily gaps</p>
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-[#D4A843]" />
                  </div>

                  <div 
                    onClick={() => goTo("donate")}
                    className="p-5 rounded-[24px] glass-premium-interact flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex items-center gap-4">
                      <div className="p-3 rounded-xl bg-teal-500/10 text-teal-400">
                        <Coffee size={16} />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white">Support Bible Manna</h4>
                        <p className="text-[10px] text-[#EEE9E0]/50 leading-relaxed mt-0.5">Support keeping God's scripture free</p>
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-teal-400" />
                  </div>
                </div>

              </motion.div>
            )}

            {/* 7. THE BIBLE MANNA PREMIUM PAGE */}
            {currentScreen === "premium" && (
              <motion.div
                key="premium"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-6 pt-1"
              >
                {/* Hero promo splash and badges */}
                <div className="py-8 px-6 rounded-[32px] glass-premium text-center space-y-4">
                  <div className="w-16 h-16 rounded-[24px] bg-[#D4A843]/10 border border-[#D4A843]/20 flex items-center justify-center text-[#D4A843] mx-auto glow-gold animate-pulse">
                    <Sparkles size={28} />
                  </div>
                  <h1 className="font-serif text-3xl font-extrabold text-[#D4A843] tracking-tight">Bible Manna Premium</h1>
                  <p className="text-xs text-[#EEE9E0]/50 max-w-sm mx-auto leading-relaxed">
                    Access ultimate tools constructed to elevate your visual devotion logs and daily Scripture studies.
                  </p>
                </div>

                {/* Ultimate feature check rows */}
                <div className="space-y-2.5">
                  {[
                    "Unlimited AI Bible Chat — Consult on complex scriptures day or night",
                    "All Bible Translations — Access NIV, ESV, NASB and many more translations",
                    "All Progressive Reading Plans — 7, 30, and 90-day journeys",
                    "Unlimited Saved Prayers & Confessions log",
                    "Premium Custom Card Designer Themes — custom high-res watermarks"
                  ].map(feat => (
                    <div 
                      key={feat}
                      className="p-4 rounded-xl glass-premium flex items-center gap-3.5 text-xs text-[#EEE9E0]/90"
                    >
                      <div className="p-1 rounded-full bg-[#D4A843]/10 text-[#D4A843] flex-shrink-0">
                        <Check size={11} strokeWidth={3} />
                      </div>
                      <span className="leading-relaxed">{feat}</span>
                    </div>
                  ))}
                </div>

                {/* Billing plans selection container */}
                <div className="p-6 rounded-[32px] glass-premium text-center space-y-5">
                  <h2 className="font-serif text-lg font-extrabold text-[#D4A843]">Upgrade to Premium</h2>
                  <p className="text-xs text-[#EEE9E0]/70 max-w-sm mx-auto leading-relaxed">
                    Unlock advanced Bible study tools and unlimited access to premium features.
                  </p>

                  <div className="p-4 rounded-2xl bg-[#D4A843]/5 border border-[#D4A843]/10 max-w-xs mx-auto text-center space-y-1 font-sans">
                    <span className="text-[10px] text-[#D4A843] uppercase tracking-wider font-extrabold">Price</span>
                    <div className="font-serif text-3xl font-extrabold text-[#D4A843]">💎 3 TON</div>
                    <span className="text-[9px] text-[#EEE9E0]/40 block uppercase tracking-wide">30 Days Membership · Manual Renewal</span>
                  </div>

                  {/* ACTIVE PREMIUM BADGE OR WALLET STATUS CONTROL */}
                  {isPremium ? (
                    <div className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-left space-y-3.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 font-sans">
                          <Check size={14} className="animate-bounce" />
                          Premium Membership Active
                        </span>
                        <span className="text-[9px] bg-emerald-500 text-black px-2 py-0.5 rounded font-extrabold uppercase tracking-wide font-mono">
                          PRO
                        </span>
                      </div>
                      
                      <div className="space-y-1.5 font-mono text-[10px] text-[#EEE9E0]/70">
                        {premiumExpiresAt && (
                          <div className="flex justify-between">
                            <span>Expires:</span>
                            <span className="font-semibold text-white">
                              {new Date(premiumExpiresAt).toLocaleDateString()}
                            </span>
                          </div>
                        )}
                        {premiumExpiresAt && (
                          <div className="flex justify-between">
                            <span>Days Left:</span>
                            <span className="font-semibold text-[#D4A843]">
                              {Math.max(0, Math.ceil((new Date(premiumExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))} days
                            </span>
                          </div>
                        )}
                        {tonSenderAddress && (
                          <div className="flex justify-between">
                            <span>Wallet Address:</span>
                            <span className="font-semibold text-[#EEE9E0]/40 truncate max-w-[130px]" title={tonSenderAddress}>
                              {tonSenderAddress.slice(0, 6)}...{tonSenderAddress.slice(-6)}
                            </span>
                          </div>
                        )}
                        {lastTxHash && (
                          <div className="flex justify-between">
                            <span>Transaction:</span>
                            <span className="font-semibold text-teal-400 truncate max-w-[130px]" title={lastTxHash}>
                              {lastTxHash.slice(0, 6)}...{lastTxHash.slice(-6)}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="pt-2 border-t border-white/5 space-y-2">
                        <button
                          onClick={handleTriggerTONPayment}
                          disabled={isPaying}
                          className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black font-extrabold text-[10px] uppercase tracking-wider rounded-xl cursor-pointer disabled:opacity-50 transition-all text-center"
                        >
                          {isPaying ? "Verifying Transaction..." : "Extend Membership (Renew for 3 TON)"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {isTonWalletConnected ? (
                        <div className="p-4 rounded-2xl bg-black/40 border border-white/5 space-y-3.5 text-left">
                          <div className="flex justify-between items-center text-[10px] font-sans">
                            <span className="text-[#EEE9E0]/50 font-medium">Connected TON Wallet:</span>
                            <button
                              onClick={handleDisconnectTONWallet}
                              className="text-[9px] uppercase font-bold text-red-500 hover:underline cursor-pointer"
                            >
                              Disconnect
                            </button>
                          </div>
                          <div className="font-mono text-xs text-[#D4A843] break-all bg-white/5 p-2.5 rounded-lg border border-white/5">
                            {tonWalletAddress ? `${tonWalletAddress.slice(0, 8)}...${tonWalletAddress.slice(-8)}` : ""}
                          </div>

                          <button
                            onClick={handleTriggerTONPayment}
                            disabled={isPaying}
                            className="w-full py-4 bg-[#D4A843] hover:bg-[#B38D35] text-black font-extrabold text-xs uppercase tracking-widest rounded-xl cursor-pointer shadow-lg glow-gold active:scale-95 disabled:opacity-50 transition-all font-sans"
                          >
                            {isPaying ? "Awaiting confirmation..." : "Pay 3 TON to Upgrade"}
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-3 flex flex-col items-center font-sans">
                          <p className="text-[10px] text-[#EEE9E0]/50 leading-relaxed max-w-xs mx-auto">
                            Connect your preferred TON Wallet (Tonkeeper, Telegram Wallet, or MyTonWallet) to initiate the upgrade.
                          </p>
                          <button
                            onClick={handleConnectTONWallet}
                            className="w-full py-4 bg-[#0088cc] hover:bg-[#0077b3] text-white font-extrabold text-xs uppercase tracking-widest rounded-xl cursor-pointer shadow-md active:scale-95 transition-all text-center font-sans"
                          >
                            Connect TON Wallet 💎
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {paymentSuccessMessage && (
                    <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 mt-2 leading-relaxed text-left font-semibold">
                      {paymentSuccessMessage}
                    </div>
                  )}

                  <span className="block text-[8px] text-[#EEE9E0]/30 leading-relaxed">
                    Security guaranteed by the TON blockchain. No recurring subscription or auto-payments — manually renew whenever it suits your spiritual devotion plan.
                  </span>
                </div>

              </motion.div>
            )}

            {/* 8. DONATIONS AND BLESSINGS */}
            {currentScreen === "donate" && (
              <motion.div
                key="donate"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-6 pt-1"
              >
                {/* Visual support cards header */}
                <div className="py-8 px-6 rounded-[32px] glass-premium text-center space-y-4">
                  <div className="w-16 h-16 rounded-[24px] bg-[#D4A843]/10 border border-[#D4A843]/20 flex items-center justify-center text-[#D4A843] mx-auto animate-pulse">
                    <span className="text-3xl">⭐</span>
                  </div>
                  <h1 className="font-serif text-3xl font-extrabold text-[#D4A843]">Support Development</h1>
                  <p className="font-sans text-xs text-[#EEE9E0]/70 max-w-sm mx-auto leading-relaxed">
                    If you enjoy using this Mini App, you can support its continued development with a Telegram Stars donation. Donations are completely optional and help fund future improvements.
                  </p>
                </div>

                {/* Option amounts quick grid */}
                <div>
                  <h3 className="text-[10px] uppercase tracking-[0.2em] text-[#EEE9E0]/40 font-bold mb-3 pl-1">Support Tiers</h3>
                  <div className="grid grid-cols-2 gap-4">
                    
                    <div 
                      onClick={() => handleSendDonation(50, "Voluntary Support (50 Stars)")}
                      className="p-5 glass-premium-interact rounded-[24px] text-center cursor-pointer flex flex-col justify-center min-h-[120px]"
                    >
                      <span className="text-2xl block mb-2">🌿</span>
                      <strong className="text-[#D4A843] block text-sm">⭐ 50 Stars</strong>
                      <span className="text-[10px] text-[#EEE9E0]/50 mt-1 leading-normal">Helper Seed</span>
                    </div>

                    <div 
                      onClick={() => handleSendDonation(100, "Voluntary Support (100 Stars)")}
                      className="p-5 glass-premium-interact rounded-[24px] text-center cursor-pointer flex flex-col justify-center min-h-[120px]"
                    >
                      <span className="text-2xl block mb-2">☕</span>
                      <strong className="text-[#D4A843] block text-sm">⭐ 100 Stars</strong>
                      <span className="text-[10px] text-[#EEE9E0]/50 mt-1 leading-normal">Cheerful Giver</span>
                    </div>

                    <div 
                      onClick={() => handleSendDonation(500, "Voluntary Support (500 Stars)")}
                      className="p-5 glass-premium-interact rounded-[24px] text-center cursor-pointer flex flex-col justify-center min-h-[120px]"
                    >
                      <span className="text-2xl block mb-2">👑</span>
                      <strong className="text-[#D4A843] block text-sm">⭐ 500 Stars</strong>
                      <span className="text-[10px] text-[#EEE9E0]/50 mt-1 leading-normal">Blessed Builder</span>
                    </div>

                    <div 
                      onClick={() => {
                        triggerHapticImpact("light");
                        setIsCustomDonationModalOpen(true);
                      }}
                      className="p-5 glass-premium-interact rounded-[24px] text-center cursor-pointer flex flex-col justify-center min-h-[120px]"
                    >
                      <span className="text-2xl block mb-2">✨</span>
                      <strong className="text-[#D4A843] block text-sm">⭐ Custom Amount</strong>
                      <span className="text-[10px] text-[#EEE9E0]/50 mt-1 leading-normal">Your own choice</span>
                    </div>

                  </div>
                </div>

                {/* Custom stars inputs */}
                <div className="p-5 rounded-[24px] glass-premium space-y-4">
                  <h4 className="text-[10px] uppercase tracking-[0.2em] text-[#EEE9E0]/40 font-bold pl-1 font-sans">Or Enter Custom Stars Support Choice</h4>
                  <input 
                    type="number"
                    value={customStarAmount}
                    onChange={e => {
                      setCustomStarAmount(e.target.value);
                      if (e.target.value && Number.isInteger(Number(e.target.value)) && Number(e.target.value) > 0) {
                        setCustomDonationError("");
                      }
                    }}
                    placeholder="Enter custom stars e.g. 150"
                    className="w-full py-3.5 px-4 bg-white/5 border border-white/10 rounded-xl text-white outline-none font-mono focus:border-teal-500/30 transition-all text-sm"
                  />
                  {customDonationError && (
                    <div className="text-red-400 text-[11px] font-sans font-medium text-left bg-red-500/10 border border-red-500/20 py-2 px-3 rounded-lg">
                      ⚠️ {customDonationError}
                    </div>
                  )}
                  <button 
                    onClick={handleCustomDonationBtn}
                    className="w-full py-3.5 rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 text-black font-extrabold text-xs uppercase tracking-widest cursor-pointer hover:opacity-90 active:scale-97 shadow-lg transition-all"
                  >
                    Donate Custom Stars
                  </button>
                </div>

                {isPaying && (
                  <div className="py-4 text-center text-xs font-mono text-[#EEE9E0]/40 animate-pulse">
                    Opening Telegram Sandbox checkout node... Please hold.
                  </div>
                )}

                {paymentSuccessMessage && (
                  <div className="p-5 rounded-[24px] bg-teal-500/10 border border-teal-500/20 text-xs text-teal-400 leading-relaxed text-center font-semibold">
                    {paymentSuccessMessage}
                  </div>
                )}

              </motion.div>
            )}

            {/* 9. GLOBAL LEADERBOARDS SCREEN */}
            {currentScreen === "leaderboard" && (
              <motion.div
                key="leaderboard"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4 pt-1"
              >
                {/* Ranking headers and Top % metrics */}
                <div className="py-6 px-6 rounded-[32px] glass-premium relative overflow-hidden shadow-2xl">
                  <div className="absolute top-[-30px] right-[-30px] w-28 h-28 bg-[rgba(212,168,67,0.1)] rounded-full filter blur-xl" />
                  
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="text-[10px] tracking-[0.2em] text-[#D4A843] uppercase font-bold">Global Rankings</span>
                      <h2 className="font-serif text-xl font-bold text-[#EEE9E0] mt-1.5 font-serif italic">Top 4% of All Believers</h2>
                    </div>
                    {/* Medal decorative */}
                    <span className="text-4xl">🏅</span>
                  </div>
                </div>

                {/* Categories Tabs row with 4 items */}
                <div className="flex gap-2 overflow-x-auto pb-1.5 no-scrollbar">
                  {[
                    { key: "streaks", label: "Streaks", icon: <Flame size={12} className="fill-[#D4A843] text-[#D4A843]" /> },
                    { key: "verses", label: "Verses read", icon: <BookOpen size={12} /> },
                    { key: "questions", label: "Ask AI", icon: <MessageSquare size={12} /> },
                    { key: "prayers", label: "Prayers saved", icon: <Heart size={12} className="fill-[#D4A843]" /> }
                  ].map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => {
                        setActiveLBTab(tab.key as LBTab);
                        showToast(`Switched rankings to ${tab.label}`);
                        triggerHapticSelection();
                      }}
                      className={`flex items-center gap-2 py-2.5 px-4 rounded-full text-xs font-bold cursor-pointer whitespace-nowrap transition-all uppercase tracking-wider ${activeLBTab === tab.key ? "bg-[#D4A843] text-black shadow-lg" : "bg-white/5 border border-white/10 text-[#EEE9E0]/80"}`}
                    >
                      {tab.icon}
                      <span>{tab.label}</span>
                    </button>
                  ))}
                </div>

                {/* Score display log list */}
                <div className="space-y-2 bg-[rgba(255,255,255,0.015)] border border-[rgba(255,255,255,0.05)] rounded-3xl p-3">
                  {leaderboards[activeLBTab]?.map((entry: any) => {
                    const isSelf = entry.username === currentUser?.username;
                    checkTopTenAchievement(entry.rank);

                    return (
                      <div 
                        key={entry.username}
                        className={`p-3 rounded-2xl flex items-center justify-between gap-3 ${isSelf ? "bg-[rgba(212,168,67,0.12)] border border-[#D4A843] glow-goldScale animate-pulse" : "bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)]"}`}
                      >
                        {/* Left Rank index */}
                        <div className="flex items-center gap-2.5">
                          <span className={`w-6 text-center font-bold font-serif text-sm ${
                            entry.rank === 1 ? "text-[#D4A843]" : 
                            entry.rank === 2 ? "text-[#a6c1ee]" : 
                            entry.rank === 3 ? "text-[#ff9650]" : "text-[rgba(238,233,224,0.4)]"
                          }`}>
                            {entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : entry.rank}
                          </span>

                          {/* Gradient avatar circle */}
                          <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${entry.avatarGradient} flex items-center justify-center text-[10px] font-bold text-white shadow-inner`}>
                            {entry.displayName[0]}
                          </div>

                          {/* Profile name card */}
                          <div>
                            <span className="text-xs font-semibold text-white block">
                              {isSelf ? "You (Anonymous Believer)" : entry.displayName}
                            </span>
                            <span className="text-[9px] text-[rgba(238,233,224,0.35)] block font-mono">
                              @{entry.username}
                            </span>
                          </div>
                        </div>

                        {/* score metrics */}
                        <div className="text-right">
                          <strong className="font-serif text-sm text-[#F0CC6A]">{entry.score}</strong>
                          <span className="text-[8px] uppercase tracking-widest block text-[rgba(238,233,224,0.45)]">
                            {activeLBTab === "streaks" ? "days" : activeLBTab === "verses" ? "verses" : activeLBTab === "questions" ? "chats" : "prayers"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

              </motion.div>
            )}

          </AnimatePresence>
        </main>

        {/* ── SEAMLESS FOOTER PERSISTENT GLASS NAVIGATION BAR (Except Onboarding) ── */}
        {currentScreen !== "onboard" && (
          <footer 
            style={{ borderColor: "#ff8800", borderRadius: "22px", height: "69.8056px" }}
            className="absolute bottom-0 inset-x-0 bg-[#0A0E1A]/90 border-t backdrop-blur-2xl py-3 px-2 flex justify-between z-20 shadow-[0_-10px_35px_rgba(0,0,0,0.5)]"
          >
            {[
              { screen: "home", label: "Devotion", icon: <Compass size={18} /> },
              { screen: "read", label: "Bible", icon: <BookOpen size={18} /> },
              { screen: "ask", label: "Ask AI", icon: <MessageSquare size={18} /> },
              { screen: "pray", label: "Journal", icon: <Heart size={18} /> },
              { screen: "profile", label: "Me", icon: <User size={18} /> }
            ].map(tab => {
              const isActive = currentScreen === tab.screen;
              return (
                <button 
                  key={tab.screen}
                  onClick={() => goTo(tab.screen as ScreenName)}
                  className="flex-1 flex flex-col items-center gap-1.5 py-1 relative cursor-pointer"
                >
                  <div className={`p-1.5 rounded-xl transition-all duration-300 ${isActive ? "bg-[#D4A843]/15 scale-110" : ""}`}>
                    {React.cloneElement(tab.icon, {
                      className: isActive ? "text-[#D4A843]" : "text-[#EEE9E0]/40"
                    })}
                  </div>
                  <span className={`text-[8.5px] font-bold tracking-widest uppercase transition-all duration-300 ${isActive ? "text-[#D4A843]" : "text-[#EEE9E0]/40"}`}>
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </footer>
        )}

        {/* ── OVERLAYS: VERSE ACTION PANEL DETAIL ── */}
        <AnimatePresence>
          {highlightedVerse && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-end justify-center"
              onClick={() => setHighlightedVerse(null)}
            >
              <motion.div 
                initial={{ translateY: "100%" }}
                animate={{ translateY: "0%" }}
                exit={{ translateY: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 220 }}
                className="w-full max-w-[480px] bg-[#0A0E1A] border-t border-white/15 rounded-t-[32px] p-6 pb-8 space-y-6 shadow-[0_-15px_40px_rgba(0,0,0,0.6)]"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex justify-between items-center pb-3 border-b border-white/5">
                  <h3 className="font-serif text-[#D4A843] text-sm font-bold tracking-wider uppercase">Selected Scripture</h3>
                  <button 
                    onClick={() => setHighlightedVerse(null)}
                    className="p-1 rounded-full bg-white/5 hover:bg-white/10 text-[#EEE9E0]/50"
                  >
                    <X size={16} />
                  </button>
                </div>

                <p className="font-serif text-xl italic text-white/90 leading-relaxed">
                  "{highlightedVerse.text}"
                </p>
                <span className="block font-serif text-sm font-semibold text-[#D4A843]">
                  — {highlightedVerse.ref}
                </span>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button 
                    onClick={() => {
                      handleCopyText(highlightedVerse.text, highlightedVerse.ref);
                      setHighlightedVerse(null);
                    }}
                    className="py-3 px-2 bg-white/5 border border-white/10 text-white font-bold text-[10px] uppercase tracking-wider rounded-xl cursor-pointer hover:bg-white/10 transition-all text-center flex items-center justify-center gap-1.5 truncate"
                  >
                    <Copy size={11} className="text-[#D4A843]" />
                    <span>Copy Verse</span>
                  </button>
                  <button 
                    onClick={() => {
                      handleSaveVerse(highlightedVerse.text, highlightedVerse.ref);
                      setHighlightedVerse(null);
                    }}
                    className={`py-3 px-2 font-bold text-[10px] uppercase tracking-wider rounded-xl cursor-pointer border transition-all text-center truncate ${
                      savedVerses.some((v: any) => v.ref === highlightedVerse.ref)
                        ? "bg-teal-500/10 border-teal-500/30 text-teal-400 hover:bg-teal-500/20"
                        : "bg-white/5 border-white/10 text-[#EEE9E0] hover:bg-white/10"
                    }`}
                  >
                    {savedVerses.some((v: any) => v.ref === highlightedVerse.ref) ? "✓ Bookmarked" : "Bookmark"}
                  </button>
                  <button 
                    onClick={() => {
                      const baseV = { text: highlightedVerse.text, ref: highlightedVerse.ref };
                      setHighlightedVerse(null);
                      handleShareButtonTrigger(baseV);
                    }}
                    className="py-3 px-2 bg-white/5 border border-white/10 text-white font-bold text-[10px] uppercase tracking-wider rounded-xl cursor-pointer hover:bg-white/10 transition-all text-center truncate"
                  >
                    Share Card
                  </button>
                  <button 
                    onClick={() => {
                      const ref = highlightedVerse.ref;
                      setHighlightedVerse(null);
                      goTo("ask");
                      setTimeout(() => {
                        useChatPromptChip(`Please explain what the scriptures mean in the verse ${ref}, and help me apply standard daily guidance for it.`);
                      }, 250);
                    }}
                    className="py-3 px-2 bg-gradient-to-r from-[#D4A843] to-[#A87820] text-black font-extrabold text-[10px] uppercase tracking-wider rounded-xl cursor-pointer shadow-lg glow-gold hover:opacity-95 transition-all text-center truncate"
                  >
                    Ask AI
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── OVERLAYS: PREMIUM DYNAMIC GRAPHICS SHARE CARD BUILDER ── */}
        <AnimatePresence>
          {isShareModalOpen && activeShareVerse && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-end justify-center"
              onClick={() => setIsShareModalOpen(false)}
            >
              <motion.div 
                initial={{ translateY: "100%" }}
                animate={{ translateY: "0%" }}
                exit={{ translateY: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 220 }}
                className="w-full max-w-[480px] bg-[#0A0E1A] border-t border-white/15 rounded-t-[32px] p-6 pb-8 space-y-5 text-center shadow-[0_-15px_40px_rgba(0,0,0,0.6)]"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex justify-between items-center pb-3 border-b border-white/5">
                  <h3 className="font-serif text-[#D4A843] text-sm font-bold tracking-wider uppercase">Customize Share Card</h3>
                  <button 
                    onClick={() => setIsShareModalOpen(false)}
                    className="p-1 rounded-full bg-white/5 hover:bg-white/10 text-[#EEE9E0]/50"
                  >
                    <X size={15} />
                  </button>
                </div>

                {/* Theme presets chips selector wrapper */}
                <div className="flex gap-2 overflow-x-auto pb-1.5 no-scrollbar">
                  {CARD_THEMES.map((theme, idx) => (
                    <button 
                      key={theme.name}
                      onClick={() => {
                        setCustomCardStyle(idx);
                        triggerHapticSelection();
                      }}
                      className={`py-2 px-4 rounded-full text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all cursor-pointer ${customCardStyle === idx ? "bg-[#D4A843] text-black" : "bg-white/5 border border-white/10 text-[#EEE9E0]/60"}`}
                    >
                      {theme.name === "Dawn" ? "🌅 Dawn" : theme.name === "Night" ? "🌌 Night" : theme.name === "Garden" ? "🌿 Garden" : theme.name === "Fire" ? "🔥 Fire" : "💜 Royal"}
                    </button>
                  ))}
                </div>

                {/* Preview Image placeholder */}
                <div className="aspect-square w-full rounded-2xl overflow-hidden bg-black/40 border border-white/10 shadow-inner flex items-center justify-center relative">
                  {cardPreviewUrl ? (
                    <img src={cardPreviewUrl} alt="Share card draft" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs text-[#EEE9E0]/30 animate-pulse font-mono tracking-widest uppercase">Rendering high-res card...</span>
                  )}
                </div>

                {/* Hidden canvas rendering system */}
                <canvas ref={shareCanvasRef} className="hidden" />

                {/* Double download or share buttons */}
                <div className="grid grid-cols-2 gap-3.5">
                  <button 
                    onClick={handleDownloadShareCard}
                    className="py-3 px-4 bg-white/5 border border-white/10 text-white hover:bg-white/10 border-white/20 active:scale-97 font-bold text-xs uppercase tracking-wider transition-all cursor-pointer text-center"
                  >
                    Download
                  </button>
                  <button 
                    onClick={handleNativeShareCard}
                    className="py-3 px-4 bg-gradient-to-r from-[#D4A843] to-[#A87820] text-black font-extrabold text-xs uppercase tracking-wider shadow-lg glow-gold active:scale-97 transition-all cursor-pointer text-center"
                  >
                    Send Manna
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}

          {isCustomDonationModalOpen && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-end justify-center"
              onClick={() => {
                setIsCustomDonationModalOpen(false);
                setCustomDonationError("");
              }}
            >
              <motion.div 
                initial={{ translateY: "100%" }}
                animate={{ translateY: "0%" }}
                exit={{ translateY: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 220 }}
                className="w-full max-w-[480px] bg-[#0A0E1A] border-t border-white/15 rounded-t-[32px] p-6 pb-8 space-y-5 text-center shadow-[0_-15px_40px_rgba(0,0,0,0.6)]"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex justify-between items-center pb-3 border-b border-white/5">
                  <h3 className="font-serif text-[#D4A843] text-sm font-bold tracking-wider uppercase">Custom Stars Donation</h3>
                  <button 
                    onClick={() => {
                      setIsCustomDonationModalOpen(false);
                      setCustomDonationError("");
                    }}
                    className="p-1 rounded-full bg-white/5 hover:bg-white/10 text-[#EEE9E0]/50"
                  >
                    <X size={15} />
                  </button>
                </div>

                <div className="space-y-4 text-left">
                  <p className="font-sans text-[#EEE9E0]/70 text-xs leading-relaxed text-center">
                    Enter the amount of Telegram Stars you would like to donate to support ongoing development of this Mini App.
                  </p>
                  
                  <div className="relative">
                    <input 
                      type="number"
                      pattern="[0-9]*"
                      inputMode="numeric"
                      value={customStarAmount}
                      onChange={e => {
                        setCustomStarAmount(e.target.value);
                        if (e.target.value && Number.isInteger(Number(e.target.value)) && Number(e.target.value) > 0) {
                          setCustomDonationError("");
                        }
                      }}
                      placeholder="Enter Stars e.g., 250"
                      className="w-full py-3.5 px-4 bg-white/5 border border-white/10 rounded-xl text-white outline-none font-mono text-center focus:border-[#D4A843]/40 transition-all text-sm"
                    />
                  </div>

                  {customDonationError && (
                    <motion.div 
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-red-400 text-[11px] font-sans font-medium text-left bg-red-500/10 border border-red-500/20 py-2 px-3 rounded-lg"
                    >
                      ⚠️ {customDonationError}
                    </motion.div>
                  )}

                  <button 
                    onClick={() => {
                      const val = customStarAmount.trim();
                      if (!val) {
                        setCustomDonationError("Please enter an amount.");
                        return;
                      }
                      const amt = Number(val);
                      if (isNaN(amt) || !Number.isInteger(amt) || amt <= 0) {
                        setCustomDonationError("Please enter a positive whole number greater than 0.");
                        return;
                      }
                      
                      setCustomDonationError("");
                      setIsCustomDonationModalOpen(false);
                      handleSendDonation(amt, "Custom Stars Support");
                    }}
                    className="w-full py-4 rounded-xl bg-gradient-to-r from-[#D4A843] to-[#F1D58B] text-black font-extrabold text-xs uppercase tracking-widest cursor-pointer hover:opacity-90 active:scale-97 shadow-lg transition-all text-center"
                  >
                    Confirm & Donate {customStarAmount ? `${customStarAmount} Stars` : "Stars"}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── IN-APP FLOATING ALARM NOTIFICATION BANNER ── */}
        <AnimatePresence>
          {inAppAlarmNotification && (
            <motion.div
              initial={{ opacity: 0, y: -80, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -40, scale: 0.95 }}
              className="fixed top-4 inset-x-4 mx-auto max-w-[440px] bg-[#0A0E1A]/95 border border-[#D4A843]/35 rounded-[24px] p-5 shadow-[0_20px_50px_rgba(0,0,0,0.85)] z-50 backdrop-blur-xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex gap-4 items-start">
                <div className="p-3 rounded-2xl bg-[#D4A843]/10 text-[#D4A843] shrink-0 border border-[#D4A843]/20">
                  {inAppAlarmNotification.type === "morning" ? <Bell size={18} className="animate-bounce" /> : <Flame size={18} className="animate-pulse" />}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <span className="text-[9px] uppercase tracking-widest font-mono text-[#D4A843] font-bold block mb-0.5">
                    {inAppAlarmNotification.type === "morning" ? "🌅 Morning Alarm Active" : "🔥 Streak Protection Active"} • {inAppAlarmNotification.time}
                  </span>
                  <h4 className="font-serif text-white font-bold text-sm leading-tight mb-1">
                    {inAppAlarmNotification.title}
                  </h4>
                  <p className="text-[11px] text-[#EEE9E0]/70 leading-relaxed">
                    {inAppAlarmNotification.body}
                  </p>
                  
                  <div className="flex gap-3 mt-3 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setInAppAlarmNotification(null);
                        goTo("home");
                      }}
                      className="py-2 px-4 bg-gradient-to-r from-[#D4A843] to-[#A87820] text-black font-extrabold text-[10px] uppercase tracking-wider rounded-xl cursor-pointer shadow-md inline-block text-center"
                    >
                      🙏 Devote Now
                    </button>
                    <button
                      type="button"
                      onClick={() => setInAppAlarmNotification(null)}
                      className="py-2 px-4 bg-white/5 border border-white/10 text-[#EEE9E0]/50 hover:bg-white/10 font-bold text-[10px] uppercase tracking-wider rounded-xl cursor-pointer inline-block text-center"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setInAppAlarmNotification(null)}
                  className="p-1 rounded-full bg-white/5 hover:bg-white/10 text-[#EEE9E0]/50 self-start shrink-0 cursor-pointer"
                >
                  <X size={14} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
 
        {/* ── AI CREDIT EXHAUSTED & REFERRAL POPUP MODAL ── */}
        <AnimatePresence>
          {showAiLimitModal && (
            <div 
              className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 text-white"
              onClick={() => setShowAiLimitModal(false)}
            >
              <motion.div 
                initial={{ translateY: "100%", opacity: 0 }}
                animate={{ translateY: "0%", opacity: 1 }}
                exit={{ translateY: "100%", opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 220 }}
                className="w-full max-w-[460px] bg-[#0A0E1A] border-t sm:border border-white/10 sm:rounded-[32px] rounded-t-[32px] p-6 pb-8 space-y-5 text-center shadow-[0_20px_60px_rgba(0,0,0,0.85)]"
                onClick={e => e.stopPropagation()}
              >
                {/* Header */}
                <div className="flex justify-between items-center pb-3 border-b border-white/5 text-left">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-[#D4A843]/10 border border-[#D4A843]/20 flex items-center justify-center text-[#D4A843]">
                      <Sparkles size={16} />
                    </div>
                    <div>
                      <h3 className="font-serif text-[#D4A843] text-sm font-bold tracking-wider uppercase">AI Limit Exhausted</h3>
                      <p className="text-[9px] text-[#EEE9E0]/45 tracking-wider uppercase font-mono mt-0.5">Free Daily Guidance Cap Met</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setShowAiLimitModal(false)}
                    className="p-1 rounded-full bg-white/5 hover:bg-white/10 text-[#EEE9E0]/50 transition-all cursor-pointer"
                  >
                    <X size={15} />
                  </button>
                </div>

                {/* Main Message */}
                <div className="space-y-2 text-left">
                  <p className="text-xs text-[#EEE9E0]/80 leading-relaxed">
                    You have utilized today's <strong>5 free AI queries</strong>. To keep consulting the Bible Counselor without interruptions, please choose one of these faithful options:
                  </p>
                </div>

                {/* Option 1: Subscribe Card */}
                <div className="p-4 rounded-[20px] bg-gradient-to-br from-[#D4A843]/10 to-transparent border border-[#D4A843]/20 text-left space-y-3 relative overflow-hidden">
                  <span className="absolute top-1 right-2.5 text-[8px] font-bold text-[#D4A843] bg-[#D4A843]/10 px-2 py-0.5 rounded-full uppercase tracking-widest font-mono">
                    Unlimited
                  </span>
                  <div className="flex gap-2.5 items-start animate-fade-in">
                    <div className="p-2 rounded-xl bg-[#D4A843]/10 text-[#D4A843] mt-0.5">
                      <Sparkles size={16} />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider">Option A: Upgrade to Premium</h4>
                      <p className="text-[10px] text-[#EEE9E0]/60 leading-relaxed mt-1">
                        Support the ministry and unlock unlimited instant AI questions, premium offline reading themes, and streak protection mechanisms.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setShowAiLimitModal(false);
                      goTo("premium");
                      triggerHapticImpact("medium");
                    }}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#D4A843] to-[#A87820] text-black font-extrabold text-[10px] uppercase tracking-wider shadow-lg glow-gold active:scale-97 transition-all cursor-pointer text-center"
                  >
                    Subscribe & Upgrade
                  </button>
                </div>

                {/* Divider */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-[1px] bg-white/5" />
                  <span className="text-[9px] uppercase tracking-widest font-mono text-[#EEE9E0]/30 font-bold">OR</span>
                  <div className="flex-1 h-[1px] bg-white/5" />
                </div>

                {/* Option 2: Refer Card */}
                <div className="p-4 rounded-[20px] bg-white/5 border border-white/10 text-left space-y-3.5">
                  <div className="flex gap-2.5 items-start">
                    <div className="p-2 rounded-xl bg-teal-500/10 text-teal-400 mt-0.5">
                      <Gift size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center">
                        <h4 className="text-xs font-bold text-white uppercase tracking-wider">Option B: Refer a Friend</h4>
                        <span className="text-[9px] text-[#EEE9E0]/50 font-semibold uppercase tracking-wider bg-white/5 px-2 py-0.5 rounded-md">
                          {referralCount} Referred
                        </span>
                      </div>
                      <p className="text-[10px] text-[#EEE9E0]/60 leading-relaxed mt-1">
                        Share Bible Manna with a friend. Once they open or register, we'll immediately grant you <strong>5 more free query credits</strong>!
                      </p>
                    </div>
                  </div>

                  {/* Gamified Referral Meter / Progress Counter */}
                  <div className="py-3 px-3.5 rounded-2xl bg-white/[0.03] border border-white/5 space-y-2.5">
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] text-[#EEE9E0]/40 font-bold uppercase tracking-wider">Faith Referral Level</span>
                      <span className="text-[10px] text-teal-400 font-extrabold font-mono tracking-wider bg-teal-400/10 px-2 py-0.5 rounded-full uppercase">
                        {referralCount === 0 ? "Novice" : referralCount === 1 ? "Partner" : referralCount === 2 ? "Ambassador" : "Covenant Giver"} ({referralCount} Ref)
                      </span>
                    </div>

                    {/* Progress Bar Container */}
                    <div className="space-y-1.5">
                      <div className="relative h-2 w-full bg-white/5 rounded-full overflow-hidden border border-white/5 p-[1px]">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(100, (referralCount / 3) * 100)}%` }}
                          transition={{ type: "spring", damping: 15 }}
                          className="h-full rounded-full bg-gradient-to-r from-teal-500 via-[#D4A843] to-emerald-400"
                        />
                      </div>
                      
                      {/* Checkpoint Indicators with Active states */}
                      <div className="grid grid-cols-3 gap-1 pt-1">
                        <div className="flex flex-col items-start space-y-0.5">
                          <span className={`text-[8px] uppercase tracking-wider font-extrabold transition-all duration-300 ${referralCount >= 1 ? "text-[#D4A843]" : "text-[#EEE9E0]/30"}`}>
                            1 Friend 🎁
                          </span>
                          <span className="text-[7px] text-[#EEE9E0]/40 leading-none">
                            {referralCount >= 1 ? "✨ Active (+5)" : "+5 Credits"}
                          </span>
                        </div>
                        
                        <div className="flex flex-col items-center space-y-0.5 text-center">
                          <span className={`text-[8px] uppercase tracking-wider font-extrabold transition-all duration-300 ${referralCount >= 2 ? "text-[#D4A843]" : "text-[#EEE9E0]/30"}`}>
                            2 Friends 🌟
                          </span>
                          <span className="text-[7px] text-[#EEE9E0]/40 leading-none">
                            {referralCount >= 2 ? "✨ Active (+10)" : "+10 Total"}
                          </span>
                        </div>

                        <div className="flex flex-col items-end space-y-0.5 text-right font-sans">
                          <span className={`text-[8px] uppercase tracking-wider font-extrabold transition-all duration-300 ${referralCount >= 3 ? "text-emerald-400" : "text-[#EEE9E0]/30"}`}>
                            3 Friends 👑
                          </span>
                          <span className="text-[7px] text-[#EEE9E0]/40 leading-none font-medium">
                            {referralCount >= 3 ? "✨ Covenant Tier" : "Ambassador"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={handleCopyReferralLink}
                      className="py-2.5 px-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl text-[10px] uppercase tracking-wider font-bold transition-all cursor-pointer text-center flex items-center justify-center gap-1.5"
                    >
                      <Share2 size={12} /> Share Invite Link
                    </button>
                    <a
                      href={`https://t.me/share/url?url=${encodeURIComponent(getAppBaseUrl() + 'invite?ref=' + (currentUser?.id || "believer"))}&text=${encodeURIComponent("Join me on Bible Manna — daily devotionals, scriptures, and live spiritual AI counseling! 📖🕊️")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="py-2.5 px-3 bg-[#229ED9]/15 hover:bg-[#229ED9]/25 border border-[#229ED9]/30 text-[#229ED9] rounded-xl text-[10px] uppercase tracking-wider font-bold transition-all cursor-pointer text-center flex items-center justify-center gap-1.5"
                      onClick={() => triggerHapticImpact("medium")}
                    >
                      Telegram Share
                    </a>
                  </div>

                  {/* Simulated Referral Actions for Preview Testing */}
                  <div className="pt-2 border-t border-white/5">
                    <button
                      onClick={handleSimulateReferral}
                      disabled={isSimulatingReferral}
                      className="w-full py-2 px-3 bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/20 text-teal-400 rounded-xl text-[10px] uppercase tracking-wider font-bold transition-all cursor-pointer text-center disabled:opacity-55"
                    >
                      {isSimulatingReferral ? "🔄 Waiting for join signal..." : "⚡ Quick Demo: Simulate Friend Joining"}
                    </button>
                  </div>
                </div>

                <div className="pt-1">
                  <button
                    onClick={() => setShowAiLimitModal(false)}
                    className="text-[10px] text-[#EEE9E0]/40 uppercase tracking-widest font-bold hover:text-white transition-colors"
                  >
                    Decide Later
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* ── DEVSANDBOX PAYMENT PANEL SIMULATOR ── */}
        <AnimatePresence>
          {sandboxPaymentDetails && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in"
            >
              <motion.div
                initial={{ scale: 0.95, y: 15 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 15 }}
                className="w-full max-w-sm rounded-[28px] bg-[#1C160C] border border-[#D4A843]/20 p-6 text-center space-y-5 shadow-2xl relative overflow-hidden"
              >
                {/* Background ambient glow */}
                <div className="absolute inset-x-0 -top-24 h-48 bg-[#D4A843]/10 blur-3xl pointer-events-none" />

                <div className="flex justify-between items-center relative z-10">
                  <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-widest font-mono text-[#D4A843] bg-[#D4A843]/10 px-2.5 py-1 rounded-full font-bold">
                    <span className="w-1.5 h-1.5 bg-[#D4A843] rounded-full animate-ping" />
                    Developer Star Sandbox
                  </div>
                  <button 
                    onClick={() => setSandboxPaymentDetails(null)}
                    className="p-1 rounded-full bg-white/5 text-[#EEE9E0]/40 hover:text-white transition-colors cursor-pointer"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="space-y-2 relative z-10 mt-2">
                  <div className="text-3xl text-center">⭐</div>
                  <h3 className="font-serif text-lg font-extrabold text-white">Confirm Simulated Purchase</h3>
                  <p className="text-[10px] text-[#EEE9E0]/50 max-w-[260px] mx-auto leading-relaxed">
                    Supply a <code className="text-[#D4A843]">TELEGRAM_BOT_TOKEN</code> to process official Stars. Currently running client/server ledger loop.
                  </p>
                </div>

                {/* Receipt Details card */}
                <div className="p-4 rounded-xl bg-black/40 border border-white/5 text-left text-[11px] space-y-2 font-mono relative z-10">
                  <div className="flex justify-between">
                    <span className="text-[#EEE9E0]/40">Item Category:</span>
                    <span className="text-white capitalize font-semibold">{sandboxPaymentDetails.type}</span>
                  </div>
                  {sandboxPaymentDetails.plan && (
                    <div className="flex justify-between">
                      <span className="text-[#EEE9E0]/40">Product/Plan:</span>
                      <span className="text-amber-400 capitalize font-semibold">{sandboxPaymentDetails.plan}</span>
                    </div>
                  )}
                  {sandboxPaymentDetails.label && (
                    <div className="flex justify-between">
                      <span className="text-[#EEE9E0]/40">Support Label:</span>
                      <span className="text-[#EEE9E0] truncate max-w-[140px] font-semibold">{sandboxPaymentDetails.label}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-[#EEE9E0]/40">Charge Amount:</span>
                    <span className="text-amber-400 font-extrabold">{sandboxPaymentDetails.stars} Stars</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#EEE9E0]/40">Client User ID:</span>
                    <span className="text-[#EEE9E0] font-semibold">{sandboxPaymentDetails.userId}</span>
                  </div>
                  <div className="pt-2 border-t border-white/5 flex flex-col gap-1 text-[9px] text-[#EEE9E0]/30 break-all leading-normal">
                    <span><strong>tx:</strong> {sandboxPaymentDetails.transactionId}</span>
                    <span><strong>payload:</strong> {sandboxPaymentDetails.payload}</span>
                  </div>
                </div>

                {/* Simulator Triggers */}
                <div className="space-y-2.5 relative z-10">
                  <button
                    onClick={async () => {
                      try {
                        triggerHapticImpact("medium");
                        const simRes = await fetch("/api/sandbox-payment-simulate", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            transactionId: sandboxPaymentDetails.transactionId,
                            telegramId: sandboxPaymentDetails.userId,
                            starsAmount: sandboxPaymentDetails.stars,
                            payload: sandboxPaymentDetails.payload
                          })
                        });

                        if (simRes.ok) {
                          const simData = await simRes.json();
                          if (simData.ok) {
                            triggerHapticNotification("success");
                            if (sandboxPaymentDetails.type === "premium") {
                              setIsPremium(true);
                              setFreeQuestionsLeft(9999);
                              const updatedUser = { ...currentUser!, is_premium: true };
                              setCurrentUser(updatedUser);
                              localStorage.setItem("bm_user", JSON.stringify(updatedUser));
                              triggerSupabaseSync(updatedUser, prayers, savedVerses, chatHistory, readingPlans, reminders);
                              setPaymentSuccessMessage(`✨ Sandbox Verified! Bible Manna Premium has been logged & activated in your ledger.`);
                              showToast("Premium active in ledger! 👑");
                            } else {
                              setPaymentSuccessMessage("❤️ Thank you for supporting development!");
                              showToast("Sandbox donation recorded! 🙌");
                            }
                          } else {
                            showToast("Simulator rejected server transaction.");
                          }
                        } else {
                          showToast("Simulator failed connection to server node.");
                        }
                      } catch (err) {
                        console.error(err);
                        showToast("Sandbox simulation request error.");
                      } finally {
                        setSandboxPaymentDetails(null);
                      }
                    }}
                    className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-black font-extrabold text-xs uppercase tracking-widest rounded-xl cursor-pointer shadow-lg active:scale-97 transition-all"
                  >
                    ✔️ Simulate Payment Success
                  </button>

                  <button
                    onClick={() => {
                      triggerHapticImpact("light");
                      showToast("Simulation cancelled by tester.");
                      setSandboxPaymentDetails(null);
                    }}
                    className="w-full py-3 bg-white/5 border border-white/10 hover:bg-white/10 text-[#EEE9E0] font-bold text-xs uppercase tracking-widest rounded-xl cursor-pointer transition-all"
                  >
                    ❌ Cancel Checkout
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── PERSISTENT FLUID NOTIFICATION TOAST ALERTS ── */}
        <div className={`fixed bottom-24 left-1/2 transform -translate-x-1/2 bg-[#D4A843]/15 border border-[#D4A843]/30 backdrop-blur text-[#D4A843] py-3 px-6 rounded-full text-xs font-bold shadow-2xl z-50 pointer-events-none transition-all duration-300 tracking-wider uppercase ${toastMessage ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`}>
          {toastMessage}
        </div>

      <Analytics />
      </div>
    </div>
  );
}
