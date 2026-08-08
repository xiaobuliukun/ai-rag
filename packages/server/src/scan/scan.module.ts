import { Module } from '@nestjs/common';
import { ScanService } from './scan.service';
import { ScanController } from './scan.controller';
import { ScanJobsService } from './scan-jobs.service';

@Module({
  controllers: [ScanController],
  providers: [ScanService, ScanJobsService],
})
export class ScanModule {}
