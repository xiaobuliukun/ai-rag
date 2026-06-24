import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { ContentIndexService } from '../content/content-index.service';

@Module({
  controllers: [SearchController],
  providers: [SearchService, ContentIndexService],
})
export class SearchModule {}
