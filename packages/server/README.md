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

非交互环境应用已提交迁移：

```bash
npm exec -w packages/server prisma migrate deploy
```

复制示例环境变量：

```bash
cp packages/server/.env.example packages/server/.env
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
建议设置 `AI_CONFIG_SECRET` 用于本地加密保存 API Key；未设置时会使用本地 fallback secret。RAG 可配置引用数量、模型上下文字数、单条摘录长度和 embedding provider。Embedding 默认使用本地 hash 向量；配置 `AI_EMBEDDING_PROVIDER=openai-compatible` 与 embedding API key 后，会调用兼容 `/embeddings` 的接口，并在向量配置变化时自动重建本地向量索引。
