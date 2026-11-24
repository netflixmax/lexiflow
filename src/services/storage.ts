import { CURATED_LIBRARY, CURATED_PODCASTS } from '../data/curatedLibrary';
import {
  SEED_DAILY_MIRROR,
  SEED_DAILY_SCENARIOS,
  SEED_PERSONAL_ARTICLE,
} from '../data/dailySeed';
import type {
  AiConfig,
  ContentItem,
  DailyMirrorCard,
  DailyScenarioCard,
  PodcastFeed,
  ReaderSettings,
  UpdateConfig,
  UserStats,
  VocabCard,
} from '../types';

const KEYS = {
  LIBRARY: 'lexiflow_library_v1',
  VOCAB: 'lexiflow_vocab_v1',
  PODCASTS: 'lexiflow_podcasts_v1',
  AI_CONFIG: 'lexiflow_ai_config_v1',
  UPDATE_CONFIG: 'lexiflow_update_config_v1',
  STATS: 'lexiflow_stats_v1',
  READER: 'lexiflow_reader_settings_v1',
  DAILY_MIRRORS: 'lexiflow_daily_mirrors_v1',
  DAILY_SCENARIOS: 'lexiflow_daily_scenarios_v1',
};

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  theme: 'light',
  fontSize: 18,
  lineHeight: 1.8,
  highlightSavedWords: true,
  showSenseGroups: true,
  showBilingual: false,
  ttsRate: 0.92,
  ttsAccent: 'en-US',
  voice: {
    engine: 'kokoro',
    kokoroSpeaker: 3, // af_heart — warm, natural American female voice
    rimeApiKey: '',
    rimeModel: 'coda',
    rimeSpeaker: 'astra',
  },
};

export const DEFAULT_AI_CONFIG: AiConfig = {
  enabled: false,
  provider: 'gemini',
  apiKey: '',
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  model: 'gemini-2.5-flash',
};

export const DEFAULT_UPDATE_CONFIG: UpdateConfig = {
  githubRepo: 'netflixmax/lexiflow',
  manifestUrl: '',
};

export const DEFAULT_STATS: UserStats = {
  wordsReadTotal: 0,
  listeningMinutes: 0,
  reviewsTotal: 0,
  daily: {},
};

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function getTodayKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function loadLibrary(): ContentItem[] {
  const baseSeed: ContentItem[] = [SEED_PERSONAL_ARTICLE, ...CURATED_LIBRARY];
  const saved = safeParse<ContentItem[]>(localStorage.getItem(KEYS.LIBRARY), []);
  if (saved.length === 0) {
    saveLibrary(baseSeed);
    return baseSeed;
  }
  // Ensure personal seed & curated items exist without overwriting user progress
  const existingIds = new Set(saved.map((i) => i.id));
  const missingPersonal = existingIds.has(SEED_PERSONAL_ARTICLE.id) ? [] : [SEED_PERSONAL_ARTICLE];
  const missingCurated = CURATED_LIBRARY.filter((c) => !existingIds.has(c.id));
  if (missingPersonal.length > 0 || missingCurated.length > 0) {
    const merged = [...missingPersonal, ...saved, ...missingCurated];
    saveLibrary(merged);
    return merged;
  }
  return saved;
}

export function saveLibrary(items: ContentItem[]): void {
  localStorage.setItem(KEYS.LIBRARY, JSON.stringify(items));
}

export function loadVocab(): VocabCard[] {
  const raw = safeParse<VocabCard[]>(localStorage.getItem(KEYS.VOCAB), []);
  // Revive Date objects inside FSRS Card
  return raw.map((card) => ({
    ...card,
    fsrs: {
      ...card.fsrs,
      due: new Date(card.fsrs.due),
      last_review: card.fsrs.last_review ? new Date(card.fsrs.last_review) : undefined,
    },
  }));
}

export function saveVocab(cards: VocabCard[]): void {
  localStorage.setItem(KEYS.VOCAB, JSON.stringify(cards));
}

export function loadPodcastFeeds(): PodcastFeed[] {
  const saved = safeParse<PodcastFeed[]>(localStorage.getItem(KEYS.PODCASTS), []);
  if (saved.length === 0) {
    savePodcastFeeds(CURATED_PODCASTS);
    return CURATED_PODCASTS;
  }
  return saved;
}

export function savePodcastFeeds(feeds: PodcastFeed[]): void {
  localStorage.setItem(KEYS.PODCASTS, JSON.stringify(feeds));
}

export function loadAiConfig(): AiConfig {
  return {
    ...DEFAULT_AI_CONFIG,
    ...safeParse<Partial<AiConfig>>(localStorage.getItem(KEYS.AI_CONFIG), {}),
  };
}

export function saveAiConfig(cfg: AiConfig): void {
  localStorage.setItem(KEYS.AI_CONFIG, JSON.stringify(cfg));
}

export function loadUpdateConfig(): UpdateConfig {
  return {
    ...DEFAULT_UPDATE_CONFIG,
    ...safeParse<Partial<UpdateConfig>>(localStorage.getItem(KEYS.UPDATE_CONFIG), {}),
  };
}

export function saveUpdateConfig(cfg: UpdateConfig): void {
  localStorage.setItem(KEYS.UPDATE_CONFIG, JSON.stringify(cfg));
}

export function loadStats(): UserStats {
  return {
    ...DEFAULT_STATS,
    ...safeParse<Partial<UserStats>>(localStorage.getItem(KEYS.STATS), {}),
  };
}

export function saveStats(stats: UserStats): void {
  localStorage.setItem(KEYS.STATS, JSON.stringify(stats));
}

export function recordActivity(
  stats: UserStats,
  delta: { wordsRead?: number; reviews?: number; listeningMins?: number; wordsMined?: number },
): UserStats {
  const key = getTodayKey();
  const prev = stats.daily[key] ?? { wordsRead: 0, reviews: 0, listeningMins: 0, wordsMined: 0 };
  const next: UserStats = {
    wordsReadTotal: stats.wordsReadTotal + (delta.wordsRead ?? 0),
    listeningMinutes: stats.listeningMinutes + (delta.listeningMins ?? 0),
    reviewsTotal: stats.reviewsTotal + (delta.reviews ?? 0),
    daily: {
      ...stats.daily,
      [key]: {
        wordsRead: prev.wordsRead + (delta.wordsRead ?? 0),
        reviews: prev.reviews + (delta.reviews ?? 0),
        listeningMins: prev.listeningMins + (delta.listeningMins ?? 0),
        wordsMined: prev.wordsMined + (delta.wordsMined ?? 0),
      },
    },
  };
  saveStats(next);
  return next;
}

export function loadReaderSettings(): ReaderSettings {
  const saved = safeParse<Partial<ReaderSettings>>(localStorage.getItem(KEYS.READER), {});
  return {
    ...DEFAULT_READER_SETTINGS,
    ...saved,
    voice: {
      ...DEFAULT_READER_SETTINGS.voice,
      ...(saved.voice ?? {}),
    },
  };
}

export function saveReaderSettings(settings: ReaderSettings): void {
  localStorage.setItem(KEYS.READER, JSON.stringify(settings));
}

export function loadDailyMirrors(): DailyMirrorCard[] {
  const saved = safeParse<DailyMirrorCard[]>(localStorage.getItem(KEYS.DAILY_MIRRORS), []);
  if (saved.length === 0) {
    saveDailyMirrors([SEED_DAILY_MIRROR]);
    return [SEED_DAILY_MIRROR];
  }
  return saved;
}

export function saveDailyMirrors(mirrors: DailyMirrorCard[]): void {
  localStorage.setItem(KEYS.DAILY_MIRRORS, JSON.stringify(mirrors));
}

export function loadDailyScenarios(): DailyScenarioCard[] {
  const saved = safeParse<DailyScenarioCard[]>(localStorage.getItem(KEYS.DAILY_SCENARIOS), []);
  if (saved.length === 0) {
    saveDailyScenarios(SEED_DAILY_SCENARIOS);
    return SEED_DAILY_SCENARIOS;
  }
  return saved;
}

export function saveDailyScenarios(scenarios: DailyScenarioCard[]): void {
  localStorage.setItem(KEYS.DAILY_SCENARIOS, JSON.stringify(scenarios));
}

export function exportAllDataJson(): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      app: 'LexiFlow',
      version: 1,
      library: loadLibrary(),
      vocab: loadVocab(),
      podcasts: loadPodcastFeeds(),
      stats: loadStats(),
      readerSettings: loadReaderSettings(),
      updateConfig: loadUpdateConfig(),
    },
    null,
    2,
  );
}

export function importAllDataJson(jsonStr: string): { vocabCount: number; libraryCount: number } {
  const parsed = JSON.parse(jsonStr);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid backup format');
  }
  if (Array.isArray(parsed.library)) saveLibrary(parsed.library);
  if (Array.isArray(parsed.vocab)) saveVocab(parsed.vocab);
  if (Array.isArray(parsed.podcasts)) savePodcastFeeds(parsed.podcasts);
  if (parsed.stats) saveStats(parsed.stats);
  if (parsed.readerSettings) saveReaderSettings(parsed.readerSettings);
  if (parsed.updateConfig) saveUpdateConfig(parsed.updateConfig);
  return {
    vocabCount: Array.isArray(parsed.vocab) ? parsed.vocab.length : 0,
    libraryCount: Array.isArray(parsed.library) ? parsed.library.length : 0,
  };
}
