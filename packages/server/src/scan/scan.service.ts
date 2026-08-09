import { Injectable, Logger } from '@nestjs/common';
import type { ScanJobPhase } from '@moxu/shared';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs-extra';
import * as path from 'path';
import matter from 'gray-matter';
import { chunkMarkdownContent } from '../content/chunking';
import { ContentIndexService } from '../content/content-index.service';

type MarkdownFile = {
  absolutePath: string;
  relativePath: string;
};

type PreparedChapter = {
  file: MarkdownFile;
  orderIndex: number;
  title: string;
  content: string;
  chunks: ReturnType<typeof chunkMarkdownContent>;
};

export type ScanProgress = {
  phase?: ScanJobPhase;
  booksTotal?: number;
  booksScanned?: number;
  chaptersScanned?: number;
  skippedBooks?: number;
  currentBook?: string;
  message?: string;
};

type ScanProgressReporter = (progress: ScanProgress) => void;
type ScanOptions = {
  onProgress?: ScanProgressReporter;
  signal?: AbortSignal;
};

@Injectable()
export class ScanService {
  private readonly logger = new Logger(ScanService.name);
  private scanOperationTail: Promise<void> = Promise.resolve();

  constructor(
    private prisma: PrismaService,
    private contentIndex: ContentIndexService,
  ) {}

  async scanDirectory(
    rootDir: string,
    optionsOrProgress?: ScanOptions | ScanProgressReporter,
  ) {
    const options = normalizeScanOptions(optionsOrProgress);
    return this.enqueueScanOperation(() =>
      this.scanDirectoryUnsafe(rootDir, options),
    );
  }

  private async scanDirectoryUnsafe(rootDir: string, options: ScanOptions) {
    this.logger.log(`Scanning directory: ${rootDir}`);

    await this.assertDirectory(rootDir);
    assertNotCancelled(options.signal);

    const entries = await fs.readdir(rootDir, { withFileTypes: true });
    const bookEntries = entries.filter((entry) => entry.isDirectory());

    let booksScanned = 0;
    let chaptersScanned = 0;

    options.onProgress?.({
      phase: 'scanning',
      booksTotal: bookEntries.length,
      booksScanned,
      chaptersScanned,
      message: `Found ${bookEntries.length} books`,
    });

    for (const entry of bookEntries) {
      assertNotCancelled(options.signal);
      const chapterCount = await this.processBook(
        path.join(rootDir, entry.name),
        entry.name,
        options,
      );
      booksScanned += 1;
      chaptersScanned += chapterCount;
      options.onProgress?.({
        phase: 'scanning',
        booksTotal: bookEntries.length,
        booksScanned,
        chaptersScanned,
        currentBook: entry.name,
      });
    }

    this.logger.log('Scan completed');
    return {
      success: true,
      message: `Scan completed: ${booksScanned} books, ${chaptersScanned} chapters`,
      booksScanned,
      chaptersScanned,
    };
  }

  async rescanKnownBooks(
    optionsOrProgress?: ScanOptions | ScanProgressReporter,
  ) {
    const options = normalizeScanOptions(optionsOrProgress);
    return this.enqueueScanOperation(() =>
      this.rescanKnownBooksUnsafe(options),
    );
  }

  private async rescanKnownBooksUnsafe(options: ScanOptions) {
    const books = await this.prisma.book.findMany({
      select: {
        path: true,
        title: true,
      },
      orderBy: {
        path: 'asc',
      },
    });

    let booksScanned = 0;
    let chaptersScanned = 0;
    let skippedBooks = 0;

    options.onProgress?.({
      phase: 'scanning',
      booksTotal: books.length,
      booksScanned,
      chaptersScanned,
      skippedBooks,
      message: `Found ${books.length} known books`,
    });

    for (const book of books) {
      assertNotCancelled(options.signal);
      if (!(await this.isDirectory(book.path))) {
        skippedBooks += 1;
        options.onProgress?.({
          phase: 'scanning',
          booksTotal: books.length,
          booksScanned,
          chaptersScanned,
          skippedBooks,
          currentBook: book.title,
          message: `Skipped missing book: ${book.title}`,
        });
        continue;
      }

      const chapterCount = await this.processBook(
        book.path,
        book.title,
        options,
      );
      booksScanned += 1;
      chaptersScanned += chapterCount;
      options.onProgress?.({
        phase: 'scanning',
        booksTotal: books.length,
        booksScanned,
        chaptersScanned,
        skippedBooks,
        currentBook: book.title,
      });
    }

    return {
      success: true,
      message: `Rescan completed: ${booksScanned} books, ${chaptersScanned} chapters${
        skippedBooks > 0 ? `, ${skippedBooks} skipped` : ''
      }`,
      booksScanned,
      chaptersScanned,
      skippedBooks,
    };
  }

  private enqueueScanOperation<T>(operation: () => Promise<T>) {
    const result = this.scanOperationTail.then(operation, operation);
    this.scanOperationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async assertDirectory(directoryPath: string) {
    if (!fs.existsSync(directoryPath)) {
      throw new Error(`Directory not found: ${directoryPath}`);
    }

    const stats = await fs.stat(directoryPath);
    if (!stats.isDirectory()) {
      throw new Error(`Path is not a directory: ${directoryPath}`);
    }
  }

  private async isDirectory(directoryPath: string) {
    if (!fs.existsSync(directoryPath)) {
      return false;
    }

    const stats = await fs.stat(directoryPath);
    return stats.isDirectory();
  }

  private async processBook(
    bookPath: string,
    bookTitle: string,
    options: ScanOptions,
  ) {
    this.logger.log(`Processing book: ${bookTitle}`);
    assertNotCancelled(options.signal);
    options.onProgress?.({
      phase: 'scanning',
      currentBook: bookTitle,
      message: `Scanning ${bookTitle}`,
    });

    const chapterFiles = await this.findMarkdownFiles(bookPath);
    const preparedChapters: PreparedChapter[] = [];

    for (const [index, file] of chapterFiles.entries()) {
      assertNotCancelled(options.signal);
      preparedChapters.push(await this.prepareChapter(file, index));
    }

    assertNotCancelled(options.signal);
    const { bookId, needsIndex } = await this.prisma.$transaction(
      async (tx) => {
        const book = await tx.book.upsert({
          where: { path: bookPath },
          update: {},
          create: {
            title: bookTitle,
            path: bookPath,
          },
        });
        const indexWasPending = book.indexPending === true;
        let changed = false;

        for (const chapter of preparedChapters) {
          assertNotCancelled(options.signal);
          changed =
            (await this.processChapter(tx, book.id, chapter)) || changed;
        }

        assertNotCancelled(options.signal);
        changed =
          (await this.removeMissingChapters(
            tx,
            book.id,
            chapterFiles.map((file) => file.relativePath),
          )) || changed;

        if (changed) {
          await tx.book.update({
            where: { id: book.id },
            data: {
              indexPending: true,
              indexRevision: {
                increment: 1,
              },
            },
          });
        }

        return {
          bookId: book.id,
          needsIndex: changed || indexWasPending,
        };
      },
    );

    if (needsIndex) {
      options.onProgress?.({
        phase: 'indexing',
        currentBook: bookTitle,
        message: `Indexing ${bookTitle}`,
      });
      assertNotCancelled(options.signal);
      if (options.signal) {
        await this.contentIndex.syncBook(bookId, {
          signal: options.signal,
        });
      } else {
        await this.contentIndex.syncBook(bookId);
      }
      assertNotCancelled(options.signal);
    }

    return chapterFiles.length;
  }

  private async findMarkdownFiles(bookPath: string) {
    const files = await this.walkMarkdownFiles(bookPath, bookPath);
    return files.sort((a, b) =>
      a.relativePath.localeCompare(b.relativePath, undefined, {
        numeric: true,
      }),
    );
  }

  private async walkMarkdownFiles(
    bookPath: string,
    currentPath: string,
  ): Promise<MarkdownFile[]> {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    const files: MarkdownFile[] = [];

    for (const entry of entries) {
      const absolutePath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        files.push(...(await this.walkMarkdownFiles(bookPath, absolutePath)));
        continue;
      }

      if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        files.push({
          absolutePath,
          relativePath: this.normalizeRelativePath(
            path.relative(bookPath, absolutePath),
          ),
        });
      }
    }

    return files;
  }

  private normalizeRelativePath(filePath: string) {
    return filePath.split(path.sep).join('/');
  }

  private async removeMissingChapters(
    tx: Prisma.TransactionClient,
    bookId: string,
    fileNames: string[],
  ) {
    const result = await tx.chapter.deleteMany({
      where: {
        bookId,
        ...(fileNames.length > 0 ? { fileName: { notIn: fileNames } } : {}),
      },
    });
    return result.count > 0;
  }

  private async prepareChapter(
    file: MarkdownFile,
    orderIndex: number,
  ): Promise<PreparedChapter> {
    const fileContent = await fs.readFile(file.absolutePath, 'utf-8');
    const { data, content } = matter(fileContent);
    let title = typeof data.title === 'string' ? data.title : undefined;
    if (!title) {
      title = path.parse(file.relativePath).name;
      title = title.replace(/^\d+[-_.]\s*/, '');
    }

    return {
      file,
      orderIndex,
      title,
      content,
      chunks: chunkMarkdownContent(content),
    };
  }

  private async processChapter(
    tx: Prisma.TransactionClient,
    bookId: string,
    prepared: PreparedChapter,
  ) {
    const { file, orderIndex, title, content, chunks } = prepared;

    const where = {
      bookId_fileName: {
        bookId,
        fileName: file.relativePath,
      },
    };
    const existing = await tx.chapter.findUnique({
      where,
      select: {
        id: true,
        title: true,
        orderIndex: true,
        content: true,
        updatedAt: true,
      },
    });
    const contentChanged = !existing || existing.content !== content;
    const metadataChanged =
      existing !== null &&
      (existing.title !== title || existing.orderIndex !== orderIndex);
    const chapter = existing
      ? metadataChanged || contentChanged
        ? await tx.chapter.update({
            where: { id: existing.id },
            data: {
              title,
              orderIndex,
              content,
              updatedAt: existing.updatedAt,
            },
          })
        : existing
      : await tx.chapter.create({
          data: {
            bookId,
            title,
            fileName: file.relativePath,
            orderIndex,
            content,
          },
        });

    if (!contentChanged) {
      return metadataChanged;
    }

    await tx.chapterChunk.deleteMany({
      where: {
        chapterId: chapter.id,
      },
    });

    if (chunks.length > 0) {
      await tx.chapterChunk.createMany({
        data: chunks.map((chunk) => ({
          chapterId: chapter.id,
          chunkIndex: chunk.chunkIndex,
          content: chunk.content,
          charCount: chunk.charCount,
        })),
      });
    }

    return true;
  }
}

function normalizeScanOptions(
  optionsOrProgress?: ScanOptions | ScanProgressReporter,
): ScanOptions {
  return typeof optionsOrProgress === 'function'
    ? { onProgress: optionsOrProgress }
    : (optionsOrProgress ?? {});
}

function assertNotCancelled(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new ScanCancelledError();
  }
}

export class ScanCancelledError extends Error {
  constructor() {
    super('Scan cancelled');
    this.name = 'ScanCancelledError';
  }
}
