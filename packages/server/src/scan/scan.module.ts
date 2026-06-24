import { Module } from '@nestjs/common';
import { ScanService } from './scan.service';
import { ScanController } from './scan.controller';
import { ContentIndexService } from '../content/content-index.service';

@Module({
  controllers: [ScanController],
  providers: [ScanService, ContentIndexService],
})
export class ScanModule {}
