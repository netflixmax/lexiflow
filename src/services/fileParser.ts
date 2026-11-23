import JSZip from 'jszip';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { BookChapter, ContentCategory, ContentItem } from '../types';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

function countWords(paragraphs: string[]): number {
  return paragraphs.join(' ').trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Parse local .pdf, .epub, .txt, or .md files into a LexiFlow ContentItem.
 */
export async function parseLocalFile(file: File, preferredCategory?: ContentCategory): Promise<ContentItem> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.pdf')) {
    return parsePdfFile(file, preferredCategory ?? 'paper');
  }
  if (lower.endsWith('.epub')) {
    return parseEpubFile(file, preferredCategory ?? 'book');
  }
  return parsePlainTextFile(file, preferredCategory ?? 'book');
}

async function parsePdfFile(file: File, category: ContentCategory): Promise<ContentItem> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const maxPages = Math.min(pdf.numPages, 40);
  const chapters: BookChapter[] = [];

  for (let p = 1; p <= maxPages; p++) {
    const page = await pdf.getPage(p);
    const textContent = await page.getTextContent();
    const lines: string[] = [];
    let currentLine = '';
    let lastY: number | null = null;

    for (const item of textContent.items) {
      if (!('str' in item)) continue;
      const y = Math.round((item.transform?.[5] as number) ?? 0);
      if (lastY !== null && Math.abs(y - lastY) > 6) {
        if (currentLine.trim()) lines.push(currentLine.trim());
        currentLine = item.str;
      } else {
        currentLine += (currentLine && !currentLine.endsWith('-') ? ' ' : '') + item.str;
      }
      lastY = y;
    }
    if (currentLine.trim()) lines.push(currentLine.trim());

    // Merge short broken lines into clean paragraphs
    const paragraphs: string[] = [];
    let buf = '';
    for (const line of lines) {
      if (!buf) {
        buf = line;
      } else if (buf.endsWith('-')) {
        buf = buf.slice(0, -1) + line;
      } else if (buf.length < 280 && !/[.!?。]$/.test(buf)) {
        buf = `${buf} ${line}`;
      } else {
        paragraphs.push(buf);
        buf = line;
      }
    }
    if (buf) paragraphs.push(buf);

    const cleaned = paragraphs.filter((s) => s.length >= 12);
    if (cleaned.length > 0) {
      chapters.push({
        title: `Page ${p}`,
        paragraphs: cleaned,
      });
    }
  }

  if (chapters.length === 0) {
    throw new Error('未能从该 PDF 提取到文本（可能是扫描图片版 PDF）。');
  }

  const totalWords = chapters.reduce((sum, c) => sum + countWords(c.paragraphs), 0);
  const cleanTitle = file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim();

  return {
    id: `pdf-${Date.now()}`,
    title: cleanTitle,
    subtitle: `PDF 导入 · 共解析 ${chapters.length} 页${pdf.numPages > maxPages ? `（原文件 ${pdf.numPages} 页）` : ''}`,
    author: 'Local PDF',
    source: 'PDF Paper',
    category,
    publishedAt: new Date().toISOString().slice(0, 10),
    paragraphs: [],
    chapters,
    currentChapter: 0,
    readProgress: 0,
    wordCount: totalWords,
    isUserImported: true,
    tags: ['PDF', '本地导入'],
  };
}

async function parseEpubFile(file: File, category: ContentCategory): Promise<ContentItem> {
  const zip = await JSZip.loadAsync(file);

  // Locate container.xml -> OPF path
  let opfPath = '';
  const containerFile = zip.file('META-INF/container.xml');
  if (containerFile) {
    const containerXml = await containerFile.async('text');
    const match = containerXml.match(/full-path="([^"]+)"/i);
    if (match) opfPath = match[1];
  }

  const baseDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
  let bookTitle = file.name.replace(/\.epub$/i, '');
  let bookAuthor = 'Local EPUB';
  const htmlPaths: string[] = [];

  if (opfPath && zip.file(opfPath)) {
    const opfXml = await zip.file(opfPath)!.async('text');
    const doc = new DOMParser().parseFromString(opfXml, 'application/xml');
    bookTitle = doc.querySelector('title')?.textContent?.trim() || bookTitle;
    bookAuthor = doc.querySelector('creator')?.textContent?.trim() || bookAuthor;

    const manifestMap = new Map<string, string>();
    doc.querySelectorAll('manifest > item').forEach((item) => {
      const id = item.getAttribute('id');
      const href = item.getAttribute('href');
      if (id && href) manifestMap.set(id, href);
    });

    doc.querySelectorAll('spine > itemref').forEach((ref) => {
      const idref = ref.getAttribute('idref');
      const href = idref ? manifestMap.get(idref) : undefined;
      if (href) htmlPaths.push(baseDir + decodeURIComponent(href));
    });
  }

  // Fallback if OPF spine was missing
  if (htmlPaths.length === 0) {
    zip.forEach((relativePath) => {
      if (/\.(xhtml|html|htm)$/i.test(relativePath) && !relativePath.includes('nav')) {
        htmlPaths.push(relativePath);
      }
    });
    htmlPaths.sort();
  }

  const chapters: BookChapter[] = [];
  const parser = new DOMParser();

  for (const path of htmlPaths.slice(0, 40)) {
    const entry = zip.file(path);
    if (!entry) continue;
    const html = await entry.async('text');
    const doc = parser.parseFromString(html, 'text/html');
    const heading =
      doc.querySelector('h1, h2, h3, title')?.textContent?.replace(/\s+/g, ' ').trim() ||
      `Chapter ${chapters.length + 1}`;
    const paragraphs = Array.from(doc.querySelectorAll('p, blockquote'))
      .map((p) => (p.textContent ?? '').replace(/\s+/g, ' ').trim())
      .filter((t) => t.length >= 15);

    if (paragraphs.length > 0) {
      chapters.push({
        title: heading.slice(0, 60),
        paragraphs,
      });
    }
  }

  if (chapters.length === 0) {
    throw new Error('未能从该 EPUB 文件中解析出章节正文。');
  }

  const totalWords = chapters.reduce((sum, c) => sum + countWords(c.paragraphs), 0);

  return {
    id: `epub-${Date.now()}`,
    title: bookTitle,
    subtitle: `${bookAuthor} · EPUB 原著（${chapters.length} 章）`,
    author: bookAuthor,
    source: 'EPUB Book',
    category,
    publishedAt: new Date().toISOString().slice(0, 10),
    paragraphs: [],
    chapters,
    currentChapter: 0,
    readProgress: 0,
    wordCount: totalWords,
    isUserImported: true,
    tags: ['EPUB', '原著'],
  };
}

async function parsePlainTextFile(file: File, category: ContentCategory): Promise<ContentItem> {
  const text = await file.text();
  const paragraphs = text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length >= 10);

  if (paragraphs.length === 0) {
    throw new Error('文件内容为空');
  }

  const cleanTitle = file.name.replace(/\.(txt|md|markdown)$/i, '').trim();
  return {
    id: `txt-${Date.now()}`,
    title: cleanTitle,
    subtitle: '本地文本导入',
    author: 'Local File',
    source: 'Text Import',
    category,
    publishedAt: new Date().toISOString().slice(0, 10),
    paragraphs: paragraphs.slice(0, 250),
    readProgress: 0,
    wordCount: countWords(paragraphs.slice(0, 250)),
    isUserImported: true,
    tags: ['本地导入'],
  };
}
