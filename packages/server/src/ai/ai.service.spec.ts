import { BadRequestException } from '@nestjs/common';
import type { AiChatStreamEvent } from '@moxu/shared';
import { AiService } from './ai.service';
import { encryptSecret } from './secrets';

type AiConfigRecord = {
  id: string;
  mode: string;
  baseUrl: string | null;
  model: string | null;
  apiKey: string | null;
  embeddingProvider: string;
  embeddingModel: string | null;
  ragSourceCount: number;
  ragContextChars: number;
  ragExcerptChars: number;
  updatedAt: Date;
};

type AiConfigUpsertPayload = {
  update: {
    apiKey?: string | null;
  };
  create: {
    apiKey: string | null;
    embeddingProvider: string;
    embeddingModel: string | null;
    ragSourceCount: number;
    ragContextChars: number;
    ragExcerptChars: number;
  };
};

type AiConfigUpdatePayload = {
  where: { id: string };
  data: { apiKey: string | null };
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
      findUnique: jest.fn<Promise<AiConfigRecord | null>, []>(),
      upsert: jest.fn<Promise<AiConfigRecord>, [AiConfigUpsertPayload]>(),
      update: jest.fn<Promise<AiConfigRecord>, [AiConfigUpdatePayload]>(),
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
    contentIndex.semanticSearch.mockImplementation(
      () => new Promise<never>(() => undefined),
    );

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
    expect(contentIndex.semanticSearch).not.toHaveBeenCalled();
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

  it('passes bounded conversation history to OpenAI-compatible chat', async () => {
    prisma.chapterChunk.findMany.mockResolvedValue([]);
    prisma.chapter.findMany.mockResolvedValue([]);
    contentIndex.search.mockResolvedValue([
      {
        chunkId: 'chunk-1',
        bookId: 'book-1',
        chapterId: 'chapter-1',
        bookTitle: 'React Patterns',
        chapterTitle: 'Hooks',
        content: 'Effects run after rendering and should be kept focused.',
        excerpt: 'Effects run after rendering and should be kept focused.',
        highlightedExcerpt:
          'Effects run after rendering and should be kept focused.',
        score: 30,
      },
    ]);
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [
            { message: { content: 'Use effects for side effects. [1]' } },
          ],
        }),
    } as Response);

    const response = await service.chat({
      message: 'And effects?',
      context: { bookId: 'book-1' },
      history: [
        { role: 'user', content: 'What are hooks?' },
        { role: 'assistant', content: 'Hooks share stateful logic.' },
      ],
      config: {
        mode: 'openai-compatible',
        baseUrl: 'https://api.example.com/v1',
        model: 'gpt-test',
        apiKey: 'sk-test',
      },
    });

    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    ) as { messages: Array<{ role: string; content: string }> };
    expect((fetchMock.mock.calls[0][1] as RequestInit).signal).toBeInstanceOf(
      AbortSignal,
    );

    expect(response.mode).toBe('openai-compatible');
    expect(body.messages).toEqual(
      expect.arrayContaining([
        { role: 'user', content: 'What are hooks?' },
        { role: 'assistant', content: 'Hooks share stateful logic.' },
      ]),
    );
    expect(body.messages.at(-1)?.content).toContain('Question:\nAnd effects?');
    expect(body.messages.at(-1)?.content).toContain('Context:');

    fetchMock.mockRestore();
  });

  it('rejects unsafe OpenAI-compatible base URL schemes', async () => {
    await expect(
      service.updateConfig({
        mode: 'openai-compatible',
        baseUrl: 'file:///tmp/model',
        model: 'gpt-test',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.aiConfig.upsert).not.toHaveBeenCalled();
  });

  it('rotates legacy API key encryption when loading config', async () => {
    const originalSecret = process.env.AI_CONFIG_SECRET;
    const originalDatabaseUrl = process.env.DATABASE_URL;

    try {
      delete process.env.AI_CONFIG_SECRET;
      process.env.DATABASE_URL = 'file:/legacy/moxu.db';
      const legacyApiKey = encryptSecret('sk-legacy');
      const saved: AiConfigRecord = {
        id: 'default',
        mode: 'openai-compatible',
        baseUrl: 'https://api.example.com/v1',
        model: 'gpt-test',
        apiKey: legacyApiKey,
        embeddingProvider: 'local',
        embeddingModel: null,
        ragSourceCount: 5,
        ragContextChars: 12000,
        ragExcerptChars: 520,
        updatedAt: new Date('2026-08-08T00:00:00.000Z'),
      };

      process.env.AI_CONFIG_SECRET = 'desktop-random-secret';
      prisma.aiConfig.findUnique.mockResolvedValue(saved);
      prisma.aiConfig.update.mockImplementation(({ data }) =>
        Promise.resolve({ ...saved, apiKey: data.apiKey }),
      );

      const config = await service.getConfig();
      expect(config).toMatchObject({
        hasApiKey: true,
        maskedApiKey: '••••gacy',
      });
      expect(config).not.toHaveProperty('apiKey');

      const update = prisma.aiConfig.update.mock.calls[0]?.[0];
      expect(update?.data.apiKey).toMatch(/^enc:v1:/);
      expect(update?.data.apiKey).not.toBe(legacyApiKey);
    } finally {
      if (originalSecret === undefined) {
        delete process.env.AI_CONFIG_SECRET;
      } else {
        process.env.AI_CONFIG_SECRET = originalSecret;
      }
      if (originalDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = originalDatabaseUrl;
      }
    }
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
          embeddingProvider: 'openai-compatible',
          embeddingModel: 'text-embedding-3-small',
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
        embeddingProvider: 'openai-compatible',
        embeddingModel: 'text-embedding-3-small',
        ragSourceCount: 99,
        ragContextChars: 100,
        ragExcerptChars: 9999,
      }),
    ).resolves.toMatchObject({
      mode: 'openai-compatible',
      hasApiKey: true,
      maskedApiKey: '••••test',
      embeddingProvider: 'openai-compatible',
      embeddingModel: 'text-embedding-3-small',
      ragSourceCount: 10,
      ragContextChars: 4000,
      ragExcerptChars: 900,
      updatedAt,
    });

    expect(capturedPayload).toBeDefined();
    expect(capturedPayload?.create.apiKey).toMatch(/^enc:v1:/);
    expect(capturedPayload?.create.embeddingProvider).toBe('openai-compatible');
    expect(capturedPayload?.create.embeddingModel).toBe(
      'text-embedding-3-small',
    );
    expect(capturedPayload?.create.ragSourceCount).toBe(10);
    expect(capturedPayload?.create.ragContextChars).toBe(4000);
    expect(capturedPayload?.create.ragExcerptChars).toBe(900);
  });

  it('keeps an existing API key when an update omits or empties it', async () => {
    const saved: AiConfigRecord = {
      id: 'default',
      mode: 'openai-compatible',
      baseUrl: 'https://api.example.com/v1',
      model: 'gpt-test',
      apiKey: encryptSecret('sk-existing'),
      embeddingProvider: 'local',
      embeddingModel: null,
      ragSourceCount: 5,
      ragContextChars: 12000,
      ragExcerptChars: 520,
      updatedAt: new Date('2026-08-08T00:00:00.000Z'),
    };
    prisma.aiConfig.findUnique.mockResolvedValue(saved);
    prisma.aiConfig.upsert.mockImplementation((payload) =>
      Promise.resolve({
        ...saved,
        apiKey: payload.update.apiKey ?? saved.apiKey,
      }),
    );

    const response = await service.updateConfig({
      mode: 'openai-compatible',
      baseUrl: saved.baseUrl ?? undefined,
      model: saved.model ?? undefined,
      apiKey: '   ',
    });

    expect(prisma.aiConfig.upsert.mock.calls[0]?.[0].update).not.toHaveProperty(
      'apiKey',
    );
    expect(response).toMatchObject({
      hasApiKey: true,
      maskedApiKey: '••••ting',
    });
    expect(response).not.toHaveProperty('apiKey');
  });

  it('only clears an existing API key with the explicit clear flag', async () => {
    const previousAiApiKey = process.env.AI_API_KEY;
    const previousOpenAiApiKey = process.env.OPENAI_API_KEY;
    const saved: AiConfigRecord = {
      id: 'default',
      mode: 'local',
      baseUrl: null,
      model: null,
      apiKey: encryptSecret('sk-existing'),
      embeddingProvider: 'local',
      embeddingModel: null,
      ragSourceCount: 5,
      ragContextChars: 12000,
      ragExcerptChars: 520,
      updatedAt: new Date('2026-08-08T00:00:00.000Z'),
    };
    prisma.aiConfig.findUnique.mockResolvedValue(saved);
    prisma.aiConfig.upsert.mockImplementation((payload) =>
      Promise.resolve({
        ...saved,
        apiKey: payload.update.apiKey ?? null,
      }),
    );

    try {
      delete process.env.AI_API_KEY;
      delete process.env.OPENAI_API_KEY;
      const response = await service.updateConfig({
        mode: 'local',
        clearApiKey: true,
      });

      expect(
        prisma.aiConfig.upsert.mock.calls[0]?.[0].update.apiKey,
      ).toBeNull();
      expect(response).toMatchObject({ hasApiKey: false });
      expect(response).not.toHaveProperty('apiKey');
    } finally {
      if (previousAiApiKey === undefined) {
        delete process.env.AI_API_KEY;
      } else {
        process.env.AI_API_KEY = previousAiApiKey;
      }
      if (previousOpenAiApiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = previousOpenAiApiKey;
      }
    }
  });

  it('uses the persisted API key when a chat config leaves it blank', async () => {
    const saved: AiConfigRecord = {
      id: 'default',
      mode: 'openai-compatible',
      baseUrl: 'https://api.example.com/v1',
      model: 'gpt-test',
      apiKey: encryptSecret('sk-existing'),
      embeddingProvider: 'local',
      embeddingModel: null,
      ragSourceCount: 5,
      ragContextChars: 12000,
      ragExcerptChars: 520,
      updatedAt: new Date('2026-08-08T00:00:00.000Z'),
    };
    prisma.aiConfig.findUnique.mockResolvedValue(saved);
    prisma.chapterChunk.findMany.mockResolvedValue([]);
    prisma.chapter.findMany.mockResolvedValue([]);
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ choices: [{ message: { content: 'Answer' } }] }),
    } as Response);

    await service.chat({
      message: 'Question',
      config: {
        mode: 'openai-compatible',
        baseUrl: 'https://api.example.com/v1',
        model: 'gpt-test',
        apiKey: '',
      },
    });

    const requestUrl = fetchMock.mock.calls[0]?.[0];
    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = requestInit.headers as Record<string, string>;
    expect(requestUrl).toBe('https://api.example.com/v1/chat/completions');
    expect(headers.Authorization).toBe('Bearer sk-existing');
    fetchMock.mockRestore();
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

    const events: AiChatStreamEvent[] = [];
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
