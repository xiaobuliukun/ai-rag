import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseFloatPipe,
  Put,
} from '@nestjs/common';
import type { UpdateBookRequest } from '@juejin-flow/shared';
import { BooksService } from './books.service';

@Controller('books')
export class BooksController {
  constructor(private readonly booksService: BooksService) {}

  @Get()
  findAll() {
    return this.booksService.findAll();
  }

  @Get('stats')
  getStats() {
    return this.booksService.getStats();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.booksService.findOne(id);
  }

  @Put(':id')
  updateBook(@Param('id') id: string, @Body() request: UpdateBookRequest) {
    return this.booksService.updateBook(id, request);
  }

  @Delete(':id')
  deleteBook(@Param('id') id: string) {
    return this.booksService.deleteBook(id);
  }

  @Get(':bookId/chapters/:chapterId')
  findChapter(
    @Param('bookId') bookId: string,
    @Param('chapterId') chapterId: string,
  ) {
    return this.booksService.findChapter(bookId, chapterId);
  }

  @Put(':bookId/chapters/:chapterId/progress')
  updateProgress(
    @Param('bookId') bookId: string,
    @Param('chapterId') chapterId: string,
    @Body('progress', ParseFloatPipe) progress: number,
    @Body('scrollPosition') scrollPosition?: number,
  ) {
    return this.booksService.updateProgress(
      bookId,
      chapterId,
      progress,
      scrollPosition,
    );
  }
}
