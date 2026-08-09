import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import {
  RequestValidationPipe,
  validateIdentifier,
  validateScanRequest,
} from '../validation/request-validation';
import { ScanService } from './scan.service';
import { ScanJobsService } from './scan-jobs.service';

@Controller('scan')
export class ScanController {
  constructor(
    private readonly scanService: ScanService,
    private readonly scanJobsService: ScanJobsService,
  ) {}

  @Post()
  async scan(
    @Body(new RequestValidationPipe(validateScanRequest))
    request: {
      path: string;
    },
  ) {
    return this.scanService.scanDirectory(request.path);
  }

  @Post('rescan-known')
  rescanKnownBooks() {
    return this.scanService.rescanKnownBooks();
  }

  @Post('jobs')
  startScanJob(
    @Body(new RequestValidationPipe(validateScanRequest))
    request: {
      path: string;
    },
  ) {
    return { job: this.scanJobsService.startScan(request.path) };
  }

  @Post('rescan-known/jobs')
  startRescanKnownBooksJob() {
    return { job: this.scanJobsService.startRescanKnownBooks() };
  }

  @Get('jobs/:id')
  getScanJob(
    @Param(
      'id',
      new RequestValidationPipe((value) => validateIdentifier(value)),
    )
    id: string,
  ) {
    return { job: this.scanJobsService.getJob(id) };
  }

  @Post('jobs/:id/cancel')
  cancelScanJob(
    @Param(
      'id',
      new RequestValidationPipe((value) => validateIdentifier(value)),
    )
    id: string,
  ) {
    return { job: this.scanJobsService.cancelJob(id) };
  }
}
