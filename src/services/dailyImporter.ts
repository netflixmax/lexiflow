import type { ContentItem, DailyMirrorCard, DailyScenarioCard } from '../types';

/**
 * Strip potential high-entropy secrets, emails, and phone/WeChat identifiers
 * before turning any external text or keyboard export into learning items.
 */
export function sanitizePersonalText(raw: string): string {
  return raw
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[已脱敏邮箱]')
    .replace(/\b[A-Za-z0-9_-]{24,}\b/g, '[已脱敏密钥]')
    .replace(/(?:微信|vx|wechat)[：:\s]*[A-Za-z0-9_-]{5,}/gi, '[已脱敏联系]')
    .replace(/\b1[3-9]\d{9}\b/g, '[已脱敏号码]');
}

export interface DailyImportResult {
  articles: ContentItem[];
  mirrors: DailyMirrorCard[];
  scenarios: DailyScenarioCard[];
  summary: string;
}

/**
 * Incrementally parse a Drive daily-english pack (.md), daily-mirror card (.md),
 * or JSON daily bundle without wiping existing user data.
 */
export function parseIncrementalDailyContent(
  rawText: string,
  fileName = '每日导入',
): DailyImportResult {
  const clean = sanitizePersonalText(rawText).trim();
  const today = new Date().toISOString().slice(0, 10);

  // 1. JSON bundle format
  if (clean.startsWith('{')) {
    try {
      const obj = JSON.parse(clean) as {
        mirror?: DailyMirrorCard;
        scenarios?: DailyScenarioCard[];
        article?: ContentItem;
      };
      const mirrors = obj.mirror ? [obj.mirror] : [];
      const scenarios = Array.isArray(obj.scenarios) ? obj.scenarios : [];
      const articles = obj.article ? [obj.article] : [];
      return {
        articles,
        mirrors,
        scenarios,
        summary: `增量导入 ${articles.length} 篇阅读、${scenarios.length} 张场景卡、${mirrors.length} 张复盘镜子`,
      };
    } catch {
      // fall through to Markdown parsing
    }
  }

  // 2. Daily Mirror Markdown (# 真实自我复盘卡 · YYYY-MM-DD)
  if (clean.includes('真实自我复盘卡')) {
    const dateMatch = clean.match(/(\d{4}-\d{2}-\d{2})/);
    const date = dateMatch?.[1] ?? today;
    const lines = clean.split(/\r?\n/).map((l) => l.trim());
    const bullets = lines
      .filter((l) => /^[-*]\s+/.test(l) || /^\d+\.\s+/.test(l))
      .map((l) => l.replace(/^[-*\d.]+\s+/, '').replace(/\*\*/g, ''))
      .slice(0, 4);
    const questionLine =
      lines.find((l) => l.includes('？') && l.length > 15)?.replace(/^[-*\d.]+\s+/, '').replace(/\*\*/g, '') ??
      '今天你最真实想推进的一件事是什么？';
    const mirror: DailyMirrorCard = {
      id: `mirror-${date}-${Date.now()}`,
      date,
      title: `${date} 真实自我复盘卡`,
      summary: bullets[0] ?? '已从你的输入法记录生成今日复盘。',
      highlights: bullets.length > 0 ? bullets : ['已同步最新思维切片'],
      mirrorQuestion: questionLine,
      userReflection: '',
    };
    return {
      articles: [],
      mirrors: [mirror],
      scenarios: [],
      summary: `已增量导入 ${date} 真实自我复盘卡`,
    };
  }

  // 3. Daily English Pack Markdown (# 个人专属 i+1 英语...)
  if (clean.includes('个人专属') && clean.includes('>')) {
    const dateMatch = clean.match(/(\d{4}-\d{2}-\d{2})/);
    const date = dateMatch?.[1] ?? today;
    const titleMatch = clean.match(/^#\s+(.+)$/m);
    const quoteBlocks = clean
      .split(/\r?\n\r?\n/)
      .filter((blk) => blk.trim().startsWith('>'))
      .map((blk) =>
        blk
          .split(/\r?\n/)
          .map((l) => l.replace(/^>\s?/, '').replace(/\s*\/\s*/g, ' ').trim())
          .filter(Boolean)
          .join(' '),
      )
      .filter((p) => /[A-Za-z]{4,}/.test(p) && !p.startsWith('Question:'));

    if (quoteBlocks.length > 0) {
      const words = quoteBlocks.join(' ').split(/\s+/).filter(Boolean).length;
      const article: ContentItem = {
        id: `personal-pack-${date}-${Date.now()}`,
        title: titleMatch?.[1]?.trim() || `个人专属英语微播客 (${date})`,
        subtitle: '从 Drive 每日英语包增量导入',
        author: 'Rong × Antigravity',
        source: '个人专属日包',
        category: 'ai',
        publishedAt: date,
        paragraphs: quoteBlocks,
        readProgress: 0,
        wordCount: words,
        isUserImported: true,
        tags: ['今日专属', 'i+1'],
      };
      return {
        articles: [article],
        mirrors: [],
        scenarios: [],
        summary: `已增量导入「${article.title}」（${words} 词）`,
      };
    }
  }

  // 4. Plain English passage or general Markdown -> incremental reading article
  const paragraphs = clean
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.replace(/^#+\s*/, '').replace(/^>\s?/gm, '').trim())
    .filter((p) => p.length > 10);

  const wordCount = paragraphs.join(' ').split(/\s+/).filter(Boolean).length;
  const article: ContentItem = {
    id: `imported-${Date.now()}`,
    title: fileName.replace(/\.(md|txt|json)$/i, '') || `导入文章 (${today})`,
    author: '个人导入',
    source: '增量导入',
    category: 'ai',
    publishedAt: today,
    paragraphs: paragraphs.length > 0 ? paragraphs : [clean],
    readProgress: 0,
    wordCount,
    isUserImported: true,
    tags: ['外部导入'],
  };

  return {
    articles: [article],
    mirrors: [],
    scenarios: [],
    summary: `已增量加入阅读库：「${article.title}」`,
  };
}
