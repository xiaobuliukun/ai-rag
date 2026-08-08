# 墨序 Server

NestJS API 服务，负责本地书库扫描、SQLite 数据持久化、全文检索、AI 上下文检索、书签、备份和本地资源读取。

## Scripts

```bash
npm run start:dev -w packages/server
npm run build -w packages/server
npm run typecheck -w packages/server
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
独立运行 Server 时建议设置 `AI_CONFIG_SECRET`，用于本地加密保存 API Key；未设置时会使用本地 fallback secret。打包 Desktop 会在首次启动时自动生成并持久化随机密钥，同时兼容并轮换旧密钥。RAG 可配置引用数量、模型上下文字数、单条摘录长度和 embedding provider。Embedding 默认使用本地 hash 向量；配置 `AI_EMBEDDING_PROVIDER=openai-compatible` 与 embedding API key 后，会调用兼容 `/embeddings` 的接口，并在向量配置变化时自动重建本地向量索引。

API 默认只接受 Host 与 socket 来源均为回环地址的本机请求。局域网使用必须同时设置 `ALLOW_REMOTE_API=true` 和非空随机 `API_ACCESS_TOKEN`；否则远程请求会被拒绝。非本机请求必须发送 `Authorization: Bearer <token>`。OpenAI-compatible Base URL 仅允许 `http://`/`https://`，Chat 和 Embedding 请求超时可分别通过 `AI_REQUEST_TIMEOUT_MS`、`AI_EMBEDDING_TIMEOUT_MS` 调整。JSON/urlencoded 请求体默认上限为 `50mb`，可用 `API_BODY_LIMIT` 覆盖。

远程 Embedding 失败不会阻断 FTS 自修复：正文全文索引会保持最新，已有向量不会被破坏性清空，但内容、标题、provider、model、Base URL 指纹或维度不匹配时会被判定为未就绪且不参与查询。向量 metadata 会记录这些 freshness 信息，用于自动判断是否需要重建。
