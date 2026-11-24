import { CURATED_LIBRARY, CURATED_PODCASTS } from '../data/curatedLibrary';
import {
  SEED_DAILY_MIRROR,
  SEED_DAILY_PICKS,
  SEED_DAILY_SCENARIOS,
  SEED_PERSONAL_ARTICLE,
} from '../data/dailySeed';
import type {
  AiConfig,
  ContentItem,
  DailyFeedConfig,
  DailyMirrorCard,
  DailyPick,
  DailyScenarioCard,
  LiveReadmeData,
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
  DAILY_PICKS: 'lexiflow_daily_picks_v1',
  DAILY_FEED_CONFIG: 'lexiflow_daily_feed_cfg_v1',
  LIVE_README: 'lexiflow_live_readme_v1',
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
    kokoroSpeaker: 1, // af_bella — warm, natural American voice
    rimeApiKey: '',
    rimeModel: 'coda',
    rimeSpeaker: 'astra',
  },
  showClassicTabs: false,
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
  listeningSecondsTotal: 0,
  reviewsTotal: 0,
  mirrorsLoggedTotal: 0,
  scenariosDoneTotal: 0,
  daily: {},
};

export const DEFAULT_LIVE_README: LiveReadmeData = {
  updatedAt: '2026-11-24',
  subtitle: '荣的个性化 AI-Native 伴侣说明书（随每日日包实时更新）',
  sections: [
    {
      title: '1. 定位：你的个性化 AI-Native 伴侣 APP',
      body: '它不再是堆满公共教材的传统英语软件，而是围绕「不断认识自己 → 不断更新自己 → 线上打通线下」打造的私人出口。首页拆成「镜子 · 播客 · 真话」三个安静单屏，一屏只做一件事。',
    },
    {
      title: '2. 核心燃料：把你的真实数据收集得足够',
      body: '全天照常用手机语音输入法在各个 App 里自然说话，晚上顺手上传到 Google Drive「输入法记录」；看到「镜子」有感触时，直接在回声框留两句真实想法。所有学习时长（精确到秒）、精读字数、镜子回声与复习曲线都会永久留在本机，升级绝不丢失。',
    },
    {
      title: '3. 每日热更新：连 README 都会跟着你一起长',
      body: '每天同步后，系统会在你私有 Drive 的 03_outbox/daily-feed/ 生成当天的 YYYY-MM-DD.json（含最新镜子、1 分钟专属播客、真话卡片、精准推荐与最新一版 README）。点右上角「导入日包」即可 1 秒热更新，无需重装软件。',
    },
    {
      title: '4. 声音与隐私红线',
      body: '播客页顶部可直接点「换声音」，自由试听 11 种 Kokoro 离线男女/美英真人音色或切换 Rime 云端音色。所有私密记录仅保存在你的本机与私有 Drive，绝不写入公开仓库；导入文本时自动过滤邮箱、手机号与高熵密钥。',
    },
  ],
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
  const loaded = {
    ...DEFAULT_STATS,
    ...safeParse<Partial<UserStats>>(localStorage.getItem(KEYS.STATS), {}),
  };
  if (loaded.listeningSecondsTotal === undefined && loaded.listeningMinutes > 0) {
    loaded.listeningSecondsTotal = loaded.listeningMinutes * 60;
  }
  return loaded;
}

export function saveStats(stats: UserStats): void {
  localStorage.setItem(KEYS.STATS, JSON.stringify(stats));
}

export function recordActivity(
  stats: UserStats,
  delta: {
    wordsRead?: number;
    reviews?: number;
    listeningMins?: number;
    listeningSeconds?: number;
    wordsMined?: number;
    mirrorsLogged?: number;
    scenariosDone?: number;
  },
): UserStats {
  const key = getTodayKey();
  const prev = stats.daily[key] ?? {
    wordsRead: 0,
    reviews: 0,
    listeningMins: 0,
    listeningSeconds: 0,
    wordsMined: 0,
    mirrorsLogged: 0,
    scenariosDone: 0,
  };

  const addedSec = (delta.listeningSeconds ?? 0) + (delta.listeningMins ?? 0) * 60;
  const totalSec = (stats.listeningSecondsTotal ?? stats.listeningMinutes * 60) + addedSec;
  const daySec = (prev.listeningSeconds ?? prev.listeningMins * 60) + addedSec;

  const next: UserStats = {
    wordsReadTotal: stats.wordsReadTotal + (delta.wordsRead ?? 0),
    listeningSecondsTotal: totalSec,
    listeningMinutes: Math.floor(totalSec / 60),
    reviewsTotal: stats.reviewsTotal + (delta.reviews ?? 0),
    mirrorsLoggedTotal: (stats.mirrorsLoggedTotal ?? 0) + (delta.mirrorsLogged ?? 0),
    scenariosDoneTotal: (stats.scenariosDoneTotal ?? 0) + (delta.scenariosDone ?? 0),
    daily: {
      ...stats.daily,
      [key]: {
        wordsRead: prev.wordsRead + (delta.wordsRead ?? 0),
        reviews: prev.reviews + (delta.reviews ?? 0),
        listeningSeconds: daySec,
        listeningMins: Math.floor(daySec / 60),
        wordsMined: prev.wordsMined + (delta.wordsMined ?? 0),
        mirrorsLogged: (prev.mirrorsLogged ?? 0) + (delta.mirrorsLogged ?? 0),
        scenariosDone: (prev.scenariosDone ?? 0) + (delta.scenariosDone ?? 0),
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

export function loadDailyPicks(): DailyPick[] {
  const saved = safeParse<DailyPick[]>(localStorage.getItem(KEYS.DAILY_PICKS), []);
  if (saved.length === 0) {
    saveDailyPicks(SEED_DAILY_PICKS);
    return SEED_DAILY_PICKS;
  }
  return saved;
}

export function saveDailyPicks(picks: DailyPick[]): void {
  localStorage.setItem(KEYS.DAILY_PICKS, JSON.stringify(picks));
}

export function loadDailyFeedConfig(): DailyFeedConfig {
  return {
    feedUrl: '',
    ...safeParse<Partial<DailyFeedConfig>>(localStorage.getItem(KEYS.DAILY_FEED_CONFIG), {}),
  };
}

export function saveDailyFeedConfig(cfg: DailyFeedConfig): void {
  localStorage.setItem(KEYS.DAILY_FEED_CONFIG, JSON.stringify(cfg));
}

export function loadLiveReadme(): LiveReadmeData {
  const saved = safeParse<LiveReadmeData | null>(localStorage.getItem(KEYS.LIVE_README), null);
  if (!saved || !Array.isArray(saved.sections) || saved.sections.length === 0) {
    saveLiveReadme(DEFAULT_LIVE_README);
    return DEFAULT_LIVE_README;
  }
  return saved;
}

export function saveLiveReadme(data: LiveReadmeData): void {
  localStorage.setItem(KEYS.LIVE_README, JSON.stringify(data));
}

export function exportAllDataJson(): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      app: 'LexiFlow',
      version: 2,
      library: loadLibrary(),
      vocab: loadVocab(),
      podcasts: loadPodcastFeeds(),
      stats: loadStats(),
      readerSettings: loadReaderSettings(),
      updateConfig: loadUpdateConfig(),
      mirrors: loadDailyMirrors(),
      scenarios: loadDailyScenarios(),
      picks: loadDailyPicks(),
      feedConfig: loadDailyFeedConfig(),
      readme: loadLiveReadme(),
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
  if (Array.isArray(parsed.mirrors)) saveDailyMirrors(parsed.mirrors);
  if (Array.isArray(parsed.scenarios)) saveDailyScenarios(parsed.scenarios);
  if (Array.isArray(parsed.picks)) saveDailyPicks(parsed.picks);
  if (parsed.feedConfig) saveDailyFeedConfig(parsed.feedConfig);
  if (parsed.readme) saveLiveReadme(parsed.readme);
  return {
    vocabCount: Array.isArray(parsed.vocab) ? parsed.vocab.length : 0,
    libraryCount: Array.isArray(parsed.library) ? parsed.library.length : 0,
  };
}
