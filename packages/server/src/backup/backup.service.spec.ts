import { REPLACE_BACKUP_CONFIRMATION, type BackupPayload } from '@moxu/shared';
import { BackupService } from './backup.service';

describe('BackupService', () => {
  it('does not export internal index recovery metadata', async () => {
    const tx = createTransactionClient();
    const { service, prisma } = createService(tx);
    prisma.book.findMany.mockResolvedValueOnce([
      {
        id: 'book-1',
        title: 'Book',
        path: '/books/book',
        description: null,
        tags: '[]',
        coverImage: null,
        lastRead: new Date('2026-08-09T00:00:00.000Z'),
        createdAt: new Date('2026-08-09T00:00:00.000Z'),
        updatedAt: new Date('2026-08-09T00:00:00.000Z'),
        indexPending: true,
        indexRevision: 7,
        chapters: [],
      },
    ]);

    const result = await service.exportBackup();

    expect(result.books[0]).not.toHaveProperty('indexPending');
    expect(result.books[0]).not.toHaveProperty('indexRevision');
  });

  it('treats a legacy raw backup payload as a merge import', async () => {
    const tx = createTransactionClient();
    const { service, prisma, contentIndex } = createService(tx);
    const payload = createBackupPayload();

    const result = await service.importBackup(payload);

    expect(result.success).toBe(true);
    expect(result.indexPending).toBe(false);
    expect(tx.book.create).toHaveBeenCalled();
    expect(tx.book.deleteMany).not.toHaveBeenCalled();
    expect(contentIndex.syncBook).toHaveBeenCalledWith('incoming-book');
    expect(contentIndex.rebuildIndex).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('requires an explicit confirmation token for replace imports', async () => {
    const tx = createTransactionClient();
    const { service, prisma } = createService(tx);
    const payload = createBackupPayload();

    await expect(
      service.importBackup({ payload, mode: 'replace' }),
    ).rejects.toThrow('Replace import requires explicit confirmation');

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.book.deleteMany).not.toHaveBeenCalled();
  });

  it('keeps destructive replace writes inside one rollback boundary', async () => {
    const tx = createTransactionClient();
    tx.chapter.create.mockRejectedValueOnce(
      new Error('chapter restore failed'),
    );
    const { service, prisma, contentIndex } = createService(tx);

    await expect(
      service.importBackup({
        payload: createBackupPayload(),
        mode: 'replace',
        replaceConfirmation: REPLACE_BACKUP_CONFIRMATION,
      }),
    ).rejects.toThrow('chapter restore failed');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.book.deleteMany).toHaveBeenCalledTimes(1);
    expect(tx.book.create).toHaveBeenCalledTimes(1);
    expect(contentIndex.rebuildIndex).not.toHaveBeenCalled();
  });

  it('returns a committed replacement with pending indexing when rebuild fails', async () => {
    const tx = createTransactionClient();
    const { service, prisma, contentIndex } = createService(tx);
    contentIndex.rebuildIndex.mockRejectedValueOnce(
      new Error('embedding service unavailable'),
    );

    const result = await service.importBackup({
      payload: createBackupPayload(),
      mode: 'replace',
      replaceConfirmation: REPLACE_BACKUP_CONFIRMATION,
    });

    expect(result).toMatchObject({
      success: true,
      indexPending: true,
      booksImported: 1,
      chaptersImported: 1,
      bookmarksImported: 1,
    });
    expect(result.message).toContain('replacement is committed');
    expect(result.message).toContain('search indexing is pending');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.book.create).toHaveBeenCalledWith({
      data: {
        id: 'incoming-book',
        title: 'React',
        path: '/books/react',
        description: null,
        tags: JSON.stringify(['frontend']),
        coverImage: null,
        lastRead: new Date('2026-06-26T00:00:00.000Z'),
        indexPending: true,
        indexRevision: 1,
        createdAt: undefined,
      },
    });
    expect(contentIndex.rebuildIndex).toHaveBeenCalledTimes(1);
    expect(prisma.book.count).not.toHaveBeenCalled();
  });

  it('clears the persisted FTS index and skips rebuilding an empty replacement', async () => {
    const tx = createTransactionClient();
    const { service, contentIndex } = createService(tx);
    const payload = createBackupPayload();
    payload.books = [];
    payload.bookmarks = [];

    const result = await service.importBackup({
      payload,
      mode: 'replace',
      replaceConfirmation: REPLACE_BACKUP_CONFIRMATION,
    });

    expect(result).toMatchObject({ success: true, indexPending: false });
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      'DELETE FROM "ChapterChunkFts"',
    );
    expect(contentIndex.rebuildIndex).not.toHaveBeenCalled();
  });

  it('merges imported books by path and rebuilds affected indexes', async () => {
    const tx = createTransactionClient();
    tx.book.findUnique.mockImplementation(
      ({ where }: { where: Record<string, unknown> }) => {
        if (where.path === '/books/react') {
          return Promise.resolve({ id: 'existing-book' });
        }
        return Promise.resolve(null);
      },
    );
    const { service, contentIndex } = createService(tx);
    const payload = createBackupPayload();

    const result = await service.importBackup({ payload, mode: 'merge' });

    expect(result).toMatchObject({
      success: true,
      booksImported: 1,
      chaptersImported: 1,
      bookmarksImported: 1,
    });
    expect(tx.book.update).toHaveBeenCalledWith({
      where: { id: 'existing-book' },
      data: {
        title: 'React',
        path: '/books/react',
        description: null,
        tags: JSON.stringify(['frontend']),
        coverImage: null,
        lastRead: new Date('2026-06-26T00:00:00.000Z'),
        indexPending: true,
        indexRevision: { increment: 1 },
      },
    });
    expect(tx.chapter.create).toHaveBeenCalledWith({
      data: {
        id: 'incoming-chapter',
        bookId: 'existing-book',
        title: 'Hooks',
        fileName: '02/hooks.md',
        content: 'Hooks let components share stateful logic.',
        orderIndex: 1,
        isRead: false,
        progress: 35,
        createdAt: undefined,
      },
    });
    expect(tx.bookmark.upsert).toHaveBeenCalledWith({
      where: { id: 'bookmark-1' },
      update: {
        bookId: 'existing-book',
        chapterId: 'incoming-chapter',
        note: 'Important',
        excerpt: null,
        position: 35,
      },
      create: {
        id: 'bookmark-1',
        bookId: 'existing-book',
        chapterId: 'incoming-chapter',
        note: 'Important',
        excerpt: null,
        position: 35,
        createdAt: new Date('2026-06-26T00:00:00.000Z'),
      },
    });
    expect(contentIndex.syncBook).toHaveBeenCalledWith('existing-book');
  });

  it('returns a committed merge with pending indexing when sync fails', async () => {
    const tx = createTransactionClient();
    const { service, prisma, contentIndex } = createService(tx);
    contentIndex.syncBook.mockRejectedValueOnce(
      new Error('index write failed'),
    );

    const result = await service.importBackup({
      payload: createBackupPayload(),
      mode: 'merge',
    });

    expect(result).toMatchObject({
      success: true,
      indexPending: true,
      booksImported: 1,
      chaptersImported: 1,
    });
    expect(result.message).toContain('data import is committed');
    expect(result.message).toContain('search indexing is pending');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.book.create).toHaveBeenCalledWith({
      data: {
        id: 'incoming-book',
        title: 'React',
        path: '/books/react',
        description: null,
        tags: JSON.stringify(['frontend']),
        coverImage: null,
        lastRead: new Date('2026-06-26T00:00:00.000Z'),
        indexPending: true,
        indexRevision: 1,
        createdAt: undefined,
      },
    });
    expect(prisma.book.count).not.toHaveBeenCalled();
  });

  it('rebuilds the full index after merging AI config and reports a pending committed import on failure', async () => {
    const tx = createTransactionClient();
    tx.book.updateMany.mockResolvedValueOnce({ count: 4 });
    const { service, contentIndex } = createService(tx);
    contentIndex.rebuildIndex.mockRejectedValueOnce(
      new Error('embedding configuration unavailable'),
    );
    const payload = createBackupPayload();
    payload.aiConfig = {
      id: 'default',
      mode: 'local',
      embeddingProvider: 'local',
    };

    const result = await service.importBackup({ payload, mode: 'merge' });

    expect(result).toMatchObject({ success: true, indexPending: true });
    expect(result.message).toContain('data import is committed');
    expect(tx.book.updateMany).toHaveBeenCalledWith({
      data: {
        indexPending: true,
        indexRevision: { increment: 1 },
      },
    });
    expect(contentIndex.rebuildIndex).toHaveBeenCalledTimes(1);
    expect(contentIndex.syncBook).not.toHaveBeenCalled();
  });

  it('rejects a bookmark whose chapter belongs to another imported book before opening a transaction', async () => {
    const tx = createTransactionClient();
    const { service, prisma } = createService(tx);
    const payload = createBackupPayload();
    payload.books.push({
      ...payload.books[0],
      id: 'second-book',
      title: 'Second Book',
      path: '/books/second',
      chapters: [
        {
          ...payload.books[0].chapters[0],
          id: 'second-chapter',
          bookId: 'second-book',
          fileName: '01/second.md',
        },
      ],
    });
    payload.bookmarks[0] = {
      ...payload.bookmarks[0],
      bookId: 'incoming-book',
      chapterId: 'second-chapter',
    };

    await expect(
      service.importBackup({ payload, mode: 'merge' }),
    ).rejects.toThrow(
      'Backup bookmark bookmark-1 chapter must belong to book incoming-book',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('stably remaps foreign IDs instead of moving unrelated records across books', async () => {
    const tx = createTransactionClient();
    let importedBookId: string | undefined;
    let importedChapterId: string | undefined;
    let importedProgressId: string | undefined;
    let importedBookmarkId: string | undefined;

    tx.book.findUnique.mockImplementation(
      ({ where }: { where: Record<string, unknown> }) => {
        if (where.path === '/books/react') {
          return Promise.resolve(
            importedBookId ? { id: importedBookId } : null,
          );
        }
        if (where.id === 'incoming-book') {
          return Promise.resolve({ id: 'incoming-book', path: '/books/other' });
        }
        return Promise.resolve(null);
      },
    );
    tx.book.create.mockImplementation(({ data }: { data: { id: string } }) => {
      importedBookId = data.id;
      return Promise.resolve({ id: data.id });
    });
    tx.chapter.findUnique.mockImplementation(
      ({ where }: { where: Record<string, unknown> }) => {
        if ('bookId_fileName' in where) {
          return Promise.resolve(
            importedChapterId ? { id: importedChapterId } : null,
          );
        }
        if (where.id === 'incoming-chapter') {
          return Promise.resolve({
            id: 'incoming-chapter',
            bookId: 'foreign-book',
            fileName: 'foreign.md',
          });
        }
        return Promise.resolve(null);
      },
    );
    tx.chapter.create.mockImplementation(
      ({ data }: { data: { id: string } }) => {
        importedChapterId = data.id;
        return Promise.resolve({ id: data.id });
      },
    );
    tx.readingProgress.findUnique.mockImplementation(
      ({ where }: { where: Record<string, unknown> }) => {
        if ('chapterId' in where) {
          return Promise.resolve(
            importedProgressId ? { id: importedProgressId } : null,
          );
        }
        if (where.id === 'progress-1') {
          return Promise.resolve({ chapterId: 'foreign-chapter' });
        }
        return Promise.resolve(null);
      },
    );
    tx.readingProgress.upsert.mockImplementation(
      ({ create }: { create: { id: string } }) => {
        importedProgressId = create.id;
        return Promise.resolve({ id: create.id });
      },
    );
    tx.bookmark.findUnique.mockResolvedValue({
      bookId: 'foreign-book',
      chapterId: 'foreign-chapter',
    });
    tx.bookmark.upsert.mockImplementation(
      ({ where }: { where: { id: string } }) => {
        importedBookmarkId = where.id;
        return Promise.resolve({ id: where.id });
      },
    );
    const { service } = createService(tx);
    const payload = createBackupPayload();

    await service.importBackup({ payload, mode: 'merge' });
    if (!importedBookId || !importedChapterId || !importedBookmarkId) {
      throw new Error('Expected imported IDs to be captured');
    }
    const firstBookId = importedBookId;
    const firstChapterId = importedChapterId;
    const firstBookmarkId = importedBookmarkId;

    await service.importBackup({ payload, mode: 'merge' });

    expect(firstBookId).not.toBe('incoming-book');
    expect(firstChapterId).not.toBe('incoming-chapter');
    expect(firstBookmarkId).not.toBe('bookmark-1');
    expect(importedProgressId).not.toBe('progress-1');
    expect(tx.book.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { id: firstBookId } }),
    );
    expect(tx.chapter.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { id: firstChapterId } }),
    );
    expect(tx.bookmark.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { id: firstBookmarkId } }),
    );
    expect(tx.book.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'incoming-book' } }),
    );
    expect(tx.chapter.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'incoming-chapter' } }),
    );
  });
});

function createBackupPayload(): BackupPayload {
  const chapterContent = 'Hooks let components share stateful logic.';
  return {
    version: 1,
    exportedAt: '2026-06-26T00:00:00.000Z',
    books: [
      {
        id: 'incoming-book',
        title: 'React',
        path: '/books/react',
        tags: ['frontend'],
        lastRead: '2026-06-26T00:00:00.000Z',
        chapters: [
          {
            id: 'incoming-chapter',
            bookId: 'incoming-book',
            title: 'Hooks',
            fileName: '02/hooks.md',
            content: chapterContent,
            orderIndex: 1,
            isRead: false,
            progress: 35,
            readingProgress: {
              id: 'progress-1',
              chapterId: 'incoming-chapter',
              percentage: 35,
              scrollPosition: 128,
              readingSeconds: 42,
              updatedAt: '2026-06-26T00:00:00.000Z',
            },
          },
        ],
      },
    ],
    bookmarks: [
      {
        id: 'bookmark-1',
        bookId: 'incoming-book',
        chapterId: 'incoming-chapter',
        note: 'Important',
        position: 35,
        createdAt: '2026-06-26T00:00:00.000Z',
      },
    ],
  };
}

function createTransactionClient() {
  return {
    $executeRawUnsafe: jest.fn().mockResolvedValue(0),
    book: {
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    chapter: {
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    vectorData: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    chapterChunk: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    readingProgress: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    bookmark: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    aiConfig: {
      upsert: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

function createService(tx: ReturnType<typeof createTransactionClient>) {
  const prisma = {
    $transaction: jest.fn(
      async (callback: (client: typeof tx) => unknown) => await callback(tx),
    ),
    book: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    bookmark: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    aiConfig: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
  };
  const contentIndex = {
    syncBook: jest.fn().mockResolvedValue(undefined),
    rebuildIndex: jest.fn().mockResolvedValue(undefined),
  };
  return {
    service: new BackupService(prisma as never, contentIndex as never),
    prisma,
    contentIndex,
  };
}
