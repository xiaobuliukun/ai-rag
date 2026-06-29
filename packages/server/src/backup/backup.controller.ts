import { Body, Controller, Get, Post } from '@nestjs/common';
import type { BackupPayload, ImportBackupRequest } from '@juejin-flow/shared';
import { BackupService } from './backup.service';

@Controller('backup')
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  @Get('export')
  exportBackup() {
    return this.backupService.exportBackup();
  }

  @Post('import')
  importBackup(@Body() request: BackupPayload | ImportBackupRequest) {
    return this.backupService.importBackup(request);
  }
}
