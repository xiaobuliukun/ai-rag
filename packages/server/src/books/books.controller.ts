import {
  Controller,
  Get,
  Param,
  Put,
  Body,
  ParseFloatPipe,
} from '@nestjs/common';
import { BooksService } from './books.service';

@Controller('books')
export class BooksController {
  constructor(private readonly booksService: BooksService) {}

  @Get()
  findAll() {
    return this.booksService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.booksService.findOne(id);
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
  ) {
    return this.booksService.updateProgress(bookId, chapterId, progress);
  }
}
