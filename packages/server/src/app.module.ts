import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { BooksModule } from './books/books.module';
import { ScanModule } from './scan/scan.module';
import { SearchModule } from './search/search.module';
import { AiModule } from './ai/ai.module';
import { BookmarksModule } from './bookmarks/bookmarks.module';
import { BackupModule } from './backup/backup.module';
import { AssetsModule } from './assets/assets.module';

@Module({
  imports: [
    PrismaModule,
    BooksModule,
    ScanModule,
    SearchModule,
    AiModule,
    BookmarksModule,
    BackupModule,
    AssetsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
