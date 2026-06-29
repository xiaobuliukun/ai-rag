import type { BackupPayload } from '@juejin-flow/shared';
import { BackupService } from './backup.service';

describe('BackupService', () => {
  it('merges imported books by path and rebuilds affected indexes', async () => {
    const tx = {
      book: {
        findUnique: jest.fn(({ where }: { where: Record<string, unknown> }) => {
          if (where.id === 'incoming-book') {
            return Promise.resolve(null);
          }
          if (where.path === '/books/react') {
            return Promise.resolve({ id: 'existing-book' });
          }
          return Promise.resolve(null);
        }),
        update: jest.fn(),
        create: jest.fn(),
      },
      chapter: {
        findUnique: jest.fn(() => Promise.resolve(null)),
        update: jest.fn(),
        create: jest.fn(),
      },
      vectorData: {
        deleteMany: jest.fn(),
      },
      chapterChunk: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      readingProgress: {
        upsert: jest.fn(),
      },
      bookmark: {
        upsert: jest.fn(),
      },
      aiConfig: {
        upsert: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        async (callback: (client: typeof tx) => unknown) => await callback(tx),
      ),
    };
    const contentIndex = {
      syncBook: jest.fn(),
    };
    const service = new BackupService(prisma as never, contentIndex as never);
    const chapterContent = 'Hooks let components share stateful logic.';
    const payload: BackupPayload = {
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
      },
    });
    expect(tx.chapter.create).toHaveBeenCalledWith({
      data: {
        id: 'incoming-chapter',
        bookId: 'existing-book',
        title: 'Hooks',
        fileName: '02/hooks.md',
        content: chapterContent,
        orderIndex: 1,
        isRead: false,
        progress: 35,
        createdAt: undefined,
      },
    });
    expect(tx.chapterChunk.createMany).toHaveBeenCalledWith({
      data: [
        {
          chapterId: 'incoming-chapter',
          chunkIndex: 0,
          content: chapterContent,
          charCount: chapterContent.length,
        },
      ],
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
});
