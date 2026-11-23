import type { BookChapter, ContentCategory, ContentItem, PodcastEpisode } from '../types';

function stripHtmlToParagraphs(html: string): string[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style, nav, footer, header, aside, iframe, noscript, svg').forEach((el) => el.remove());

  const blocks = Array.from(doc.querySelectorAll('p, blockquote, h2, h3, li'))
    .map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim())
    .filter((t) => t.length >= 25);

  if (blocks.length >= 2) {
    // Deduplicate identical consecutive blocks
    return blocks.filter((b, idx) => idx === 0 || b !== blocks[idx - 1]).slice(0, 120);
  }

  const fallbackText = (doc.body?.textContent ?? '').replace(/\r/g, '\n');
  return fallbackText
    .split(/\n{2,}/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length >= 25)
    .slice(0, 120);
}

function countWords(paragraphs: string[]): number {
  return paragraphs.join(' ').trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Fetch latest AI / CS research papers directly from arXiv official open API.
 */
export async function fetchArxivPapers(query = 'cat:cs.AI OR cat:cs.CL OR cat:cs.LG', maxResults = 12): Promise<ContentItem[]> {
  const url = `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(query)}&sortBy=submittedDate&sortOrder=descending&max_results=${maxResults}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`arXiv 请求失败 (${res.status})`);
  const xmlText = await res.text();

  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlText, 'application/xml');
  const entries = Array.from(xml.querySelectorAll('entry'));

  return entries.map((entry, idx) => {
    const idUrl = entry.querySelector('id')?.textContent?.trim() ?? `arxiv-${idx}`;
    const arxivId = idUrl.split('/abs/')[1] ?? `paper-${idx}`;
    const title = (entry.querySelector('title')?.textContent ?? 'Untitled Paper').replace(/\s+/g, ' ').trim();
    const summary = (entry.querySelector('summary')?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const published = (entry.querySelector('published')?.textContent ?? '').slice(0, 10);
    const authors = Array.from(entry.querySelectorAll('author > name'))
      .map((a) => a.textContent?.trim())
      .filter(Boolean)
      .slice(0, 4)
      .join(', ');

    // Split abstract into crisp readable paragraphs by sentences (3 sentences per paragraph)
    const sentences = summary.match(/[^.!?]+[.!?]+/g) ?? [summary];
    const paragraphs: string[] = [];
    for (let i = 0; i < sentences.length; i += 3) {
      paragraphs.push(sentences.slice(i, i + 3).join(' ').trim());
    }
    if (paragraphs.length > 0) {
      paragraphs[0] = `Abstract: ${paragraphs[0]}`;
    }

    const categories = Array.from(entry.querySelectorAll('category'))
      .map((c) => c.getAttribute('term'))
      .filter((t): t is string => Boolean(t))
      .slice(0, 3);

    return {
      id: `arxiv-${arxivId.replace(/[^a-zA-Z0-9.-]/g, '_')}`,
      title,
      subtitle: `arXiv:${arxivId} · ${authors || 'arXiv Authors'}`,
      author: authors || 'arXiv Authors',
      source: 'arXiv Live',
      category: 'paper',
      publishedAt: published || 'Recent',
      paragraphs,
      readProgress: 0,
      wordCount: countWords(paragraphs),
      externalUrl: idUrl,
      tags: categories.length > 0 ? categories : ['arXiv', 'AI'],
    };
  });
}

/**
 * Fetch RSS / Atom feed articles (AI tools & Philosophy essays).
 */
export async function fetchRssArticles(
  feedUrl: string,
  sourceName: string,
  category: ContentCategory,
): Promise<ContentItem[]> {
  const res = await fetch(feedUrl);
  if (!res.ok) throw new Error(`订阅源加载失败 (${res.status})`);
  const xmlText = await res.text();
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlText, 'application/xml');

  const items = Array.from(xml.querySelectorAll('item, entry')).slice(0, 12);
  const results: ContentItem[] = [];

  for (let i = 0; i < items.length; i++) {
    const el = items[i];
    const title = (el.querySelector('title')?.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!title) continue;

    const linkEl = el.querySelector('link');
    const link = linkEl?.getAttribute('href') || linkEl?.textContent?.trim() || '';
    const pubDateRaw =
      el.querySelector('pubDate')?.textContent ||
      el.querySelector('published')?.textContent ||
      el.querySelector('updated')?.textContent ||
      '';
    const publishedAt = pubDateRaw ? new Date(pubDateRaw).toISOString().slice(0, 10) : 'Recent';
    const author =
      el.querySelector('author > name')?.textContent?.trim() ||
      el.querySelector('creator')?.textContent?.trim() ||
      sourceName;

    const contentHtml =
      el.querySelector('content\\:encoded')?.textContent ||
      el.querySelector('encoded')?.textContent ||
      el.querySelector('content')?.textContent ||
      el.querySelector('description')?.textContent ||
      el.querySelector('summary')?.textContent ||
      '';

    const paragraphs = stripHtmlToParagraphs(contentHtml);
    if (paragraphs.length === 0) continue;

    results.push({
      id: `rss-${category}-${btoa(unescape(encodeURIComponent(link || title))).slice(0, 18)}`,
      title,
      subtitle: paragraphs[0].slice(0, 120) + (paragraphs[0].length > 120 ? '…' : ''),
      author,
      source: sourceName,
      category,
      publishedAt,
      paragraphs,
      readProgress: 0,
      wordCount: countWords(paragraphs),
      externalUrl: link || undefined,
      tags: [sourceName],
    });
  }

  return results;
}

export interface GutenbergSearchResult {
  id: number;
  title: string;
  authors: string;
  subjects: string[];
  textUrl?: string;
  downloadCount: number;
}

/**
 * Search 70,000+ free English original classics via Project Gutenberg (Gutendex API).
 */
export async function searchGutenbergBooks(query: string): Promise<GutenbergSearchResult[]> {
  const q = query.trim() || 'philosophy';
  const res = await fetch(`https://gutendex.com/books/?languages=en&search=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error(`原著书库搜索失败 (${res.status})`);
  const data = await res.json();

  return (data.results ?? [])
    .map((b: {
      id: number;
      title: string;
      authors?: { name: string }[];
      subjects?: string[];
      formats?: Record<string, string>;
      download_count?: number;
    }) => {
      const formats = b.formats ?? {};
      const textUrl =
        formats['text/plain; charset=utf-8'] ||
        formats['text/plain; charset=us-ascii'] ||
        formats['text/plain'] ||
        Object.entries(formats).find(([k]) => k.startsWith('text/plain'))?.[1];

      return {
        id: b.id,
        title: b.title,
        authors: (b.authors ?? []).map((a) => a.name).join(', ') || 'Classic Author',
        subjects: (b.subjects ?? []).slice(0, 3),
        textUrl,
        downloadCount: b.download_count ?? 0,
      };
    })
    .filter((b: GutenbergSearchResult) => Boolean(b.textUrl))
    .slice(0, 12);
}

/**
 * Download a Project Gutenberg plain-text book and split it into clean readable chapters.
 */
export async function downloadGutenbergBook(book: GutenbergSearchResult): Promise<ContentItem> {
  if (!book.textUrl) throw new Error('该原著暂未提供纯文本版本');
  const res = await fetch(book.textUrl);
  if (!res.ok) throw new Error(`原著下载失败 (${res.status})`);
  let raw = await res.text();

  // Strip Project Gutenberg header/footer boilerplate
  const startMatch = raw.match(/\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^*]*\*\*\*/i);
  if (startMatch && startMatch.index !== undefined) {
    raw = raw.slice(startMatch.index + startMatch[0].length);
  }
  const endMatch = raw.match(/\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i);
  if (endMatch && endMatch.index !== undefined) {
    raw = raw.slice(0, endMatch.index);
  }

  const allParagraphs = raw
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length >= 20);

  // Chunk into clean ~25-paragraph chapters (capped to keep LocalStorage snappy on mobile)
  const capped = allParagraphs.slice(0, 300);
  const chapters: BookChapter[] = [];
  const chunkSize = 25;
  for (let i = 0; i < capped.length; i += chunkSize) {
    chapters.push({
      title: `Part ${chapters.length + 1}`,
      paragraphs: capped.slice(i, i + chunkSize),
    });
  }

  if (chapters.length === 0) {
    throw new Error('未能解析出有效正文');
  }

  const totalWords = chapters.reduce((sum, c) => sum + countWords(c.paragraphs), 0);

  return {
    id: `gutenberg-${book.id}`,
    title: book.title,
    subtitle: `${book.authors} · Project Gutenberg 原著`,
    author: book.authors,
    source: 'Project Gutenberg',
    category: 'book',
    publishedAt: 'Classic',
    paragraphs: [],
    chapters,
    currentChapter: 0,
    readProgress: 0,
    wordCount: totalWords,
    externalUrl: `https://www.gutenberg.org/ebooks/${book.id}`,
    isUserImported: true,
    tags: ['Original Book', 'Gutenberg'],
  };
}

/**
 * Import any web article URL by fetching HTML and extracting readable paragraphs.
 */
export async function importArticleFromUrl(url: string, category: ContentCategory): Promise<ContentItem> {
  const normalized = url.startsWith('http') ? url : `https://${url}`;
  const res = await fetch(normalized);
  if (!res.ok) throw new Error(`网页抓取失败 (${res.status})`);
  const html = await res.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const title =
    doc.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
    doc.querySelector('h1')?.textContent?.trim() ||
    doc.title ||
    normalized;

  const mainEl = doc.querySelector('article, main, [role="main"]') ?? doc.body;
  const paragraphs = stripHtmlToParagraphs(mainEl?.innerHTML ?? html);
  if (paragraphs.length === 0) {
    throw new Error('未能从该页面提取到英文正文，可尝试复制文本直接导入。');
  }

  const host = new URL(normalized).hostname.replace(/^www\./, '');
  return {
    id: `url-${Date.now()}`,
    title: title.replace(/\s+/g, ' ').trim(),
    subtitle: `导入自 ${host}`,
    author: host,
    source: host,
    category,
    publishedAt: new Date().toISOString().slice(0, 10),
    paragraphs,
    readProgress: 0,
    wordCount: countWords(paragraphs),
    externalUrl: normalized,
    isUserImported: true,
    tags: ['网页导入'],
  };
}

/**
 * Parse a Podcast RSS feed and return playable audio episodes.
 */
export async function fetchPodcastEpisodes(rssUrl: string, feedTitle: string): Promise<PodcastEpisode[]> {
  const res = await fetch(rssUrl);
  if (!res.ok) throw new Error(`播客源加载失败 (${res.status})`);
  const xmlText = await res.text();
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlText, 'application/xml');

  const items = Array.from(xml.querySelectorAll('item')).slice(0, 15);
  const episodes: PodcastEpisode[] = [];

  for (let i = 0; i < items.length; i++) {
    const el = items[i];
    const enclosure = el.querySelector('enclosure');
    const audioUrl = enclosure?.getAttribute('url') || '';
    if (!audioUrl) continue;

    const title = (el.querySelector('title')?.textContent ?? `Episode ${i + 1}`).trim();
    const descHtml =
      el.querySelector('description')?.textContent ||
      el.querySelector('itunes\\:summary')?.textContent ||
      '';
    const descText = new DOMParser()
      .parseFromString(descHtml, 'text/html')
      .body.textContent?.replace(/\s+/g, ' ')
      .trim()
      .slice(0, 180) ?? '';
    const pubRaw = el.querySelector('pubDate')?.textContent ?? '';
    const pubDate = pubRaw ? new Date(pubRaw).toISOString().slice(0, 10) : '';
    const duration =
      el.querySelector('itunes\\:duration')?.textContent?.trim() ||
      el.getElementsByTagName('itunes:duration')[0]?.textContent?.trim() ||
      undefined;

    episodes.push({
      id: `ep-${btoa(unescape(encodeURIComponent(audioUrl))).slice(0, 20)}`,
      feedTitle,
      title,
      description: descText,
      audioUrl,
      pubDate,
      duration,
    });
  }

  return episodes;
}
