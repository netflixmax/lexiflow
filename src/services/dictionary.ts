import { OFFLINE_DICTIONARY_MAP } from '../data/starterDecks';
import type { DictionaryEntry } from '../types';

const cache = new Map<string, DictionaryEntry>();

function cleanWord(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/^[^a-z]+|[^a-z]+$/g, '')
    .trim();
}

function candidateLemmas(word: string): string[] {
  const out = [word];
  if (word.endsWith('ies') && word.length > 4) out.push(`${word.slice(0, -3)}y`);
  if (word.endsWith('ied') && word.length > 4) out.push(`${word.slice(0, -3)}y`);
  if (word.endsWith('es') && word.length > 3) out.push(word.slice(0, -2));
  if (word.endsWith('s') && word.length > 3 && !word.endsWith('ss')) out.push(word.slice(0, -1));
  if (word.endsWith('ing') && word.length > 5) {
    out.push(word.slice(0, -3));
    out.push(`${word.slice(0, -3)}e`);
  }
  if (word.endsWith('ed') && word.length > 4) {
    out.push(word.slice(0, -2));
    out.push(word.slice(0, -1));
  }
  if (word.endsWith('ly') && word.length > 4) out.push(word.slice(0, -2));
  return Array.from(new Set(out));
}

export async function lookupWord(rawWord: string): Promise<DictionaryEntry> {
  const word = cleanWord(rawWord);
  if (!word) {
    return {
      word: rawWord,
      definitions: [{ definition: 'Select an English word to look up.' }],
      source: 'offline',
    };
  }

  if (cache.has(word)) {
    return cache.get(word)!;
  }

  const candidates = candidateLemmas(word);

  // 1. Check bundled high-value offline dictionary first (instant, includes Chinese hint)
  for (const cand of candidates) {
    const offline = OFFLINE_DICTIONARY_MAP[cand];
    if (offline) {
      const entry: DictionaryEntry = {
        word: offline.word,
        phonetic: offline.phonetic,
        partOfSpeech: offline.partOfSpeech,
        zhHint: offline.zhHint,
        definitions: [{ definition: offline.definition, example: offline.contextSentence }],
        source: 'offline',
      };
      cache.set(word, entry);
      return entry;
    }
  }

  // 2. Query open-source Free Dictionary API (dictionaryapi.dev)
  for (const cand of candidates.slice(0, 3)) {
    try {
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(cand)}`);
      if (!res.ok) continue;
      const data = await res.json();
      if (!Array.isArray(data) || !data[0]) continue;

      const first = data[0];
      const phonetic =
        first.phonetic ||
        first.phonetics?.find((p: { text?: string }) => p.text)?.text ||
        '';
      const audioUrl =
        first.phonetics?.find((p: { audio?: string }) => p.audio && p.audio.length > 0)?.audio ||
        undefined;

      const definitions: DictionaryEntry['definitions'] = [];
      let partOfSpeech = '';

      for (const meaning of first.meanings ?? []) {
        if (!partOfSpeech && meaning.partOfSpeech) {
          partOfSpeech = meaning.partOfSpeech;
        }
        for (const def of (meaning.definitions ?? []).slice(0, 2)) {
          if (def.definition) {
            definitions.push({
              definition: def.definition,
              example: def.example,
            });
          }
          if (definitions.length >= 4) break;
        }
        if (definitions.length >= 4) break;
      }

      if (definitions.length > 0) {
        const entry: DictionaryEntry = {
          word: first.word || cand,
          phonetic,
          audioUrl,
          partOfSpeech,
          definitions,
          source: 'dictionaryapi',
        };
        cache.set(word, entry);
        return entry;
      }
    } catch {
      // fall through to next candidate / fallback
    }
  }

  // 3. Fallback: Datamuse open lexicon API
  try {
    const res = await fetch(`https://api.datamuse.com/words?sp=${encodeURIComponent(word)}&md=d&max=1`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data[0]?.defs?.length > 0) {
        const defs = (data[0].defs as string[]).slice(0, 3).map((d) => {
          const parts = d.split('\t');
          return { definition: parts[1] ?? d };
        });
        const entry: DictionaryEntry = {
          word: data[0].word || word,
          partOfSpeech: (data[0].defs[0] as string).split('\t')[0],
          definitions: defs,
          source: 'wiktionary',
        };
        cache.set(word, entry);
        return entry;
      }
    }
  } catch {
    // offline or unreachable
  }

  return {
    word,
    definitions: [
      {
        definition: '离线暂未收录该词，联网后将自动查询开源英英词典；你仍可一键收藏原句入库。',
      },
    ],
    source: 'offline',
  };
}
