import { Module } from '@nestjs/common';
import { ContentIndexService } from '../content/content-index.service';
import { BackupController } from './backup.controller';
import { BackupService } from './backup.service';

@Module({
  controllers: [BackupController],
  providers: [BackupService, ContentIndexService],
})
export class BackupModule {}
