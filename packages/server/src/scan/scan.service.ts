import { Injectable, Logger } from '@nestjs/common';
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

@Injectable()
export class ScanService {
  private readonly logger = new Logger(ScanService.name);

  constructor(
    private prisma: PrismaService,
    private contentIndex: ContentIndexService,
  ) {}

  async scanDirectory(rootDir: string) {
    this.logger.log(`Scanning directory: ${rootDir}`);

    if (!fs.existsSync(rootDir)) {
      throw new Error(`Directory not found: ${rootDir}`);
    }

    const entries = await fs.readdir(rootDir, { withFileTypes: true });

    let booksScanned = 0;
    let chaptersScanned = 0;

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const chapterCount = await this.processBook(
          path.join(rootDir, entry.name),
          entry.name,
        );
        booksScanned += 1;
        chaptersScanned += chapterCount;
      }
    }

    this.logger.log('Scan completed');
    return {
      success: true,
      message: `Scan completed: ${booksScanned} books, ${chaptersScanned} chapters`,
      booksScanned,
      chaptersScanned,
    };
  }

  private async processBook(bookPath: string, bookTitle: string) {
    this.logger.log(`Processing book: ${bookTitle}`);

    // Create or update Book
    const book = await this.prisma.book.upsert({
      where: { path: bookPath },
      update: { title: bookTitle },
      create: {
        title: bookTitle,
        path: bookPath,
      },
    });

    const chapterFiles = await this.findMarkdownFiles(bookPath);

    for (const [index, file] of chapterFiles.entries()) {
      await this.processChapter(book.id, file, index);
    }

    await this.removeMissingChapters(
      book.id,
      chapterFiles.map((file) => file.relativePath),
    );
    await this.contentIndex.syncBook(book.id);

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

  private async removeMissingChapters(bookId: string, fileNames: string[]) {
    await this.prisma.chapter.deleteMany({
      where: {
        bookId,
        ...(fileNames.length > 0 ? { fileName: { notIn: fileNames } } : {}),
      },
    });
  }

  private async processChapter(
    bookId: string,
    file: MarkdownFile,
    orderIndex: number,
  ) {
    // Read file content
    const fileContent = await fs.readFile(file.absolutePath, 'utf-8');

    const { data, content } = matter(fileContent);

    // Determine title: Frontmatter title > Filename (without extension)
    let title = typeof data.title === 'string' ? data.title : undefined;
    if (!title) {
      title = path.parse(file.relativePath).name;
      // Remove number prefix if exists (e.g., "01-Intro" -> "Intro")
      title = title.replace(/^\d+[-_.]\s*/, '');
    }

    const chapter = await this.prisma.chapter.upsert({
      where: {
        bookId_fileName: {
          bookId,
          fileName: file.relativePath,
        },
      },
      update: {
        title,
        orderIndex,
        content, // Storing content in DB for RAG/Search later
      },
      create: {
        bookId,
        title,
        fileName: file.relativePath,
        orderIndex,
        content,
      },
    });

    const chunks = chunkMarkdownContent(content);
    await this.prisma.chapterChunk.deleteMany({
      where: {
        chapterId: chapter.id,
      },
    });

    if (chunks.length > 0) {
      await this.prisma.chapterChunk.createMany({
        data: chunks.map((chunk) => ({
          chapterId: chapter.id,
          chunkIndex: chunk.chunkIndex,
          content: chunk.content,
          charCount: chunk.charCount,
        })),
      });
    }
  }
}
