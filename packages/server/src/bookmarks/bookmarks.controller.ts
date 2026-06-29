import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import type {
  CreateBookmarkRequest,
  UpdateBookmarkRequest,
} from '@moxu/shared';
import { BookmarksService } from './bookmarks.service';

@Controller('bookmarks')
export class BookmarksController {
  constructor(private readonly bookmarksService: BookmarksService) {}

  @Get()
  findAll(
    @Query('bookId') bookId?: string,
    @Query('chapterId') chapterId?: string,
  ) {
    return this.bookmarksService.findAll({ bookId, chapterId });
  }

  @Post()
  create(@Body() request: CreateBookmarkRequest) {
    return this.bookmarksService.create(request);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() request: UpdateBookmarkRequest) {
    return this.bookmarksService.update(id, request);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.bookmarksService.remove(id);
  }
}
