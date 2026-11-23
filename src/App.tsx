import React, { useMemo, useState } from 'react';
import { BookOpen, Brain, Headphones, User } from 'lucide-react';
import type { Grade } from 'ts-fsrs';
import { LibraryView } from './components/LibraryView';
import { ListenView } from './components/ListenView';
import { ProfileView } from './components/ProfileView';
import { ReaderView } from './components/ReaderView';
import { VocabView } from './components/VocabView';
import { STARTER_WORDS } from './data/starterDecks';
import { createNewFsrsCard, isCardDue, reviewFsrsCard } from './services/fsrsService';
import {
  loadAiConfig,
  loadLibrary,
  loadPodcastFeeds,
  loadReaderSettings,
  loadStats,
  loadUpdateConfig,
  loadVocab,
  recordActivity,
  saveAiConfig,
  saveLibrary,
  savePodcastFeeds,
  saveReaderSettings,
  saveUpdateConfig,
  saveVocab,
} from './services/storage';
import type {
  ActiveTab,
  AiConfig,
  ContentItem,
  PodcastFeed,
  ReaderSettings,
  UpdateConfig,
  VocabCard,
} from './types';

export function App() {
  const [tab, setTab] = useState<ActiveTab>('read');
  const [library, setLibrary] = useState<ContentItem[]>(() => loadLibrary());
  const [vocab, setVocab] = useState<VocabCard[]>(() => loadVocab());
  const [podcasts, setPodcasts] = useState<PodcastFeed[]>(() => loadPodcastFeeds());
  const [aiConfig, setAiConfig] = useState<AiConfig>(() => loadAiConfig());
  const [updateConfig, setUpdateConfig] = useState<UpdateConfig>(() => loadUpdateConfig());
  const [stats, setStats] = useState(() => loadStats());
  const [readerSettings, setReaderSettings] = useState<ReaderSettings>(() => loadReaderSettings());

  const [readingItemId, setReadingItemId] = useState<string | null>(null);
  const [listeningArticle, setListeningArticle] = useState<ContentItem | null>(null);

  const readingItem = useMemo(
    () => library.find((i) => i.id === readingItemId) ?? null,
    [library, readingItemId],
  );

  const savedWordSet = useMemo(
    () => new Set(vocab.map((v) => v.word.toLowerCase())),
    [vocab],
  );

  const dueCount = useMemo(() => vocab.filter((c) => isCardDue(c)).length, [vocab]);

  const handleAddItems = (newItems: ContentItem[]) => {
    setLibrary((prev) => {
      const existing = new Set(prev.map((i) => i.id));
      const unique = newItems.filter((n) => !existing.has(n.id));
      const next = [...unique, ...prev];
      saveLibrary(next);
      return next;
    });
  };

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

  const handleMineWord = (input: Omit<VocabCard, 'id' | 'createdAt' | 'fsrs'>) => {
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
  };

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
  };

  const navItems: Array<{ key: ActiveTab; label: string; icon: React.ReactNode; badge?: number }> = [
    { key: 'read', label: '阅读', icon: <BookOpen className="w-5 h-5" /> },
    { key: 'listen', label: '精听', icon: <Headphones className="w-5 h-5" /> },
    { key: 'vocab', label: '词库', icon: <Brain className="w-5 h-5" />, badge: dueCount > 0 ? dueCount : undefined },
    { key: 'profile', label: '我的', icon: <User className="w-5 h-5" /> },
  ];

  return (
    <div className="h-full w-full flex flex-col bg-[#FAF9F6] overflow-hidden">
      <main className="flex-1 overflow-hidden">
        {tab === 'read' && (
          <LibraryView
            items={library}
            onSelect={(item) => setReadingItemId(item.id)}
            onAddItems={handleAddItems}
            onDeleteItem={handleDeleteItem}
          />
        )}
        {tab === 'listen' && (
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
            onUpdateAiConfig={handleUpdateAiConfig}
            onUpdateUpdateConfig={handleUpdateUpdateConfig}
            onDataImported={handleReloadAll}
          />
        )}
      </main>

      {/* Minimalist Bottom Navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-30 bg-[#FAF9F6]/95 backdrop-blur-md border-t border-[#ECEAE4] pb-safe">
        <div className="max-w-lg mx-auto grid grid-cols-4 h-15">
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
            setTab('listen');
          }}
          onBack={() => setReadingItemId(null)}
        />
      )}
    </div>
  );
}

export default App;
