import React, { useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Cpu,
  Download,
  FileText,
  Globe,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { CURATED_RSS_FEEDS } from '../data/curatedLibrary';
import {
  downloadGutenbergBook,
  fetchArxivPapers,
  fetchRssArticles,
  importArticleFromUrl,
  searchGutenbergBooks,
} from '../services/feeds';
import type { GutenbergSearchResult } from '../services/feeds';
import { parseLocalFile } from '../services/fileParser';
import type { ContentCategory, ContentItem } from '../types';

interface LibraryViewProps {
  items: ContentItem[];
  onSelect: (item: ContentItem) => void;
  onAddItems: (newItems: ContentItem[]) => void;
  onDeleteItem: (id: string) => void;
}

const CATEGORY_TABS: Array<{ key: 'all' | ContentCategory; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'ai', label: 'AI 工具' },
  { key: 'philosophy', label: '哲人思考' },
  { key: 'book', label: '英文原著' },
  { key: 'paper', label: '论文' },
];

const CATEGORY_META: Record<ContentCategory, { label: string; color: string }> = {
  ai: { label: 'AI', color: 'bg-sky-50 text-sky-700 border-sky-200/70' },
  philosophy: { label: '哲思', color: 'bg-amber-50 text-amber-800 border-amber-200/70' },
  book: { label: '原著', color: 'bg-emerald-50 text-emerald-800 border-emerald-200/70' },
  paper: { label: '论文', color: 'bg-violet-50 text-violet-800 border-violet-200/70' },
};

export const LibraryView: React.FC<LibraryViewProps> = ({
  items,
  onSelect,
  onAddItems,
  onDeleteItem,
}) => {
  const [activeCat, setActiveCat] = useState<'all' | ContentCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  // Live fetching states
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [feedMsg, setFeedMsg] = useState<string | null>(null);

  // Import modal
  const [showImport, setShowImport] = useState(false);
  const [importTab, setImportTab] = useState<'file' | 'url' | 'text'>('file');
  const [importCategory, setImportCategory] = useState<ContentCategory>('ai');
  const [urlInput, setUrlInput] = useState('');
  const [textTitle, setTextTitle] = useState('');
  const [textBody, setTextBody] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Gutenberg Classics modal
  const [showGutenberg, setShowGutenberg] = useState(false);
  const [gutenbergQuery, setGutenbergQuery] = useState('philosophy');
  const [gutenbergResults, setGutenbergResults] = useState<GutenbergSearchResult[]>([]);
  const [gutenbergLoading, setGutenbergLoading] = useState(false);
  const [downloadingBookId, setDownloadingBookId] = useState<number | null>(null);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (activeCat !== 'all' && item.category !== activeCat) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          item.title.toLowerCase().includes(q) ||
          item.author.toLowerCase().includes(q) ||
          item.source.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [items, activeCat, searchQuery]);

  const handleFetchArxiv = async () => {
    setLoadingFeed(true);
    setFeedMsg(null);
    try {
      const papers = await fetchArxivPapers('cat:cs.AI OR cat:cs.CL OR cat:cs.LG', 10);
      onAddItems(papers);
      setFeedMsg(`已同步 ${papers.length} 篇 arXiv 最新 AI 论文`);
    } catch (e) {
      setFeedMsg((e as Error).message || 'arXiv 拉取失败，请检查网络');
    } finally {
      setLoadingFeed(false);
    }
  };

  const handleFetchRss = async (targetCat: 'ai' | 'philosophy') => {
    setLoadingFeed(true);
    setFeedMsg(null);
    try {
      const feeds = CURATED_RSS_FEEDS.filter((f) => f.category === targetCat);
      const allFetched: ContentItem[] = [];
      for (const feed of feeds) {
        try {
          const articles = await fetchRssArticles(feed.url, feed.name, feed.category);
          allFetched.push(...articles.slice(0, 5));
        } catch {
          // continue to next feed
        }
      }
      if (allFetched.length === 0) {
        setFeedMsg('暂未获取到新文章，请检查网络连接后重试');
      } else {
        onAddItems(allFetched);
        setFeedMsg(`已同步 ${allFetched.length} 篇最新${targetCat === 'ai' ? ' AI 前沿' : '哲思'}长文`);
      }
    } finally {
      setLoadingFeed(false);
    }
  };

  const handleSearchGutenberg = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setGutenbergLoading(true);
    try {
      const res = await searchGutenbergBooks(gutenbergQuery);
      setGutenbergResults(res);
    } catch (err) {
      setFeedMsg((err as Error).message);
    } finally {
      setGutenbergLoading(false);
    }
  };

  const handleDownloadBook = async (book: GutenbergSearchResult) => {
    setDownloadingBookId(book.id);
    try {
      const item = await downloadGutenbergBook(book);
      onAddItems([item]);
      setShowGutenberg(false);
      onSelect(item);
    } catch (err) {
      alert((err as Error).message || '下载原著失败');
    } finally {
      setDownloadingBookId(null);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportError(null);
    try {
      const item = await parseLocalFile(file, importCategory);
      onAddItems([item]);
      setShowImport(false);
      onSelect(item);
    } catch (err) {
      setImportError((err as Error).message || '文件解析失败');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleImportUrl = async () => {
    if (!urlInput.trim()) return;
    setImporting(true);
    setImportError(null);
    try {
      const item = await importArticleFromUrl(urlInput.trim(), importCategory);
      onAddItems([item]);
      setUrlInput('');
      setShowImport(false);
      onSelect(item);
    } catch (err) {
      setImportError((err as Error).message || '网页提取失败');
    } finally {
      setImporting(false);
    }
  };

  const handleImportText = () => {
    const paragraphs = textBody
      .replace(/\r\n/g, '\n')
      .split(/\n{2,}/)
      .map((p) => p.replace(/\s+/g, ' ').trim())
      .filter((p) => p.length >= 10);

    if (paragraphs.length === 0) {
      setImportError('请粘贴至少一段英文正文');
      return;
    }

    const words = paragraphs.join(' ').split(/\s+/).filter(Boolean).length;
    const item: ContentItem = {
      id: `text-${Date.now()}`,
      title: textTitle.trim() || paragraphs[0].slice(0, 48),
      subtitle: '手动粘贴导入',
      author: 'Personal Note',
      source: '自定义文本',
      category: importCategory,
      publishedAt: new Date().toISOString().slice(0, 10),
      paragraphs,
      readProgress: 0,
      wordCount: words,
      isUserImported: true,
      tags: ['自定义'],
    };
    onAddItems([item]);
    setTextTitle('');
    setTextBody('');
    setShowImport(false);
    onSelect(item);
  };

  return (
    <div className="flex flex-col h-full bg-[#FAF9F6]">
      {/* Minimalist Top Bar */}
      <header className="pt-safe px-5 pb-3 bg-[#FAF9F6]/95 backdrop-blur-sm border-b border-[#ECEAE4]">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight text-[#1C1B18]">LexiFlow</h1>
            <p className="text-[12px] text-[#78756E] mt-0.5">AI · 哲思 · 原著 · 论文精读</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSearch((v) => !v)}
              className="w-9 h-9 rounded-full flex items-center justify-center text-[#57544D] hover:bg-[#EFECE6] transition-colors"
              aria-label="搜索"
            >
              <Search className="w-[18px] h-[18px]" />
            </button>
            <button
              onClick={() => {
                setImportError(null);
                setShowImport(true);
              }}
              className="h-9 px-3.5 rounded-full bg-[#1C1B18] text-[#FAF9F6] text-[13px] font-medium flex items-center gap-1.5 active:scale-95 transition-transform"
            >
              <Plus className="w-4 h-4" />
              导入
            </button>
          </div>
        </div>

        {showSearch && (
          <div className="mt-3 relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索标题、作者或来源…"
              className="w-full h-10 pl-9 pr-9 rounded-xl bg-white border border-[#E5E2DA] text-[14px] text-[#1C1B18] placeholder:text-[#A39F95] focus:outline-none focus:border-[#1C1B18]"
            />
            <Search className="w-4 h-4 text-[#9A968C] absolute left-3 top-3" />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-[#9A968C]"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* Category Filter Pills */}
        <div className="flex items-center gap-2 mt-3.5 overflow-x-auto no-scrollbar pb-0.5">
          {CATEGORY_TABS.map((tab) => {
            const active = activeCat === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveCat(tab.key);
                  setFeedMsg(null);
                }}
                className={`px-3.5 py-1.5 rounded-full text-[13px] font-medium whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-[#1C1B18] text-[#FAF9F6]'
                    : 'bg-white text-[#57544D] border border-[#E7E4DC]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </header>

      {/* Scrollable Content List */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 pb-24">
        {/* Contextual Live Source Action (clean 1-line bar) */}
        {activeCat === 'ai' && (
          <button
            onClick={() => handleFetchRss('ai')}
            disabled={loadingFeed}
            className="w-full py-2.5 px-4 rounded-xl bg-white border border-[#E7E4DC] flex items-center justify-between text-[13px] text-[#3B3934] active:bg-[#F3F1EB]"
          >
            <span className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-sky-600" />
              拉取 AI 工具前沿 RSS（Simon Willison / HF）
            </span>
            {loadingFeed ? (
              <Loader2 className="w-4 h-4 animate-spin text-[#78756E]" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5 text-[#78756E]" />
            )}
          </button>
        )}

        {activeCat === 'philosophy' && (
          <button
            onClick={() => handleFetchRss('philosophy')}
            disabled={loadingFeed}
            className="w-full py-2.5 px-4 rounded-xl bg-white border border-[#E7E4DC] flex items-center justify-between text-[13px] text-[#3B3934] active:bg-[#F3F1EB]"
          >
            <span className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-600" />
              拉取哲思与心智模型 RSS（Aeon / Farnam Street）
            </span>
            {loadingFeed ? (
              <Loader2 className="w-4 h-4 animate-spin text-[#78756E]" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5 text-[#78756E]" />
            )}
          </button>
        )}

        {activeCat === 'book' && (
          <button
            onClick={() => {
              setShowGutenberg(true);
              if (gutenbergResults.length === 0) {
                handleSearchGutenberg();
              }
            }}
            className="w-full py-2.5 px-4 rounded-xl bg-white border border-[#E7E4DC] flex items-center justify-between text-[13px] text-[#3B3934] active:bg-[#F3F1EB]"
          >
            <span className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-emerald-700" />
              探索 Project Gutenberg 70,000+ 免费英文原著
            </span>
            <Search className="w-3.5 h-3.5 text-[#78756E]" />
          </button>
        )}

        {activeCat === 'paper' && (
          <button
            onClick={handleFetchArxiv}
            disabled={loadingFeed}
            className="w-full py-2.5 px-4 rounded-xl bg-white border border-[#E7E4DC] flex items-center justify-between text-[13px] text-[#3B3934] active:bg-[#F3F1EB]"
          >
            <span className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-violet-600" />
              同步 arXiv 最新 AI / LLM 论文（或点右上角导入 PDF）
            </span>
            {loadingFeed ? (
              <Loader2 className="w-4 h-4 animate-spin text-[#78756E]" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5 text-[#78756E]" />
            )}
          </button>
        )}

        {feedMsg && (
          <div className="px-3.5 py-2 rounded-lg bg-[#F2EFE9] text-[12px] text-[#57544D] flex items-center justify-between">
            <span>{feedMsg}</span>
            <button onClick={() => setFeedMsg(null)}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Editorial Cards */}
        {filteredItems.length === 0 ? (
          <div className="py-16 text-center text-[#8E8A80] text-[14px]">
            暂无匹配内容，试试切换分类或导入 PDF / EPUB / 网页。
          </div>
        ) : (
          filteredItems.map((item) => {
            const meta = CATEGORY_META[item.category];
            const readMins = Math.max(1, Math.round(item.wordCount / 180));
            return (
              <article
                key={item.id}
                onClick={() => onSelect(item)}
                className="bg-white rounded-2xl p-4 border border-[#ECEAE4] active:scale-[0.99] transition-transform cursor-pointer"
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`px-2 py-0.5 text-[11px] font-medium rounded-md border ${meta.color}`}
                    >
                      {meta.label}
                    </span>
                    <span className="text-[12px] text-[#8E8A80] truncate">{item.source}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] text-[#9A968C]">
                      {item.wordCount} 词 · {readMins}m
                    </span>
                    {item.isUserImported && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`删除《${item.title}》？`)) onDeleteItem(item.id);
                        }}
                        className="p-1 text-[#B0ACA2] hover:text-rose-600"
                        aria-label="删除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <h2 className="font-editorial text-[17px] leading-snug font-semibold text-[#1C1B18]">
                  {item.title}
                </h2>

                {item.subtitle && (
                  <p className="text-[13px] text-[#6E6B64] mt-1.5 line-clamp-2 leading-relaxed">
                    {item.subtitle}
                  </p>
                )}

                <div className="mt-3 flex items-center justify-between text-[12px] text-[#8E8A80]">
                  <span className="truncate max-w-[65%]">{item.author}</span>
                  {item.chapters && item.chapters.length > 0 ? (
                    <span>
                      第 {(item.currentChapter ?? 0) + 1}/{item.chapters.length} 章
                    </span>
                  ) : (
                    <span>{item.readProgress > 0 ? `已读 ${item.readProgress}%` : item.publishedAt}</span>
                  )}
                </div>

                {item.readProgress > 0 && (
                  <div className="mt-2 h-1 w-full bg-[#F1EFEA] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#1C1B18]/70 rounded-full"
                      style={{ width: `${Math.min(100, item.readProgress)}%` }}
                    />
                  </div>
                )}
              </article>
            );
          })
        )}
      </div>

      {/* Universal Import Modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] flex items-end justify-center">
          <div className="w-full max-w-lg bg-[#FAF9F6] rounded-t-3xl p-5 pb-8 max-h-[88vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[17px] font-semibold text-[#1C1B18]">导入英文材料</h3>
              <button
                onClick={() => setShowImport(false)}
                className="w-8 h-8 rounded-full bg-[#EFECE6] flex items-center justify-center text-[#57544D]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Mode tabs */}
            <div className="grid grid-cols-3 gap-2 p-1 bg-[#EFECE6] rounded-xl mb-4">
              {(
                [
                  { k: 'file', label: 'PDF / EPUB' },
                  { k: 'url', label: '网页链接' },
                  { k: 'text', label: '粘贴文本' },
                ] as const
              ).map((t) => (
                <button
                  key={t.k}
                  onClick={() => {
                    setImportTab(t.k);
                    setImportError(null);
                  }}
                  className={`py-2 rounded-lg text-[13px] font-medium transition-colors ${
                    importTab === t.k ? 'bg-white text-[#1C1B18] shadow-xs' : 'text-[#6E6B64]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Category selector */}
            <div className="mb-4">
              <label className="text-[12px] text-[#78756E] block mb-1.5">归入分类</label>
              <div className="flex gap-2">
                {(['ai', 'philosophy', 'book', 'paper'] as ContentCategory[]).map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setImportCategory(cat)}
                    className={`px-3 py-1.5 rounded-lg text-[12px] border ${
                      importCategory === cat
                        ? 'bg-[#1C1B18] text-white border-[#1C1B18]'
                        : 'bg-white text-[#57544D] border-[#E5E2DA]'
                    }`}
                  >
                    {CATEGORY_META[cat].label}
                  </button>
                ))}
              </div>
            </div>

            {importTab === 'file' && (
              <div className="border-2 border-dashed border-[#DDD9CE] rounded-2xl p-6 text-center bg-white">
                <Upload className="w-7 h-7 text-[#78756E] mx-auto mb-2" />
                <p className="text-[14px] font-medium text-[#1C1B18]">
                  选择本地 PDF 论文、EPUB 原著或 TXT / MD
                </p>
                <p className="text-[12px] text-[#8E8A80] mt-1">
                  本地离线解析，点词查释义并一键采集生词
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.epub,.txt,.md,application/pdf,application/epub+zip,text/plain"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importing}
                  className="mt-4 px-5 py-2.5 rounded-full bg-[#1C1B18] text-white text-[13px] font-medium inline-flex items-center gap-2"
                >
                  {importing && <Loader2 className="w-4 h-4 animate-spin" />}
                  {importing ? '正在解析文件…' : '选择文件'}
                </button>
              </div>
            )}

            {importTab === 'url' && (
              <div className="space-y-3">
                <div className="relative">
                  <Globe className="w-4 h-4 text-[#8E8A80] absolute left-3.5 top-3.5" />
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://example.com/article..."
                    className="w-full h-11 pl-10 pr-3 rounded-xl bg-white border border-[#E5E2DA] text-[14px] focus:outline-none focus:border-[#1C1B18]"
                  />
                </div>
                <button
                  onClick={handleImportUrl}
                  disabled={importing || !urlInput.trim()}
                  className="w-full h-11 rounded-xl bg-[#1C1B18] text-white text-[14px] font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {importing && <Loader2 className="w-4 h-4 animate-spin" />}
                  {importing ? '正在提取正文…' : '抓取并开始精读'}
                </button>
              </div>
            )}

            {importTab === 'text' && (
              <div className="space-y-3">
                <input
                  type="text"
                  value={textTitle}
                  onChange={(e) => setTextTitle(e.target.value)}
                  placeholder="文章 / 章节标题（可选）"
                  className="w-full h-10 px-3.5 rounded-xl bg-white border border-[#E5E2DA] text-[14px] focus:outline-none focus:border-[#1C1B18]"
                />
                <textarea
                  rows={6}
                  value={textBody}
                  onChange={(e) => setTextBody(e.target.value)}
                  placeholder="粘贴英文文章、论文段落或原著节选（空行分段）…"
                  className="w-full p-3.5 rounded-xl bg-white border border-[#E5E2DA] text-[14px] leading-relaxed focus:outline-none focus:border-[#1C1B18]"
                />
                <button
                  onClick={handleImportText}
                  className="w-full h-11 rounded-xl bg-[#1C1B18] text-white text-[14px] font-medium"
                >
                  导入并精读
                </button>
              </div>
            )}

            {importError && (
              <p className="mt-3 text-[13px] text-rose-600 bg-rose-50 px-3 py-2 rounded-lg">
                {importError}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Gutenberg Classics Explorer Modal */}
      {showGutenberg && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] flex items-end justify-center">
          <div className="w-full max-w-lg bg-[#FAF9F6] rounded-t-3xl p-5 pb-8 h-[82vh] flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-[17px] font-semibold text-[#1C1B18]">Project Gutenberg 原著库</h3>
                <p className="text-[12px] text-[#78756E]">搜索英文哲学与文学经典，免费下载入库精读</p>
              </div>
              <button
                onClick={() => setShowGutenberg(false)}
                className="w-8 h-8 rounded-full bg-[#EFECE6] flex items-center justify-center text-[#57544D]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSearchGutenberg} className="flex gap-2 mb-3">
              <input
                type="text"
                value={gutenbergQuery}
                onChange={(e) => setGutenbergQuery(e.target.value)}
                placeholder="例如：Plato, Nietzsche, Seneca, Darwin, Austen..."
                className="flex-1 h-10 px-3.5 rounded-xl bg-white border border-[#E5E2DA] text-[14px] focus:outline-none focus:border-[#1C1B18]"
              />
              <button
                type="submit"
                disabled={gutenbergLoading}
                className="px-4 h-10 rounded-xl bg-[#1C1B18] text-white text-[13px] font-medium"
              >
                搜索
              </button>
            </form>

            <div className="flex gap-1.5 mb-3 overflow-x-auto no-scrollbar">
              {['philosophy', 'stoic', 'Plato', 'Nietzsche', 'Darwin', 'Russell'].map((kw) => (
                <button
                  key={kw}
                  onClick={() => {
                    setGutenbergQuery(kw);
                    searchGutenbergBooks(kw).then(setGutenbergResults).catch(() => {});
                  }}
                  className="px-2.5 py-1 rounded-full bg-white border border-[#E5E2DA] text-[12px] text-[#57544D] whitespace-nowrap"
                >
                  {kw}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5">
              {gutenbergLoading ? (
                <div className="py-12 flex items-center justify-center text-[#78756E] gap-2 text-[14px]">
                  <Loader2 className="w-4 h-4 animate-spin" /> 正在搜索经典原著…
                </div>
              ) : (
                gutenbergResults.map((book) => (
                  <div
                    key={book.id}
                    className="p-3.5 rounded-xl bg-white border border-[#ECEAE4] flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="font-editorial text-[15px] font-semibold text-[#1C1B18] line-clamp-1">
                        {book.title}
                      </div>
                      <div className="text-[12px] text-[#78756E] truncate mt-0.5">
                        {book.authors}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDownloadBook(book)}
                      disabled={downloadingBookId === book.id}
                      className="shrink-0 h-8 px-3 rounded-lg bg-[#1C1B18] text-white text-[12px] font-medium inline-flex items-center gap-1"
                    >
                      {downloadingBookId === book.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                      导入
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
