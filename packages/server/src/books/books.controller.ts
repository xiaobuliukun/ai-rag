import { Body, Controller, Delete, Get, Param, Put } from '@nestjs/common';
import type { UpdateBookRequest, UpdateProgressRequest } from '@moxu/shared';
import {
  RequestValidationPipe,
  validateIdentifier,
  validateProgressRequest,
  validateUpdateBookRequest,
} from '../validation/request-validation';
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
  updateBook(
    @Param(
      'id',
      new RequestValidationPipe((value) => validateIdentifier(value)),
    )
    id: string,
    @Body(new RequestValidationPipe(validateUpdateBookRequest))
    request: UpdateBookRequest,
  ) {
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
    @Param(
      'bookId',
      new RequestValidationPipe((value) => validateIdentifier(value, 'bookId')),
    )
    bookId: string,
    @Param(
      'chapterId',
      new RequestValidationPipe((value) =>
        validateIdentifier(value, 'chapterId'),
      ),
    )
    chapterId: string,
    @Body(new RequestValidationPipe(validateProgressRequest))
    request: UpdateProgressRequest,
  ) {
    return this.booksService.updateProgress(
      bookId,
      chapterId,
      request.progress,
      request.scrollPosition,
      request.readingSecondsDelta,
    );
  }
}
