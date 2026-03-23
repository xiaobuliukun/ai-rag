import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as matter from 'gray-matter';

@Injectable()
export class ScanService {
  private readonly logger = new Logger(ScanService.name);

  constructor(private prisma: PrismaService) {}

  async scanDirectory(rootDir: string) {
    this.logger.log(`Scanning directory: ${rootDir}`);

    if (!fs.existsSync(rootDir)) {
      throw new Error(`Directory not found: ${rootDir}`);
    }

    const entries = await fs.readdir(rootDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        await this.processBook(path.join(rootDir, entry.name), entry.name);
      }
    }

    this.logger.log('Scan completed');
    return { success: true, message: 'Scan completed' };
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

    const entries = await fs.readdir(bookPath, { withFileTypes: true });
    
    // Filter and sort entries (simple sort by name for now)
    const chapterFiles = entries
      .filter(e => e.isFile() && e.name.endsWith('.md'))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    for (const file of chapterFiles) {
      await this.processChapter(book.id, path.join(bookPath, file.name), file.name);
    }
  }

  private async processChapter(bookId: string, filePath: string, fileName: string) {
    // Read file content
    const fileContent = await fs.readFile(filePath, 'utf-8');
    
    // Parse frontmatter
    // @ts-ignore
    const { data, content } = matter(fileContent);

    // Determine title: Frontmatter title > Filename (without extension)
    let title = data.title;
    if (!title) {
      title = path.parse(fileName).name;
      // Remove number prefix if exists (e.g., "01-Intro" -> "Intro")
      title = title.replace(/^\d+[-_.]\s*/, '');
    }

    await this.prisma.chapter.upsert({
      where: {
        bookId_fileName: {
          bookId,
          fileName,
        },
      },
      update: {
        title,
        content: content, // Storing content in DB for RAG/Search later
      },
      create: {
        bookId,
        title,
        fileName,
        content: content,
      },
    });
  }
}
