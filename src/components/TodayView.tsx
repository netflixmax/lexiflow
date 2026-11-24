import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookmarkCheck,
  BookmarkPlus,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Compass,
  Copy,
  Eye,
  FileUp,
  HelpCircle,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Sparkles,
  Volume2,
} from 'lucide-react';
import {
  fetchDailyFeedFromUrl,
  parseIncrementalDailyContent,
} from '../services/dailyImporter';
import {
  KOKORO_SPEAKERS,
  speakSequence,
  speakText,
  stopSpeaking,
} from '../services/nativeBridge';
import { segmentIntoSenseGroups, splitParagraphToSentences } from '../services/senseGroup';
import { translateEnToZh } from '../services/translator';
import type {
  ContentItem,
  DailyFeedConfig,
  DailyMirrorCard,
  DailyPick,
  DailyScenarioCard,
  ReaderSettings,
  VocabCard,
} from '../types';

interface TodayViewProps {
  mirrors: DailyMirrorCard[];
  scenarios: DailyScenarioCard[];
  picks: DailyPick[];
  library: ContentItem[];
  savedWordSet: Set<string>;
  readerSettings: ReaderSettings;
  feedConfig: DailyFeedConfig;
  onUpdateSettings: (next: ReaderSettings) => void;
  onUpdateMirror: (updated: DailyMirrorCard) => void;
  onUpdateScenario: (updated: DailyScenarioCard) => void;
  onImportDaily: (res: {
    articles: ContentItem[];
    mirrors: DailyMirrorCard[];
    scenarios: DailyScenarioCard[];
    picks?: DailyPick[];
  }) => void;
  onUpdateFeedSynced: (iso: string) => void;
  onMineWord: (card: Omit<VocabCard, 'id' | 'createdAt' | 'fsrs'>) => void;
  onOpenArticle: (item: ContentItem) => void;
  onOpenReadme: () => void;
  onRecordListening: (minutes: number) => void;
}

export const TodayView: React.FC<TodayViewProps> = ({
  mirrors,
  scenarios,
  picks,
  library,
  savedWordSet,
  readerSettings,
  feedConfig,
  onUpdateSettings,
  onUpdateMirror,
  onUpdateScenario,
  onImportDaily,
  onUpdateFeedSynced,
  onMineWord,
  onOpenArticle,
  onOpenReadme,
  onRecordListening,
}) => {
  const latestMirror = mirrors[0] ?? null;

  // Daily podcast inline playback state
  const personalArticles = useMemo(
    () => library.filter((i) => i.source === '个人专属日包' || i.tags?.includes('今日专属')),
    [library],
  );
  const latestPodcast = personalArticles[0] ?? library[0] ?? null;
  const podcastSentences = useMemo(() => {
    if (!latestPodcast) return [];
    return latestPodcast.paragraphs
      .flatMap((p) => splitParagraphToSentences(p))
      .filter((s) => s.length >= 4);
  }, [latestPodcast]);

  const [sentenceIdx, setSentenceIdx] = useState(0);
  const [isPlayingPodcast, setIsPlayingPodcast] = useState(false);
  const [showPodcastZh, setShowPodcastZh] = useState(false);
  const [sentenceZh, setSentenceZh] = useState<Record<number, string>>({});
  const listenStartRef = useRef<number | null>(null);

  // Mirror echo copy state
  const [copiedEcho, setCopiedEcho] = useState(false);

  // Real-speech scenario state
  const [sceneIdx, setSceneIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [draftAttempt, setDraftAttempt] = useState('');

  // Import / Sync state
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [syncingFeed, setSyncingFeed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeScene = scenarios[sceneIdx] ?? scenarios[0] ?? null;

  const commitListening = () => {
    if (listenStartRef.current) {
      const mins = Math.round((Date.now() - listenStartRef.current) / 60000);
      if (mins >= 1) onRecordListening(mins);
      listenStartRef.current = null;
    }
  };

  useEffect(() => {
    setSentenceIdx(0);
    setSentenceZh({});
    setIsPlayingPodcast(false);
    stopSpeaking();
  }, [latestPodcast?.id]);

  useEffect(() => {
    return () => {
      stopSpeaking();
      commitListening();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!showPodcastZh || podcastSentences.length === 0) return;
    let cancelled = false;
    (async () => {
      for (let i = 0; i < podcastSentences.length; i++) {
        if (cancelled) break;
        if (sentenceZh[i]) continue;
        const zh = await translateEnToZh(podcastSentences[i]);
        if (!cancelled && zh) {
          setSentenceZh((prev) => ({ ...prev, [i]: zh }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPodcastZh, podcastSentences]);

  const startPodcastAt = (idx: number) => {
    if (podcastSentences.length === 0) return;
    const clamped = Math.max(0, Math.min(podcastSentences.length - 1, idx));
    setSentenceIdx(clamped);
    setIsPlayingPodcast(true);
    if (!listenStartRef.current) listenStartRef.current = Date.now();

    speakSequence(podcastSentences, {
      startIndex: clamped,
      rate: readerSettings.ttsRate,
      loopSingle: false,
      onSentenceStart: (i) => setSentenceIdx(i),
      onComplete: () => {
        setIsPlayingPodcast(false);
        commitListening();
      },
    });
  };

  const togglePodcastPlay = () => {
    if (isPlayingPodcast) {
      setIsPlayingPodcast(false);
      stopSpeaking();
      commitListening();
    } else {
      startPodcastAt(sentenceIdx);
    }
  };

  const activeVoiceLabel = useMemo(() => {
    if (readerSettings.voice.engine === 'rime' && readerSettings.voice.rimeApiKey.trim()) {
      return `Rime · ${readerSettings.voice.rimeSpeaker}`;
    }
    const sp = KOKORO_SPEAKERS.find((s) => s.id === readerSettings.voice.kokoroSpeaker);
    return `Kokoro · ${sp?.name ?? 'Heart'}`;
  }, [readerSettings.voice]);

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

  const showToast = (msg: string) => {
    setImportNotice(msg);
    setTimeout(() => setImportNotice(null), 4200);
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
        picks: parsed.picks,
      });
      showToast(parsed.summary);
    } catch {
      showToast('导入失败，请确认文件为每日 JSON 或 Markdown 包。');
    } finally {
      e.target.value = '';
    }
  };

  const handleSyncRemoteFeed = async () => {
    if (!feedConfig.feedUrl.trim()) {
      fileInputRef.current?.click();
      return;
    }
    setSyncingFeed(true);
    try {
      const parsed = await fetchDailyFeedFromUrl(feedConfig.feedUrl);
      onImportDaily({
        articles: parsed.articles,
        mirrors: parsed.mirrors,
        scenarios: parsed.scenarios,
        picks: parsed.picks,
      });
      onUpdateFeedSynced(new Date().toISOString());
      showToast(parsed.summary);
    } catch (e) {
      showToast((e as Error).message || '拉取失败，可点导入本地日包');
    } finally {
      setSyncingFeed(false);
    }
  };

  const handleCopyEcho = () => {
    if (!latestMirror?.userReflection?.trim()) return;
    const text = `[今日镜子回声 ${latestMirror.date}]\n问：${latestMirror.mirrorQuestion}\n答：${latestMirror.userReflection.trim()}`;
    navigator.clipboard?.writeText(text).then(() => {
      setCopiedEcho(true);
      setTimeout(() => setCopiedEcho(false), 2000);
    });
  };

  const isPhraseSaved = activeScene
    ? savedWordSet.has((activeScene.keyPhrase || activeScene.enSenseGroups[0] || '').toLowerCase())
    : false;

  return (
    <div className="flex flex-col h-full bg-[#FAF9F6]">
      {/* Ultra-Clean Top Header */}
      <header className="pt-safe px-5 pb-3 bg-[#FAF9F6] border-b border-[#ECEAE4]">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight text-[#1C1B18]">今日</h1>
            <p className="text-[12px] text-[#78756E] mt-0.5">
              每日镜子 · 专属播客 · 随你的记录进化
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={onOpenReadme}
              className="h-8 px-2.5 rounded-xl bg-white border border-[#E5E2DA] text-[12px] font-medium text-[#57544D] flex items-center gap-1"
            >
              <HelpCircle className="w-3.5 h-3.5 text-amber-600" />
              README
            </button>

            {feedConfig.feedUrl.trim() ? (
              <button
                onClick={handleSyncRemoteFeed}
                disabled={syncingFeed}
                className="h-8 px-2.5 rounded-xl bg-[#1C1B18] text-[#FAF9F6] text-[12px] font-medium flex items-center gap-1 disabled:opacity-50"
              >
                {syncingFeed ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                同步
              </button>
            ) : null}

            <button
              onClick={() => fileInputRef.current?.click()}
              className="h-8 px-2.5 rounded-xl bg-white border border-[#E5E2DA] text-[12px] font-medium text-[#1C1B18] flex items-center gap-1"
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
        </div>
        {importNotice && (
          <div className="mt-2.5 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-[12px] text-emerald-800">
            {importNotice}
          </div>
        )}
      </header>

      {/* Main Scrollable Flow */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 pb-24">
        {/* 1. Self-Mirror Card (Expanded by default — the heart of self-discovery) */}
        {latestMirror && (
          <section className="rounded-2xl bg-white border border-[#ECEAE4] p-4 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center">
                  <Sparkles className="w-4 h-4" />
                </span>
                <div>
                  <div className="text-[15px] font-semibold text-[#1C1B18]">
                    今日镜子 · {latestMirror.date}
                  </div>
                  <div className="text-[11px] text-[#78756E]">根据你的真实语音记录生成</div>
                </div>
              </div>
            </div>

            <p className="text-[13.5px] leading-relaxed text-[#2C2A26]">{latestMirror.summary}</p>

            <ul className="space-y-1.5 pt-1">
              {latestMirror.highlights.map((h, i) => (
                <li key={i} className="text-[12.5px] text-[#57544D] flex gap-2 leading-relaxed">
                  <span className="text-amber-600 shrink-0">•</span>
                  <span>{h}</span>
                </li>
              ))}
            </ul>

            <div className="p-3 rounded-xl bg-[#FAF6EE] border border-amber-200/70">
              <div className="text-[11px] font-semibold text-amber-800 mb-1">镜子提问</div>
              <p className="text-[13px] text-[#2C2318] leading-relaxed">
                {latestMirror.mirrorQuestion}
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] text-[#78756E]">
                  用语音键盘留一句此刻的回声（继续沉淀你的个人数据）
                </label>
                {latestMirror.userReflection?.trim() ? (
                  <button
                    onClick={handleCopyEcho}
                    className="text-[11px] text-amber-700 font-medium flex items-center gap-1"
                  >
                    {copiedEcho ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copiedEcho ? '已复制' : '复制回声'}
                  </button>
                ) : null}
              </div>
              <textarea
                rows={2}
                value={latestMirror.userReflection ?? ''}
                onChange={(e) =>
                  onUpdateMirror({ ...latestMirror, userReflection: e.target.value })
                }
                placeholder="对着语音键盘随口说两句真实想法…"
                className="w-full p-2.5 rounded-xl bg-[#FAF9F6] border border-[#E5E2DA] text-[13px] text-[#1C1B18] focus:outline-none focus:border-[#1C1B18]"
              />
            </div>
          </section>
        )}

        {/* 2. Inline Daily Personalized Podcast Player */}
        {latestPodcast && (
          <section className="rounded-2xl bg-white border border-[#ECEAE4] overflow-hidden shadow-2xs">
            {/* Dark Editorial Player Header */}
            <div className="bg-[#1C1B18] text-[#FAF9F6] p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-wider text-amber-400 font-medium">
                    今日专属播客 · {activeVoiceLabel}
                  </div>
                  <h2 className="font-editorial text-[16px] font-semibold mt-1 leading-snug">
                    {latestPodcast.title}
                  </h2>
                  {latestPodcast.subtitle && (
                    <p className="text-[11.5px] text-[#B8B4AA] mt-0.5">{latestPodcast.subtitle}</p>
                  )}
                </div>
                <button
                  onClick={togglePodcastPlay}
                  className="w-11 h-11 rounded-full bg-amber-500 text-[#1C1B18] shrink-0 flex items-center justify-center shadow-md active:scale-95 transition-transform"
                  aria-label={isPlayingPodcast ? '暂停播客' : '播放播客'}
                >
                  {isPlayingPodcast ? (
                    <Pause className="w-5 h-5" />
                  ) : (
                    <Play className="w-5 h-5 ml-0.5" />
                  )}
                </button>
              </div>

              {/* Compact Controls Row */}
              <div className="flex items-center justify-between gap-2 flex-wrap pt-1 border-t border-white/10">
                <div className="flex items-center gap-1">
                  {[0.8, 0.92, 1.05].map((r) => (
                    <button
                      key={r}
                      onClick={() => onUpdateSettings({ ...readerSettings, ttsRate: r })}
                      className={`px-2 py-0.5 rounded-md text-[11px] font-medium ${
                        Math.abs(readerSettings.ttsRate - r) < 0.04
                          ? 'bg-white text-[#1C1B18]'
                          : 'bg-white/10 text-[#C8C4BA]'
                      }`}
                    >
                      {r}x
                    </button>
                  ))}
                  <button
                    onClick={() => setShowPodcastZh((v) => !v)}
                    className={`ml-1 px-2 py-0.5 rounded-md text-[11px] font-medium ${
                      showPodcastZh
                        ? 'bg-amber-400/25 text-amber-300 border border-amber-400/40'
                        : 'bg-white/10 text-[#C8C4BA]'
                    }`}
                  >
                    双语
                  </button>
                </div>

                <button
                  onClick={() => onOpenArticle(latestPodcast)}
                  className="px-2.5 py-1 rounded-lg bg-white/12 text-[#FAF9F6] text-[11.5px] flex items-center gap-1"
                >
                  <BookOpen className="w-3 h-3" /> 点词精读
                </button>
              </div>
            </div>

            {/* Inline Synchronized Sense-Group Transcript */}
            <div className="p-3.5 space-y-2 max-h-[340px] overflow-y-auto bg-[#FAF9F6]/60">
              {podcastSentences.map((sent, idx) => {
                const active = idx === sentenceIdx;
                const groups = segmentIntoSenseGroups(sent);
                return (
                  <div
                    key={idx}
                    onClick={() => startPodcastAt(idx)}
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                      active
                        ? 'bg-white border-[#1C1B18] shadow-2xs'
                        : 'bg-white/60 border-[#ECEAE4]'
                    }`}
                  >
                    <p className="font-editorial text-[15px] leading-relaxed text-[#1C1B18]">
                      {groups.map((g, gIdx) => (
                        <React.Fragment key={gIdx}>
                          <span>{g.text}</span>
                          {gIdx < groups.length - 1 && (
                            <span className="mx-1.5 font-sans text-[11.5px] text-amber-600/60 select-none">
                              /
                            </span>
                          )}
                        </React.Fragment>
                      ))}
                    </p>
                    {showPodcastZh && sentenceZh[idx] && (
                      <p className="text-[12.5px] text-[#78756E] mt-1 leading-relaxed">
                        {sentenceZh[idx]}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* 3. Today's Real-Speech Challenge (Compact) */}
        {activeScene && (
          <section className="rounded-2xl bg-white border border-[#ECEAE4] p-4 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-[#1C1B18] text-[#FAF9F6] text-[11px] font-medium">
                  今日真话 {sceneIdx + 1}/{scenarios.length}
                </span>
                <span className="text-[12px] text-[#78756E]">{activeScene.sceneTag}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => switchScene(sceneIdx - 1)}
                  className="w-7 h-7 rounded-lg border border-[#ECEAE4] flex items-center justify-center text-[#57544D]"
                  aria-label="上一句"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => switchScene(sceneIdx + 1)}
                  className="w-7 h-7 rounded-lg border border-[#ECEAE4] flex items-center justify-center text-[#57544D]"
                  aria-label="下一句"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#FAF9F6] border border-[#EFECE6]">
              <p className="text-[14.5px] font-medium text-[#1C1B18] leading-relaxed">
                「{activeScene.zhOriginal}」
              </p>
            </div>

            <textarea
              rows={2}
              value={draftAttempt || activeScene.userAttempt || ''}
              onChange={(e) => setDraftAttempt(e.target.value)}
              placeholder="用语音键盘试着说一遍英文，再揭晓母语者表达…"
              className="w-full p-2.5 rounded-xl bg-white border border-[#E5E2DA] text-[13px] text-[#1C1B18] focus:outline-none focus:border-[#1C1B18]"
            />

            {!revealed ? (
              <button
                onClick={() => setRevealed(true)}
                className="w-full h-9 rounded-xl bg-[#1C1B18] text-[#FAF9F6] text-[12.5px] font-medium flex items-center justify-center gap-1.5"
              >
                <Eye className="w-3.5 h-3.5" />
                揭晓母语者意群版
              </button>
            ) : (
              <div className="space-y-2.5">
                <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-emerald-800">
                      母语者意群版（i+1）
                    </span>
                    <button
                      onClick={() =>
                        speakText(activeScene.enNatural, {
                          rate: readerSettings.ttsRate,
                          locale: readerSettings.ttsAccent,
                        })
                      }
                      className="px-2 py-0.5 rounded-md bg-white border border-emerald-200 text-emerald-800 text-[11px] font-medium flex items-center gap-1"
                    >
                      <Volume2 className="w-3 h-3" /> 朗读
                    </button>
                  </div>
                  <p className="font-editorial text-[15.5px] leading-relaxed text-[#1C1B18]">
                    {activeScene.enSenseGroups.map((g, idx) => (
                      <React.Fragment key={idx}>
                        <span>{g}</span>
                        {idx < activeScene.enSenseGroups.length - 1 && (
                          <span className="mx-1.5 font-sans text-[11.5px] text-amber-600/70 select-none">
                            /
                          </span>
                        )}
                      </React.Fragment>
                    ))}
                  </p>
                  {activeScene.tip && (
                    <p className="text-[12px] text-[#57544D] pt-1 border-t border-emerald-200/60">
                      {activeScene.tip}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={() => handleSavePhraseToFsrs(activeScene)}
                    disabled={isPhraseSaved}
                    className={`h-8 px-2.5 rounded-lg text-[11.5px] font-medium flex items-center gap-1 ${
                      isPhraseSaved
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-[#F1EFEA] text-[#1C1B18]'
                    }`}
                  >
                    {isPhraseSaved ? (
                      <>
                        <BookmarkCheck className="w-3.5 h-3.5" /> 已入复习
                      </>
                    ) : (
                      <>
                        <BookmarkPlus className="w-3.5 h-3.5" /> 收入复习
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => handleRateScene('mastered')}
                    className="h-8 px-3 rounded-lg bg-[#1C1B18] text-white text-[12px] font-medium flex items-center gap-1"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> 说顺了 · 下一句
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {/* 4. Today's Personalized Picks (Driven by your logs, 1-3 items only) */}
        {picks.length > 0 && (
          <section className="space-y-2">
            <div className="flex items-center gap-1.5 px-1">
              <Compass className="w-4 h-4 text-amber-600" />
              <h2 className="text-[14px] font-semibold text-[#1C1B18]">今日为你推</h2>
            </div>
            <div className="space-y-2">
              {picks.map((pick) => {
                const Inner = (
                  <div className="p-3.5 rounded-2xl bg-white border border-[#ECEAE4] hover:border-[#1C1B18] transition-colors space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium text-amber-700">{pick.tag}</span>
                      {pick.url && <span className="text-[11px] text-[#9A968C]">打开 ↗</span>}
                    </div>
                    <div className="text-[14px] font-semibold text-[#1C1B18] leading-snug">
                      {pick.title}
                    </div>
                    <p className="text-[12px] text-[#6E6B64] leading-relaxed">{pick.reason}</p>
                  </div>
                );
                return pick.url ? (
                  <a key={pick.id} href={pick.url} target="_blank" rel="noreferrer" className="block">
                    {Inner}
                  </a>
                ) : (
                  <div key={pick.id}>{Inner}</div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};
