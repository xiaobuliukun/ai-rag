import { Controller, Get, Query } from '@nestjs/common';
import type { SearchResultType } from '@moxu/shared';
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
    @Query('q') query = '',
    @Query('bookId') bookId?: string,
    @Query('type') type?: SearchResultType,
  ) {
    return this.searchService.search(query, bookId, type);
  }
}
