import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { AppModule } from './../src/app.module';
import { configureHttpApplication } from './../src/http';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  let databaseDirectory: string;
  const previousDatabaseUrl = process.env.DATABASE_URL;

  beforeAll(async () => {
    databaseDirectory = mkdtempSync(join(tmpdir(), 'moxu-e2e-'));
    process.env.DATABASE_URL = `file:${join(databaseDirectory, 'test.db')}`;
    const serverRoot = resolve(__dirname, '..');
    const prismaCli = resolve(
      serverRoot,
      '../../node_modules/prisma/build/index.js',
    );
    execFileSync(
      process.execPath,
      [
        prismaCli,
        'migrate',
        'deploy',
        '--config',
        resolve(serverRoot, 'prisma.config.ts'),
        '--schema',
        resolve(serverRoot, 'prisma/schema.prisma'),
      ],
      {
        cwd: serverRoot,
        env: {
          ...process.env,
          DATABASE_URL: process.env.DATABASE_URL,
          PRISMA_HIDE_UPDATE_MESSAGE: '1',
          RUST_LOG: process.env.RUST_LOG
            ? `${process.env.RUST_LOG},schema_engine=info`
            : 'schema_engine=info',
        },
        stdio: 'pipe',
      },
    );

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication({ bodyParser: false });
    configureHttpApplication(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    if (previousDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }
    rmSync(databaseDirectory, { recursive: true, force: true });
  });

  it('/api (GET)', () => {
    return request(app.getHttpServer())
      .get('/api')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          name: '墨序',
          status: 'ok',
          apiPrefix: 'api',
        });
      });
  });

  it('/api/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('/api/books (GET) uses the migrated isolated database', () => {
    return request(app.getHttpServer())
      .get('/api/books')
      .expect(200)
      .expect([]);
  });

  it('/api/backup/import accepts JSON bodies larger than the framework default', () => {
    return request(app.getHttpServer())
      .post('/api/backup/import')
      .send({ padding: 'x'.repeat(150_000) })
      .expect(400);
  });
});
