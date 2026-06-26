# Juejin Flow Server

NestJS API 服务，负责本地书库扫描、SQLite 数据持久化、全文检索、AI 上下文检索、书签、备份和本地资源读取。

## Scripts

```bash
npm run start:dev -w packages/server
npm run build -w packages/server
npm run test -w packages/server
npm run test:e2e -w packages/server
```

## Database

Prisma 使用 SQLite。默认数据库路径按顺序查找：

1. `DATABASE_URL`
2. 当前工作目录的 `dev.db`
3. `packages/server/dev.db`

运行迁移：

```bash
npm exec -w packages/server prisma migrate dev
```

## Main API

- `GET /api/books`
- `GET /api/books/stats`
- `GET /api/books/:id`
- `GET /api/books/:bookId/chapters/:chapterId`
- `PUT /api/books/:bookId/chapters/:chapterId/progress`
- `POST /api/scan`
- `GET /api/search`
- `POST /api/ai/chat`
- `POST /api/ai/chat/stream`
- `GET /api/bookmarks`
- `GET /api/backup/export`
- `POST /api/backup/import`
- `GET /api/assets/books/:bookId/files`

AI 默认使用本地抽取式回答；配置 OpenAI-compatible `baseUrl`、`model`、`apiKey` 后，会调用兼容 `/chat/completions` 的模型接口。
