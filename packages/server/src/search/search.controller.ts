import { Controller, Get, Query } from '@nestjs/common';
import type { SearchQueryRequest } from '../validation/request-validation';
import {
  RequestValidationPipe,
  validateSearchQuery,
} from '../validation/request-validation';
import { SearchService } from './search.service';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get('index-status')
  getIndexStatus() {
    return this.searchService.getIndexStatus();
  }

  @Get()
  search(
    @Query(new RequestValidationPipe(validateSearchQuery))
    query: SearchQueryRequest,
  ) {
    return this.searchService.search(query.q ?? '', query.bookId, query.type);
  }
}
