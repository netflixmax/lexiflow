import React, { useMemo, useRef, useState } from 'react';
import {
  BookmarkCheck,
  BookmarkPlus,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Compass,
  Eye,
  FileUp,
  Headphones,
  Sparkles,
  Volume2,
} from 'lucide-react';
import { INTEREST_ISLANDS } from '../data/dailySeed';
import { parseIncrementalDailyContent } from '../services/dailyImporter';
import { speakText } from '../services/nativeBridge';
import type {
  ContentItem,
  DailyMirrorCard,
  DailyScenarioCard,
  ReaderSettings,
  VocabCard,
} from '../types';

interface TodayViewProps {
  mirrors: DailyMirrorCard[];
  scenarios: DailyScenarioCard[];
  library: ContentItem[];
  savedWordSet: Set<string>;
  readerSettings: ReaderSettings;
  onUpdateMirror: (updated: DailyMirrorCard) => void;
  onUpdateScenario: (updated: DailyScenarioCard) => void;
  onImportDaily: (res: {
    articles: ContentItem[];
    mirrors: DailyMirrorCard[];
    scenarios: DailyScenarioCard[];
  }) => void;
  onMineWord: (card: Omit<VocabCard, 'id' | 'createdAt' | 'fsrs'>) => void;
  onOpenArticle: (item: ContentItem) => void;
  onSendToListen: (item: ContentItem) => void;
}

export const TodayView: React.FC<TodayViewProps> = ({
  mirrors,
  scenarios,
  library,
  savedWordSet,
  readerSettings,
  onUpdateMirror,
  onUpdateScenario,
  onImportDaily,
  onMineWord,
  onOpenArticle,
  onSendToListen,
}) => {
  const latestMirror = mirrors[0] ?? null;
  const [mirrorExpanded, setMirrorExpanded] = useState(false);
  const [sceneIdx, setSceneIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [draftAttempt, setDraftAttempt] = useState('');
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeScene = scenarios[sceneIdx] ?? scenarios[0] ?? null;

  const personalArticles = useMemo(
    () => library.filter((i) => i.source === '个人专属日包' || i.tags?.includes('今日专属')),
    [library],
  );
  const latestPersonalArticle = personalArticles[0] ?? library[0] ?? null;

  const domainMap = useMemo(() => {
    const map = new Map<string, { total: number; done: number }>();
    for (const sc of scenarios) {
      const prev = map.get(sc.domain) ?? { total: 0, done: 0 };
      prev.total += 1;
      if (sc.status === 'mastered') prev.done += 1;
      map.set(sc.domain, prev);
    }
    return Array.from(map.entries());
  }, [scenarios]);

  const masteredCount = useMemo(
    () => scenarios.filter((s) => s.status === 'mastered').length,
    [scenarios],
  );

  const switchScene = (nextIdx: number) => {
    if (scenarios.length === 0) return;
    const clamped = (nextIdx + scenarios.length) % scenarios.length;
    setSceneIdx(clamped);
    setRevealed(false);
    setDraftAttempt(scenarios[clamped]?.userAttempt ?? '');
  };

  const handleSavePhraseToFsrs = (scene: DailyScenarioCard) => {
    const word = scene.keyPhrase || scene.enSenseGroups[0] || scene.enNatural.slice(0, 32);
    onMineWord({
      word,
      definition: scene.enNatural,
      zhHint: scene.zhOriginal,
      contextSentence: scene.enNatural,
      sourceTitle: `今日现场 · ${scene.sceneTag}`,
      deck: '我的真实表达',
    });
  };

  const handleRateScene = (status: DailyScenarioCard['status']) => {
    if (!activeScene) return;
    onUpdateScenario({
      ...activeScene,
      userAttempt: draftAttempt.trim() || activeScene.userAttempt,
      status,
    });
    if (sceneIdx < scenarios.length - 1) {
      setTimeout(() => switchScene(sceneIdx + 1), 220);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseIncrementalDailyContent(text, file.name);
      onImportDaily({
        articles: parsed.articles,
        mirrors: parsed.mirrors,
        scenarios: parsed.scenarios,
      });
      setImportNotice(parsed.summary);
      setTimeout(() => setImportNotice(null), 4000);
    } catch {
      setImportNotice('导入失败，请确认文件为 Markdown 或 JSON 格式。');
    } finally {
      e.target.value = '';
    }
  };

  const isPhraseSaved = activeScene
    ? savedWordSet.has((activeScene.keyPhrase || activeScene.enSenseGroups[0] || '').toLowerCase())
    : false;

  return (
    <div className="flex flex-col h-full bg-[#FAF9F6]">
      {/* Top Header */}
      <header className="pt-safe px-5 pb-3 bg-[#FAF9F6] border-b border-[#ECEAE4]">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight text-[#1C1B18]">今日进化</h1>
            <p className="text-[12px] text-[#78756E] mt-0.5">
              认识自己 · 用真话练英文 · 线上打通线下
            </p>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="h-9 px-3 rounded-xl bg-white border border-[#E5E2DA] text-[12px] font-medium text-[#1C1B18] flex items-center gap-1.5 shadow-2xs active:scale-95 transition-transform"
          >
            <FileUp className="w-3.5 h-3.5 text-amber-600" />
            导入日包
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,.txt,.json,text/markdown,text/plain,application/json"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
        {importNotice && (
          <div className="mt-2.5 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-[12px] text-emerald-800">
            {importNotice}
          </div>
        )}
      </header>

      {/* Main Scrollable Flow */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 pb-24">
        {/* 1. Self-Mirror Card */}
        {latestMirror && (
          <section className="rounded-2xl bg-white border border-[#ECEAE4] p-4 shadow-2xs">
            <button
              onClick={() => setMirrorExpanded((v) => !v)}
              className="w-full flex items-center justify-between text-left"
            >
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center">
                  <Sparkles className="w-4 h-4" />
                </span>
                <div>
                  <div className="text-[14px] font-semibold text-[#1C1B18]">
                    今日镜子 · {latestMirror.date}
                  </div>
                  <div className="text-[11px] text-[#78756E]">来自你的语音输入切片</div>
                </div>
              </div>
              {mirrorExpanded ? (
                <ChevronUp className="w-4 h-4 text-[#78756E]" />
              ) : (
                <ChevronDown className="w-4 h-4 text-[#78756E]" />
              )}
            </button>

            <p className="mt-3 text-[13px] leading-relaxed text-[#3D3A34]">
              {latestMirror.summary}
            </p>

            {mirrorExpanded && (
              <div className="mt-3 pt-3 border-t border-[#F0EDE6] space-y-2.5">
                <ul className="space-y-1.5">
                  {latestMirror.highlights.map((h, i) => (
                    <li key={i} className="text-[12.5px] text-[#57544D] flex gap-2">
                      <span className="text-amber-600">•</span>
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>

                <div className="p-3 rounded-xl bg-[#FAF6EE] border border-amber-200/60">
                  <div className="text-[11px] font-medium text-amber-800 mb-1">镜子提问</div>
                  <p className="text-[13px] text-[#2C2318] leading-relaxed">
                    {latestMirror.mirrorQuestion}
                  </p>
                </div>

                <div>
                  <label className="text-[11px] text-[#78756E] block mb-1">
                    用语音键盘留一句此刻的真实想法（仅存本机）
                  </label>
                  <textarea
                    rows={2}
                    value={latestMirror.userReflection ?? ''}
                    onChange={(e) =>
                      onUpdateMirror({ ...latestMirror, userReflection: e.target.value })
                    }
                    placeholder="对着键盘随口说一句…"
                    className="w-full p-2.5 rounded-xl bg-[#FAF9F6] border border-[#E5E2DA] text-[13px] text-[#1C1B18] focus:outline-none focus:border-[#1C1B18]"
                  />
                </div>
              </div>
            )}
          </section>
        )}

        {/* 2. Today's Real-Speech English Challenge */}
        {activeScene && (
          <section className="rounded-2xl bg-white border border-[#ECEAE4] p-4 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-[#1C1B18] text-[#FAF9F6] text-[11px] font-medium">
                  今日现场 {sceneIdx + 1}/{scenarios.length}
                </span>
                <span className="text-[12px] text-[#78756E]">{activeScene.sceneTag}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => switchScene(sceneIdx - 1)}
                  className="w-7 h-7 rounded-lg border border-[#ECEAE4] flex items-center justify-center text-[#57544D]"
                  aria-label="上一关"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => switchScene(sceneIdx + 1)}
                  className="w-7 h-7 rounded-lg border border-[#ECEAE4] flex items-center justify-center text-[#57544D]"
                  aria-label="下一关"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Real Chinese Prompt */}
            <div className="p-3.5 rounded-xl bg-[#FAF9F6] border border-[#EFECE6]">
              <div className="text-[11px] text-[#8E8A80] mb-1">你真实想表达的中文</div>
              <p className="text-[15px] font-medium text-[#1C1B18] leading-relaxed">
                「{activeScene.zhOriginal}」
              </p>
            </div>

            {/* User Voice/Text Tryout Box */}
            <div>
              <textarea
                rows={2}
                value={draftAttempt || activeScene.userAttempt || ''}
                onChange={(e) => setDraftAttempt(e.target.value)}
                placeholder="先用你的语音键盘试着说/写一遍英文（不打分，只跟自己练）…"
                className="w-full p-3 rounded-xl bg-white border border-[#E5E2DA] text-[13.5px] text-[#1C1B18] focus:outline-none focus:border-[#1C1B18]"
              />
            </div>

            {!revealed ? (
              <button
                onClick={() => setRevealed(true)}
                className="w-full h-10 rounded-xl bg-[#1C1B18] text-[#FAF9F6] text-[13px] font-medium flex items-center justify-center gap-1.5 active:scale-[0.99] transition-transform"
              >
                <Eye className="w-4 h-4" />
                揭晓母语者意群表达
              </button>
            ) : (
              <div className="space-y-3 pt-1">
                {/* Native Sense-Group Reveal */}
                <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-emerald-800">
                      母语者意群版（四级 550 分 i+1）
                    </span>
                    <button
                      onClick={() =>
                        speakText(activeScene.enNatural, {
                          rate: readerSettings.ttsRate,
                          locale: readerSettings.ttsAccent,
                        })
                      }
                      className="px-2.5 py-1 rounded-lg bg-white border border-emerald-200 text-emerald-800 text-[11.5px] font-medium flex items-center gap-1"
                    >
                      <Volume2 className="w-3.5 h-3.5" /> 真人朗读
                    </button>
                  </div>

                  <p className="font-editorial text-[16px] leading-relaxed text-[#1C1B18]">
                    {activeScene.enSenseGroups.map((g, idx) => (
                      <React.Fragment key={idx}>
                        <span>{g}</span>
                        {idx < activeScene.enSenseGroups.length - 1 && (
                          <span className="mx-1.5 font-sans text-[12px] text-amber-600/70 select-none">
                            /
                          </span>
                        )}
                      </React.Fragment>
                    ))}
                  </p>

                  {activeScene.tip && (
                    <p className="text-[12px] text-[#57544D] leading-relaxed pt-1 border-t border-emerald-200/60">
                      💡 {activeScene.tip}
                    </p>
                  )}
                </div>

                {/* Actions: Save to FSRS + Self Rating */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <button
                    onClick={() => handleSavePhraseToFsrs(activeScene)}
                    disabled={isPhraseSaved}
                    className={`h-8 px-3 rounded-lg text-[12px] font-medium flex items-center gap-1 ${
                      isPhraseSaved
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-[#F1EFEA] text-[#1C1B18]'
                    }`}
                  >
                    {isPhraseSaved ? (
                      <>
                        <BookmarkCheck className="w-3.5 h-3.5" /> 已进 FSRS 词库
                      </>
                    ) : (
                      <>
                        <BookmarkPlus className="w-3.5 h-3.5" /> 收藏句块到 FSRS
                      </>
                    )}
                  </button>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleRateScene('learning')}
                      className="h-8 px-2.5 rounded-lg border border-[#E5E2DA] bg-white text-[12px] text-[#57544D]"
                    >
                      再磨磨
                    </button>
                    <button
                      onClick={() => handleRateScene('mastered')}
                      className="h-8 px-3 rounded-lg bg-[#1C1B18] text-white text-[12px] font-medium flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> 说顺了
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* 3. Today's Personal 1-Minute i+1 Micro-Podcast */}
        {latestPersonalArticle && (
          <section className="rounded-2xl bg-[#1C1B18] text-[#FAF9F6] p-4 shadow-sm space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-amber-400 font-medium">
                  个人专属 1 分钟 i+1 微播客
                </div>
                <h3 className="font-editorial text-[16px] font-semibold mt-1 leading-snug">
                  {latestPersonalArticle.title}
                </h3>
                {latestPersonalArticle.subtitle && (
                  <p className="text-[12px] text-[#B8B4AA] mt-0.5">
                    {latestPersonalArticle.subtitle}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onSendToListen(latestPersonalArticle)}
                className="flex-1 h-9 rounded-xl bg-amber-500 text-[#1C1B18] text-[12.5px] font-semibold flex items-center justify-center gap-1.5"
              >
                <Headphones className="w-4 h-4" /> 直接精听（Kokoro）
              </button>
              <button
                onClick={() => onOpenArticle(latestPersonalArticle)}
                className="h-9 px-3.5 rounded-xl bg-white/12 text-[#FAF9F6] text-[12.5px] font-medium flex items-center gap-1.5"
              >
                <BookOpen className="w-3.5 h-3.5" /> 意群精读
              </button>
            </div>
          </section>
        )}

        {/* 4. Personal Capability Map (Zero Leaderboard, Self-Only) */}
        <section className="rounded-2xl bg-white border border-[#ECEAE4] p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="text-[14px] font-semibold text-[#1C1B18]">我的表达地图</div>
            <span className="text-[12px] text-[#78756E]">
              已点亮 {masteredCount} / {scenarios.length} 个真实场景
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {domainMap.map(([domain, info]) => {
              const lit = info.done > 0;
              return (
                <div
                  key={domain}
                  className={`px-3 py-1.5 rounded-xl text-[12px] border flex items-center gap-1.5 ${
                    lit
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800 font-medium'
                      : 'bg-[#FAF9F6] border-[#ECEAE4] text-[#6E6B64]'
                  }`}
                >
                  <span>{domain}</span>
                  <span className="text-[11px] opacity-75">
                    {info.done}/{info.total}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* 5. Interest Islands */}
        <section className="space-y-2">
          <div className="flex items-center gap-1.5 px-1">
            <Compass className="w-4 h-4 text-amber-600" />
            <h2 className="text-[14px] font-semibold text-[#1C1B18]">你的兴趣岛（一手真实英语源）</h2>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {INTEREST_ISLANDS.map((island) => (
              <a
                key={island.id}
                href={island.url}
                target="_blank"
                rel="noreferrer"
                className="p-3 rounded-2xl bg-white border border-[#ECEAE4] hover:border-[#1C1B18] transition-colors block"
              >
                <div className="text-[13px] font-semibold text-[#1C1B18] leading-snug">
                  {island.title}
                </div>
                <div className="text-[11.5px] text-[#78756E] mt-1 line-clamp-2">
                  {island.subtitle}
                </div>
                <div className="text-[10.5px] text-amber-700 mt-1.5 font-medium truncate">
                  {island.sourceLabel} ↗
                </div>
              </a>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
