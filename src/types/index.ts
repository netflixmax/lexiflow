import type { Card as FsrsCard } from 'ts-fsrs';

export type ContentCategory = 'ai' | 'philosophy' | 'book' | 'paper';

export interface BookChapter {
  title: string;
  paragraphs: string[];
}

export interface ContentItem {
  id: string;
  title: string;
  subtitle?: string;
  author: string;
  source: string;
  category: ContentCategory;
  publishedAt: string;
  paragraphs: string[];
  chapters?: BookChapter[];
  currentChapter?: number;
  readProgress: number; // 0 to 100
  wordCount: number;
  externalUrl?: string;
  isUserImported?: boolean;
  tags?: string[];
}

export interface DictionaryEntry {
  word: string;
  phonetic?: string;
  audioUrl?: string;
  partOfSpeech?: string;
  definitions: Array<{
    definition: string;
    example?: string;
  }>;
  zhHint?: string;
  source: 'offline' | 'dictionaryapi' | 'wiktionary';
}

export interface VocabCard {
  id: string;
  word: string;
  phonetic?: string;
  audioUrl?: string;
  partOfSpeech?: string;
  definition: string;
  zhHint?: string;
  contextSentence: string;
  sourceTitle: string;
  sourceId?: string;
  deck: string;
  createdAt: number;
  fsrs: FsrsCard;
}

export interface PodcastFeed {
  id: string;
  title: string;
  category: 'ai' | 'philosophy' | 'english';
  description: string;
  rssUrl: string;
}

export interface PodcastEpisode {
  id: string;
  feedTitle: string;
  title: string;
  description: string;
  audioUrl: string;
  pubDate: string;
  duration?: string;
}

export type AiProvider = 'gemini' | 'openai' | 'deepseek' | 'custom';

export interface AiConfig {
  enabled: boolean;
  provider: AiProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface UpdateConfig {
  githubRepo: string; // e.g. "username/lexiflow"
  manifestUrl: string; // optional direct update.json URL (e.g. raw GitHub or Drive)
}

export interface UpdateInfo {
  versionName: string;
  versionCode: number;
  apkUrl: string;
  releaseNotes: string;
  sha256?: string;
  publishedAt?: string;
}

export interface DailyActivity {
  wordsRead: number;
  reviews: number;
  listeningMins: number;
  wordsMined: number;
}

export interface UserStats {
  wordsReadTotal: number;
  listeningMinutes: number;
  reviewsTotal: number;
  daily: Record<string, DailyActivity>; // YYYY-MM-DD
}

export type ReaderTheme = 'light' | 'sepia' | 'dark';

export interface ReaderSettings {
  theme: ReaderTheme;
  fontSize: number; // px, 15..24
  lineHeight: number; // 1.5..2.1
  highlightSavedWords: boolean;
  ttsRate: number; // 0.6..1.6
  ttsAccent: 'en-US' | 'en-GB';
}

export type ActiveTab = 'read' | 'listen' | 'vocab' | 'profile';
