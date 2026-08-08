import {
  buildFtsQuery,
  ContentIndexService,
  createEmbeddingEndpointFingerprint,
  createHighlightedSnippet,
  normalizeSearchText,
  parseVectorMetadata,
} from './content-index.service';

describe('ContentIndexService helpers', () => {
  it('normalizes CJK text into searchable unicode tokens', () => {
    expect(normalizeSearchText('测试 React  Hooks')).toBe('测 试 react hooks');
  });

  it('builds FTS queries for mixed Chinese and Latin terms', () => {
    expect(buildFtsQuery('测试 React')).toBe('react* "测" "试"');
    expect(buildFtsQuery('测试 React', 'or')).toBe('react* OR "测" OR "试"');
  });

  it('escapes snippets before adding highlight markup', () => {
    const snippet = createHighlightedSnippet(
      '<script>React</script> hooks share stateful logic.',
      'React',
    );

    expect(snippet.text).toContain('<script>React</script>');
    expect(snippet.html).toContain(
      '&lt;script&gt;<mark>React</mark>&lt;/script&gt;',
    );
    expect(snippet.html).not.toContain('<script>');
  });

  it('highlights Chinese phrases with token fallback', () => {
    const snippet = createHighlightedSnippet(
      '前端性能优化需要同时关注渲染、缓存和交互延迟。',
      '前端 性能',
    );

    expect(snippet.html).toContain('<mark>前端</mark>');
    expect(snippet.html).toContain('<mark>性能</mark>');
  });

  it('parses vector metadata for embedding index freshness checks', () => {
    expect(
      parseVectorMetadata(
        JSON.stringify({
          embeddingProvider: 'openai-compatible',
          embeddingModel: 'text-embedding-3-small',
          embeddingEndpoint: 'abc123',
          embeddingDimensions: 1536,
        }),
      ),
    ).toEqual({
      embeddingProvider: 'openai-compatible',
      embeddingModel: 'text-embedding-3-small',
      embeddingEndpoint: 'abc123',
      embeddingDimensions: 1536,
    });

    expect(parseVectorMetadata('bad-json')).toEqual({});
  });

  it('fingerprints normalized embedding endpoints without exposing the URL', () => {
    const fingerprint = createEmbeddingEndpointFingerprint(
      'https://embedding.example.test/v1/',
    );

    expect(fingerprint).toHaveLength(16);
    expect(fingerprint).not.toContain('embedding.example.test');
    expect(fingerprint).toBe(
      createEmbeddingEndpointFingerprint('https://embedding.example.test/v1'),
    );
    expect(fingerprint).not.toBe(
      createEmbeddingEndpointFingerprint(
        'https://other-embedding.example.test/v1',
      ),
    );
  });
});

describe('ContentIndexService index lifecycle', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function createHarness() {
    type VectorCreateManyArgs = {
      data: Array<{
        chunkId: string;
        chapterId: string;
        metadata: string;
      }>;
    };
    const tx = {
      $executeRawUnsafe: jest.fn(),
      vectorData: {
        deleteMany: jest.fn(),
        createMany: jest.fn<unknown, [VectorCreateManyArgs]>(),
      },
    };
    const prisma = {
      $queryRawUnsafe: jest.fn(),
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        Promise.resolve(callback(tx)),
      ),
      book: {
        findMany: jest.fn(),
      },
      chapterChunk: {
        findMany: jest.fn(),
      },
      aiConfig: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };

    return {
      prisma,
      tx,
      service: new ContentIndexService(prisma as never),
    };
  }

  it('rebuilds a non-empty FTS index when rows are missing and stale', async () => {
    const { prisma, service, tx } = createHarness();
    prisma.$queryRawUnsafe
      .mockResolvedValueOnce([
        {
          totalChunks: 2,
          ftsChunks: 2,
          missingChunks: 1,
          staleRows: 1,
          mismatchedRows: 0,
        },
      ])
      .mockResolvedValueOnce([]);
    prisma.book.findMany.mockResolvedValue([]);

    await expect(service.search('react')).resolves.toEqual([]);

    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      'DELETE FROM "ChapterChunkFts"',
    );
    expect(tx.vectorData.deleteMany).not.toHaveBeenCalled();
  });

  it('removes FTS and vector rows through the explicit book cleanup API', async () => {
    const { service, tx } = createHarness();

    await service.removeBook('book-1');

    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      'DELETE FROM "ChapterChunkFts" WHERE "bookId" = ?',
      'book-1',
    );
    expect(tx.vectorData.deleteMany).toHaveBeenCalledWith({
      where: {
        chapter: {
          bookId: 'book-1',
        },
      },
    });
  });

  it('atomically replaces a book FTS and vector index', async () => {
    const { prisma, service, tx } = createHarness();
    prisma.chapterChunk.findMany.mockResolvedValue([
      {
        id: 'chunk-1',
        content: 'Hooks share stateful logic.',
        chapter: {
          id: 'chapter-1',
          title: 'Hooks',
          bookId: 'book-1',
          book: {
            title: 'React',
          },
        },
      },
    ]);

    await service.syncBook('book-1');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.$executeRawUnsafe).toHaveBeenNthCalledWith(
      1,
      'DELETE FROM "ChapterChunkFts" WHERE "bookId" = ?',
      'book-1',
    );
    expect(tx.$executeRawUnsafe).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO "ChapterChunkFts"'),
      'chunk-1',
      'book-1',
      'chapter-1',
      'React',
      'Hooks',
      expect.stringContaining('hooks share stateful logic'),
    );
    const createManyArgs = tx.vectorData.createMany.mock.calls[0]?.[0];
    expect(createManyArgs?.data[0]).toMatchObject({
      chunkId: 'chunk-1',
      chapterId: 'chapter-1',
    });
    expect(createManyArgs?.data[0]?.metadata).toContain(
      '"embeddingDimensions":96',
    );
  });

  it('keeps FTS current and preserves vectors when remote embeddings fail', async () => {
    const { prisma, service, tx } = createHarness();
    prisma.aiConfig.findUnique.mockResolvedValue({
      embeddingProvider: 'openai-compatible',
      embeddingModel: 'remote-embedding',
      baseUrl: 'https://embedding.example.test/v1',
      apiKey: 'test-key',
    });
    prisma.chapterChunk.findMany.mockResolvedValue([
      {
        id: 'chunk-1',
        content: 'Hooks share stateful logic.',
        chapter: {
          id: 'chapter-1',
          title: 'Hooks',
          bookId: 'book-1',
          book: {
            title: 'React',
          },
        },
      },
    ]);
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('offline'));

    await expect(service.syncBook('book-1')).rejects.toThrow(
      'Embedding request failed',
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.$executeRawUnsafe).toHaveBeenNthCalledWith(
      1,
      'DELETE FROM "ChapterChunkFts" WHERE "bookId" = ?',
      'book-1',
    );
    expect(tx.$executeRawUnsafe).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO "ChapterChunkFts"'),
      'chunk-1',
      'book-1',
      'chapter-1',
      'React',
      'Hooks',
      expect.stringContaining('hooks share stateful logic'),
    );
    expect(tx.vectorData.deleteMany).not.toHaveBeenCalled();
    expect(tx.vectorData.createMany).not.toHaveBeenCalled();
  });

  it('rebuilds FTS without deleting existing vectors when a full remote rebuild fails', async () => {
    const { prisma, service, tx } = createHarness();
    prisma.aiConfig.findUnique.mockResolvedValue({
      embeddingProvider: 'openai-compatible',
      embeddingModel: 'remote-embedding',
      baseUrl: 'https://embedding.example.test/v1',
      apiKey: 'test-key',
    });
    prisma.book.findMany.mockResolvedValue([
      { id: 'book-1' },
      { id: 'book-2' },
    ]);
    prisma.chapterChunk.findMany
      .mockResolvedValueOnce([
        {
          id: 'chunk-1',
          content: 'Hooks share stateful logic.',
          chapter: {
            id: 'chapter-1',
            title: 'Hooks',
            bookId: 'book-1',
            book: { title: 'React' },
          },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'chunk-2',
          content: 'Effects synchronize external systems.',
          chapter: {
            id: 'chapter-2',
            title: 'Effects',
            bookId: 'book-2',
            book: { title: 'React Patterns' },
          },
        },
      ]);
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ data: [{ index: 0, embedding: [0.1, 0.2] }] }),
      } as Response)
      .mockRejectedValueOnce(new Error('offline'));

    await expect(service.rebuildIndex()).rejects.toThrow(
      'Embedding request failed',
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.$executeRawUnsafe).toHaveBeenNthCalledWith(
      1,
      'DELETE FROM "ChapterChunkFts"',
    );
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO "ChapterChunkFts"'),
      'chunk-1',
      'book-1',
      'chapter-1',
      'React',
      'Hooks',
      expect.any(String),
    );
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO "ChapterChunkFts"'),
      'chunk-2',
      'book-2',
      'chapter-2',
      'React Patterns',
      'Effects',
      expect.any(String),
    );
    expect(tx.vectorData.deleteMany).not.toHaveBeenCalled();
    expect(tx.vectorData.createMany).not.toHaveBeenCalled();
  });

  it('skips semantic results when the remote embedding query is unavailable', async () => {
    const { prisma, service } = createHarness();
    prisma.aiConfig.findUnique.mockResolvedValue({
      embeddingProvider: 'openai-compatible',
      embeddingModel: 'remote-embedding',
      baseUrl: 'https://embedding.example.test/v1',
      apiKey: 'test-key',
    });
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('offline'));

    await expect(service.semanticSearch('hooks')).resolves.toEqual([]);
  });
});
