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
      upsert: jest.fn(),
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
    prisma.chapter.upsert
      .mockResolvedValueOnce({ id: 'chapter-1' })
      .mockResolvedValueOnce({ id: 'chapter-2' });

    await service.scanDirectory(tempDir);

    expect(prisma.chapter.upsert).toHaveBeenNthCalledWith(1, {
      where: {
        bookId_fileName: {
          bookId: 'book-1',
          fileName: '01-intro.md',
        },
      },
      update: {
        orderIndex: 0,
        title: 'intro',
        content: '# Intro',
      },
      create: {
        bookId: 'book-1',
        fileName: '01-intro.md',
        orderIndex: 0,
        title: 'intro',
        content: '# Intro',
      },
    });
    expect(prisma.chapter.upsert).toHaveBeenNthCalledWith(2, {
      where: {
        bookId_fileName: {
          bookId: 'book-1',
          fileName: 'part-2/02-hooks.md',
        },
      },
      update: {
        orderIndex: 1,
        title: 'hooks',
        content: '# Hooks',
      },
      create: {
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
    prisma.chapter.upsert.mockResolvedValue({ id: 'chapter-1' });

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

  it('removes all chapters when a scanned book has no markdown files', async () => {
    const bookPath = path.join(tempDir, 'Empty Book');
    await fs.outputFile(path.join(bookPath, 'notes.txt'), 'skip me');

    prisma.book.upsert.mockResolvedValue({ id: 'book-1' });

    const result = await service.scanDirectory(tempDir);

    expect(result.chaptersScanned).toBe(0);
    expect(prisma.chapter.deleteMany).toHaveBeenCalledWith({
      where: {
        bookId: 'book-1',
      },
    });
    expect(prisma.chapter.upsert).not.toHaveBeenCalled();
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
    prisma.chapter.upsert.mockResolvedValue({ id: 'chapter-1' });

    const result = await service.rescanKnownBooks();

    expect(result).toMatchObject({
      success: true,
      booksScanned: 1,
      chaptersScanned: 1,
      skippedBooks: 1,
    });
    expect(prisma.book.upsert).toHaveBeenCalledWith({
      where: { path: bookPath },
      update: { title: 'Custom Known Title' },
      create: {
        title: 'Custom Known Title',
        path: bookPath,
      },
    });
    expect(contentIndex.syncBook).toHaveBeenCalledWith('book-1');
  });
});
