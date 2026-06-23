import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { existsSync } from 'fs';
import { join } from 'path';

function getDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const candidates = [
    join(process.cwd(), 'dev.db'),
    join(process.cwd(), 'packages', 'server', 'dev.db'),
    join(__dirname, '..', '..', 'dev.db'),
    join(__dirname, '..', '..', '..', 'dev.db'),
  ];
  const databasePath =
    candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];

  return `file:${databasePath}`;
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({
      adapter: new PrismaBetterSqlite3({
        url: getDatabaseUrl(),
      }),
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
