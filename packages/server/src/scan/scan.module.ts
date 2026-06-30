import { Module } from '@nestjs/common';
import { ScanService } from './scan.service';
import { ScanController } from './scan.controller';
import { ContentIndexService } from '../content/content-index.service';
import { ScanJobsService } from './scan-jobs.service';

@Module({
  controllers: [ScanController],
  providers: [ScanService, ScanJobsService, ContentIndexService],
})
export class ScanModule {}
