import { Global, Module } from '@nestjs/common';
import { ContentIndexService } from './content-index.service';

@Global()
@Module({
  providers: [ContentIndexService],
  exports: [ContentIndexService],
})
export class ContentModule {}
