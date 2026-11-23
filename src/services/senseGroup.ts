import { translateEnToZh } from './translator';

export interface SenseGroup {
  text: string;
  role: 'core' | 'connector' | 'modifier';
}

const CLAUSE_OPENERS = new Set([
  'that', 'which', 'who', 'whom', 'whose', 'where', 'when', 'while',
  'because', 'although', 'though', 'unless', 'until', 'whether', 'whereas',
  'before', 'after', 'since', 'if',
]);

const PREP_OPENERS = new Set([
  'in', 'on', 'at', 'by', 'with', 'without', 'for', 'from', 'into', 'onto',
  'through', 'throughout', 'across', 'about', 'between', 'among', 'under',
  'over', 'against', 'toward', 'towards', 'within', 'beyond', 'despite', 'during',
]);

const COORD_OPENERS = new Set(['and', 'but', 'or', 'yet', 'nor']);

const DETERMINERS = new Set(['the', 'a', 'an', 'this', 'that', 'these', 'those', 'my', 'your', 'his', 'her', 'its', 'our', 'their']);

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function classifyChunk(text: string, index: number): SenseGroup['role'] {
  const first = text.trim().toLowerCase().replace(/^[^a-z]+/, '');
  if (index === 0 && !CLAUSE_OPENERS.has(first) && !PREP_OPENERS.has(first)) {
    return 'core';
  }
  if (CLAUSE_OPENERS.has(first) || COORD_OPENERS.has(first)) {
    return 'connector';
  }
  if (PREP_OPENERS.has(first) || first === 'to') {
    return 'modifier';
  }
  return 'core';
}

/**
 * Segment an English sentence into natural native-speaker Sense Groups (意群 / 语块)
 * representing 3-8 word prosodic & syntactic breath units.
 */
export function segmentIntoSenseGroups(sentence: string): SenseGroup[] {
  const clean = sentence.replace(/\s+/g, ' ').trim();
  if (!clean) return [];

  // Step 1: Split on major punctuation while keeping punctuation attached to left chunk
  const rawClauses = clean
    .split(/(?<=[,;:\u2014\u2013])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks: string[] = [];

  for (const clause of rawClauses) {
    const words = clause.split(/\s+/);
    if (words.length <= 6) {
      chunks.push(clause);
      continue;
    }

    let buf: string[] = [];
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const lower = w.toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, '');
      const nextLower = (words[i + 1] ?? '').toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, '');
      const remaining = words.length - i;

      let shouldBreak = false;
      if (buf.length >= 3 && remaining >= 2) {
        if (CLAUSE_OPENERS.has(lower)) {
          shouldBreak = true;
        } else if (COORD_OPENERS.has(lower) && buf.length >= 4) {
          shouldBreak = true;
        } else if (PREP_OPENERS.has(lower) && buf.length >= 3) {
          shouldBreak = true;
        } else if (lower === 'of' && buf.length >= 5 && remaining >= 3) {
          shouldBreak = true;
        } else if (lower === 'to' && buf.length >= 4 && remaining >= 3 && !DETERMINERS.has(nextLower)) {
          // Infinitive phrase break (e.g., "to build a system"), avoid breaking "to the"
          shouldBreak = true;
        } else if (buf.length >= 8 && remaining >= 3) {
          // Hard ceiling so no chunk feels overwhelming
          shouldBreak = true;
        }
      }

      if (shouldBreak) {
        chunks.push(buf.join(' '));
        buf = [w];
      } else {
        buf.push(w);
      }
    }
    if (buf.length > 0) {
      chunks.push(buf.join(' '));
    }
  }

  // Step 2: Anti-fragmentation merge pass (avoid awkward 1-2 word trailing fragments)
  const merged: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const cur = chunks[i];
    const wc = wordCount(cur);
    const endsPunct = /[,;:\u2014\u2013]$/.test(cur);
    if (wc <= 2 && !endsPunct && merged.length > 0 && wordCount(merged[merged.length - 1]) <= 6) {
      merged[merged.length - 1] = `${merged[merged.length - 1]} ${cur}`;
    } else {
      merged.push(cur);
    }
  }

  return merged.map((text, idx) => ({
    text,
    role: classifyChunk(text, idx),
  }));
}

export function splitParagraphToSentences(paragraph: string): string[] {
  const matches = paragraph.match(/[^.!?]+[.!?]+(?:\s*["”’)\]]+)?|[^.!?]+$/g);
  if (!matches) return [paragraph.trim()].filter(Boolean);
  return matches.map((s) => s.trim()).filter((s) => s.length >= 2);
}

/**
 * Translate each sense group in linear English order (顺读顺译) to train
 * native left-to-right comprehension instead of backward word-order translation.
 */
export async function translateSenseGroupsLinear(
  groups: SenseGroup[],
): Promise<Array<SenseGroup & { zh: string }>> {
  const results = await Promise.all(
    groups.map(async (g) => {
      const zh = await translateEnToZh(g.text);
      return { ...g, zh };
    }),
  );
  return results;
}
