import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { ScanService } from './scan.service';

@Controller('scan')
export class ScanController {
  constructor(private readonly scanService: ScanService) {}

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
}
