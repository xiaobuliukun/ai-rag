import { Test, TestingModule } from '@nestjs/testing';
import { ScanService } from './scan.service';
import { PrismaService } from '../prisma/prisma.service';
import { ContentIndexService } from '../content/content-index.service';
import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

describe('ScanService', () => {
  let service: ScanService;
  let tempDir: string;
  const prisma = {
    book: {
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
    chapter: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    chapterChunk: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
  };
  const contentIndex = {
    syncBook: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.chapter.findUnique.mockResolvedValue(null);
    prisma.chapter.deleteMany.mockResolvedValue({ count: 0 });
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'moxu-scan-'));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScanService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: ContentIndexService,
          useValue: contentIndex,
        },
      ],
    }).compile();

    service = module.get<ScanService>(ScanService);
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('recursively scans markdown chapters with stable order indexes', async () => {
    const bookPath = path.join(tempDir, 'Book A');
    await fs.outputFile(path.join(bookPath, '01-intro.md'), '# Intro');
    await fs.outputFile(
      path.join(bookPath, 'part-2', '02-hooks.md'),
      '# Hooks',
    );
    await fs.outputFile(path.join(bookPath, 'part-2', 'notes.txt'), 'skip me');

    prisma.book.upsert.mockResolvedValue({ id: 'book-1' });
    prisma.chapter.create
      .mockResolvedValueOnce({ id: 'chapter-1' })
      .mockResolvedValueOnce({ id: 'chapter-2' });

    await service.scanDirectory(tempDir);

    expect(prisma.chapter.create).toHaveBeenNthCalledWith(1, {
      data: {
        bookId: 'book-1',
        fileName: '01-intro.md',
        orderIndex: 0,
        title: 'intro',
        content: '# Intro',
      },
    });
    expect(prisma.chapter.create).toHaveBeenNthCalledWith(2, {
      data: {
        bookId: 'book-1',
        fileName: 'part-2/02-hooks.md',
        orderIndex: 1,
        title: 'hooks',
        content: '# Hooks',
      },
    });
    expect(prisma.chapter.deleteMany).toHaveBeenCalledWith({
      where: {
        bookId: 'book-1',
        fileName: {
          notIn: ['01-intro.md', 'part-2/02-hooks.md'],
        },
      },
    });
    expect(prisma.chapterChunk.createMany).toHaveBeenCalledTimes(2);
    expect(contentIndex.syncBook).toHaveBeenCalledWith('book-1');
  });

  it('reports scan and index progress', async () => {
    const bookPath = path.join(tempDir, 'Book A');
    await fs.outputFile(path.join(bookPath, '01-intro.md'), '# Intro');
    const progressEvents: Array<{ phase?: string; currentBook?: string }> = [];

    prisma.book.upsert.mockResolvedValue({ id: 'book-1' });
    prisma.chapter.create.mockResolvedValue({ id: 'chapter-1' });

    await service.scanDirectory(tempDir, (progress) => {
      progressEvents.push({
        phase: progress.phase,
        currentBook: progress.currentBook,
      });
    });

    expect(progressEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ phase: 'scanning' }),
        expect.objectContaining({
          phase: 'indexing',
          currentBook: 'Book A',
        }),
      ]),
    );
  });

  it('passes the scan cancellation signal into remote indexing work', async () => {
    const bookPath = path.join(tempDir, 'Book A');
    await fs.outputFile(path.join(bookPath, '01-intro.md'), '# Intro');
    const controller = new AbortController();

    prisma.book.upsert.mockResolvedValue({ id: 'book-1' });
    prisma.chapter.create.mockResolvedValue({ id: 'chapter-1' });

    await service.scanDirectory(tempDir, { signal: controller.signal });

    expect(contentIndex.syncBook).toHaveBeenCalledWith('book-1', {
      signal: controller.signal,
    });
  });

  it('preserves custom book titles and leaves unchanged chapters untouched', async () => {
    const bookPath = path.join(tempDir, 'Directory Title');
    await fs.outputFile(path.join(bookPath, '01-intro.md'), '# Intro');
    const previousUpdatedAt = new Date('2026-06-01T00:00:00.000Z');

    prisma.book.upsert.mockResolvedValue({
      id: 'book-1',
      title: 'My Custom Title',
    });
    prisma.chapter.findUnique.mockResolvedValue({
      id: 'chapter-1',
      title: 'intro',
      orderIndex: 0,
      content: '# Intro',
      updatedAt: previousUpdatedAt,
    });

    await service.scanDirectory(tempDir);

    expect(prisma.book.upsert).toHaveBeenCalledWith({
      where: { path: bookPath },
      update: {},
      create: {
        title: 'Directory Title',
        path: bookPath,
      },
    });
    expect(prisma.chapter.update).not.toHaveBeenCalled();
    expect(prisma.chapterChunk.deleteMany).not.toHaveBeenCalled();
    expect(prisma.chapterChunk.createMany).not.toHaveBeenCalled();
    expect(contentIndex.syncBook).not.toHaveBeenCalled();
  });

  it('refreshes the index for chapter metadata changes without rebuilding chunks', async () => {
    const bookPath = path.join(tempDir, 'Book A');
    await fs.outputFile(
      path.join(bookPath, '01-intro.md'),
      '---\ntitle: Updated Intro\n---\n# Intro',
    );

    prisma.book.upsert.mockResolvedValue({ id: 'book-1' });
    prisma.chapter.findUnique.mockResolvedValue({
      id: 'chapter-1',
      title: 'Old Intro',
      orderIndex: 0,
      content: '# Intro',
      updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    });
    prisma.chapter.update.mockResolvedValue({ id: 'chapter-1' });

    await service.scanDirectory(tempDir);

    expect(prisma.chapter.update).toHaveBeenCalledWith({
      where: { id: 'chapter-1' },
      data: {
        title: 'Updated Intro',
        orderIndex: 0,
        content: '# Intro',
        updatedAt: new Date('2026-07-01T00:00:00.000Z'),
      },
    });
    expect(prisma.chapterChunk.deleteMany).not.toHaveBeenCalled();
    expect(contentIndex.syncBook).toHaveBeenCalledWith('book-1');
  });

  it('removes all chapters when a scanned book has no markdown files', async () => {
    const bookPath = path.join(tempDir, 'Empty Book');
    await fs.outputFile(path.join(bookPath, 'notes.txt'), 'skip me');

    prisma.book.upsert.mockResolvedValue({ id: 'book-1' });
    prisma.chapter.deleteMany.mockResolvedValueOnce({ count: 1 });

    const result = await service.scanDirectory(tempDir);

    expect(result.chaptersScanned).toBe(0);
    expect(prisma.chapter.deleteMany).toHaveBeenCalledWith({
      where: {
        bookId: 'book-1',
      },
    });
    expect(prisma.chapter.create).not.toHaveBeenCalled();
    expect(contentIndex.syncBook).toHaveBeenCalledWith('book-1');
  });

  it('rejects paths that are not directories', async () => {
    const filePath = path.join(tempDir, 'not-a-library.md');
    await fs.outputFile(filePath, '# Not a library');

    await expect(service.scanDirectory(filePath)).rejects.toThrow(
      `Path is not a directory: ${filePath}`,
    );
    expect(prisma.book.upsert).not.toHaveBeenCalled();
    expect(contentIndex.syncBook).not.toHaveBeenCalled();
  });

  it('rescans known book paths and skips missing directories', async () => {
    const bookPath = path.join(tempDir, 'Known Book');
    const missingPath = path.join(tempDir, 'Missing Book');
    await fs.outputFile(path.join(bookPath, '01-intro.md'), '# Intro');

    prisma.book.findMany.mockResolvedValue([
      { path: bookPath, title: 'Custom Known Title' },
      { path: missingPath, title: 'Missing Book' },
    ]);
    prisma.book.upsert.mockResolvedValue({ id: 'book-1' });
    prisma.chapter.create.mockResolvedValue({ id: 'chapter-1' });

    const result = await service.rescanKnownBooks();

    expect(result).toMatchObject({
      success: true,
      booksScanned: 1,
      chaptersScanned: 1,
      skippedBooks: 1,
    });
    expect(prisma.book.upsert).toHaveBeenCalledWith({
      where: { path: bookPath },
      update: {},
      create: {
        title: 'Custom Known Title',
        path: bookPath,
      },
    });
    expect(contentIndex.syncBook).toHaveBeenCalledWith('book-1');
  });

  it('serializes concurrent scans before they mutate books or indexes', async () => {
    const firstLibrary = path.join(tempDir, 'library-one');
    const secondLibrary = path.join(tempDir, 'library-two');
    await fs.outputFile(
      path.join(firstLibrary, 'Book A', '01-intro.md'),
      '# Intro',
    );
    await fs.outputFile(
      path.join(secondLibrary, 'Book B', '01-start.md'),
      '# Start',
    );

    prisma.book.upsert
      .mockResolvedValueOnce({ id: 'book-1' })
      .mockResolvedValueOnce({ id: 'book-2' });
    prisma.chapter.create
      .mockResolvedValueOnce({ id: 'chapter-1' })
      .mockResolvedValueOnce({ id: 'chapter-2' });

    let releaseFirstIndex: (() => void) | undefined;
    let markFirstIndexStarted: (() => void) | undefined;
    const firstIndexStarted = new Promise<void>((resolve) => {
      markFirstIndexStarted = resolve;
    });
    contentIndex.syncBook
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            releaseFirstIndex = resolve;
            markFirstIndexStarted?.();
          }),
      )
      .mockResolvedValueOnce(undefined);

    const firstScan = service.scanDirectory(firstLibrary);
    await firstIndexStarted;
    const secondScan = service.scanDirectory(secondLibrary);

    expect(prisma.book.upsert).toHaveBeenCalledTimes(1);
    expect(contentIndex.syncBook).toHaveBeenCalledTimes(1);

    releaseFirstIndex?.();
    await Promise.all([firstScan, secondScan]);

    expect(prisma.book.upsert).toHaveBeenCalledTimes(2);
    expect(contentIndex.syncBook).toHaveBeenCalledTimes(2);
  });
});
