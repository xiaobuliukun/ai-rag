import {
  Controller,
  Post,
  Body,
  BadRequestException,
  Get,
  Param,
} from '@nestjs/common';
import { ScanService } from './scan.service';
import { ScanJobsService } from './scan-jobs.service';

@Controller('scan')
export class ScanController {
  constructor(
    private readonly scanService: ScanService,
    private readonly scanJobsService: ScanJobsService,
  ) {}

  @Post()
  async scan(@Body('path') path: string) {
    if (!path) {
      throw new BadRequestException('Path is required');
    }
    return this.scanService.scanDirectory(path);
  }

  @Post('rescan-known')
  rescanKnownBooks() {
    return this.scanService.rescanKnownBooks();
  }

  @Post('jobs')
  startScanJob(@Body('path') path: string) {
    if (!path) {
      throw new BadRequestException('Path is required');
    }
    return { job: this.scanJobsService.startScan(path) };
  }

  @Post('rescan-known/jobs')
  startRescanKnownBooksJob() {
    return { job: this.scanJobsService.startRescanKnownBooks() };
  }

  @Get('jobs/:id')
  getScanJob(@Param('id') id: string) {
    return { job: this.scanJobsService.getJob(id) };
  }

  @Post('jobs/:id/cancel')
  cancelScanJob(@Param('id') id: string) {
    return { job: this.scanJobsService.cancelJob(id) };
  }
}
