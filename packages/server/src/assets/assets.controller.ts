import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  Res,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { Response } from 'express';
import { realpath, stat } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';

const BOOK_ASSET_CONTENT_TYPES = new Map([
  ['.avif', 'image/avif'],
  ['.bmp', 'image/bmp'],
  ['.gif', 'image/gif'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
]);

@Controller('assets')
export class AssetsController {
  constructor(private prisma: PrismaService) {}

  @Get('books/:bookId/files')
  async serveBookFile(
    @Param('bookId') bookId: string,
    @Query('path') filePath: string,
    @Res() response: Response,
  ) {
    if (!filePath) {
      throw new BadRequestException('File path is required');
    }

    const book = await this.prisma.book.findUnique({
      where: { id: bookId },
      select: { path: true },
    });

    if (!book) {
      throw new NotFoundException('Book not found');
    }

    const rootPath = await resolveRealPath(book.path);
    if (!rootPath) {
      throw new NotFoundException('Book directory not found');
    }

    const requestedPath = resolve(rootPath, filePath);
    assertPathInsideBook(rootPath, requestedPath);

    const realRequestedPath = await resolveRealPath(requestedPath);
    if (!realRequestedPath) {
      throw new NotFoundException('File not found');
    }
    assertPathInsideBook(rootPath, realRequestedPath);

    const fileStats = await stat(realRequestedPath).catch(() => null);
    if (!fileStats?.isFile()) {
      throw new NotFoundException('File not found');
    }

    const contentType = BOOK_ASSET_CONTENT_TYPES.get(
      extname(realRequestedPath).toLowerCase(),
    );
    if (!contentType) {
      throw new UnsupportedMediaTypeException(
        'Only common image files can be served as book assets',
      );
    }

    response.setHeader('Cache-Control', 'private, max-age=3600');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; sandbox",
    );
    response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    response.type(contentType);
    return response.sendFile(realRequestedPath);
  }
}

async function resolveRealPath(path: string) {
  try {
    return await realpath(path);
  } catch {
    return null;
  }
}

function assertPathInsideBook(rootPath: string, requestedPath: string) {
  const relativePath = relative(rootPath, requestedPath);
  if (
    relativePath === '..' ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new BadRequestException('File path must stay inside the book');
  }
}
