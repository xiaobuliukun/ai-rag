# 墨序

本地优先的 Markdown 小册阅读平台。它会扫描本地书库目录，把 Markdown 文件整理成可阅读的私人图书馆，并提供全文搜索、阅读进度、书签、备份以及基于本地内容的 AI 辅助问答。

## 技术栈

- `packages/web`：Next.js 16 App Router、React 19、Tailwind CSS 4
- `packages/server`：NestJS 11、Prisma、SQLite、SQLite FTS5
- `packages/shared`：前后端共享 TypeScript 类型

## 快速开始

```bash
npm install
cp packages/server/.env.example packages/server/.env
npm exec -w packages/server prisma migrate deploy
npm run dev:server
npm run dev:web
```

默认地址：

- Web：`http://127.0.0.1:3000`
- API：`http://127.0.0.1:3001/api`

前端默认请求 `http://localhost:3001/api`，可通过 `NEXT_PUBLIC_API_BASE_URL` 覆盖。

## 常用命令

```bash
npm run dev
npm run build
npm run lint
npm run test
npm run test:e2e -w packages/server
npm run test:smoke -w packages/web
```

`test:smoke` 需要先成功运行一次 `npm run build -w packages/web`。

## 书库目录

扫描时，指定的根目录下每个子目录会被识别为一本书，子目录内的 `.md` 文件会递归识别为章节。章节顺序按相对路径自然排序，前端会按目录层级展示。

示例：

```text
books/
  React 小册/
    01-intro.md
    02-hooks/
      01-use-state.md
      02-use-effect.md
  TypeScript 小册/
    01-basic.md
```

## AI 与 RAG

AI 默认使用本地抽取式回答，不需要外部服务。配置 OpenAI-compatible `baseUrl`、`model`、`apiKey` 后，会调用兼容 `/chat/completions` 的接口生成回答。

Embedding 默认使用本地 hash 向量；配置 `AI_EMBEDDING_PROVIDER=openai-compatible` 和 embedding API key 后，会调用兼容 `/embeddings` 的接口。向量配置变化时，服务会自动重建本地向量数据。

建议在 `packages/server/.env` 中设置稳定的 `AI_CONFIG_SECRET`，用于加密保存 API Key。

## 备份

管理页支持导出和导入 JSON 备份。导入有两种模式：

- 合并：保留现有数据，按书籍路径和章节文件名更新重复内容。
- 替换：清空现有数据后恢复备份。

导出的 AI API Key 会脱敏，不会写入备份文件。
