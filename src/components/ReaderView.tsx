import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookmarkCheck,
  BookmarkPlus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Headphones,
  Loader2,
  Sparkles,
  Type,
  Volume2,
  X,
} from 'lucide-react';
import { analyzeSentenceSyntax, distillArticleInsight, explainWordInContext } from '../services/aiTutor';
import { lookupWord } from '../services/dictionary';
import { speakText } from '../services/nativeBridge';
import type {
  AiConfig,
  ContentItem,
  DictionaryEntry,
  ReaderSettings,
  ReaderTheme,
  VocabCard,
} from '../types';

interface ReaderViewProps {
  item: ContentItem;
  savedWordSet: Set<string>;
  readerSettings: ReaderSettings;
  aiConfig: AiConfig;
  onUpdateSettings: (next: ReaderSettings) => void;
  onUpdateItem: (updated: ContentItem) => void;
  onMineWord: (card: Omit<VocabCard, 'id' | 'createdAt' | 'fsrs'>) => void;
  onRecordReading: (words: number) => void;
  onSendToListen: (item: ContentItem) => void;
  onBack: () => void;
}

const THEME_STYLES: Record<
  ReaderTheme,
  { bg: string; text: string; muted: string; border: string; sheetBg: string }
> = {
  light: {
    bg: 'bg-[#FAF9F6]',
    text: 'text-[#1C1B18]',
    muted: 'text-[#78756E]',
    border: 'border-[#ECEAE4]',
    sheetBg: 'bg-white',
  },
  sepia: {
    bg: 'bg-[#F4ECD8]',
    text: 'text-[#2C2318]',
    muted: 'text-[#75654E]',
    border: 'border-[#E3D6BC]',
    sheetBg: 'bg-[#FAF4E6]',
  },
  dark: {
    bg: 'bg-[#141413]',
    text: 'text-[#E7E4DC]',
    muted: 'text-[#969288]',
    border: 'border-[#272624]',
    sheetBg: 'bg-[#1E1D1B]',
  },
};

function extractSentenceForParagraph(paragraph: string, targetWord: string): string {
  const sentences = paragraph.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [paragraph];
  const lower = targetWord.toLowerCase();
  const hit = sentences.find((s) => s.toLowerCase().includes(lower));
  return (hit ?? paragraph).trim();
}

export const ReaderView: React.FC<ReaderViewProps> = ({
  item,
  savedWordSet,
  readerSettings,
  aiConfig,
  onUpdateSettings,
  onUpdateItem,
  onMineWord,
  onRecordReading,
  onSendToListen,
  onBack,
}) => {
  const theme = THEME_STYLES[readerSettings.theme];
  const scrollRef = useRef<HTMLDivElement>(null);

  const chapterIdx = item.currentChapter ?? 0;
  const activeParagraphs = useMemo(() => {
    if (item.chapters && item.chapters.length > 0) {
      return item.chapters[chapterIdx]?.paragraphs ?? [];
    }
    return item.paragraphs;
  }, [item, chapterIdx]);

  const activeChapterTitle = item.chapters?.[chapterIdx]?.title;

  const [showAppearance, setShowAppearance] = useState(false);

  // Word lookup sheet state
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [selectedSentence, setSelectedSentence] = useState<string>('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [entry, setEntry] = useState<DictionaryEntry | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  // Optional AI states
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [showArticleInsight, setShowArticleInsight] = useState(false);
  const [articleInsight, setArticleInsight] = useState<string | null>(null);
  const [markedDone, setMarkedDone] = useState(false);

  const aiReady = aiConfig.enabled && Boolean(aiConfig.apiKey.trim());

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [chapterIdx, item.id]);

  const handleTapWord = async (rawToken: string, paragraph: string) => {
    const cleaned = rawToken.replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, '');
    if (!cleaned || cleaned.length < 2) return;

    const sentence = extractSentenceForParagraph(paragraph, cleaned);
    setSelectedWord(cleaned);
    setSelectedSentence(sentence);
    setLookupLoading(true);
    setEntry(null);
    setJustSaved(savedWordSet.has(cleaned.toLowerCase()));
    setAiResult(null);
    setAiError(null);

    try {
      const res = await lookupWord(cleaned);
      setEntry(res);
      setJustSaved(savedWordSet.has(res.word.toLowerCase()) || savedWordSet.has(cleaned.toLowerCase()));
    } finally {
      setLookupLoading(false);
    }
  };

  const handlePronounce = (text: string, audioUrl?: string) => {
    if (audioUrl) {
      const audio = new Audio(audioUrl);
      audio.play().catch(() => {
        speakText(text, { rate: 0.9, locale: readerSettings.ttsAccent });
      });
      return;
    }
    speakText(text, { rate: 0.9, locale: readerSettings.ttsAccent });
  };

  const handleSaveWord = () => {
    if (!selectedWord) return;
    const targetWord = entry?.word || selectedWord.toLowerCase();
    const defText =
      entry?.definitions?.[0]?.definition || 'Saved from reading context.';
    onMineWord({
      word: targetWord,
      phonetic: entry?.phonetic,
      audioUrl: entry?.audioUrl,
      partOfSpeech: entry?.partOfSpeech,
      definition: defText,
      zhHint: entry?.zhHint,
      contextSentence: selectedSentence,
      sourceTitle: item.title,
      sourceId: item.id,
      deck: '阅读采集',
    });
    setJustSaved(true);
  };

  const handleAiAction = async (mode: 'word' | 'sentence') => {
    if (!selectedWord) return;
    setAiLoading(true);
    setAiError(null);
    setAiResult(null);
    try {
      const res =
        mode === 'word'
          ? await explainWordInContext(aiConfig, entry?.word || selectedWord, selectedSentence)
          : await analyzeSentenceSyntax(aiConfig, selectedSentence);
      setAiResult(res);
    } catch (e) {
      setAiError((e as Error).message);
    } finally {
      setAiLoading(false);
    }
  };

  const handleArticleInsight = async () => {
    setShowArticleInsight(true);
    if (articleInsight) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await distillArticleInsight(
        aiConfig,
        activeChapterTitle ? `${item.title} - ${activeChapterTitle}` : item.title,
        activeParagraphs.join('\n\n'),
      );
      setArticleInsight(res);
    } catch (e) {
      setAiError((e as Error).message);
    } finally {
      setAiLoading(false);
    }
  };

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    if (max <= 0) return;
    const pct = Math.min(100, Math.round((el.scrollTop / max) * 100));
    if (pct > item.readProgress + 8 || pct === 100) {
      onUpdateItem({ ...item, readProgress: Math.max(item.readProgress, pct) });
    }
  };

  const handleCompleteSection = () => {
    const words = activeParagraphs.join(' ').split(/\s+/).filter(Boolean).length;
    onRecordReading(words);
    onUpdateItem({ ...item, readProgress: 100 });
    setMarkedDone(true);
  };

  const switchChapter = (nextIdx: number) => {
    if (!item.chapters) return;
    if (nextIdx < 0 || nextIdx >= item.chapters.length) return;
    setArticleInsight(null);
    setMarkedDone(false);
    onUpdateItem({
      ...item,
      currentChapter: nextIdx,
      readProgress: Math.round(((nextIdx + 1) / item.chapters.length) * 100),
    });
  };

  return (
    <div className={`fixed inset-0 z-40 flex flex-col ${theme.bg} ${theme.text}`}>
      {/* Minimal Top Bar */}
      <header
        className={`pt-safe px-4 pb-2.5 flex items-center justify-between border-b ${theme.border}`}
      >
        <button
          onClick={onBack}
          className="h-9 px-2 -ml-2 rounded-full flex items-center gap-1 text-[14px]"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>书架</span>
        </button>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onSendToListen(item)}
            className={`h-8 px-3 rounded-full border ${theme.border} text-[12px] font-medium flex items-center gap-1.5`}
          >
            <Headphones className="w-3.5 h-3.5" />
            精听
          </button>

          {aiReady && (
            <button
              onClick={handleArticleInsight}
              className={`h-8 px-3 rounded-full border ${theme.border} text-[12px] font-medium flex items-center gap-1`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              导读
            </button>
          )}

          <button
            onClick={() => setShowAppearance((v) => !v)}
            className={`w-8 h-8 rounded-full border ${theme.border} flex items-center justify-center`}
            aria-label="排版设置"
          >
            <Type className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Typography & Theme Popover */}
      {showAppearance && (
        <div className={`px-5 py-3.5 border-b ${theme.border} ${theme.sheetBg} space-y-3`}>
          <div className="flex items-center justify-between">
            <span className={`text-[12px] ${theme.muted}`}>阅读主题</span>
            <div className="flex gap-2">
              {(
                [
                  { k: 'light', label: '纸白', swatch: 'bg-[#FAF9F6] text-[#1C1B18]' },
                  { k: 'sepia', label: '暖纸', swatch: 'bg-[#F4ECD8] text-[#2C2318]' },
                  { k: 'dark', label: '夜墨', swatch: 'bg-[#1C1B18] text-[#E7E4DC]' },
                ] as const
              ).map((t) => (
                <button
                  key={t.k}
                  onClick={() => onUpdateSettings({ ...readerSettings, theme: t.k })}
                  className={`px-3 py-1 rounded-lg text-[12px] border ${t.swatch} ${
                    readerSettings.theme === t.k ? 'ring-2 ring-amber-500 border-transparent' : 'border-black/15'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className={`text-[12px] ${theme.muted}`}>字号 ({readerSettings.fontSize}px)</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  onUpdateSettings({
                    ...readerSettings,
                    fontSize: Math.max(15, readerSettings.fontSize - 1),
                  })
                }
                className={`w-8 h-7 rounded-lg border ${theme.border} text-[13px]`}
              >
                A-
              </button>
              <button
                onClick={() =>
                  onUpdateSettings({
                    ...readerSettings,
                    fontSize: Math.min(24, readerSettings.fontSize + 1),
                  })
                }
                className={`w-8 h-7 rounded-lg border ${theme.border} text-[13px]`}
              >
                A+
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className={`text-[12px] ${theme.muted}`}>高亮词库中的生词 (i+1 复现)</span>
            <input
              type="checkbox"
              checked={readerSettings.highlightSavedWords}
              onChange={(e) =>
                onUpdateSettings({ ...readerSettings, highlightSavedWords: e.target.checked })
              }
              className="w-4 h-4 accent-amber-600"
            />
          </div>
        </div>
      )}

      {/* Main Immersive Reading Surface */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-5 sm:px-8 py-6 pb-28 max-w-2xl mx-auto w-full"
      >
        <div className="mb-6">
          <div className={`text-[12px] uppercase tracking-wider ${theme.muted}`}>
            {item.source} · {item.author}
          </div>
          <h1 className="font-editorial text-[24px] leading-snug font-semibold mt-1.5">
            {item.title}
          </h1>
          {activeChapterTitle && (
            <div className={`text-[14px] font-medium mt-2 ${theme.muted}`}>{activeChapterTitle}</div>
          )}
          <p className={`text-[12px] mt-3 ${theme.muted}`}>
            轻点任意英文单词即可查词、听发音并连同原句存入 FSRS 词库
          </p>
        </div>

        <div
          className="font-editorial space-y-5"
          style={{
            fontSize: `${readerSettings.fontSize}px`,
            lineHeight: readerSettings.lineHeight,
          }}
        >
          {activeParagraphs.map((para, pIdx) => {
            const tokens = para.split(/([A-Za-z][A-Za-z'-]*)/g);
            return (
              <p key={pIdx} className="tracking-[0.005em]">
                {tokens.map((tok, tIdx) => {
                  if (!/^[A-Za-z]/.test(tok)) {
                    return <React.Fragment key={tIdx}>{tok}</React.Fragment>;
                  }
                  const lower = tok.toLowerCase();
                  const isSaved = readerSettings.highlightSavedWords && savedWordSet.has(lower);
                  const isSelected = selectedWord?.toLowerCase() === lower;
                  return (
                    <span
                      key={tIdx}
                      onClick={() => handleTapWord(tok, para)}
                      className={`cursor-pointer rounded-xs transition-colors ${
                        isSelected
                          ? 'bg-amber-300/70 text-[#1C1B18]'
                          : isSaved
                            ? 'border-b-[1.5px] border-amber-500/70'
                            : 'active:bg-amber-200/50'
                      }`}
                    >
                      {tok}
                    </span>
                  );
                })}
              </p>
            );
          })}
        </div>

        {/* Chapter navigation for Books / PDFs */}
        {item.chapters && item.chapters.length > 1 && (
          <div className={`mt-10 pt-5 border-t ${theme.border} flex items-center justify-between`}>
            <button
              onClick={() => switchChapter(chapterIdx - 1)}
              disabled={chapterIdx === 0}
              className={`px-3.5 py-2 rounded-xl border ${theme.border} text-[13px] flex items-center gap-1 disabled:opacity-35`}
            >
              <ChevronLeft className="w-4 h-4" /> 上一章
            </button>
            <span className={`text-[12px] ${theme.muted}`}>
              {chapterIdx + 1} / {item.chapters.length}
            </span>
            <button
              onClick={() => switchChapter(chapterIdx + 1)}
              disabled={chapterIdx === item.chapters.length - 1}
              className={`px-3.5 py-2 rounded-xl border ${theme.border} text-[13px] flex items-center gap-1 disabled:opacity-35`}
            >
              下一章 <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Finish Reading / Record Growth */}
        <div className={`mt-8 pt-6 border-t ${theme.border} flex flex-col items-center gap-3`}>
          <button
            onClick={handleCompleteSection}
            disabled={markedDone}
            className={`px-6 py-2.5 rounded-full text-[13px] font-medium flex items-center gap-2 transition-colors ${
              markedDone
                ? 'bg-emerald-600 text-white'
                : 'bg-[#1C1B18] text-[#FAF9F6] dark:bg-[#E7E4DC] dark:text-[#1C1B18]'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            {markedDone ? '已记录本次精读字数' : '完成本篇精读（计入成长）'}
          </button>
        </div>
      </div>

      {/* Tap-Word Bottom Sheet */}
      {selectedWord && (
        <div
          className={`fixed inset-x-0 bottom-0 z-50 ${theme.sheetBg} border-t ${theme.border} rounded-t-3xl shadow-2xl px-5 pt-4 pb-6 max-h-[65vh] overflow-y-auto`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="font-editorial text-[22px] font-semibold">
                  {entry?.word || selectedWord}
                </h3>
                {entry?.phonetic && (
                  <span className={`text-[13px] ${theme.muted}`}>{entry.phonetic}</span>
                )}
                {entry?.partOfSpeech && (
                  <span className={`text-[11px] px-2 py-0.5 rounded-md border ${theme.border} ${theme.muted}`}>
                    {entry.partOfSpeech}
                  </span>
                )}
                <button
                  onClick={() => handlePronounce(entry?.word || selectedWord, entry?.audioUrl)}
                  className={`w-8 h-8 rounded-full border ${theme.border} flex items-center justify-center`}
                  aria-label="朗读单词"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
              </div>
              {entry?.zhHint && (
                <div className="text-[14px] font-medium text-amber-700 dark:text-amber-400 mt-1">
                  {entry.zhHint}
                </div>
              )}
            </div>

            <button
              onClick={() => setSelectedWord(null)}
              className={`w-8 h-8 rounded-full border ${theme.border} flex items-center justify-center shrink-0`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-3">
            {lookupLoading ? (
              <div className={`py-4 flex items-center gap-2 text-[13px] ${theme.muted}`}>
                <Loader2 className="w-4 h-4 animate-spin" /> 正在查询开源词典…
              </div>
            ) : (
              <ul className="space-y-2 text-[14px] leading-relaxed">
                {entry?.definitions.slice(0, 3).map((d, i) => (
                  <li key={i} className="flex gap-2">
                    <span className={`${theme.muted} select-none`}>{i + 1}.</span>
                    <div>
                      <div>{d.definition}</div>
                      {d.example && (
                        <div className={`text-[12px] italic mt-0.5 ${theme.muted}`}>“{d.example}”</div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Context sentence preview */}
          <div className={`mt-3.5 p-3 rounded-xl border ${theme.border} text-[12px] leading-relaxed ${theme.muted}`}>
            原句：{selectedSentence}
          </div>

          {/* Action Row */}
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <button
              onClick={handleSaveWord}
              disabled={justSaved}
              className={`h-10 px-4 rounded-xl text-[13px] font-medium flex items-center gap-1.5 transition-colors ${
                justSaved
                  ? 'bg-emerald-600/15 text-emerald-700 border border-emerald-600/30'
                  : 'bg-[#1C1B18] text-[#FAF9F6]'
              }`}
            >
              {justSaved ? (
                <>
                  <BookmarkCheck className="w-4 h-4" /> 已在 FSRS 词库
                </>
              ) : (
                <>
                  <BookmarkPlus className="w-4 h-4" /> 收藏生词（含原句）
                </>
              )}
            </button>

            <button
              onClick={() => handlePronounce(selectedSentence)}
              className={`h-10 px-3.5 rounded-xl border ${theme.border} text-[13px] flex items-center gap-1.5`}
            >
              <Volume2 className="w-4 h-4" /> 读原句
            </button>

            {aiReady && (
              <>
                <button
                  onClick={() => handleAiAction('word')}
                  disabled={aiLoading}
                  className={`h-10 px-3 rounded-xl border ${theme.border} text-[12px] font-medium flex items-center gap-1`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-600" /> AI 语境精析
                </button>
                <button
                  onClick={() => handleAiAction('sentence')}
                  disabled={aiLoading}
                  className={`h-10 px-3 rounded-xl border ${theme.border} text-[12px] font-medium flex items-center gap-1`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-600" /> 拆解长难句
                </button>
              </>
            )}
          </div>

          {/* Optional AI Output */}
          {(aiLoading || aiResult || aiError) && (
            <div className={`mt-3.5 p-3.5 rounded-xl border ${theme.border} text-[13px] leading-relaxed whitespace-pre-wrap`}>
              {aiLoading && (
                <span className={`flex items-center gap-2 ${theme.muted}`}>
                  <Loader2 className="w-4 h-4 animate-spin" /> AI 助教思考中…
                </span>
              )}
              {aiError && <span className="text-rose-500">{aiError}</span>}
              {aiResult}
            </div>
          )}
        </div>
      )}

      {/* Optional AI Article Deep Insight Modal */}
      {showArticleInsight && (
        <div className="fixed inset-0 z-50 bg-black/45 flex items-end justify-center">
          <div className={`w-full max-w-lg ${theme.sheetBg} rounded-t-3xl p-5 pb-8 max-h-[75vh] overflow-y-auto`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 font-semibold text-[16px]">
                <Sparkles className="w-4 h-4 text-amber-600" /> AI 深度导读
              </div>
              <button
                onClick={() => setShowArticleInsight(false)}
                className={`w-8 h-8 rounded-full border ${theme.border} flex items-center justify-center`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="text-[14px] leading-relaxed whitespace-pre-wrap">
              {aiLoading ? (
                <div className={`py-8 flex items-center justify-center gap-2 ${theme.muted}`}>
                  <Loader2 className="w-4 h-4 animate-spin" /> 正在提炼核心论点与思维模型…
                </div>
              ) : aiError ? (
                <p className="text-rose-500">{aiError}</p>
              ) : (
                articleInsight
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
