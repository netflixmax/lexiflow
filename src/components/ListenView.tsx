import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Eye,
  EyeOff,
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
  Volume2,
} from 'lucide-react';
import { fetchPodcastEpisodes } from '../services/feeds';
import { speakText, stopSpeaking } from '../services/nativeBridge';
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

function splitToSentences(item: ContentItem | null): string[] {
  if (!item) return [];
  const paragraphs =
    item.chapters && item.chapters.length > 0
      ? item.chapters[item.currentChapter ?? 0]?.paragraphs ?? []
      : item.paragraphs;

  const out: string[] = [];
  for (const p of paragraphs) {
    const matches = p.match(/[^.!?]+[.!?]+|[^.!?]+$/g);
    if (matches) {
      for (const s of matches) {
        const clean = s.trim();
        if (clean.length >= 6) out.push(clean);
      }
    }
  }
  return out;
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
  const sentences = useMemo(() => splitToSentences(currentItem), [currentItem]);

  // Article synced TTS state
  const [sentenceIdx, setSentenceIdx] = useState(0);
  const [isPlayingTts, setIsPlayingTts] = useState(false);
  const [loopSentence, setLoopSentence] = useState(false);
  const [blindMode, setBlindMode] = useState(false);
  const [revealedIdx, setRevealedIdx] = useState<Set<number>>(new Set());
  const [dictationInput, setDictationInput] = useState('');

  const playingRef = useRef(false);
  const loopRef = useRef(false);
  const idxRef = useRef(0);
  const sentencesRef = useRef<string[]>([]);
  const rateRef = useRef(readerSettings.ttsRate);
  const accentRef = useRef(readerSettings.ttsAccent);
  const sessionStartRef = useRef<number | null>(null);

  useEffect(() => {
    loopRef.current = loopSentence;
  }, [loopSentence]);
  useEffect(() => {
    sentencesRef.current = sentences;
    setSentenceIdx(0);
    idxRef.current = 0;
    setRevealedIdx(new Set());
    stopTtsPlayback();
  }, [sentences]);
  useEffect(() => {
    rateRef.current = readerSettings.ttsRate;
    accentRef.current = readerSettings.ttsAccent;
  }, [readerSettings.ttsRate, readerSettings.ttsAccent]);

  const commitListeningTime = () => {
    if (sessionStartRef.current) {
      const mins = Math.round((Date.now() - sessionStartRef.current) / 60000);
      if (mins >= 1) onRecordListening(mins);
      sessionStartRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      playingRef.current = false;
      stopSpeaking();
      commitListeningTime();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const playSentenceAt = (index: number) => {
    const list = sentencesRef.current;
    if (index < 0 || index >= list.length) {
      playingRef.current = false;
      setIsPlayingTts(false);
      commitListeningTime();
      return;
    }
    idxRef.current = index;
    setSentenceIdx(index);
    playingRef.current = true;
    setIsPlayingTts(true);
    if (!sessionStartRef.current) sessionStartRef.current = Date.now();

    speakText(list[index], {
      rate: rateRef.current,
      locale: accentRef.current,
      onEnd: () => {
        if (!playingRef.current) return;
        if (loopRef.current) {
          setTimeout(() => {
            if (playingRef.current) playSentenceAt(idxRef.current);
          }, 350);
        } else if (idxRef.current + 1 < sentencesRef.current.length) {
          setTimeout(() => {
            if (playingRef.current) playSentenceAt(idxRef.current + 1);
          }, 260);
        } else {
          playingRef.current = false;
          setIsPlayingTts(false);
          commitListeningTime();
        }
      },
    });
  };

  const stopTtsPlayback = () => {
    playingRef.current = false;
    setIsPlayingTts(false);
    stopSpeaking();
    commitListeningTime();
  };

  const toggleTts = () => {
    if (isPlayingTts) {
      stopTtsPlayback();
    } else {
      playSentenceAt(sentenceIdx);
    }
  };

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
    stopTtsPlayback();
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
            <p className="text-[12px] text-[#78756E] mt-0.5">单句复读 · 盲听听写 · 原声播客</p>
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

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                {[0.75, 0.95, 1.15, 1.35].map((r) => (
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
                <button
                  onClick={() =>
                    onUpdateSettings({
                      ...readerSettings,
                      ttsAccent: readerSettings.ttsAccent === 'en-US' ? 'en-GB' : 'en-US',
                    })
                  }
                  className="px-2 py-1 rounded-md text-[11px] font-medium bg-[#F1EFEA] text-[#57544D]"
                >
                  {readerSettings.ttsAccent === 'en-US' ? '美音 US' : '英音 UK'}
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setLoopSentence((v) => !v)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1 border ${
                    loopSentence
                      ? 'bg-amber-100 border-amber-400 text-amber-900'
                      : 'bg-white border-[#E5E2DA] text-[#57544D]'
                  }`}
                >
                  <Repeat className="w-3 h-3" /> 单句循环
                </button>
                <button
                  onClick={() => setBlindMode((v) => !v)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1 border ${
                    blindMode
                      ? 'bg-[#1C1B18] border-[#1C1B18] text-white'
                      : 'bg-white border-[#E5E2DA] text-[#57544D]'
                  }`}
                >
                  {blindMode ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  盲听
                </button>
              </div>
            </div>
          </div>

          {/* Blind Dictation Box */}
          {blindMode && (
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

          {/* Synchronized Sentences List */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2.5 pb-40">
            {sentences.map((s, idx) => {
              const active = idx === sentenceIdx;
              const isBlurred = blindMode && !revealedIdx.has(idx);
              return (
                <div
                  key={idx}
                  onClick={() => {
                    if (isBlurred) {
                      setRevealedIdx((prev) => new Set(prev).add(idx));
                    } else {
                      setDictationInput('');
                      playSentenceAt(idx);
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
                      <span className="flex items-center gap-1 text-amber-700 font-medium">
                        <Volume2 className="w-3 h-3" /> 朗读中
                      </span>
                    )}
                  </div>
                  <p
                    className={`font-editorial text-[16px] leading-relaxed text-[#1C1B18] transition-all ${
                      isBlurred ? 'blur-[6px] select-none' : ''
                    }`}
                  >
                    {s}
                  </p>
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
                  playSentenceAt(Math.max(0, sentenceIdx - 1));
                }}
                className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center"
              >
                <SkipBack className="w-4 h-4" />
              </button>
              <button
                onClick={toggleTts}
                className="w-11 h-11 rounded-full bg-[#FAF9F6] text-[#1C1B18] flex items-center justify-center active:scale-95 transition-transform"
              >
                {isPlayingTts ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
              </button>
              <button
                onClick={() => {
                  setDictationInput('');
                  playSentenceAt(Math.min(sentences.length - 1, sentenceIdx + 1));
                }}
                className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center"
              >
                <SkipForward className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={() => playSentenceAt(sentenceIdx)}
              className="text-[12px] text-[#C8C4BA] px-2 py-1 rounded-lg bg-white/10"
            >
              重听本句
            </button>
          </div>
        </div>
      ) : (
        /* Podcast Mode */
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Feed Selector */}
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

          {/* Episodes */}
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

          {/* Native Audio Element + Mini Player */}
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
    </div>
  );
};
