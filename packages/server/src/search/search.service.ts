import { Injectable } from '@nestjs/common';
import type {
  SearchIndexStatus,
  SearchResult,
  SearchResultType,
} from '@moxu/shared';
import {
  ContentIndexService,
  ContentSearchResult,
  SemanticSearchResult,
  createHighlightedSnippet,
} from '../content/content-index.service';
import { PrismaService } from '../prisma/prisma.service';

const MAX_RESULTS = 50;
const CONTENT_FETCH_LIMIT = 80;
const SEARCH_TYPES: SearchResultType[] = ['all', 'book', 'chapter', 'content'];
const RESULT_TYPE_PRIORITY: Record<SearchResult['type'], number> = {
  book: 3,
  chapter: 2,
  content: 1,
};

type BookSearchRecord = {
  id: string;
  title: string;
  description?: string | null;
  tags?: string | null;
  chapters: Array<{
    id: string;
    isRead: boolean;
  }>;
};

type ChapterSearchRecord = {
  id: string;
  bookId: string;
  title: string;
  fileName: string;
  book: {
    title: string;
  };
};

type QueryAnalysis = {
  raw: string;
  normalized: string;
  terms: string[];
  weightedTerms: Array<{
    value: string;
    weight: number;
  }>;
};

@Injectable()
export class SearchService {
  constructor(
    private prisma: PrismaService,
    private contentIndex: ContentIndexService,
  ) {}

  getIndexStatus(): Promise<SearchIndexStatus> {
    return this.contentIndex.getStatus();
  }

  async search(
    query: string,
    bookId?: string,
    type: SearchResultType = 'all',
  ): Promise<SearchResult[]> {
    const keyword = query.trim();
    if (!keyword) {
      return [];
    }

    const resultType = SEARCH_TYPES.includes(type) ? type : 'all';
    const analysis = analyzeQuery(keyword);
    if (!analysis.terms.length) {
      return [];
    }

    const [books, chapters, ftsResults] = await Promise.all([
      this.searchBooks(analysis, bookId, resultType),
      this.searchChapters(analysis, bookId, resultType),
      this.searchFtsContent(analysis, bookId, resultType),
    ]);
    const semanticResults =
      books.length === 0 && chapters.length === 0 && ftsResults.length === 0
        ? await this.searchSemanticContent(analysis, bookId, resultType)
        : [];
    const chunks = mergeContentResults(
      analysis,
      ftsResults,
      semanticResults,
    ).slice(0, MAX_RESULTS);

    const bookResults: SearchResult[] = books.map((book) => ({
      id: book.id,
      type: 'book' as const,
      title: book.title,
      content: `${book.chapters.filter((chapter) => chapter.isRead).length}/${book.chapters.length} 章已读`,
      score:
        scoreText(book.title, analysis) * 1.9 +
        scoreText(book.description ?? '', analysis) * 0.45 +
        scoreText(book.tags ?? '', analysis) * 0.55 +
        36,
      bookId: book.id,
      bookTitle: book.title,
    }));

    const chapterResults: SearchResult[] = chapters.map((chapter) => {
      const titleScore = scoreText(chapter.title, analysis);
      const fileNameScore = scoreText(chapter.fileName, analysis);
      const bookTitleScore = scoreText(chapter.book.title, analysis);

      return {
        id: chapter.id,
        type: 'chapter' as const,
        title: chapter.title,
        content: chapter.fileName,
        score:
          titleScore * 1.55 + fileNameScore * 0.42 + bookTitleScore * 0.3 + 24,
        bookId: chapter.bookId,
        chapterId: chapter.id,
        bookTitle: chapter.book.title,
      };
    });

    const contentResults: SearchResult[] = chunks.map((chunk) => ({
      id: chunk.chunkId,
      type: 'content' as const,
      title: chunk.chapterTitle,
      content: chunk.excerpt,
      highlightedContent: chunk.highlightedExcerpt,
      score: chunk.score,
      bookId: chunk.bookId,
      chapterId: chunk.chapterId,
      bookTitle: chunk.bookTitle,
    }));

    return [...bookResults, ...chapterResults, ...contentResults]
      .sort(
        (left, right) =>
          right.score - left.score ||
          RESULT_TYPE_PRIORITY[right.type] - RESULT_TYPE_PRIORITY[left.type] ||
          left.title.localeCompare(right.title),
      )
      .slice(0, MAX_RESULTS);
  }

  private searchBooks(
    analysis: QueryAnalysis,
    bookId: string | undefined,
    resultType: SearchResultType,
  ): Promise<BookSearchRecord[]> {
    if (resultType !== 'all' && resultType !== 'book') {
      return Promise.resolve([]);
    }

    return this.prisma.book.findMany({
      where: {
        ...(bookId ? { id: bookId } : {}),
        OR: buildBookWhere(analysis),
      },
      include: {
        chapters: {
          select: { id: true, isRead: true },
          orderBy: { fileName: 'asc' },
        },
      },
      take: MAX_RESULTS,
    });
  }

  private searchChapters(
    analysis: QueryAnalysis,
    bookId: string | undefined,
    resultType: SearchResultType,
  ): Promise<ChapterSearchRecord[]> {
    if (resultType !== 'all' && resultType !== 'chapter') {
      return Promise.resolve([]);
    }

    return this.prisma.chapter.findMany({
      where: {
        ...(bookId ? { bookId } : {}),
        OR: buildChapterWhere(analysis),
      },
      select: {
        id: true,
        bookId: true,
        title: true,
        fileName: true,
        book: {
          select: {
            title: true,
          },
        },
      },
      orderBy: [{ orderIndex: 'asc' }, { fileName: 'asc' }],
      take: MAX_RESULTS,
    });
  }

  private searchFtsContent(
    analysis: QueryAnalysis,
    bookId: string | undefined,
    resultType: SearchResultType,
  ): Promise<ContentSearchResult[]> {
    if (resultType !== 'all' && resultType !== 'content') {
      return Promise.resolve([]);
    }

    return this.contentIndex.search(analysis.raw, {
      bookId,
      limit: CONTENT_FETCH_LIMIT,
    });
  }

  private searchSemanticContent(
    analysis: QueryAnalysis,
    bookId: string | undefined,
    resultType: SearchResultType,
  ): Promise<SemanticSearchResult[]> {
    if (resultType !== 'all' && resultType !== 'content') {
      return Promise.resolve([]);
    }

    return this.contentIndex
      .semanticSearch(analysis.raw, {
        bookId,
        limit: Math.min(24, CONTENT_FETCH_LIMIT),
      })
      .catch(() => [] as SemanticSearchResult[]);
  }
}

function analyzeQuery(query: string): QueryAnalysis {
  const raw = query.trim();
  const normalized = normalizeForSearch(raw);
  const compactQuery = normalized.replace(/\s+/g, '');
  const latinTerms = normalized.match(/[a-z0-9][a-z0-9_-]*/g) ?? [];
  const cjkPhrases = Array.from(
    normalized.matchAll(/[\u4e00-\u9fff]{2,}/g),
    (match) => match[0],
  );
  const cjkChars = Array.from(
    normalized.matchAll(/[\u4e00-\u9fff]/g),
    (match) => match[0],
  );
  const cjkBigrams = cjkPhrases.flatMap((phrase) => {
    const grams: string[] = [];
    for (let index = 0; index < phrase.length - 1; index += 1) {
      grams.push(phrase.slice(index, index + 2));
    }
    return grams;
  });
  const terms = uniqueTerms([
    compactQuery,
    ...latinTerms,
    ...cjkPhrases,
    ...cjkBigrams,
    ...cjkChars,
  ]).filter((term) => term.length > 0);

  return {
    raw,
    normalized,
    terms,
    weightedTerms: terms.map((term) => ({
      value: term,
      weight:
        /[\u4e00-\u9fff]/.test(term) && term.length === 1
          ? 0.55
          : term.length >= 4
            ? 1.6
            : 1,
    })),
  };
}

function buildBookWhere(analysis: QueryAnalysis) {
  return analysis.terms.flatMap((term) => [
    { title: { contains: term } },
    { description: { contains: term } },
    { tags: { contains: term } },
  ]);
}

function buildChapterWhere(analysis: QueryAnalysis) {
  return analysis.terms.flatMap((term) => [
    { title: { contains: term } },
    { fileName: { contains: term } },
    {
      book: {
        title: { contains: term },
      },
    },
  ]);
}

function mergeContentResults(
  analysis: QueryAnalysis,
  ftsResults: ContentSearchResult[],
  semanticResults: SemanticSearchResult[],
) {
  const merged = new Map<string, ContentSearchResult>();

  for (const result of ftsResults) {
    const lexicalBoost =
      scoreText(result.chapterTitle, analysis) * 0.72 +
      scoreText(result.content, analysis) * 0.42;
    merged.set(result.chunkId, {
      ...result,
      score: Math.round(result.score + lexicalBoost + 18),
    });
  }

  for (const result of semanticResults) {
    const existing = merged.get(result.chunkId);
    const snippet = createHighlightedSnippet(result.content, analysis.raw);
    const semanticBoost = Math.round(result.score * 1.65);
    const lexicalBoost =
      scoreText(result.chapterTitle, analysis) * 0.55 +
      scoreText(result.content, analysis) * 0.26;

    merged.set(result.chunkId, {
      chunkId: result.chunkId,
      bookId: result.bookId,
      chapterId: result.chapterId,
      bookTitle: result.bookTitle,
      chapterTitle: result.chapterTitle,
      content: result.content,
      excerpt: existing?.excerpt ?? snippet.text,
      highlightedExcerpt: existing?.highlightedExcerpt ?? snippet.html,
      score: Math.round((existing?.score ?? 0) + semanticBoost + lexicalBoost),
    });
  }

  return Array.from(merged.values()).sort(
    (left, right) =>
      right.score - left.score ||
      left.chapterTitle.localeCompare(right.chapterTitle),
  );
}

function scoreText(text: string, analysis: QueryAnalysis) {
  const normalizedText = normalizeForSearch(text);
  if (!normalizedText || !analysis.normalized) {
    return 0;
  }

  const compactText = normalizedText.replace(/\s+/g, '');
  const compactQuery = analysis.normalized.replace(/\s+/g, '');
  let score = 0;

  if (compactText === compactQuery) {
    score += 240;
  } else if (compactText.startsWith(compactQuery)) {
    score += 170;
  } else if (compactText.includes(compactQuery)) {
    score += 132;
  }

  let matchedWeight = 0;
  const totalWeight = analysis.weightedTerms.reduce(
    (total, term) => total + term.weight,
    0,
  );

  for (const term of analysis.weightedTerms) {
    if (compactText.includes(term.value)) {
      matchedWeight += term.weight;
      score += 22 * term.weight;
    }
  }

  if (totalWeight > 0) {
    score += (matchedWeight / totalWeight) * 86;
  }

  return Math.round(score);
}

function normalizeForSearch(text: string) {
  return text.trim().toLowerCase();
}

function uniqueTerms(terms: string[]) {
  return Array.from(new Set(terms.map((term) => term.trim().toLowerCase())));
}
