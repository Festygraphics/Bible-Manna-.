import { DailyVerse, ReadingPlan } from "./types";

export interface BookMetadata {
  id: string;
  name: string;
  chapters: number;
}

export interface ShareCardTheme {
  name: string;
  bg: string[];
  accent: string;
  text: string;
  muted: string;
  pattern: "rays" | "stars" | "cross" | "leaves" | "flames";
}

// All 66 books of the Holy Bible with accurate chapter counts
export const BIBLE_BOOKS: BookMetadata[] = [
  // Old Testament
  { id: "genesis", name: "Genesis", chapters: 50 },
  { id: "exodus", name: "Exodus", chapters: 40 },
  { id: "leviticus", name: "Leviticus", chapters: 27 },
  { id: "numbers", name: "Numbers", chapters: 36 },
  { id: "deuteronomy", name: "Deuteronomy", chapters: 34 },
  { id: "joshua", name: "Joshua", chapters: 24 },
  { id: "judges", name: "Judges", chapters: 21 },
  { id: "ruth", name: "Ruth", chapters: 4 },
  { id: "1samuel", name: "1 Samuel", chapters: 31 },
  { id: "2samuel", name: "2 Samuel", chapters: 24 },
  { id: "1kings", name: "1 Kings", chapters: 22 },
  { id: "2kings", name: "2 Kings", chapters: 25 },
  { id: "1chronicles", name: "1 Chronicles", chapters: 29 },
  { id: "2chronicles", name: "2 Chronicles", chapters: 36 },
  { id: "ezra", name: "Ezra", chapters: 10 },
  { id: "nehemiah", name: "Nehemiah", chapters: 13 },
  { id: "esther", name: "Esther", chapters: 10 },
  { id: "job", name: "Job", chapters: 42 },
  { id: "psalms", name: "Psalms", chapters: 150 },
  { id: "proverbs", name: "Proverbs", chapters: 31 },
  { id: "ecclesiastes", name: "Ecclesiastes", chapters: 12 },
  { id: "songofsolomon", name: "Song of Solomon", chapters: 8 },
  { id: "isaiah", name: "Isaiah", chapters: 66 },
  { id: "jeremiah", name: "Jeremiah", chapters: 52 },
  { id: "lamentations", name: "Lamentations", chapters: 5 },
  { id: "ezekiel", name: "Ezekiel", chapters: 48 },
  { id: "daniel", name: "Daniel", chapters: 12 },
  { id: "hosea", name: "Hosea", chapters: 14 },
  { id: "joel", name: "Joel", chapters: 3 },
  { id: "amos", name: "Amos", chapters: 9 },
  { id: "obadiah", name: "Obadiah", chapters: 1 },
  { id: "jonah", name: "Jonah", chapters: 4 },
  { id: "micah", name: "Micah", chapters: 7 },
  { id: "nahum", name: "Nahum", chapters: 3 },
  { id: "habakkuk", name: "Habakkuk", chapters: 3 },
  { id: "zephaniah", name: "Zephaniah", chapters: 3 },
  { id: "haggai", name: "Haggai", chapters: 2 },
  { id: "zechariah", name: "Zechariah", chapters: 14 },
  { id: "malachi", name: "Malachi", chapters: 4 },
  // New Testament
  { id: "matthew", name: "Matthew", chapters: 28 },
  { id: "mark", name: "Mark", chapters: 16 },
  { id: "luke", name: "Luke", chapters: 24 },
  { id: "john", name: "John", chapters: 21 },
  { id: "acts", name: "Acts", chapters: 28 },
  { id: "romans", name: "Romans", chapters: 16 },
  { id: "1corinthians", name: "1 Corinthians", chapters: 16 },
  { id: "2corinthians", name: "2 Corinthians", chapters: 13 },
  { id: "galatians", name: "Galatians", chapters: 6 },
  { id: "ephesians", name: "Ephesians", chapters: 6 },
  { id: "philippians", name: "Philippians", chapters: 4 },
  { id: "colossians", name: "Colossians", chapters: 4 },
  { id: "1thessalonians", name: "1 Thessalonians", chapters: 5 },
  { id: "2thessalonians", name: "2 Thessalonians", chapters: 3 },
  { id: "1timothy", name: "1 Timothy", chapters: 6 },
  { id: "2timothy", name: "2 Timothy", chapters: 4 },
  { id: "titus", name: "Titus", chapters: 3 },
  { id: "philemon", name: "Philemon", chapters: 1 },
  { id: "hebrews", name: "Hebrews", chapters: 13 },
  { id: "james", name: "James", chapters: 5 },
  { id: "1peter", name: "1 Peter", chapters: 5 },
  { id: "2peter", name: "2 Peter", chapters: 3 },
  { id: "1john", name: "1 John", chapters: 5 },
  { id: "2john", name: "2 John", chapters: 1 },
  { id: "3john", name: "3 John", chapters: 1 },
  { id: "jude", name: "Jude", chapters: 1 },
  { id: "revelation", name: "Revelation", chapters: 22 },
];

// Rich list of rotating Scripture verses for the Daily Devotional
export const DEVOTIONAL_VERSES: DailyVerse[] = [
  { ref: 'John 3:16', text: 'For God so loved the world that he gave his one and only Son, that whoever believes in him shall not perish but have eternal life.' },
  { ref: 'Philippians 4:13', text: 'I can do all this through him who gives me strength.' },
  { ref: 'Jeremiah 29:11', text: 'For I know the plans I have for you, declares the Lord, plans to prosper you and not to harm you, plans to give you hope and a future.' },
  { ref: 'Psalm 23:1', text: 'The Lord is my shepherd, I lack nothing.' },
  { ref: 'Romans 8:28', text: 'And we know that in all things God works for the good of those who love him, who have been called according to his purpose.' },
  { ref: 'Isaiah 40:31', text: 'But those who hope in the Lord will renew their strength. They will soar on wings like eagles; they will run and not grow weary, they will walk and breathe easily.' },
  { ref: 'Proverbs 3:5-6', text: 'Trust in the Lord with all your heart and lean not on your own understanding; in all your ways submit to him, and he will make your paths straight.' },
  { ref: 'Matthew 6:33', text: 'But seek first his kingdom and his righteousness, and all these things will be given to you as well.' },
  { ref: 'Psalm 46:1', text: 'God is our refuge and strength, an ever-present help in trouble.' },
  { ref: '2 Timothy 1:7', text: 'For the Spirit God gave us does not make us timid, but gives us power, love and self-discipline.' },
  { ref: 'Isaiah 41:10', text: 'So do not fear, for I am with you; do not be dismayed, for I am your God. I will strengthen you and help you; I will uphold you with my righteous right hand.' },
  { ref: 'Psalm 34:18', text: 'The Lord is close to the brokenhearted and saves those who are crushed in spirit.' },
  { ref: 'Matthew 11:28', text: 'Come to me, all you who are weary and burdened, and I will give you rest.' },
  { ref: 'Philippians 4:6-7', text: 'Do not be anxious about anything, but in every situation, by prayer and petition, with thanksgiving, present your requests to God. And the peace of God will guard your hearts.' },
  { ref: 'Joshua 1:9', text: 'Have I not commanded you? Be strong and courageous. Do not be afraid; do not be discouraged, for the Lord your God will be with you wherever you go.' },
  { ref: 'Psalm 119:105', text: 'Your word is a lamp for my feet, a light on my path.' },
  { ref: 'John 14:6', text: 'Jesus answered, I am the way and the truth and the life. No one comes to the Father except through me.' },
  { ref: 'Romans 15:13', text: 'May the God of hope fill you with all joy and peace as you trust in him, so that you may overflow with hope by the power of the Holy Spirit.' },
  { ref: 'Hebrews 11:1', text: 'Now faith is confidence in what we hope for and assurance about what we do not see.' },
  { ref: 'Romans 12:2', text: 'Do not conform to the pattern of this world, but be transformed by the renewing of your mind.' },
  { ref: '1 Corinthians 13:4-5', text: 'Love is patient, love is kind. It does not envy, it does not boast, it is not proud. It does not dishonor others, it is not self-seeking.' },
  { ref: 'Psalm 27:1', text: 'The Lord is my light and my salvation — whom shall I fear? The Lord is the stronghold of my life — of whom shall I be afraid?' },
  { ref: 'John 16:33', text: 'I have told you these things, so that in me you may have peace. In this world you will have trouble. But take heart! I have overcome the world.' },
  { ref: 'Lamentations 3:22-23', text: 'Because of the Lord\'s great love we are not consumed, for his compassions never fail. They are new every morning; great is your faithfulness.' },
  { ref: 'Ephesians 2:8-9', text: 'For it is by grace you have been saved, through faith — and this is not from yourselves, it is the gift of God.' },
  { ref: 'Romans 8:38-39', text: 'For I am convinced that neither death nor life, nor anything else in all creation, will be able to separate us from the love of God.' },
  { ref: 'Psalm 37:4', text: 'Take delight in the Lord, and he will give you the desires of your heart.' },
  { ref: '1 Peter 5:7', text: 'Cast all your anxiety on him because he cares for you.' },
  { ref: 'Matthew 5:14', text: 'You are the light of the world. A town built on a hill cannot be hidden.' },
  { ref: 'Galatians 5:22-23', text: 'But the fruit of the Spirit is love, joy, peace, forbearance, kindness, goodness, faithfulness, gentleness and self-control.' }
];

export const INITIAL_READING_PLANS: ReadingPlan[] = [
  { id: 'nt-30', icon: 'cross', name: 'New Testament in 30 Days', days: 30, desc: 'Read through the entire New Testament', progress: 0, started: false },
  { id: 'psalms-7', icon: 'scroll', name: 'Psalms & Proverbs', days: 7, desc: 'A week of godly wisdom and daily worship', progress: 0, started: false },
  { id: 'gospels-14', icon: 'dove', name: 'The Four Gospels', days: 14, desc: 'Recounting the miraculous life and words of Jesus', progress: 0, started: false },
  { id: 'genesis-7', icon: 'globe', name: 'In the Beginning', days: 7, desc: 'Genesis study and the beautiful story of creation', progress: 0, started: false },
  { id: 'paul-21', icon: 'letter', name: "Paul's Letters", days: 21, desc: "An immersive study of Paul's epistles in 3 weeks", progress: 0, started: false },
];

export const CARD_THEMES: ShareCardTheme[] = [
  { name: 'Dawn', bg: ['#1A0A2E', '#2D1B4E', '#8B4513', '#D47C0F'], accent: '#F5D07A', text: '#FFF8E7', muted: 'rgba(255,248,231,0.7)', pattern: 'rays' },
  { name: 'Night', bg: ['#080D1A', '#0F1628', '#1A2444', '#0A0E1A'], accent: '#E8B84B', text: '#F0EDE6', muted: 'rgba(240,237,230,0.65)', pattern: 'stars' },
  { name: 'Garden', bg: ['#0A1F0A', '#1A3A1A', '#0D2B0D', '#081408'], accent: '#7BC67E', text: '#E8F5E9', muted: 'rgba(232,245,233,0.65)', pattern: 'leaves' },
  { name: 'Fire', bg: ['#1A0500', '#3D0C00', '#7A1A00', '#2D0800'], accent: '#FF8C42', text: '#FFF3E0', muted: 'rgba(255,243,224,0.65)', pattern: 'flames' },
  { name: 'Royal', bg: ['#1A0535', '#2D0D5C', '#1A0535', '#0D001A'], accent: '#CE93D8', text: '#F3E5F5', muted: 'rgba(243,229,245,0.65)', pattern: 'cross' },
];

export function rotateDayVerse(): DailyVerse {
  const dayOfYear = Math.floor(Date.now() / 86400000);
  return DEVOTIONAL_VERSES[dayOfYear % DEVOTIONAL_VERSES.length];
}

// Generate premium mock user rosters for high fidelity leaderboard tables
export function generateLeaderboardData() {
  return {
    streaks: [
      { rank: 1, displayName: "Pastor Jonathan", username: "pastor_j", score: 264, isCurrentUser: false, avatarGradient: "from-[#FAD961] to-[#F76B1C]", badge: "gold" },
      { rank: 2, displayName: "Sarah Miller", username: "sarah_m", score: 189, isCurrentUser: false, avatarGradient: "from-[#3023AE] to-[#C86DD7]", badge: "silver" },
      { rank: 3, displayName: "David K.", username: "david_king", score: 142, isCurrentUser: false, avatarGradient: "from-[#43e97b] to-[#38f9d7]", badge: "bronze" },
      { rank: 4, displayName: "Abigail Grace", username: "abigrace", score: 98, isCurrentUser: false, avatarGradient: "from-[#ff9a9e] to-[#fecfef]", badge: "normal" },
      { rank: 5, displayName: "Ezekiel Cole", username: "ezek_c", score: 71, isCurrentUser: false, avatarGradient: "from-[#12c2e9] to-[#c471ed]", badge: "normal" }
    ] as any[],
    verses: [
      { rank: 1, displayName: "Elizabeth Vance", username: "elizabeth_v", score: 1250, isCurrentUser: false, avatarGradient: "from-[#C86DD7] to-[#3023AE]", badge: "gold" },
      { rank: 2, displayName: "Pastor Jonathan", username: "pastor_j", score: 920, isCurrentUser: false, avatarGradient: "from-[#FAD961] to-[#F76B1C]", badge: "silver" },
      { rank: 3, displayName: "Caleb Vance", username: "caleb_v", score: 815, isCurrentUser: false, avatarGradient: "from-[#38f9d7] to-[#43e97b]", badge: "bronze" },
      { rank: 4, displayName: "Matthew Luke", username: "matt_l", score: 620, isCurrentUser: false, avatarGradient: "from-[#a1c4fd] to-[#c2e9fb]", badge: "normal" },
      { rank: 5, displayName: "Ruth Esther", username: "ruth_e", score: 490, isCurrentUser: false, avatarGradient: "from-[#fbc2eb] to-[#a6c1ee]", badge: "normal" }
    ] as any[],
    questions: [
      { rank: 1, displayName: "Theology Seeker", username: "theo_seek", score: 450, isCurrentUser: false, avatarGradient: "from-[#fcb045] to-[#fd1d1d]", badge: "gold" },
      { rank: 2, displayName: "Hannah Carter", username: "hannah_c", score: 380, isCurrentUser: false, avatarGradient: "from-[#fbc2eb] to-[#a6c1ee]", badge: "silver" },
      { rank: 3, displayName: "David K.", username: "david_king", score: 290, isCurrentUser: false, avatarGradient: "from-[#43e97b] to-[#38f9d7]", badge: "bronze" },
      { rank: 4, displayName: "Samuel Paul", username: "sam_p", score: 210, isCurrentUser: false, avatarGradient: "from-[#11998e] to-[#38ef7d]", badge: "normal" },
      { rank: 5, displayName: "Martha Mary", username: "martha_m", score: 180, isCurrentUser: false, avatarGradient: "from-[#ff9966] to-[#ff5e62]", badge: "normal" }
    ] as any[],
    prayers: [
      { rank: 1, displayName: "Prayer Warrior", username: "warrior_pray", score: 180, isCurrentUser: false, avatarGradient: "from-[#ff5e62] to-[#ff9966]", badge: "gold" },
      { rank: 2, displayName: "Faith Journey", username: "faith_journey", score: 140, isCurrentUser: false, avatarGradient: "from-[#11998e] to-[#38ef7d]", badge: "silver" },
      { rank: 3, displayName: "Abigail Grace", username: "abigrace", score: 110, isCurrentUser: false, avatarGradient: "from-[#ff9a9e] to-[#fecfef]", badge: "bronze" },
      { rank: 4, displayName: "Sister Susan", username: "susan_s", score: 95, isCurrentUser: false, avatarGradient: "from-[#fad0c4] to-[#ffd1ff]", badge: "normal" },
      { rank: 5, displayName: "Ezekiel Cole", username: "ezek_c", score: 80, isCurrentUser: false, avatarGradient: "from-[#12c2e9] to-[#c471ed]", badge: "normal" }
    ] as any[]
  };
}
