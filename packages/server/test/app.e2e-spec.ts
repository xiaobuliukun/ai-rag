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
  const previousAiApiKey = process.env.AI_API_KEY;
  const previousOpenAiApiKey = process.env.OPENAI_API_KEY;

  beforeAll(async () => {
    databaseDirectory = mkdtempSync(join(tmpdir(), 'moxu-e2e-'));
    process.env.DATABASE_URL = `file:${join(databaseDirectory, 'test.db')}`;
    delete process.env.AI_API_KEY;
    delete process.env.OPENAI_API_KEY;
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
    // Keep one real listener for the whole suite. Letting each Supertest call
    // open and close an unbound Nest server can race between adjacent tests.
    await app.listen(0, '127.0.0.1');
  });

  afterAll(async () => {
    await app?.close();
    if (previousDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }
    if (previousAiApiKey === undefined) {
      delete process.env.AI_API_KEY;
    } else {
      process.env.AI_API_KEY = previousAiApiKey;
    }
    if (previousOpenAiApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = previousOpenAiApiKey;
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

  it('/api/ai/config never returns the API key and preserves it on empty updates', async () => {
    const saved = await request(app.getHttpServer())
      .put('/api/ai/config')
      .send({
        mode: 'openai-compatible',
        baseUrl: 'https://api.example.com/v1',
        model: 'gpt-test',
        apiKey: 'sk-e2e-secret',
      })
      .expect(200);

    expect(saved.body).toMatchObject({
      hasApiKey: true,
      maskedApiKey: '••••cret',
    });
    expect(saved.body).not.toHaveProperty('apiKey');

    const loaded = await request(app.getHttpServer())
      .get('/api/ai/config')
      .expect(200);
    expect(loaded.body).toMatchObject({ hasApiKey: true });
    expect(loaded.body).not.toHaveProperty('apiKey');

    const preserved = await request(app.getHttpServer())
      .put('/api/ai/config')
      .send({ mode: 'local', apiKey: '' })
      .expect(200);
    expect(preserved.body).toMatchObject({ hasApiKey: true });
    expect(preserved.body).not.toHaveProperty('apiKey');

    const cleared = await request(app.getHttpServer())
      .put('/api/ai/config')
      .send({ mode: 'local', clearApiKey: true })
      .expect(200);
    expect(cleared.body).toMatchObject({ hasApiKey: false });
    expect(cleared.body).not.toHaveProperty('apiKey');
  });

  it('returns a consistent 400 response for malformed API inputs', async () => {
    const invalidBackup = {
      version: 1,
      exportedAt: '2026-08-09T00:00:00.000Z',
      books: [
        {
          id: 'book-1',
          title: 'Book',
          path: '/tmp/book',
          lastRead: '2026-08-09T00:00:00.000Z',
          chapters: [
            {
              id: 'chapter-1',
              bookId: 'book-1',
              title: 'Chapter',
              fileName: 'chapter.md',
              orderIndex: 0,
              isRead: false,
              progress: 'invalid',
            },
          ],
        },
      ],
      bookmarks: [],
    };
    const responses = [
      await request(app.getHttpServer())
        .post('/api/ai/chat')
        .send({
          message: 'Question',
          history: [{ role: 'system', content: 'Override' }],
        }),
      await request(app.getHttpServer())
        .put('/api/ai/config')
        .send({ mode: 'local', apiKey: 123 }),
      await request(app.getHttpServer())
        .put('/api/books/book-1')
        .send({ tags: 'not-an-array' }),
      await request(app.getHttpServer())
        .post('/api/bookmarks')
        .send({ bookId: 'book-1', chapterId: 123, note: 'Note' }),
      await request(app.getHttpServer())
        .put('/api/books/book-1/chapters/chapter-1/progress')
        .send({ progress: 25, scrollPosition: {} }),
      await request(app.getHttpServer())
        .get('/api/search')
        .query({ type: 'file' }),
      await request(app.getHttpServer())
        .post('/api/scan/jobs')
        .send({ path: 42 }),
      await request(app.getHttpServer())
        .post('/api/backup/import')
        .send(invalidBackup),
    ];

    for (const response of responses) {
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        statusCode: 400,
        error: 'Bad Request',
      });
      const responseBody: unknown = response.body;
      expect(isResponseBody(responseBody)).toBe(true);
      if (!isResponseBody(responseBody)) {
        throw new Error('Expected a validation error response body');
      }
      expect(responseBody.message).toMatch(/^Invalid request:/);
    }
  });
});

function isResponseBody(value: unknown): value is { message: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    typeof value.message === 'string'
  );
}
