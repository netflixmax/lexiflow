/**
 * 100% Free, zero-API-key English -> Simplified Chinese translation service
 * with LocalStorage caching so translated articles & words work offline forever.
 */

const CACHE_KEY = 'lexiflow_zh_cache_v1';

function loadCache(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

function saveCache(cache: Record<string, string>): void {
  try {
    const keys = Object.keys(cache);
    // Keep cache compact (max 600 entries)
    if (keys.length > 600) {
      const trimmed: Record<string, string> = {};
      for (const k of keys.slice(keys.length - 500)) {
        trimmed[k] = cache[k];
      }
      localStorage.setItem(CACHE_KEY, JSON.stringify(trimmed));
      return;
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore storage quota
  }
}

const memCache: Record<string, string> = loadCache();

export async function translateEnToZh(text: string): Promise<string> {
  const clean = text.trim();
  if (!clean) return '';
  if (memCache[clean]) return memCache[clean];

  // 1. Primary: Free Google Translate public endpoint (fast, natural Chinese)
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q=${encodeURIComponent(clean)}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && Array.isArray(data[0])) {
        const translated = (data[0] as Array<[string]>)
          .map((seg) => seg?.[0] ?? '')
          .join('')
          .trim();
        if (translated) {
          memCache[clean] = translated;
          saveCache(memCache);
          return translated;
        }
      }
    }
  } catch {
    // fall through to MyMemory
  }

  // 2. Fallback: Free MyMemory open translation API
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(clean.slice(0, 480))}&langpair=en|zh-CN`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      const translated = data?.responseData?.translatedText;
      if (typeof translated === 'string' && translated.trim()) {
        memCache[clean] = translated.trim();
        saveCache(memCache);
        return translated.trim();
      }
    }
  } catch {
    // offline
  }

  return '';
}

export async function translateParagraphsBatch(paragraphs: string[]): Promise<Record<number, string>> {
  const result: Record<number, string> = {};
  for (let i = 0; i < paragraphs.length; i++) {
    const zh = await translateEnToZh(paragraphs[i]);
    if (zh) result[i] = zh;
  }
  return result;
}
