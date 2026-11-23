import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Headphones,
  Loader2,
  Pause,
  Play,
  Plus,
  Radio,
  Repeat,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Volume2,
  X,
} from 'lucide-react';
import { fetchPodcastEpisodes } from '../services/feeds';
import {
  fetchRimeVoices,
  KOKORO_SPEAKERS,
  speakSequence,
  stopSpeaking,
} from '../services/nativeBridge';
import { segmentIntoSenseGroups, splitParagraphToSentences } from '../services/senseGroup';
import { translateEnToZh } from '../services/translator';
import type { ContentItem, PodcastEpisode, PodcastFeed, ReaderSettings } from '../types';

interface ListenViewProps {
  library: ContentItem[];
  activeArticle: ContentItem | null;
  podcastFeeds: PodcastFeed[];
  readerSettings: ReaderSettings;
  onUpdateSettings: (next: ReaderSettings) => void;
  onAddPodcastFeed: (feed: PodcastFeed) => void;
  onRecordListening: (minutes: number) => void;
}

function extractSentences(item: ContentItem | null): string[] {
  if (!item) return [];
  const paragraphs =
    item.chapters && item.chapters.length > 0
      ? item.chapters[item.currentChapter ?? 0]?.paragraphs ?? []
      : item.paragraphs;
  return paragraphs.flatMap((p) => splitParagraphToSentences(p)).filter((s) => s.length >= 6);
}

export const ListenView: React.FC<ListenViewProps> = ({
  library,
  activeArticle,
  podcastFeeds,
  readerSettings,
  onUpdateSettings,
  onAddPodcastFeed,
  onRecordListening,
}) => {
  const [mode, setMode] = useState<'article' | 'podcast'>('article');
  const [selectedId, setSelectedId] = useState<string>(activeArticle?.id ?? library[0]?.id ?? '');

  useEffect(() => {
    if (activeArticle) {
      setSelectedId(activeArticle.id);
      setMode('article');
    }
  }, [activeArticle]);

  const currentItem = useMemo(
    () => library.find((i) => i.id === selectedId) ?? library[0] ?? null,
    [library, selectedId],
  );
  const sentences = useMemo(() => extractSentences(currentItem), [currentItem]);

  // Article synced Kokoro / Rime state
  const [sentenceIdx, setSentenceIdx] = useState(0);
  const [isPlayingTts, setIsPlayingTts] = useState(false);
  const [loopSentence, setLoopSentence] = useState(false);
  const [listenStage, setListenStage] = useState<'bilingual' | 'english' | 'blind'>('bilingual');
  const [sentenceZh, setSentenceZh] = useState<Record<number, string>>({});
  const [revealedIdx, setRevealedIdx] = useState<Set<number>>(new Set());
  const [dictationInput, setDictationInput] = useState('');

  // Quick Voice Engine Sheet (Kokoro Offline / Rime Cloud)
  const [showVoiceSheet, setShowVoiceSheet] = useState(false);
  const [rimeVoiceList, setRimeVoiceList] = useState<string[]>([
    'astra',
    'celeste',
    'mesa',
    'marsh',
    'cove',
    'orion',
  ]);
  const [loadingRimeVoices, setLoadingRimeVoices] = useState(false);

  const sessionStartRef = useRef<number | null>(null);

  const commitListeningTime = () => {
    if (sessionStartRef.current) {
      const mins = Math.round((Date.now() - sessionStartRef.current) / 60000);
      if (mins >= 1) onRecordListening(mins);
      sessionStartRef.current = null;
    }
  };

  useEffect(() => {
    setSentenceIdx(0);
    setRevealedIdx(new Set());
    setSentenceZh({});
    setIsPlayingTts(false);
    stopSpeaking();
  }, [sentences]);

  useEffect(() => {
    return () => {
      stopSpeaking();
      commitListeningTime();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (listenStage !== 'bilingual' || sentences.length === 0) return;
    let cancelled = false;
    (async () => {
      for (let i = 0; i < sentences.length; i++) {
        if (cancelled) break;
        const zh = await translateEnToZh(sentences[i]);
        if (!cancelled && zh) {
          setSentenceZh((prev) => ({ ...prev, [i]: zh }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listenStage, sentences]);

  const startPlaybackAt = (index: number, forceLoop?: boolean) => {
    if (sentences.length === 0) return;
    const clamped = Math.max(0, Math.min(sentences.length - 1, index));
    setSentenceIdx(clamped);
    setIsPlayingTts(true);
    if (!sessionStartRef.current) sessionStartRef.current = Date.now();

    speakSequence(sentences, {
      startIndex: clamped,
      rate: readerSettings.ttsRate,
      loopSingle: forceLoop ?? loopSentence,
      onSentenceStart: (idx) => {
        setSentenceIdx(idx);
      },
      onComplete: () => {
        setIsPlayingTts(false);
        commitListeningTime();
      },
    });
  };

  const stopPlayback = () => {
    setIsPlayingTts(false);
    stopSpeaking();
    commitListeningTime();
  };

  const togglePlay = () => {
    if (isPlayingTts) stopPlayback();
    else startPlaybackAt(sentenceIdx);
  };

  const handleLoadRimeVoices = async (model: 'coda' | 'mistv3') => {
    setLoadingRimeVoices(true);
    try {
      const list = await fetchRimeVoices(model);
      setRimeVoiceList(list);
    } finally {
      setLoadingRimeVoices(false);
    }
  };

  const activeVoiceBadge = useMemo(() => {
    if (readerSettings.voice.engine === 'rime' && readerSettings.voice.rimeApiKey.trim()) {
      return `Rime · ${readerSettings.voice.rimeSpeaker}`;
    }
    if (readerSettings.voice.engine === 'system') {
      return '系统语音';
    }
    const sp = KOKORO_SPEAKERS.find((s) => s.id === readerSettings.voice.kokoroSpeaker);
    return `Kokoro · ${sp?.name ?? 'Heart'}`;
  }, [readerSettings.voice]);

  // Podcast state
  const [selectedFeed, setSelectedFeed] = useState<PodcastFeed>(podcastFeeds[0]);
  const [episodes, setEpisodes] = useState<PodcastEpisode[]>([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [podError, setPodError] = useState<string | null>(null);
  const [activeEp, setActiveEp] = useState<PodcastEpisode | null>(null);
  const [isPodPlaying, setIsPodPlaying] = useState(false);
  const [podSpeed, setPodSpeed] = useState(1.0);
  const [podProgress, setPodProgress] = useState(0);
  const [podDuration, setPodDuration] = useState(0);
  const [showAddPod, setShowAddPod] = useState(false);
  const [newPodTitle, setNewPodTitle] = useState('');
  const [newPodUrl, setNewPodUrl] = useState('');
  const audioRef = useRef<HTMLAudioElement>(null);

  const loadFeed = async (feed: PodcastFeed) => {
    setSelectedFeed(feed);
    setLoadingEpisodes(true);
    setPodError(null);
    try {
      const list = await fetchPodcastEpisodes(feed.rssUrl, feed.title);
      setEpisodes(list);
      if (list.length === 0) setPodError('暂未解析到可播放音频单集。');
    } catch (e) {
      setPodError((e as Error).message || '播客源加载失败，请检查网络。');
      setEpisodes([]);
    } finally {
      setLoadingEpisodes(false);
    }
  };

  useEffect(() => {
    if (mode === 'podcast' && episodes.length === 0 && !loadingEpisodes && selectedFeed) {
      loadFeed(selectedFeed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const playEpisode = (ep: PodcastEpisode) => {
    stopPlayback();
    setActiveEp(ep);
    setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.playbackRate = podSpeed;
        audioRef.current.play().then(() => setIsPodPlaying(true)).catch(() => {});
      }
    }, 60);
  };

  const togglePodPlay = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      a.play().then(() => setIsPodPlaying(true)).catch(() => {});
    } else {
      a.pause();
      setIsPodPlaying(false);
    }
  };

  const skipAudio = (delta: number) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = Math.max(0, Math.min(a.duration || 0, a.currentTime + delta));
  };

  const formatTime = (sec: number) => {
    if (!Number.isFinite(sec) || sec <= 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const currentSentence = sentences[sentenceIdx] ?? '';
  const dictationMatchPct = useMemo(() => {
    if (!dictationInput.trim() || !currentSentence) return null;
    const targetWords = currentSentence.toLowerCase().match(/[a-z]+/g) ?? [];
    const inputWords = new Set(dictationInput.toLowerCase().match(/[a-z]+/g) ?? []);
    if (targetWords.length === 0) return null;
    const matched = targetWords.filter((w) => inputWords.has(w)).length;
    return Math.round((matched / targetWords.length) * 100);
  }, [dictationInput, currentSentence]);

  return (
    <div className="flex flex-col h-full bg-[#FAF9F6]">
      {/* Header */}
      <header className="pt-safe px-5 pb-3 bg-[#FAF9F6] border-b border-[#ECEAE4]">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight text-[#1C1B18]">精听工坊</h1>
            <p className="text-[12px] text-[#78756E] mt-0.5">Kokoro 离线 · Rime 云端 · 意群节律</p>
          </div>
          <div className="flex p-1 bg-[#EFECE6] rounded-xl">
            <button
              onClick={() => setMode('article')}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
                mode === 'article' ? 'bg-white text-[#1C1B18] shadow-xs' : 'text-[#6E6B64]'
              }`}
            >
              文章精听
            </button>
            <button
              onClick={() => setMode('podcast')}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
                mode === 'podcast' ? 'bg-white text-[#1C1B18] shadow-xs' : 'text-[#6E6B64]'
              }`}
            >
              英文播客
            </button>
          </div>
        </div>
      </header>

      {mode === 'article' ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Article Selector & Controls */}
          <div className="px-5 py-3 border-b border-[#ECEAE4] bg-white/70 space-y-2.5">
            <select
              value={currentItem?.id ?? ''}
              onChange={(e) => setSelectedId(e.target.value)}
              className="w-full h-10 px-3 rounded-xl bg-white border border-[#E5E2DA] text-[13px] font-medium text-[#1C1B18] focus:outline-none"
            >
              {library.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>

            {/* 3-Step Natural Listening Stages */}
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#F1EFEA] rounded-xl">
              {(
                [
                  { k: 'bilingual', label: '① 双语磨耳' },
                  { k: 'english', label: '② 英文跟读' },
                  { k: 'blind', label: '③ 盲听挑战' },
                ] as const
              ).map((st) => (
                <button
                  key={st.k}
                  onClick={() => setListenStage(st.k)}
                  className={`py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
                    listenStage === st.k
                      ? 'bg-white text-[#1C1B18] shadow-xs'
                      : 'text-[#6E6B64]'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 flex-wrap">
                {[0.75, 0.9, 1.05, 1.25].map((r) => (
                  <button
                    key={r}
                    onClick={() => onUpdateSettings({ ...readerSettings, ttsRate: r })}
                    className={`px-2 py-1 rounded-md text-[11px] font-medium ${
                      Math.abs(readerSettings.ttsRate - r) < 0.05
                        ? 'bg-[#1C1B18] text-white'
                        : 'bg-[#F1EFEA] text-[#57544D]'
                    }`}
                  >
                    {r}x
                  </button>
                ))}

                {/* Voice Engine Quick Switch Pill */}
                <button
                  onClick={() => setShowVoiceSheet(true)}
                  className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1"
                >
                  <SlidersHorizontal className="w-3 h-3" />
                  {activeVoiceBadge}
                </button>
              </div>

              <button
                onClick={() => {
                  const next = !loopSentence;
                  setLoopSentence(next);
                  if (isPlayingTts) startPlaybackAt(sentenceIdx, next);
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1 border ${
                  loopSentence
                    ? 'bg-amber-100 border-amber-400 text-amber-900'
                    : 'bg-white border-[#E5E2DA] text-[#57544D]'
                }`}
              >
                <Repeat className="w-3 h-3" /> 单句循环
              </button>
            </div>
          </div>

          {/* Blind Dictation Box */}
          {listenStage === 'blind' && (
            <div className="px-5 py-3 bg-[#F6F3EB] border-b border-[#E7E2D4]">
              <div className="flex items-center justify-between text-[12px] text-[#6E6B64] mb-1.5">
                <span>听写当前第 {sentenceIdx + 1} 句（点击句子可揭晓原文）</span>
                {dictationMatchPct !== null && (
                  <span className="font-semibold text-emerald-700">命中 {dictationMatchPct}%</span>
                )}
              </div>
              <input
                type="text"
                value={dictationInput}
                onChange={(e) => setDictationInput(e.target.value)}
                placeholder="听音频并输入你听到的英文关键词或整句…"
                className="w-full h-9 px-3 rounded-lg bg-white border border-[#E2DDD0] text-[13px] focus:outline-none focus:border-[#1C1B18]"
              />
            </div>
          )}

          {/* Synchronized Sentences List with Native Sense-Group Rhythm */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2.5 pb-40">
            {sentences.map((s, idx) => {
              const active = idx === sentenceIdx;
              const isBlurred = listenStage === 'blind' && !revealedIdx.has(idx);
              const groups = segmentIntoSenseGroups(s);
              return (
                <div
                  key={idx}
                  onClick={() => {
                    if (isBlurred) {
                      setRevealedIdx((prev) => new Set(prev).add(idx));
                    } else {
                      setDictationInput('');
                      startPlaybackAt(idx);
                    }
                  }}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                    active
                      ? 'bg-white border-[#1C1B18] shadow-xs'
                      : 'bg-white/60 border-[#ECEAE4]'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] text-[#9A968C] mb-1">
                    <span>Sentence {idx + 1}</span>
                    {active && isPlayingTts && (
                      <span className="flex items-center gap-1 text-emerald-700 font-medium">
                        <Volume2 className="w-3 h-3" /> 朗读中
                      </span>
                    )}
                  </div>
                  <p
                    className={`font-editorial text-[16px] leading-relaxed text-[#1C1B18] transition-all ${
                      isBlurred ? 'blur-[6px] select-none' : ''
                    }`}
                  >
                    {groups.map((g, gIdx) => (
                      <React.Fragment key={gIdx}>
                        <span>{g.text}</span>
                        {gIdx < groups.length - 1 && (
                          <span className="mx-1.5 font-sans text-[12px] text-amber-600/55 select-none">
                            /
                          </span>
                        )}
                      </React.Fragment>
                    ))}
                  </p>
                  {listenStage === 'bilingual' && sentenceZh[idx] && (
                    <p className="text-[13px] text-[#78756E] mt-1.5 leading-relaxed">
                      {sentenceZh[idx]}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Floating Playback Control Bar */}
          <div className="fixed left-4 right-4 bottom-20 max-w-lg mx-auto bg-[#1C1B18] text-[#FAF9F6] rounded-2xl px-4 py-3 shadow-xl flex items-center justify-between">
            <div className="text-[12px] text-[#C8C4BA]">
              {sentenceIdx + 1} / {sentences.length} 句
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setDictationInput('');
                  startPlaybackAt(Math.max(0, sentenceIdx - 1));
                }}
                className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center"
              >
                <SkipBack className="w-4 h-4" />
              </button>
              <button
                onClick={togglePlay}
                className="w-11 h-11 rounded-full bg-[#FAF9F6] text-[#1C1B18] flex items-center justify-center active:scale-95 transition-transform"
              >
                {isPlayingTts ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
              </button>
              <button
                onClick={() => {
                  setDictationInput('');
                  startPlaybackAt(Math.min(sentences.length - 1, sentenceIdx + 1));
                }}
                className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center"
              >
                <SkipForward className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={() => startPlaybackAt(sentenceIdx)}
              className="text-[12px] text-[#C8C4BA] px-2 py-1 rounded-lg bg-white/10"
            >
              重听本句
            </button>
          </div>
        </div>
      ) : (
        /* Podcast Mode */
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-5 py-3 flex items-center gap-2 overflow-x-auto no-scrollbar border-b border-[#ECEAE4]">
            {podcastFeeds.map((feed) => (
              <button
                key={feed.id}
                onClick={() => loadFeed(feed)}
                className={`px-3 py-1.5 rounded-full text-[12px] font-medium whitespace-nowrap border ${
                  selectedFeed?.id === feed.id
                    ? 'bg-[#1C1B18] text-white border-[#1C1B18]'
                    : 'bg-white text-[#57544D] border-[#E5E2DA]'
                }`}
              >
                {feed.title}
              </button>
            ))}
            <button
              onClick={() => setShowAddPod((v) => !v)}
              className="px-2.5 py-1.5 rounded-full text-[12px] bg-white border border-dashed border-[#C7C2B6] text-[#57544D] flex items-center gap-1 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" /> 添加 RSS
            </button>
          </div>

          {showAddPod && (
            <div className="px-5 py-3 bg-white border-b border-[#ECEAE4] space-y-2">
              <input
                type="text"
                value={newPodTitle}
                onChange={(e) => setNewPodTitle(e.target.value)}
                placeholder="播客名称"
                className="w-full h-9 px-3 rounded-lg border border-[#E5E2DA] text-[13px]"
              />
              <div className="flex gap-2">
                <input
                  type="url"
                  value={newPodUrl}
                  onChange={(e) => setNewPodUrl(e.target.value)}
                  placeholder="RSS 订阅地址 (https://...)"
                  className="flex-1 h-9 px-3 rounded-lg border border-[#E5E2DA] text-[13px]"
                />
                <button
                  onClick={() => {
                    if (!newPodUrl.trim()) return;
                    const created: PodcastFeed = {
                      id: `pod-${Date.now()}`,
                      title: newPodTitle.trim() || '自定义播客',
                      category: 'english',
                      description: '自定义 RSS 播客源',
                      rssUrl: newPodUrl.trim(),
                    };
                    onAddPodcastFeed(created);
                    setNewPodTitle('');
                    setNewPodUrl('');
                    setShowAddPod(false);
                    loadFeed(created);
                  }}
                  className="px-3.5 h-9 rounded-lg bg-[#1C1B18] text-white text-[12px]"
                >
                  添加
                </button>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2.5 pb-44">
            {loadingEpisodes ? (
              <div className="py-16 flex items-center justify-center gap-2 text-[#78756E] text-[14px]">
                <Loader2 className="w-4 h-4 animate-spin" /> 正在加载播客单集…
              </div>
            ) : podError ? (
              <div className="py-12 text-center space-y-3">
                <p className="text-[13px] text-[#78756E]">{podError}</p>
                <button
                  onClick={() => loadFeed(selectedFeed)}
                  className="px-4 py-2 rounded-full bg-[#1C1B18] text-white text-[12px]"
                >
                  重试加载
                </button>
              </div>
            ) : (
              episodes.map((ep) => {
                const isCurrent = activeEp?.id === ep.id;
                return (
                  <div
                    key={ep.id}
                    onClick={() => playEpisode(ep)}
                    className={`p-4 rounded-2xl border cursor-pointer transition-colors ${
                      isCurrent ? 'bg-white border-[#1C1B18]' : 'bg-white border-[#ECEAE4]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-[11px] text-[#8E8A80]">
                          <Radio className="w-3 h-3" />
                          <span>{ep.pubDate}</span>
                          {ep.duration && <span>· {ep.duration}</span>}
                        </div>
                        <h3 className="text-[15px] font-semibold text-[#1C1B18] mt-1 leading-snug">
                          {ep.title}
                        </h3>
                        {ep.description && (
                          <p className="text-[12px] text-[#6E6B64] mt-1 line-clamp-2">
                            {ep.description}
                          </p>
                        )}
                      </div>
                      <div
                        className={`w-9 h-9 rounded-full shrink-0 flex items-center justify-center ${
                          isCurrent ? 'bg-[#1C1B18] text-white' : 'bg-[#F1EFEA] text-[#1C1B18]'
                        }`}
                      >
                        <Headphones className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <audio
            ref={audioRef}
            src={activeEp?.audioUrl}
            onTimeUpdate={(e) => setPodProgress(e.currentTarget.currentTime)}
            onLoadedMetadata={(e) => setPodDuration(e.currentTarget.duration)}
            onEnded={() => {
              setIsPodPlaying(false);
              onRecordListening(Math.max(1, Math.round(podDuration / 60)));
            }}
          />

          {activeEp && (
            <div className="fixed left-4 right-4 bottom-20 max-w-lg mx-auto bg-[#1C1B18] text-[#FAF9F6] rounded-2xl p-3.5 shadow-xl space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[13px] font-medium truncate">{activeEp.title}</div>
                <button
                  onClick={() => {
                    const speeds = [0.8, 1.0, 1.25, 1.5];
                    const next = speeds[(speeds.indexOf(podSpeed) + 1) % speeds.length];
                    setPodSpeed(next);
                    if (audioRef.current) audioRef.current.playbackRate = next;
                  }}
                  className="px-2 py-0.5 rounded-md bg-white/15 text-[11px] shrink-0"
                >
                  {podSpeed}x
                </button>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-[#B8B4AA]">
                <span>{formatTime(podProgress)}</span>
                <input
                  type="range"
                  min={0}
                  max={podDuration || 100}
                  value={podProgress}
                  onChange={(e) => {
                    const t = Number(e.target.value);
                    if (audioRef.current) audioRef.current.currentTime = t;
                    setPodProgress(t);
                  }}
                  className="flex-1 accent-amber-400 h-1"
                />
                <span>{formatTime(podDuration)}</span>
              </div>
              <div className="flex items-center justify-center gap-5 pt-0.5">
                <button onClick={() => skipAudio(-10)} className="text-[#D6D2C8] flex items-center gap-0.5 text-[11px]">
                  <RotateCcw className="w-4 h-4" /> 10s
                </button>
                <button
                  onClick={togglePodPlay}
                  className="w-10 h-10 rounded-full bg-[#FAF9F6] text-[#1C1B18] flex items-center justify-center"
                >
                  {isPodPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                </button>
                <button onClick={() => skipAudio(15)} className="text-[#D6D2C8] flex items-center gap-0.5 text-[11px]">
                  15s <RotateCw className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Clean Voice Engine Quick Picker Sheet */}
      {showVoiceSheet && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] flex items-end justify-center">
          <div className="w-full max-w-lg bg-[#FAF9F6] rounded-t-3xl p-5 pb-8 max-h-[82vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[17px] font-semibold text-[#1C1B18]">朗读语音引擎</h3>
                <p className="text-[12px] text-[#78756E]">离线默认 Kokoro-82M 真人质感；可选 Rime 云端 API</p>
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
                Kokoro 离线（免费）
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
                Rime 云端（可选）
              </button>
            </div>

            {readerSettings.voice.engine === 'kokoro' ? (
              <div className="grid grid-cols-2 gap-2">
                {KOKORO_SPEAKERS.map((sp) => {
                  const active = readerSettings.voice.kokoroSpeaker === sp.id;
                  return (
                    <button
                      key={sp.id}
                      onClick={() =>
                        onUpdateSettings({
                          ...readerSettings,
                          voice: { ...readerSettings.voice, engine: 'kokoro', kokoroSpeaker: sp.id },
                        })
                      }
                      className={`p-2.5 rounded-xl border text-left transition-colors ${
                        active
                          ? 'bg-[#1C1B18] text-white border-[#1C1B18]'
                          : 'bg-white text-[#1C1B18] border-[#E5E2DA]'
                      }`}
                    >
                      <div className="text-[13px] font-semibold">{sp.name}</div>
                      <div className={`text-[11px] ${active ? 'text-[#C8C4BA]' : 'text-[#8E8A80]'}`}>
                        {sp.desc}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="text-[11px] text-[#78756E] block mb-1">
                    Rime API Key（未填或断网时自动回退离线 Kokoro）
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
                    placeholder="输入 Rime API Key…"
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
                        handleLoadRimeVoices(m);
                      }}
                      className={`px-3.5 py-1.5 rounded-lg text-[12px] border ${
                        readerSettings.voice.rimeModel === m
                          ? 'bg-[#1C1B18] text-white border-[#1C1B18]'
                          : 'bg-white text-[#57544D] border-[#E5E2DA]'
                      }`}
                    >
                      模型: {m}
                    </button>
                  ))}
                  <button
                    onClick={() => handleLoadRimeVoices(readerSettings.voice.rimeModel)}
                    className="ml-auto text-[12px] text-[#57544D] underline"
                  >
                    {loadingRimeVoices ? '拉取音色中…' : '刷新官方音色列表'}
                  </button>
                </div>

                <div>
                  <label className="text-[11px] text-[#78756E] block mb-1">Rime 英文音色</label>
                  <select
                    value={readerSettings.voice.rimeSpeaker}
                    onChange={(e) =>
                      onUpdateSettings({
                        ...readerSettings,
                        voice: { ...readerSettings.voice, rimeSpeaker: e.target.value },
                      })
                    }
                    className="w-full h-10 px-3 rounded-xl bg-white border border-[#E5E2DA] text-[13px]"
                  >
                    {rimeVoiceList.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <button
              onClick={() => setShowVoiceSheet(false)}
              className="w-full h-10 rounded-xl bg-[#1C1B18] text-white text-[13px] font-medium"
            >
              完成
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
