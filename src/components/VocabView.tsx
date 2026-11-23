import React, { useMemo, useState } from 'react';
import {
  Brain,
  Check,
  ChevronRight,
  Layers,
  Plus,
  Search,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import type { Grade } from 'ts-fsrs';
import { STARTER_WORDS } from '../data/starterDecks';
import {
  getCardStatusLabel,
  getSchedulingPreview,
  isCardDue,
  Rating,
} from '../services/fsrsService';
import { speakText } from '../services/nativeBridge';
import type { VocabCard } from '../types';

interface VocabViewProps {
  cards: VocabCard[];
  onReviewCard: (cardId: string, grade: Grade) => void;
  onImportDeck: (deckName: 'AI & 论文核心词' | '哲人思辨词汇' | '高阶生产力词') => number;
  onDeleteCard: (cardId: string) => void;
}

const DECK_LIST: Array<{
  name: 'AI & 论文核心词' | '哲人思辨词汇' | '高阶生产力词';
  desc: string;
}> = [
  { name: 'AI & 论文核心词', desc: '读懂 arXiv 论文与 AI 工程博客的高杠杆词' },
  { name: '哲人思辨词汇', desc: '斯多葛、认识论与英文思想原著高频词' },
  { name: '高阶生产力词', desc: '提升英文写作与深度思考表达的精准动词/形容词' },
];

function maskWordInSentence(sentence: string, word: string): string {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`\\b${escaped}[a-z]*\\b`, 'gi');
  return sentence.replace(regex, '______');
}

export const VocabView: React.FC<VocabViewProps> = ({
  cards,
  onReviewCard,
  onImportDeck,
  onDeleteCard,
}) => {
  const [inReview, setInReview] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'due' | 'mastered'>('all');
  const [toast, setToast] = useState<string | null>(null);

  const dueCards = useMemo(() => cards.filter((c) => isCardDue(c)), [cards]);
  const masteredCount = useMemo(
    () => cards.filter((c) => getCardStatusLabel(c) === '已掌握').length,
    [cards],
  );

  const filteredCards = useMemo(() => {
    return cards.filter((c) => {
      if (statusFilter === 'due' && !isCardDue(c)) return false;
      if (statusFilter === 'mastered' && getCardStatusLabel(c) !== '已掌握') return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          c.word.toLowerCase().includes(q) ||
          c.definition.toLowerCase().includes(q) ||
          (c.zhHint?.includes(q) ?? false)
        );
      }
      return true;
    });
  }, [cards, statusFilter, search]);

  const currentReviewCard = dueCards[0] ?? null;
  const preview = useMemo(
    () => (currentReviewCard ? getSchedulingPreview(currentReviewCard.fsrs) : null),
    [currentReviewCard],
  );

  const handlePronounce = (card: VocabCard) => {
    if (card.audioUrl) {
      new Audio(card.audioUrl).play().catch(() => speakText(card.word));
    } else {
      speakText(card.word);
    }
  };

  const handleGrade = (grade: Grade) => {
    if (!currentReviewCard) return;
    onReviewCard(currentReviewCard.id, grade);
    setFlipped(false);
    if (dueCards.length <= 1) {
      setInReview(false);
      setToast('今日 FSRS 复习队列已清空！');
      setTimeout(() => setToast(null), 2600);
    }
  };

  const handleImport = (deckName: 'AI & 论文核心词' | '哲人思辨词汇' | '高阶生产力词') => {
    const added = onImportDeck(deckName);
    setToast(added > 0 ? `已导入 ${added} 个「${deckName}」进入 FSRS 队列` : `「${deckName}」已全部在你的词库中`);
    setTimeout(() => setToast(null), 2600);
  };

  // Fullscreen Minimalist FSRS Review Mode
  if (inReview && currentReviewCard && preview) {
    return (
      <div className="fixed inset-0 z-40 bg-[#FAF9F6] flex flex-col">
        <header className="pt-safe px-5 pb-3 flex items-center justify-between border-b border-[#ECEAE4]">
          <button
            onClick={() => {
              setInReview(false);
              setFlipped(false);
            }}
            className="text-[14px] text-[#57544D] flex items-center gap-1"
          >
            <X className="w-5 h-5" /> 结束
          </button>
          <span className="text-[13px] font-medium text-[#78756E]">
            FSRS 科学复习 · 剩余 {dueCards.length} 词
          </span>
          <span className="w-10" />
        </header>

        <div className="flex-1 flex flex-col justify-between p-5 max-w-lg mx-auto w-full pb-8">
          <div
            onClick={() => !flipped && setFlipped(true)}
            className="flex-1 bg-white rounded-3xl border border-[#E7E4DC] p-6 flex flex-col justify-center items-center text-center shadow-xs my-2"
          >
            <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-[#F3F1EB] text-[#78756E] mb-4">
              {currentReviewCard.deck}
            </span>

            <h2 className="font-editorial text-[34px] font-semibold text-[#1C1B18] tracking-tight">
              {currentReviewCard.word}
            </h2>

            <div className="flex items-center gap-2 mt-2">
              {currentReviewCard.phonetic && (
                <span className="text-[14px] text-[#78756E]">{currentReviewCard.phonetic}</span>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handlePronounce(currentReviewCard);
                }}
                className="w-8 h-8 rounded-full bg-[#F3F1EB] flex items-center justify-center text-[#1C1B18]"
              >
                <Volume2 className="w-4 h-4" />
              </button>
            </div>

            {/* Context sentence (cloze on front, full on back) */}
            <p className="font-editorial text-[16px] leading-relaxed text-[#4A4740] mt-6 px-2">
              “
              {flipped
                ? currentReviewCard.contextSentence
                : maskWordInSentence(currentReviewCard.contextSentence, currentReviewCard.word)}
              ”
            </p>

            {flipped ? (
              <div className="mt-6 pt-5 border-t border-[#ECEAE4] w-full text-left space-y-2">
                {currentReviewCard.zhHint && (
                  <div className="text-[16px] font-semibold text-amber-800">
                    {currentReviewCard.zhHint}
                  </div>
                )}
                <p className="text-[14px] text-[#2C2A26] leading-relaxed">
                  {currentReviewCard.partOfSpeech && (
                    <span className="italic text-[#78756E] mr-1.5">
                      {currentReviewCard.partOfSpeech}
                    </span>
                  )}
                  {currentReviewCard.definition}
                </p>
                <div className="text-[11px] text-[#9A968C] pt-1">
                  出处：{currentReviewCard.sourceTitle}
                </div>
              </div>
            ) : (
              <p className="mt-8 text-[12px] text-[#A39F95]">轻点卡片查看释义与完整语境</p>
            )}
          </div>

          {!flipped ? (
            <button
              onClick={() => setFlipped(true)}
              className="w-full h-12 rounded-2xl bg-[#1C1B18] text-[#FAF9F6] text-[15px] font-medium mt-3"
            >
              显示释义
            </button>
          ) : (
            <div className="grid grid-cols-4 gap-2 mt-3">
              {(
                [
                  { g: Rating.Again as Grade, label: '忘记', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
                  { g: Rating.Hard as Grade, label: '困难', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
                  { g: Rating.Good as Grade, label: '记得', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
                  { g: Rating.Easy as Grade, label: '秒懂', cls: 'bg-sky-50 text-sky-800 border-sky-200' },
                ] as const
              ).map((btn) => (
                <button
                  key={btn.label}
                  onClick={() => handleGrade(btn.g)}
                  className={`py-2.5 rounded-xl border flex flex-col items-center justify-center active:scale-95 transition-transform ${btn.cls}`}
                >
                  <span className="text-[14px] font-semibold">{btn.label}</span>
                  <span className="text-[11px] opacity-80 mt-0.5">{preview[btn.g].label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#FAF9F6]">
      <header className="pt-safe px-5 pb-3 bg-[#FAF9F6] border-b border-[#ECEAE4]">
        <h1 className="text-[22px] font-semibold tracking-tight text-[#1C1B18]">FSRS 词库</h1>
        <p className="text-[12px] text-[#78756E] mt-0.5">语境采集 · 科学间隔重复 · 长期留存</p>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 pb-24">
        {toast && (
          <div className="px-4 py-2.5 rounded-xl bg-[#1C1B18] text-[#FAF9F6] text-[13px] flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400" /> {toast}
          </div>
        )}

        {/* Review Summary Card */}
        <section className="bg-white rounded-2xl p-5 border border-[#ECEAE4]">
          <div className="grid grid-cols-3 gap-3 text-center mb-4">
            <div>
              <div className="text-[24px] font-semibold text-[#1C1B18]">{dueCards.length}</div>
              <div className="text-[11px] text-[#8E8A80]">今日待复习</div>
            </div>
            <div>
              <div className="text-[24px] font-semibold text-[#1C1B18]">{cards.length}</div>
              <div className="text-[11px] text-[#8E8A80]">词库总计</div>
            </div>
            <div>
              <div className="text-[24px] font-semibold text-emerald-700">{masteredCount}</div>
              <div className="text-[11px] text-[#8E8A80]">长期掌握</div>
            </div>
          </div>

          <button
            onClick={() => {
              if (dueCards.length > 0) {
                setFlipped(false);
                setInReview(true);
              }
            }}
            disabled={dueCards.length === 0}
            className="w-full h-11 rounded-xl bg-[#1C1B18] text-[#FAF9F6] text-[14px] font-medium flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.99] transition-transform"
          >
            <Brain className="w-4 h-4" />
            {dueCards.length > 0 ? `开始今日 FSRS 复习 (${dueCards.length} 词)` : '今日复习已完成'}
          </button>
        </section>

        {/* Curated Capability Decks */}
        <section>
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-[13px] font-semibold text-[#57544D] flex items-center gap-1.5">
              <Layers className="w-4 h-4" /> 能力导向精选词包（免费内置）
            </h2>
          </div>
          <div className="space-y-2">
            {DECK_LIST.map((deck) => {
              const totalInDeck = STARTER_WORDS.filter((w) => w.deck === deck.name).length;
              return (
                <div
                  key={deck.name}
                  className="p-3.5 rounded-2xl bg-white border border-[#ECEAE4] flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold text-[#1C1B18]">
                      {deck.name}{' '}
                      <span className="text-[11px] font-normal text-[#8E8A80]">
                        ({totalInDeck} 词)
                      </span>
                    </div>
                    <div className="text-[12px] text-[#78756E] mt-0.5">{deck.desc}</div>
                  </div>
                  <button
                    onClick={() => handleImport(deck.name)}
                    className="shrink-0 h-8 px-3 rounded-lg bg-[#F3F1EB] text-[#1C1B18] text-[12px] font-medium flex items-center gap-1 active:bg-[#E5E2DA]"
                  >
                    <Plus className="w-3.5 h-3.5" /> 加入
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {/* Personal Vocabulary Vault */}
        <section>
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-[13px] font-semibold text-[#57544D]">我的词汇库</h2>
            <div className="flex gap-1.5">
              {(
                [
                  { k: 'all', l: '全部' },
                  { k: 'due', l: '待复习' },
                  { k: 'mastered', l: '已掌握' },
                ] as const
              ).map((f) => (
                <button
                  key={f.k}
                  onClick={() => setStatusFilter(f.k)}
                  className={`px-2.5 py-1 rounded-full text-[11px] ${
                    statusFilter === f.k
                      ? 'bg-[#1C1B18] text-white'
                      : 'bg-white border border-[#E5E2DA] text-[#6E6B64]'
                  }`}
                >
                  {f.l}
                </button>
              ))}
            </div>
          </div>

          {cards.length > 0 && (
            <div className="relative mb-3">
              <Search className="w-4 h-4 text-[#9A968C] absolute left-3 top-2.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索单词或释义…"
                className="w-full h-9 pl-9 pr-3 rounded-xl bg-white border border-[#E5E2DA] text-[13px] focus:outline-none focus:border-[#1C1B18]"
              />
            </div>
          )}

          {filteredCards.length === 0 ? (
            <div className="py-10 text-center text-[13px] text-[#8E8A80] bg-white rounded-2xl border border-[#ECEAE4]">
              {cards.length === 0
                ? '阅读时轻点任意单词即可收藏，或点击上方一键加入能力词包。'
                : '没有匹配的单词'}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredCards.map((card) => {
                const status = getCardStatusLabel(card);
                return (
                  <div
                    key={card.id}
                    className="p-3.5 rounded-2xl bg-white border border-[#ECEAE4]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-editorial text-[17px] font-semibold text-[#1C1B18]">
                          {card.word}
                        </span>
                        {card.phonetic && (
                          <span className="text-[12px] text-[#8E8A80] truncate">{card.phonetic}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#F3F1EB] text-[#57544D]">
                          {status}
                        </span>
                        <button
                          onClick={() => handlePronounce(card)}
                          className="p-1.5 text-[#57544D]"
                        >
                          <Volume2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onDeleteCard(card.id)}
                          className="p-1.5 text-[#B0ACA2] hover:text-rose-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    {card.zhHint && (
                      <div className="text-[13px] text-amber-800 font-medium mt-1">{card.zhHint}</div>
                    )}
                    <p className="text-[12px] text-[#57544D] mt-0.5 line-clamp-2">{card.definition}</p>
                    <p className="text-[11px] text-[#9A968C] mt-1.5 italic line-clamp-1 flex items-center gap-1">
                      <ChevronRight className="w-3 h-3 shrink-0" />
                      {card.contextSentence}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
