/**
 * Bible Manna Shared Type Definitions
 */

export interface User {
  id: number;
  first_name: string;
  username: string;
  lang: string;
  streak_count: number;
  last_active: string;
  is_premium: boolean;
  premium_status?: string;
  premium_expires_at?: string;
  wallet_address?: string;
  last_transaction_hash?: string;
  verses_read: number;
  photo_url?: string;
  channel_joined?: boolean;
  chat_trials_bonus?: number;
}

export interface Prayer {
  id: string;
  user_id: number;
  content: string;
  created_at: string;
  answered: boolean;
}

export interface ReadingPlan {
  id: string;
  icon: "cross" | "scroll" | "dove" | "globe" | "letter";
  name: string;
  days: number;
  desc: string;
  progress: number; // 0 to 100
  started: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "bot";
  text: string;
  senderName: string;
  timestamp: string;
}

export interface DailyVerse {
  ref: string;
  text: string;
}

export interface LeaderboardEntry {
  rank: number;
  displayName: string;
  username: string;
  score: number;
  isCurrentUser: boolean;
  avatarGradient: string;
  badge: "gold" | "silver" | "bronze" | "normal";
}

export type ScreenName = 
  | "onboard" 
  | "home" 
  | "read" 
  | "ask" 
  | "pray" 
  | "profile" 
  | "premium" 
  | "donate" 
  | "leaderboard";

export type LBTab = "streaks" | "verses" | "questions" | "prayers";
