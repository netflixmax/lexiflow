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

export type VoiceEngineType = 'kokoro' | 'rime' | 'system';

export interface VoiceConfig {
  engine: VoiceEngineType;
  kokoroSpeaker: number; // 0..10
  rimeApiKey: string;
  rimeModel: 'coda' | 'mistv3';
  rimeSpeaker: string;
}

export interface ReaderSettings {
  theme: ReaderTheme;
  fontSize: number; // px, 15..24
  lineHeight: number; // 1.5..2.1
  highlightSavedWords: boolean;
  showSenseGroups: boolean;
  showBilingual: boolean;
  ttsRate: number; // 0.6..1.6
  ttsAccent: 'en-US' | 'en-GB';
  voice: VoiceConfig;
}

export interface DailyMirrorCard {
  id: string;
  date: string;
  title: string;
  summary: string;
  highlights: string[];
  mirrorQuestion: string;
  userReflection?: string;
}

export interface DailyScenarioCard {
  id: string;
  date: string;
  sceneTag: string;
  zhOriginal: string;
  userAttempt?: string;
  tip?: string;
  enSenseGroups: string[];
  enNatural: string;
  keyPhrase?: string;
  domain: '思想表达' | '分享产品' | 'AI 洞察' | '下达意图' | '体验反馈' | '日常交流';
  status: 'pending' | 'learning' | 'mastered';
}

export interface SharedIncomingPayload {
  action: 'word' | 'text';
  text: string;
  context?: string;
  source?: string;
}

export type ActiveTab = 'today' | 'read' | 'listen' | 'vocab' | 'profile';
