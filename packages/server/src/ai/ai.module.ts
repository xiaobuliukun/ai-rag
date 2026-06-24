import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { ContentIndexService } from '../content/content-index.service';

@Module({
  controllers: [AiController],
  providers: [AiService, ContentIndexService],
})
export class AiModule {}
