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
import type { BookmarkQueryRequest } from '../validation/request-validation';
import {
  RequestValidationPipe,
  validateBookmarkQuery,
  validateCreateBookmarkRequest,
  validateIdentifier,
  validateUpdateBookmarkRequest,
} from '../validation/request-validation';
import { BookmarksService } from './bookmarks.service';

@Controller('bookmarks')
export class BookmarksController {
  constructor(private readonly bookmarksService: BookmarksService) {}

  @Get()
  findAll(
    @Query(new RequestValidationPipe(validateBookmarkQuery))
    query: BookmarkQueryRequest,
  ) {
    return this.bookmarksService.findAll(query);
  }

  @Post()
  create(
    @Body(new RequestValidationPipe(validateCreateBookmarkRequest))
    request: CreateBookmarkRequest,
  ) {
    return this.bookmarksService.create(request);
  }

  @Put(':id')
  update(
    @Param(
      'id',
      new RequestValidationPipe((value) => validateIdentifier(value)),
    )
    id: string,
    @Body(new RequestValidationPipe(validateUpdateBookmarkRequest))
    request: UpdateBookmarkRequest,
  ) {
    return this.bookmarksService.update(id, request);
  }

  @Delete(':id')
  remove(
    @Param(
      'id',
      new RequestValidationPipe((value) => validateIdentifier(value)),
    )
    id: string,
  ) {
    return this.bookmarksService.remove(id);
  }
}
