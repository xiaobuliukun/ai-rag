import { Test, TestingModule } from '@nestjs/testing';
import { ScanService } from './scan.service';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';

describe('ScanService', () => {
  let service: ScanService;
  let tempDir: string;
  const prisma = {
    book: {
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

  beforeEach(async () => {
    jest.clearAllMocks();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'juejin-flow-scan-'));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScanService,
        {
          provide: PrismaService,
          useValue: prisma,
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
  });
});
