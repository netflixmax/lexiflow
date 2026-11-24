import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, Brain, Headphones, Settings, Sparkles } from 'lucide-react';
import type { Grade } from 'ts-fsrs';
import { LibraryView } from './components/LibraryView';
import { ListenView } from './components/ListenView';
import { ProfileView } from './components/ProfileView';
import { ReaderView } from './components/ReaderView';
import { ReadmeModal } from './components/ReadmeModal';
import { TodayView } from './components/TodayView';
import { VocabView } from './components/VocabView';
import { STARTER_WORDS } from './data/starterDecks';
import { parseIncrementalDailyContent } from './services/dailyImporter';
import { lookupWord } from './services/dictionary';
import { createNewFsrsCard, isCardDue, reviewFsrsCard } from './services/fsrsService';
import {
  configureSpeechEngine,
  consumePendingShare,
  subscribeIncomingShare,
} from './services/nativeBridge';
import {
  loadAiConfig,
  loadDailyFeedConfig,
  loadDailyMirrors,
  loadDailyPicks,
  loadDailyScenarios,
  loadLibrary,
  loadLiveReadme,
  loadPodcastFeeds,
  loadReaderSettings,
  loadStats,
  loadUpdateConfig,
  loadVocab,
  recordActivity,
  saveAiConfig,
  saveDailyFeedConfig,
  saveDailyMirrors,
  saveDailyPicks,
  saveDailyScenarios,
  saveLibrary,
  saveLiveReadme,
  savePodcastFeeds,
  saveReaderSettings,
  saveUpdateConfig,
  saveVocab,
} from './services/storage';
import type {
  ActiveTab,
  AiConfig,
  ContentItem,
  DailyFeedConfig,
  DailyMirrorCard,
  DailyPick,
  DailyScenarioCard,
  LiveReadmeData,
  PodcastFeed,
  ReaderSettings,
  SharedIncomingPayload,
  UpdateConfig,
  VocabCard,
} from './types';

export function App() {
  const [tab, setTab] = useState<ActiveTab>('today');
  const [library, setLibrary] = useState<ContentItem[]>(() => loadLibrary());
  const [vocab, setVocab] = useState<VocabCard[]>(() => loadVocab());
  const [podcasts, setPodcasts] = useState<PodcastFeed[]>(() => loadPodcastFeeds());
  const [aiConfig, setAiConfig] = useState<AiConfig>(() => loadAiConfig());
  const [updateConfig, setUpdateConfig] = useState<UpdateConfig>(() => loadUpdateConfig());
  const [feedConfig, setFeedConfig] = useState<DailyFeedConfig>(() => loadDailyFeedConfig());
  const [stats, setStats] = useState(() => loadStats());
  const [readerSettings, setReaderSettings] = useState<ReaderSettings>(() => loadReaderSettings());
  const [mirrors, setMirrors] = useState<DailyMirrorCard[]>(() => loadDailyMirrors());
  const [scenarios, setScenarios] = useState<DailyScenarioCard[]>(() => loadDailyScenarios());
  const [picks, setPicks] = useState<DailyPick[]>(() => loadDailyPicks());
  const [liveReadme, setLiveReadme] = useState<LiveReadmeData>(() => loadLiveReadme());

  const [readingItemId, setReadingItemId] = useState<string | null>(null);
  const [listeningArticle, setListeningArticle] = useState<ContentItem | null>(null);
  const [shareToast, setShareToast] = useState<string | null>(null);
  const [showReadme, setShowReadme] = useState(false);

  useEffect(() => {
    configureSpeechEngine(readerSettings.voice);
  }, [readerSettings.voice]);

  useEffect(() => {
    if (!readerSettings.showClassicTabs && (tab === 'read' || tab === 'listen')) {
      setTab('today');
    }
  }, [readerSettings.showClassicTabs, tab]);

  const readingItem = useMemo(
    () => library.find((i) => i.id === readingItemId) ?? null,
    [library, readingItemId],
  );

  const savedWordSet = useMemo(
    () => new Set(vocab.map((v) => v.word.toLowerCase())),
    [vocab],
  );

  const dueCount = useMemo(() => vocab.filter((c) => isCardDue(c)).length, [vocab]);

  const handleAddItems = useCallback((newItems: ContentItem[]) => {
    setLibrary((prev) => {
      const existing = new Set(prev.map((i) => i.id));
      const unique = newItems.filter((n) => !existing.has(n.id));
      const next = [...unique, ...prev];
      saveLibrary(next);
      return next;
    });
  }, []);

  const handleUpdateItem = (updated: ContentItem) => {
    setLibrary((prev) => {
      const next = prev.map((i) => (i.id === updated.id ? updated : i));
      saveLibrary(next);
      return next;
    });
  };

  const handleDeleteItem = (id: string) => {
    setLibrary((prev) => {
      const next = prev.filter((i) => i.id !== id);
      saveLibrary(next);
      return next;
    });
  };

  const handleMineWord = useCallback((input: Omit<VocabCard, 'id' | 'createdAt' | 'fsrs'>) => {
    setVocab((prev) => {
      if (prev.some((c) => c.word.toLowerCase() === input.word.toLowerCase())) {
        return prev;
      }
      const card: VocabCard = {
        ...input,
        id: `word-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        createdAt: Date.now(),
        fsrs: createNewFsrsCard(),
      };
      const next = [card, ...prev];
      saveVocab(next);
      return next;
    });
    setStats((prev) => recordActivity(prev, { wordsMined: 1 }));
  }, []);

  const handleImportDaily = useCallback(
    (res: {
      articles: ContentItem[];
      mirrors: DailyMirrorCard[];
      scenarios: DailyScenarioCard[];
      picks?: DailyPick[];
      readme?: LiveReadmeData;
    }) => {
      if (res.articles.length > 0) {
        setLibrary((prev) => {
          const prevMap = new Map(prev.map((a) => [a.id, a]));
          const incomingIds = new Set(res.articles.map((a) => a.id));
          const updatedIncoming = res.articles.map((a) => {
            const old = prevMap.get(a.id);
            return old ? { ...a, readProgress: old.readProgress } : a;
          });
          const merged = [...updatedIncoming, ...prev.filter((a) => !incomingIds.has(a.id))];
          saveLibrary(merged);
          return merged;
        });
      }
      if (res.mirrors.length > 0) {
        setMirrors((prev) => {
          const prevMap = new Map(prev.map((m) => [m.id, m]));
          const incomingIds = new Set(res.mirrors.map((m) => m.id));
          const updatedIncoming = res.mirrors.map((m) => {
            const old = prevMap.get(m.id);
            return old && old.userReflection ? { ...m, userReflection: old.userReflection } : m;
          });
          const merged = [...updatedIncoming, ...prev.filter((m) => !incomingIds.has(m.id))];
          saveDailyMirrors(merged);
          return merged;
        });
      }
      if (res.scenarios.length > 0) {
        setScenarios((prev) => {
          const prevMap = new Map(prev.map((s) => [s.id, s]));
          const incomingIds = new Set(res.scenarios.map((s) => s.id));
          const updatedIncoming = res.scenarios.map((s) => {
            const old = prevMap.get(s.id);
            return old ? { ...s, status: old.status, userAttempt: old.userAttempt ?? s.userAttempt } : s;
          });
          const merged = [...updatedIncoming, ...prev.filter((s) => !incomingIds.has(s.id))];
          saveDailyScenarios(merged);
          return merged;
        });
      }
      if (res.picks && res.picks.length > 0) {
        setPicks(res.picks);
        saveDailyPicks(res.picks);
      }
      if (res.readme && Array.isArray(res.readme.sections) && res.readme.sections.length > 0) {
        setLiveReadme(res.readme);
        saveLiveReadme(res.readme);
      }
    },
    [handleAddItems],
  );

  // Receive Android ACTION_SEND or keyboard ACTION_ADD_WORD incrementally
  const handleIncomingShare = useCallback(
    async (payload: SharedIncomingPayload) => {
      const text = payload.text?.trim();
      if (!text) return;

      if (payload.action === 'word') {
        const entry = await lookupWord(text).catch(() => null);
        handleMineWord({
          word: entry?.word || text,
          phonetic: entry?.phonetic,
          audioUrl: entry?.audioUrl,
          partOfSpeech: entry?.partOfSpeech,
          definition: entry?.definitions?.[0]?.definition || 'Imported via external share.',
          zhHint: entry?.zhHint,
          contextSentence: payload.context || text,
          sourceTitle: payload.source === 'keyboard' ? '语音键盘采集' : '系统分享采集',
          deck: '外部采集',
        });
        setShareToast(`已增量收词到复习：「${entry?.word || text}」`);
        setTimeout(() => setShareToast(null), 3500);
        return;
      }

      const parsed = parseIncrementalDailyContent(text, '外部分享导入');
      handleImportDaily({
        articles: parsed.articles,
        mirrors: parsed.mirrors,
        scenarios: parsed.scenarios,
        picks: parsed.picks,
        readme: parsed.readme,
      });
      if (parsed.mirrors.length > 0 || parsed.picks.length > 0) {
        setTab('today');
      } else if (parsed.articles.length > 0) {
        setReadingItemId(parsed.articles[0].id);
      } else {
        setTab('today');
      }
      setShareToast(parsed.summary);
      setTimeout(() => setShareToast(null), 3500);
    },
    [handleImportDaily, handleMineWord],
  );

  useEffect(() => {
    let cleanup = () => {};
    (async () => {
      const pending = await consumePendingShare();
      if (pending) await handleIncomingShare(pending);
      cleanup = await subscribeIncomingShare((payload) => {
        void handleIncomingShare(payload);
      });
    })();
    return () => cleanup();
  }, [handleIncomingShare]);

  const handleReviewCard = (cardId: string, grade: Grade) => {
    setVocab((prev) => {
      const next = prev.map((c) =>
        c.id === cardId ? { ...c, fsrs: reviewFsrsCard(c.fsrs, grade) } : c,
      );
      saveVocab(next);
      return next;
    });
    setStats((prev) => recordActivity(prev, { reviews: 1 }));
  };

  const handleImportDeck = (deckName: 'AI & 论文核心词' | '哲人思辨词汇' | '高阶生产力词') => {
    const existing = new Set(vocab.map((c) => c.word.toLowerCase()));
    const toAdd: VocabCard[] = STARTER_WORDS.filter(
      (w) => w.deck === deckName && !existing.has(w.word.toLowerCase()),
    ).map((w, idx) => ({
      id: `deck-${Date.now()}-${idx}`,
      word: w.word,
      phonetic: w.phonetic,
      partOfSpeech: w.partOfSpeech,
      definition: w.definition,
      zhHint: w.zhHint,
      contextSentence: w.contextSentence,
      sourceTitle: deckName,
      deck: deckName,
      createdAt: Date.now() + idx,
      fsrs: createNewFsrsCard(),
    }));

    if (toAdd.length > 0) {
      setVocab((prev) => {
        const next = [...toAdd, ...prev];
        saveVocab(next);
        return next;
      });
    }
    return toAdd.length;
  };

  const handleDeleteCard = (cardId: string) => {
    setVocab((prev) => {
      const next = prev.filter((c) => c.id !== cardId);
      saveVocab(next);
      return next;
    });
  };

  const handleUpdateMirror = (updated: DailyMirrorCard) => {
    setMirrors((prev) => {
      const next = prev.map((m) => (m.id === updated.id ? updated : m));
      saveDailyMirrors(next);
      return next;
    });
  };

  const handleUpdateScenario = (updated: DailyScenarioCard) => {
    setScenarios((prev) => {
      const next = prev.map((s) => (s.id === updated.id ? updated : s));
      saveDailyScenarios(next);
      return next;
    });
  };

  const handleUpdateSettings = (next: ReaderSettings) => {
    setReaderSettings(next);
    saveReaderSettings(next);
  };

  const handleUpdateAiConfig = (next: AiConfig) => {
    setAiConfig(next);
    saveAiConfig(next);
  };

  const handleUpdateUpdateConfig = (next: UpdateConfig) => {
    setUpdateConfig(next);
    saveUpdateConfig(next);
  };

  const handleUpdateFeedConfig = (next: DailyFeedConfig) => {
    setFeedConfig(next);
    saveDailyFeedConfig(next);
  };

  const handleAddPodcast = (feed: PodcastFeed) => {
    setPodcasts((prev) => {
      const next = [feed, ...prev];
      savePodcastFeeds(next);
      return next;
    });
  };

  const handleReloadAll = () => {
    setLibrary(loadLibrary());
    setVocab(loadVocab());
    setPodcasts(loadPodcastFeeds());
    setStats(loadStats());
    setReaderSettings(loadReaderSettings());
    setUpdateConfig(loadUpdateConfig());
    setFeedConfig(loadDailyFeedConfig());
    setMirrors(loadDailyMirrors());
    setScenarios(loadDailyScenarios());
    setPicks(loadDailyPicks());
    setLiveReadme(loadLiveReadme());
  };

  const showClassic = Boolean(readerSettings.showClassicTabs);

  const navItems: Array<{ key: ActiveTab; label: string; icon: React.ReactNode; badge?: number }> =
    showClassic
      ? [
          { key: 'today', label: '今日', icon: <Sparkles className="w-5 h-5" /> },
          { key: 'read', label: '阅读', icon: <BookOpen className="w-5 h-5" /> },
          { key: 'listen', label: '精听', icon: <Headphones className="w-5 h-5" /> },
          {
            key: 'vocab',
            label: '复习',
            icon: <Brain className="w-5 h-5" />,
            badge: dueCount > 0 ? dueCount : undefined,
          },
          { key: 'profile', label: '设置', icon: <Settings className="w-5 h-5" /> },
        ]
      : [
          { key: 'today', label: '今日', icon: <Sparkles className="w-5 h-5" /> },
          {
            key: 'vocab',
            label: '复习',
            icon: <Brain className="w-5 h-5" />,
            badge: dueCount > 0 ? dueCount : undefined,
          },
          { key: 'profile', label: '设置', icon: <Settings className="w-5 h-5" /> },
        ];

  return (
    <div className="h-full w-full flex flex-col bg-[#FAF9F6] overflow-hidden">
      {shareToast && (
        <div className="fixed top-4 left-4 right-4 z-50 max-w-md mx-auto px-4 py-2.5 rounded-2xl bg-[#1C1B18] text-[#FAF9F6] text-[13px] shadow-xl text-center">
          {shareToast}
        </div>
      )}

      <main className="flex-1 overflow-hidden">
        {tab === 'today' && (
          <TodayView
            mirrors={mirrors}
            scenarios={scenarios}
            picks={picks}
            library={library}
            savedWordSet={savedWordSet}
            readerSettings={readerSettings}
            feedConfig={feedConfig}
            onUpdateSettings={handleUpdateSettings}
            onUpdateMirror={handleUpdateMirror}
            onUpdateScenario={handleUpdateScenario}
            onImportDaily={handleImportDaily}
            onUpdateFeedConfig={handleUpdateFeedConfig}
            onUpdateFeedSynced={(iso) => handleUpdateFeedConfig({ ...feedConfig, lastSyncedAt: iso })}
            onMineWord={handleMineWord}
            onOpenArticle={(item) => setReadingItemId(item.id)}
            onOpenReadme={() => setShowReadme(true)}
            onRecordListeningSeconds={(secs) =>
              setStats((prev) => recordActivity(prev, { listeningSeconds: secs }))
            }
            onRecordScenarioDone={() =>
              setStats((prev) => recordActivity(prev, { scenariosDone: 1 }))
            }
            onRecordMirrorEcho={() =>
              setStats((prev) => recordActivity(prev, { mirrorsLogged: 1 }))
            }
          />
        )}
        {tab === 'read' && showClassic && (
          <LibraryView
            items={library}
            onSelect={(item) => setReadingItemId(item.id)}
            onAddItems={handleAddItems}
            onDeleteItem={handleDeleteItem}
          />
        )}
        {tab === 'listen' && showClassic && (
          <ListenView
            library={library}
            activeArticle={listeningArticle}
            podcastFeeds={podcasts}
            readerSettings={readerSettings}
            onUpdateSettings={handleUpdateSettings}
            onAddPodcastFeed={handleAddPodcast}
            onRecordListening={(mins) => setStats((prev) => recordActivity(prev, { listeningMins: mins }))}
          />
        )}
        {tab === 'vocab' && (
          <VocabView
            cards={vocab}
            onReviewCard={handleReviewCard}
            onImportDeck={handleImportDeck}
            onDeleteCard={handleDeleteCard}
          />
        )}
        {tab === 'profile' && (
          <ProfileView
            stats={stats}
            vocabCount={vocab.length}
            aiConfig={aiConfig}
            updateConfig={updateConfig}
            feedConfig={feedConfig}
            readerSettings={readerSettings}
            onUpdateReaderSettings={handleUpdateSettings}
            onUpdateAiConfig={handleUpdateAiConfig}
            onUpdateUpdateConfig={handleUpdateUpdateConfig}
            onUpdateFeedConfig={handleUpdateFeedConfig}
            onOpenReadme={() => setShowReadme(true)}
            onDataImported={handleReloadAll}
          />
        )}
      </main>

      {/* Radical Minimalist Bottom Navigation (3 tabs by default) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 bg-[#FAF9F6]/95 backdrop-blur-md border-t border-[#ECEAE4] pb-safe">
        <div className={`max-w-lg mx-auto grid h-15 ${showClassic ? 'grid-cols-5' : 'grid-cols-3'}`}>
          {navItems.map((n) => {
            const active = tab === n.key;
            return (
              <button
                key={n.key}
                onClick={() => setTab(n.key)}
                className={`flex flex-col items-center justify-center gap-0.5 relative transition-colors ${
                  active ? 'text-[#1C1B18]' : 'text-[#9A968C]'
                }`}
              >
                <div className="relative">
                  {n.icon}
                  {n.badge && (
                    <span className="absolute -top-1 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-amber-600 text-white text-[10px] font-semibold flex items-center justify-center">
                      {n.badge > 99 ? '99+' : n.badge}
                    </span>
                  )}
                </div>
                <span className={`text-[11px] ${active ? 'font-semibold' : 'font-normal'}`}>
                  {n.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Fullscreen Immersive Reader Overlay */}
      {readingItem && (
        <ReaderView
          item={readingItem}
          savedWordSet={savedWordSet}
          readerSettings={readerSettings}
          aiConfig={aiConfig}
          onUpdateSettings={handleUpdateSettings}
          onUpdateItem={handleUpdateItem}
          onMineWord={handleMineWord}
          onRecordReading={(words) => setStats((prev) => recordActivity(prev, { wordsRead: words }))}
          onSendToListen={(item) => {
            setListeningArticle(item);
            setReadingItemId(null);
            setTab(showClassic ? 'listen' : 'today');
          }}
          onBack={() => setReadingItemId(null)}
        />
      )}

      {/* Living Built-in README Modal */}
      {showReadme && (
        <ReadmeModal
          readme={liveReadme}
          onClose={() => setShowReadme(false)}
          onTriggerImport={() => {
            setTab('today');
            setShareToast('点击右上角「日包」，选择 Drive 中 03_outbox/daily-feed/ 的今日 JSON 即可实时更新');
            setTimeout(() => setShareToast(null), 4000);
          }}
        />
      )}
    </div>
  );
}

export default App;
