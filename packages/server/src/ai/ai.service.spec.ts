import { BadRequestException } from '@nestjs/common';
import { AiService } from './ai.service';
import { encryptSecret } from './secrets';

type AiConfigRecord = {
  id: string;
  mode: string;
  baseUrl: string | null;
  model: string | null;
  apiKey: string | null;
  ragSourceCount: number;
  ragContextChars: number;
  ragExcerptChars: number;
  updatedAt: Date;
};

type AiConfigUpsertPayload = {
  create: {
    apiKey: string | null;
    ragSourceCount: number;
    ragContextChars: number;
    ragExcerptChars: number;
  };
};

describe('AiService', () => {
  const prisma = {
    chapter: {
      findMany: jest.fn(),
    },
    chapterChunk: {
      findMany: jest.fn(),
    },
    aiConfig: {
      findUnique: jest.fn<() => Promise<AiConfigRecord | null>>(),
      upsert:
        jest.fn<(payload: AiConfigUpsertPayload) => Promise<AiConfigRecord>>(),
    },
  };
  const contentIndex = {
    search: jest.fn(),
    semanticSearch: jest.fn(),
  };

  let service: AiService;

  beforeEach(() => {
    jest.clearAllMocks();
    contentIndex.search.mockResolvedValue([]);
    contentIndex.semanticSearch.mockResolvedValue([]);
    prisma.aiConfig.findUnique.mockResolvedValue(null);
    service = new AiService(prisma as never, contentIndex as never);
  });

  it('rejects an empty message', async () => {
    await expect(service.chat({ message: '   ' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('returns a local extractive answer with sources', async () => {
    prisma.chapterChunk.findMany
      .mockResolvedValueOnce([
        {
          id: 'chunk-1',
          content:
            'React hooks let components share stateful logic. Effects run after rendering and should be kept focused.',
          chunkIndex: 0,
          chapter: {
            id: 'chapter-1',
            bookId: 'book-1',
            title: 'Hooks',
            content:
              'React hooks let components share stateful logic. Effects run after rendering and should be kept focused.',
            book: { title: 'React Patterns' },
          },
        },
      ])
      .mockResolvedValueOnce([]);
    prisma.chapter.findMany.mockResolvedValue([]);

    const response = await service.chat({
      message: 'What are React hooks?',
      context: { bookId: 'book-1', chapterId: 'chapter-1' },
      config: { mode: 'local' },
    });

    expect(response.mode).toBe('local-extractive');
    expect(response.sources).toHaveLength(1);
    expect(response.answer).toContain('React hooks');
    expect(response.sources[0]).toMatchObject({
      id: 'chunk-1',
      bookId: 'book-1',
      chapterId: 'chapter-1',
      bookTitle: 'React Patterns',
      chapterTitle: 'Hooks',
    });
  });

  it('falls back to chapter content if chunks are not indexed yet', async () => {
    prisma.chapterChunk.findMany.mockResolvedValue([]);
    prisma.chapter.findMany.mockResolvedValue([
      {
        id: 'chapter-1',
        bookId: 'book-1',
        title: 'Hooks',
        content:
          'React hooks let components share stateful logic. Effects run after rendering and should be kept focused.',
        book: { title: 'React Patterns' },
      },
    ]);

    const response = await service.chat({
      message: 'What are React hooks?',
      context: { bookId: 'book-1', chapterId: 'chapter-1' },
      config: { mode: 'local' },
    });

    expect(response.mode).toBe('local-extractive');
    expect(response.sources).toHaveLength(1);
    expect(response.answer).toContain('React hooks');
    expect(response.sources[0]).toMatchObject({
      bookId: 'book-1',
      chapterId: 'chapter-1',
      bookTitle: 'React Patterns',
      chapterTitle: 'Hooks',
    });
  });

  it('uses indexed content search when available', async () => {
    prisma.chapterChunk.findMany.mockResolvedValue([]);
    prisma.chapter.findMany.mockResolvedValue([]);
    contentIndex.search.mockResolvedValue([
      {
        chunkId: 'chunk-1',
        bookId: 'book-1',
        chapterId: 'chapter-1',
        bookTitle: 'React Patterns',
        chapterTitle: 'Hooks',
        content: 'React hooks let components share stateful logic.',
        excerpt: 'React hooks let components share stateful logic.',
        highlightedExcerpt:
          '<mark>React</mark> hooks let components share stateful logic.',
        score: 30,
      },
    ]);

    const response = await service.chat({
      message: 'React hooks',
      context: { bookId: 'book-1' },
      config: { mode: 'local' },
    });

    expect(contentIndex.search).toHaveBeenCalledWith(
      expect.stringContaining('react hooks'),
      expect.objectContaining({
        bookId: 'book-1',
        limit: 250,
        mode: 'and',
      }),
    );
    expect(contentIndex.search).toHaveBeenCalledWith(
      expect.stringContaining('react hooks'),
      expect.objectContaining({
        bookId: 'book-1',
        limit: 250,
        mode: 'or',
      }),
    );
    expect(prisma.chapterChunk.findMany).not.toHaveBeenCalled();
    expect(response.sources[0]).toMatchObject({
      id: 'chunk-1',
      bookId: 'book-1',
      chapterId: 'chapter-1',
      bookTitle: 'React Patterns',
      chapterTitle: 'Hooks',
    });
  });

  it('filters noisy Chinese question characters from indexed retrieval', async () => {
    prisma.chapterChunk.findMany.mockResolvedValue([]);
    prisma.chapter.findMany.mockResolvedValue([]);
    contentIndex.search.mockResolvedValue([
      {
        chunkId: 'chunk-1',
        bookId: 'book-1',
        chapterId: 'chapter-1',
        bookTitle: 'React Patterns',
        chapterTitle: 'Hooks 原理',
        content: 'React hooks are implemented through a linked list.',
        excerpt: 'React hooks are implemented through a linked list.',
        highlightedExcerpt:
          'React hooks are implemented through a linked list.',
        score: 30,
      },
    ]);

    await service.chat({
      message: 'React Hooks 的核心原理是什么？',
      context: { bookId: 'book-1' },
      config: { mode: 'local' },
    });

    expect(contentIndex.search).toHaveBeenNthCalledWith(
      1,
      'react hooks',
      expect.objectContaining({ mode: 'and' }),
    );
  });

  it('limits sources and excerpts from RAG runtime config', async () => {
    prisma.chapterChunk.findMany.mockResolvedValue([]);
    prisma.chapter.findMany.mockResolvedValue([]);
    const longContent =
      'React hooks let components share stateful logic across multiple focused examples. '.repeat(
        8,
      );
    contentIndex.search.mockResolvedValue(
      Array.from({ length: 4 }, (_, index) => ({
        chunkId: `chunk-${index + 1}`,
        bookId: 'book-1',
        chapterId: `chapter-${index + 1}`,
        bookTitle: 'React Patterns',
        chapterTitle: `Hooks ${index + 1}`,
        content: longContent,
        excerpt: longContent,
        highlightedExcerpt: longContent,
        score: 30 - index,
      })),
    );

    const response = await service.chat({
      message: 'React hooks',
      context: { bookId: 'book-1' },
      config: {
        mode: 'local',
        ragSourceCount: 2,
        ragExcerptChars: 240,
      },
    });

    expect(response.sources).toHaveLength(2);
    expect(response.sources[0].excerpt.length).toBeLessThanOrEqual(240);
  });

  it('persists bounded RAG settings with encrypted API keys', async () => {
    const updatedAt = new Date('2026-06-26T00:00:00.000Z');
    let capturedPayload: AiConfigUpsertPayload | undefined;
    prisma.aiConfig.upsert.mockImplementation(
      (payload: AiConfigUpsertPayload) => {
        capturedPayload = payload;
        return Promise.resolve({
          id: 'default',
          mode: 'openai-compatible',
          baseUrl: 'https://api.example.com/v1',
          model: 'gpt-test',
          apiKey: encryptSecret('sk-test'),
          ragSourceCount: 10,
          ragContextChars: 4000,
          ragExcerptChars: 900,
          updatedAt,
        });
      },
    );

    await expect(
      service.updateConfig({
        mode: 'openai-compatible',
        baseUrl: 'https://api.example.com/v1',
        model: 'gpt-test',
        apiKey: 'sk-test',
        ragSourceCount: 99,
        ragContextChars: 100,
        ragExcerptChars: 9999,
      }),
    ).resolves.toMatchObject({
      mode: 'openai-compatible',
      apiKey: 'sk-test',
      ragSourceCount: 10,
      ragContextChars: 4000,
      ragExcerptChars: 900,
      updatedAt,
    });

    expect(capturedPayload).toBeDefined();
    expect(capturedPayload?.create.apiKey).toMatch(/^enc:v1:/);
    expect(capturedPayload?.create.ragSourceCount).toBe(10);
    expect(capturedPayload?.create.ragContextChars).toBe(4000);
    expect(capturedPayload?.create.ragExcerptChars).toBe(900);
  });

  it('streams local answers with sources and a final response', async () => {
    prisma.chapterChunk.findMany.mockResolvedValue([]);
    prisma.chapter.findMany.mockResolvedValue([]);
    contentIndex.search.mockResolvedValue([
      {
        chunkId: 'chunk-1',
        bookId: 'book-1',
        chapterId: 'chapter-1',
        bookTitle: 'React Patterns',
        chapterTitle: 'Hooks',
        content: 'React hooks let components share stateful logic.',
        excerpt: 'React hooks let components share stateful logic.',
        highlightedExcerpt:
          '<mark>React</mark> hooks let components share stateful logic.',
        score: 30,
      },
    ]);

    const events = [];
    for await (const event of service.streamChat({
      message: 'React hooks',
      context: { bookId: 'book-1' },
      config: { mode: 'local' },
    })) {
      events.push(event);
    }

    expect(events[0]).toMatchObject({
      type: 'meta',
      sources: [expect.objectContaining({ chapterTitle: 'Hooks' })],
      mode: 'local-extractive',
    });
    expect(events.some((event) => event.type === 'delta')).toBe(true);
    expect(events.at(-1)).toMatchObject({
      type: 'done',
      response: {
        mode: 'local-extractive',
        sources: [expect.objectContaining({ chapterTitle: 'Hooks' })],
      },
    });
  });
});
