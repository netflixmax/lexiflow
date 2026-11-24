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
  Headphones,
  HelpCircle,
  Loader2,
  MessageSquareText,
  Pause,
  Play,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Volume2,
  X,
} from 'lucide-react';
import {
  fetchDailyFeedFromUrl,
  parseIncrementalDailyContent,
} from '../services/dailyImporter';
import {
  configureSpeechEngine,
  fetchRimeVoices,
  getSpeechStatus,
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
  LiveReadmeData,
  ReaderSettings,
  VocabCard,
} from '../types';

type TodaySubTab = 'mirror' | 'podcast' | 'speech';

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
    readme?: LiveReadmeData;
  }) => void;
  onUpdateFeedConfig: (cfg: DailyFeedConfig) => void;
  onUpdateFeedSynced: (iso: string) => void;
  onMineWord: (card: Omit<VocabCard, 'id' | 'createdAt' | 'fsrs'>) => void;
  onOpenArticle: (item: ContentItem) => void;
  onOpenReadme: () => void;
  onRecordListeningSeconds: (seconds: number) => void;
  onRecordScenarioDone: () => void;
  onRecordMirrorEcho: () => void;
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
  onUpdateFeedConfig,
  onUpdateFeedSynced,
  onMineWord,
  onOpenArticle,
  onOpenReadme,
  onRecordListeningSeconds,
  onRecordScenarioDone,
  onRecordMirrorEcho,
}) => {
  const [subTab, setSubTab] = useState<TodaySubTab>('mirror');
  const latestMirror = mirrors[0] ?? null;
  const mirrorEchoLoggedRef = useRef<Set<string>>(new Set());

  // Daily podcast state
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

  // Inline voice picker sheet state
  const [showVoiceSheet, setShowVoiceSheet] = useState(false);
  const [speechStatus, setSpeechStatus] = useState<{
    kokoroBundled: boolean;
    kokoroReady?: boolean;
    kokoroError?: string;
    cacheBytes: number;
  }>({ kokoroBundled: true, kokoroReady: true, cacheBytes: 0 });
  const [rimeVoices, setRimeVoices] = useState<string[]>([
    'astra',
    'celeste',
    'mesa',
    'marsh',
    'cove',
    'orion',
  ]);
  const [loadingRimeVoices, setLoadingRimeVoices] = useState(false);

  // Mirror echo copy state
  const [copiedEcho, setCopiedEcho] = useState(false);

  // Real-speech scenario state
  const [sceneIdx, setSceneIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [draftAttempt, setDraftAttempt] = useState('');

  // Import / Sync state
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [syncingFeed, setSyncingFeed] = useState(false);
  const [showHubSheet, setShowHubSheet] = useState(false);
  const [hubPasscodeInput, setHubPasscodeInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeScene = scenarios[sceneIdx] ?? scenarios[0] ?? null;

  const commitListening = () => {
    if (listenStartRef.current) {
      const secs = Math.round((Date.now() - listenStartRef.current) / 1000);
      if (secs >= 3) onRecordListeningSeconds(secs);
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

  const handleOpenVoiceSheet = () => {
    setShowVoiceSheet(true);
    getSpeechStatus().then(setSpeechStatus);
  };

  const handlePickKokoroVoice = async (speakerId: number) => {
    const nextVoice = {
      ...readerSettings.voice,
      engine: 'kokoro' as const,
      kokoroSpeaker: speakerId,
    };
    onUpdateSettings({ ...readerSettings, voice: nextVoice });
    await configureSpeechEngine(nextVoice);
    setIsPlayingPodcast(false);
    await stopSpeaking();
    const sample =
      podcastSentences[0] || 'With AI tools, the walls between subjects are slowly fading.';
    speakText(sample, { rate: readerSettings.ttsRate });
  };

  const handlePickRimeVoice = async (speaker: string) => {
    const nextVoice = {
      ...readerSettings.voice,
      engine: 'rime' as const,
      rimeSpeaker: speaker,
    };
    onUpdateSettings({ ...readerSettings, voice: nextVoice });
    await configureSpeechEngine(nextVoice);
    if (nextVoice.rimeApiKey.trim()) {
      setIsPlayingPodcast(false);
      await stopSpeaking();
      const sample =
        podcastSentences[0] || 'With AI tools, the walls between subjects are slowly fading.';
      speakText(sample, { rate: readerSettings.ttsRate });
    }
  };

  const activeVoiceLabel = useMemo(() => {
    if (readerSettings.voice.engine === 'rime' && readerSettings.voice.rimeApiKey.trim()) {
      return `Rime · ${readerSettings.voice.rimeSpeaker}`;
    }
    if (readerSettings.voice.engine === 'system') {
      return '系统语音';
    }
    const sp = KOKORO_SPEAKERS.find((s) => s.id === readerSettings.voice.kokoroSpeaker);
    return sp?.name ?? 'Bella';
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
      sourceTitle: `今日真话 · ${scene.sceneTag}`,
      deck: '我的真实表达',
    });
  };

  const handleRateScene = (status: DailyScenarioCard['status']) => {
    if (!activeScene) return;
    const wasMastered = activeScene.status === 'mastered';
    onUpdateScenario({
      ...activeScene,
      userAttempt: draftAttempt.trim() || activeScene.userAttempt,
      status,
    });
    if (status === 'mastered' && !wasMastered) {
      onRecordScenarioDone();
    }
    if (sceneIdx < scenarios.length - 1) {
      setTimeout(() => switchScene(sceneIdx + 1), 200);
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
        readme: parsed.readme,
      });
      showToast(parsed.summary);
    } catch {
      showToast('导入失败，请确认文件为每日 JSON 或 Markdown 包。');
    } finally {
      e.target.value = '';
    }
  };

  const trySyncWithFallback = async (primaryUrl: string) => {
    try {
      return { parsed: await fetchDailyFeedFromUrl(primaryUrl), usedUrl: primaryUrl };
    } catch (firstErr) {
      if (primaryUrl.includes('zaixiang-hub.pages.dev')) {
        const alt = primaryUrl.replace('zaixiang-hub.pages.dev', 'rong-personal-hub.lucas2001loveu.workers.dev');
        return { parsed: await fetchDailyFeedFromUrl(alt), usedUrl: alt };
      }
      if (primaryUrl.includes('rong-personal-hub.lucas2001loveu.workers.dev')) {
        const alt = primaryUrl.replace('rong-personal-hub.lucas2001loveu.workers.dev', 'zaixiang-hub.pages.dev');
        return { parsed: await fetchDailyFeedFromUrl(alt), usedUrl: alt };
      }
      throw firstErr;
    }
  };

  const handleSyncRemoteFeed = async () => {
    if (!feedConfig.feedUrl.trim()) {
      setShowHubSheet(true);
      return;
    }
    setSyncingFeed(true);
    try {
      const { parsed, usedUrl } = await trySyncWithFallback(feedConfig.feedUrl.trim());
      onImportDaily({
        articles: parsed.articles,
        mirrors: parsed.mirrors,
        scenarios: parsed.scenarios,
        picks: parsed.picks,
        readme: parsed.readme,
      });
      const nowIso = new Date().toISOString();
      onUpdateFeedSynced(nowIso);
      onUpdateFeedConfig({ feedUrl: usedUrl, lastSyncedAt: nowIso });
      showToast(parsed.summary);
    } catch (e) {
      showToast((e as Error).message || '拉取失败，可点日包手动导入');
    } finally {
      setSyncingFeed(false);
    }
  };

  const handleConnectHubAndSync = async () => {
    const k = hubPasscodeInput.trim();
    if (!k) {
      showToast('请输入工作台口令');
      return;
    }
    const candidateUrl = k.startsWith('http')
      ? k
      : `https://zaixiang-hub.pages.dev/api/daily-feed.json?key=${encodeURIComponent(k)}`;
    setSyncingFeed(true);
    try {
      const { parsed, usedUrl } = await trySyncWithFallback(candidateUrl);
      onImportDaily({
        articles: parsed.articles,
        mirrors: parsed.mirrors,
        scenarios: parsed.scenarios,
        picks: parsed.picks,
        readme: parsed.readme,
      });
      const nowIso = new Date().toISOString();
      onUpdateFeedSynced(nowIso);
      onUpdateFeedConfig({ feedUrl: usedUrl, lastSyncedAt: nowIso });
      setShowHubSheet(false);
      setHubPasscodeInput('');
      showToast('已连上共同工作台并同步最新复盘与播客');
    } catch (e) {
      showToast((e as Error).message || '口令或网络有误，请重试');
    } finally {
      setSyncingFeed(false);
    }
  };

  const handleEchoChange = (val: string) => {
    if (!latestMirror) return;
    onUpdateMirror({ ...latestMirror, userReflection: val });
    if (val.trim().length >= 4 && !mirrorEchoLoggedRef.current.has(latestMirror.id)) {
      mirrorEchoLoggedRef.current.add(latestMirror.id);
      onRecordMirrorEcho();
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
      {/* Airy Top Header + 3 Single-Focus Sub-Tabs */}
      <header className="pt-safe px-5 pb-3 bg-[#FAF9F6] border-b border-[#ECEAE4] space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-[22px] font-semibold tracking-tight text-[#1C1B18]">今日</h1>
          <div className="flex items-center gap-1.5">
            <button
              onClick={onOpenReadme}
              className="h-8 px-2.5 rounded-xl bg-white border border-[#E5E2DA] text-[12px] font-medium text-[#57544D] flex items-center gap-1"
            >
              <HelpCircle className="w-3.5 h-3.5 text-amber-600" />
              README
            </button>

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

            <button
              onClick={() => fileInputRef.current?.click()}
              className="h-8 px-2.5 rounded-xl bg-white border border-[#E5E2DA] text-[12px] font-medium text-[#1C1B18] flex items-center gap-1"
            >
              <FileUp className="w-3.5 h-3.5 text-amber-600" />
              日包
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

        {/* Breathing Single-Focus Switcher */}
        <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#EFECE6] rounded-xl">
          {(
            [
              { k: 'mirror', label: '镜子', icon: <Sparkles className="w-3.5 h-3.5" /> },
              { k: 'podcast', label: '播客', icon: <Headphones className="w-3.5 h-3.5" /> },
              { k: 'speech', label: '真话', icon: <MessageSquareText className="w-3.5 h-3.5" /> },
            ] as const
          ).map((item) => {
            const active = subTab === item.k;
            return (
              <button
                key={item.k}
                onClick={() => setSubTab(item.k)}
                className={`h-8 rounded-lg text-[13px] font-medium flex items-center justify-center gap-1.5 transition-all ${
                  active
                    ? 'bg-white text-[#1C1B18] shadow-2xs'
                    : 'text-[#6E6B64]'
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            );
          })}
        </div>

        {importNotice && (
          <div className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-[12px] text-emerald-800">
            {importNotice}
          </div>
        )}
      </header>

      {/* SUB-VIEW 1: MIRROR (Spacious, calm self-discovery) */}
      {subTab === 'mirror' && (
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5 pb-24">
          {latestMirror && (
            <section className="rounded-3xl bg-white border border-[#ECEAE4] p-5 shadow-2xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-amber-700 font-semibold">
                    Daily Mirror · {latestMirror.date}
                  </div>
                  <h2 className="text-[18px] font-semibold text-[#1C1B18] mt-0.5">
                    今日镜子
                  </h2>
                </div>
                <button
                  onClick={() => setSubTab('podcast')}
                  className="px-3 py-1.5 rounded-full bg-[#FAF6EE] border border-amber-200/80 text-[12px] font-medium text-amber-900 flex items-center gap-1"
                >
                  <Headphones className="w-3.5 h-3.5" /> 听今日播客
                </button>
              </div>

              <p className="text-[14.5px] leading-[1.75] text-[#2C2A26]">{latestMirror.summary}</p>

              <ul className="space-y-2 pt-1">
                {latestMirror.highlights.map((h, i) => (
                  <li key={i} className="text-[13px] text-[#57544D] flex gap-2 leading-relaxed">
                    <span className="text-amber-600 shrink-0">•</span>
                    <span>{h}</span>
                  </li>
                ))}
              </ul>

              <div className="p-4 rounded-2xl bg-[#FAF6EE] border border-amber-200/70 space-y-1">
                <div className="text-[11.5px] font-semibold text-amber-800">镜子提问</div>
                <p className="text-[14px] text-[#2C2318] leading-relaxed">
                  {latestMirror.mirrorQuestion}
                </p>
              </div>

              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <label className="text-[12px] text-[#78756E]">
                    留一句此刻的语音回声（永久保留在本机记录中）
                  </label>
                  {latestMirror.userReflection?.trim() ? (
                    <button
                      onClick={handleCopyEcho}
                      className="text-[11.5px] text-amber-700 font-medium flex items-center gap-1"
                    >
                      {copiedEcho ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedEcho ? '已复制' : '复制回声'}
                    </button>
                  ) : null}
                </div>
                <textarea
                  rows={3}
                  value={latestMirror.userReflection ?? ''}
                  onChange={(e) => handleEchoChange(e.target.value)}
                  placeholder="对着你的语音键盘随口说两句真实想法…"
                  className="w-full p-3 rounded-2xl bg-[#FAF9F6] border border-[#E5E2DA] text-[13.5px] leading-relaxed text-[#1C1B18] focus:outline-none focus:border-[#1C1B18]"
                />
              </div>
            </section>
          )}

          {/* Gentle Personalized Picks */}
          {picks.length > 0 && (
            <section className="space-y-2.5">
              <div className="flex items-center gap-1.5 px-1">
                <Compass className="w-4 h-4 text-amber-600" />
                <h3 className="text-[13.5px] font-semibold text-[#57544D]">今日为你推</h3>
              </div>
              <div className="space-y-2.5">
                {picks.map((pick) => {
                  const card = (
                    <div className="p-4 rounded-2xl bg-white border border-[#ECEAE4] space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-medium text-amber-700">{pick.tag}</span>
                        {pick.url && <span className="text-[11px] text-[#9A968C]">打开 ↗</span>}
                      </div>
                      <div className="text-[14px] font-semibold text-[#1C1B18] leading-snug">
                        {pick.title}
                      </div>
                      <p className="text-[12.5px] text-[#6E6B64] leading-relaxed">{pick.reason}</p>
                    </div>
                  );
                  return pick.url ? (
                    <a key={pick.id} href={pick.url} target="_blank" rel="noreferrer" className="block">
                      {card}
                    </a>
                  ) : (
                    <div key={pick.id}>{card}</div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}

      {/* SUB-VIEW 2: PODCAST (Dedicated, spacious, 1-tap voice switcher!) */}
      {subTab === 'podcast' && latestPodcast && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Compact Top Player Card */}
          <div className="px-5 pt-4 pb-3 bg-[#FAF9F6] border-b border-[#ECEAE4]">
            <div className="rounded-2xl bg-[#1C1B18] text-[#FAF9F6] p-4 space-y-3 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-wider text-amber-400 font-medium">
                    今日专属 1 分钟播客
                  </div>
                  <h2 className="font-editorial text-[16.5px] font-semibold mt-1 leading-snug">
                    {latestPodcast.title}
                  </h2>
                </div>
                <button
                  onClick={togglePodcastPlay}
                  className="w-12 h-12 rounded-full bg-amber-500 text-[#1C1B18] shrink-0 flex items-center justify-center shadow-md active:scale-95 transition-transform"
                  aria-label={isPlayingPodcast ? '暂停播客' : '播放播客'}
                >
                  {isPlayingPodcast ? (
                    <Pause className="w-5 h-5" />
                  ) : (
                    <Play className="w-5 h-5 ml-0.5" />
                  )}
                </button>
              </div>

              {/* Voice Switcher + Speed + Bilingual Row */}
              <div className="flex items-center justify-between gap-2 flex-wrap pt-2 border-t border-white/10">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    onClick={handleOpenVoiceSheet}
                    className="h-7 px-2.5 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-[11.5px] font-medium flex items-center gap-1"
                  >
                    <SlidersHorizontal className="w-3 h-3" />
                    换声音 · {activeVoiceLabel}
                  </button>

                  {[0.8, 0.92, 1.05].map((r) => (
                    <button
                      key={r}
                      onClick={() => onUpdateSettings({ ...readerSettings, ttsRate: r })}
                      className={`h-7 px-2 rounded-lg text-[11px] font-medium ${
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
                    className={`h-7 px-2 rounded-lg text-[11px] font-medium ${
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
                  className="h-7 px-2.5 rounded-lg bg-white/12 text-[#FAF9F6] text-[11.5px] flex items-center gap-1"
                >
                  <BookOpen className="w-3 h-3" /> 点词精读
                </button>
              </div>
            </div>
          </div>

          {/* Full-Height Comfortable Sense-Group Transcript */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 pb-24">
            {podcastSentences.map((sent, idx) => {
              const active = idx === sentenceIdx;
              const groups = segmentIntoSenseGroups(sent);
              return (
                <div
                  key={idx}
                  onClick={() => startPodcastAt(idx)}
                  className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                    active
                      ? 'bg-white border-[#1C1B18] shadow-xs'
                      : 'bg-white/70 border-[#ECEAE4]'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] text-[#9A968C] mb-1.5">
                    <span>第 {idx + 1} 句</span>
                    {active && isPlayingPodcast && (
                      <span className="text-emerald-700 font-medium flex items-center gap-1">
                        <Volume2 className="w-3 h-3" /> 朗读中
                      </span>
                    )}
                  </div>
                  <p className="font-editorial text-[16.5px] leading-[1.75] text-[#1C1B18]">
                    {groups.map((g, gIdx) => (
                      <React.Fragment key={gIdx}>
                        <span>{g.text}</span>
                        {gIdx < groups.length - 1 && (
                          <span className="mx-1.5 font-sans text-[12px] text-amber-600/60 select-none">
                            /
                          </span>
                        )}
                      </React.Fragment>
                    ))}
                  </p>
                  {showPodcastZh && sentenceZh[idx] && (
                    <p className="text-[13px] text-[#78756E] mt-2 leading-relaxed">
                      {sentenceZh[idx]}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SUB-VIEW 3: REAL SPEECH (Spacious single-card practice) */}
      {subTab === 'speech' && activeScene && (
        <div className="flex-1 overflow-y-auto px-5 py-5 pb-24">
          <section className="rounded-3xl bg-white border border-[#ECEAE4] p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-[#1C1B18] text-[#FAF9F6] text-[11.5px] font-medium">
                  今日真话 {sceneIdx + 1} / {scenarios.length}
                </span>
                <span className="text-[12.5px] text-[#78756E]">{activeScene.sceneTag}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => switchScene(sceneIdx - 1)}
                  className="w-8 h-8 rounded-xl border border-[#ECEAE4] flex items-center justify-center text-[#57544D]"
                  aria-label="上一句"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => switchScene(sceneIdx + 1)}
                  className="w-8 h-8 rounded-xl border border-[#ECEAE4] flex items-center justify-center text-[#57544D]"
                  aria-label="下一句"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#FAF9F6] border border-[#EFECE6]">
              <div className="text-[11.5px] text-[#8E8A80] mb-1.5">你真实想表达的中文</div>
              <p className="text-[16px] font-medium text-[#1C1B18] leading-relaxed">
                「{activeScene.zhOriginal}」
              </p>
            </div>

            <textarea
              rows={3}
              value={draftAttempt || activeScene.userAttempt || ''}
              onChange={(e) => setDraftAttempt(e.target.value)}
              placeholder="先用语音键盘试着说一遍英文，再揭晓母语者表达…"
              className="w-full p-3.5 rounded-2xl bg-white border border-[#E5E2DA] text-[14px] leading-relaxed text-[#1C1B18] focus:outline-none focus:border-[#1C1B18]"
            />

            {!revealed ? (
              <button
                onClick={() => setRevealed(true)}
                className="w-full h-11 rounded-2xl bg-[#1C1B18] text-[#FAF9F6] text-[13.5px] font-medium flex items-center justify-center gap-2"
              >
                <Eye className="w-4 h-4" />
                揭晓母语者意群版
              </button>
            ) : (
              <div className="space-y-3.5">
                <div className="p-4 rounded-2xl bg-emerald-50/75 border border-emerald-200/80 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11.5px] font-medium text-emerald-800">
                      母语者意群版（i+1）
                    </span>
                    <button
                      onClick={() =>
                        speakText(activeScene.enNatural, {
                          rate: readerSettings.ttsRate,
                          locale: readerSettings.ttsAccent,
                        })
                      }
                      className="px-3 py-1 rounded-lg bg-white border border-emerald-200 text-emerald-800 text-[12px] font-medium flex items-center gap-1"
                    >
                      <Volume2 className="w-3.5 h-3.5" /> 朗读
                    </button>
                  </div>
                  <p className="font-editorial text-[17px] leading-[1.7] text-[#1C1B18]">
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
                    <p className="text-[12.5px] text-[#57544D] pt-2 border-t border-emerald-200/60 leading-relaxed">
                      {activeScene.tip}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={() => handleSavePhraseToFsrs(activeScene)}
                    disabled={isPhraseSaved}
                    className={`h-9 px-3.5 rounded-xl text-[12.5px] font-medium flex items-center gap-1.5 ${
                      isPhraseSaved
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-[#F1EFEA] text-[#1C1B18]'
                    }`}
                  >
                    {isPhraseSaved ? (
                      <>
                        <BookmarkCheck className="w-4 h-4" /> 已入复习
                      </>
                    ) : (
                      <>
                        <BookmarkPlus className="w-4 h-4" /> 收入复习
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => handleRateScene('mastered')}
                    className="h-9 px-4 rounded-xl bg-[#1C1B18] text-white text-[12.5px] font-medium flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" /> 说顺了 · 下一句
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {/* Instant Inline Voice Switcher Bottom Sheet */}
      {showVoiceSheet && (
        <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[1px] flex items-end justify-center">
          <div className="w-full max-w-lg bg-[#FAF9F6] rounded-t-3xl p-5 pb-8 max-h-[82vh] overflow-y-auto space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[17px] font-semibold text-[#1C1B18]">选择你最顺耳的声音</h3>
                <p className="text-[12px] text-[#78756E] mt-0.5">
                  点击任意音色立即试听 1 句 ·{' '}
                  {speechStatus.kokoroError
                    ? `Kokoro 异常(${speechStatus.kokoroError})`
                    : speechStatus.kokoroReady
                      ? 'Kokoro 神经网络已就绪'
                      : '正在预热离线语音'}
                </p>
              </div>
              <button
                onClick={() => setShowVoiceSheet(false)}
                className="w-8 h-8 rounded-full bg-[#EFECE6] flex items-center justify-center text-[#57544D]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 p-1 bg-[#EFECE6] rounded-xl">
              <button
                onClick={() =>
                  onUpdateSettings({
                    ...readerSettings,
                    voice: { ...readerSettings.voice, engine: 'kokoro' },
                  })
                }
                className={`py-2 rounded-lg text-[13px] font-medium ${
                  readerSettings.voice.engine === 'kokoro'
                    ? 'bg-white text-[#1C1B18] shadow-xs'
                    : 'text-[#6E6B64]'
                }`}
              >
                Kokoro 离线（11 音色免费）
              </button>
              <button
                onClick={() =>
                  onUpdateSettings({
                    ...readerSettings,
                    voice: { ...readerSettings.voice, engine: 'rime' },
                  })
                }
                className={`py-2 rounded-lg text-[13px] font-medium ${
                  readerSettings.voice.engine === 'rime'
                    ? 'bg-white text-[#1C1B18] shadow-xs'
                    : 'text-[#6E6B64]'
                }`}
              >
                Rime 云端播客级
              </button>
            </div>

            {readerSettings.voice.engine === 'kokoro' ? (
              <div className="grid grid-cols-2 gap-2">
                {KOKORO_SPEAKERS.map((sp) => {
                  const active = readerSettings.voice.kokoroSpeaker === sp.id;
                  return (
                    <button
                      key={sp.id}
                      onClick={() => handlePickKokoroVoice(sp.id)}
                      className={`p-3 rounded-xl border text-left transition-colors ${
                        active
                          ? 'bg-[#1C1B18] text-white border-[#1C1B18]'
                          : 'bg-white text-[#1C1B18] border-[#E5E2DA]'
                      }`}
                    >
                      <div className="text-[13.5px] font-semibold flex items-center justify-between">
                        <span>{sp.name}</span>
                        <Volume2 className="w-3.5 h-3.5 opacity-60" />
                      </div>
                      <div className={`text-[11px] mt-0.5 ${active ? 'text-[#C8C4BA]' : 'text-[#8E8A80]'}`}>
                        {sp.desc}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="text-[11.5px] text-[#78756E] block mb-1">
                    Rime API Key（有缓存不重复扣费，断网自动回退 Kokoro）
                  </label>
                  <input
                    type="password"
                    value={readerSettings.voice.rimeApiKey}
                    onChange={(e) =>
                      onUpdateSettings({
                        ...readerSettings,
                        voice: { ...readerSettings.voice, rimeApiKey: e.target.value },
                      })
                    }
                    placeholder="粘贴你的 Rime API Key…"
                    className="w-full h-10 px-3 rounded-xl bg-white border border-[#E5E2DA] text-[13px]"
                  />
                </div>
                <div className="flex items-center gap-2">
                  {(['coda', 'mistv3'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => {
                        onUpdateSettings({
                          ...readerSettings,
                          voice: { ...readerSettings.voice, rimeModel: m },
                        });
                        setLoadingRimeVoices(true);
                        fetchRimeVoices(m)
                          .then(setRimeVoices)
                          .finally(() => setLoadingRimeVoices(false));
                      }}
                      className={`px-3.5 py-1.5 rounded-lg text-[12px] border ${
                        readerSettings.voice.rimeModel === m
                          ? 'bg-[#1C1B18] text-white border-[#1C1B18]'
                          : 'bg-white text-[#57544D] border-[#E5E2DA]'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                  {loadingRimeVoices && <Loader2 className="w-4 h-4 animate-spin text-[#78756E]" />}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {rimeVoices.slice(0, 18).map((v) => {
                    const active = readerSettings.voice.rimeSpeaker === v;
                    return (
                      <button
                        key={v}
                        onClick={() => handlePickRimeVoice(v)}
                        className={`py-2 px-2.5 rounded-xl border text-[12px] font-medium truncate ${
                          active
                            ? 'bg-[#1C1B18] text-white border-[#1C1B18]'
                            : 'bg-white text-[#1C1B18] border-[#E5E2DA]'
                        }`}
                      >
                        {v}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {showHubSheet && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-end justify-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowHubSheet(false);
          }}
        >
          <div className="w-full max-w-lg bg-[#FAF9F6] rounded-t-3xl p-5 pb-8 space-y-3.5 border-t border-[#ECEAE4]">
            <div className="flex items-center justify-between">
              <h3 className="text-[16px] font-semibold text-[#1C1B18]">直连共同工作台（只需填一次）</h3>
              <button
                onClick={() => setShowHubSheet(false)}
                className="w-8 h-8 rounded-full bg-white border border-[#E5E2DA] flex items-center justify-center text-[#57544D]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[12.5px] text-[#78756E] leading-relaxed">
              输入一次你的工作台私人空间口令，之后每次点右上角「同步」即可 1 秒更新最新整体复盘、专属播客与真话卡片，无需再下载重装。
            </p>
            <input
              type="password"
              value={hubPasscodeInput}
              onChange={(e) => setHubPasscodeInput(e.target.value)}
              placeholder="输入工作台私人空间口令…"
              className="w-full h-11 px-3.5 rounded-xl bg-white border border-[#E5E2DA] text-[14px]"
            />
            <button
              onClick={handleConnectHubAndSync}
              disabled={syncingFeed}
              className="w-full h-11 rounded-xl bg-[#1C1B18] text-white text-[13.5px] font-medium flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {syncingFeed && <Loader2 className="w-4 h-4 animate-spin" />}
              连接并立即同步
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
