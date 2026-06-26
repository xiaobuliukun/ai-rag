import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { existsSync, statSync } from 'fs';
import { isAbsolute, relative, resolve } from 'path';
import { PrismaService } from '../prisma/prisma.service';

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

    const rootPath = resolve(book.path);
    const requestedPath = resolve(rootPath, filePath);
    const relativePath = relative(rootPath, requestedPath);

    if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
      throw new BadRequestException('File path must stay inside the book');
    }

    if (!existsSync(requestedPath) || !statSync(requestedPath).isFile()) {
      throw new NotFoundException('File not found');
    }

    return response.sendFile(requestedPath);
  }
}
