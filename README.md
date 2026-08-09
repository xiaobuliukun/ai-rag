# 墨序

墨序是一个本地优先的 Markdown 小册阅读平台。它会扫描本地书库目录，把散落的 Markdown 文件整理成可阅读、可检索、可追踪进度的私人图书馆，并提供书签、备份、桌面端、移动端以及基于本地内容的 AI 辅助问答。

项目目标不是做一个云端内容平台，而是给个人知识库和本地学习资料提供一个稳定、可控、低依赖的阅读工作台：数据保存在本机，API 默认只接受本机访问，AI 默认也可以完全离线使用本地抽取式回答。

## 核心能力

- 本地书库扫描：根目录下每个一级子目录识别为一本书，递归 `.md` 文件识别为章节。
- Markdown 阅读：支持章节树、阅读进度、阅读时长、书签、图片资源和代码块展示。
- 全文搜索：书名、章节名、正文内容统一检索，正文使用 SQLite FTS5。
- 语义检索：默认本地 hash embedding，可配置 OpenAI-compatible `/embeddings`。
- AI 问答：默认本地抽取式回答，可配置 OpenAI-compatible `/chat/completions`。
- 数据备份：导出/导入书籍、章节、进度、书签、AI/RAG 配置和前端阅读偏好。
- 多端入口：Web、Electron 桌面端、Expo React Native 移动端共享同一套本地 API。
- 本地安全：API 默认监听 `127.0.0.1`，并默认拒绝非本机 Host。

## Monorepo 结构

```text
packages/
  server/    NestJS API，Prisma，SQLite，FTS5，RAG 与备份
  web/       Next.js Web 阅读器与管理界面
  app/       Expo React Native 移动端
  desktop/   Electron 桌面壳与安装包配置
  shared/    前后端共享 TypeScript 类型
docs/
  product_requirements_document.md
  technical_architecture_document.md
scripts/
  moxu-local.mjs
  large-library-smoke.mjs
```

## 技术栈

- `packages/server`：NestJS 11、Prisma 7、better-sqlite3、SQLite、SQLite FTS5
- `packages/web`：Next.js 16 App Router、React 19、Tailwind CSS 4、Zustand
- `packages/app`：Expo SDK 57、React Native 0.86、Expo Router、SecureStore
- `packages/desktop`：Electron、electron-builder、electron-updater
- `packages/shared`：共享 DTO、实体和 API 类型

## 快速开始

```bash
npm install
cp packages/server/.env.example packages/server/.env
npm exec -w packages/server prisma migrate deploy
```

启动 API：

```bash
npm run dev:server
```

启动 Web：

```bash
npm run dev:web
```

启动移动端：

```bash
npm run dev:app
```

也可以同时启动本地 API 和 Web：

```bash
npm run local
```

默认地址：

- API：`http://127.0.0.1:3001/api`
- Web：`http://127.0.0.1:3000`
- App：Expo Dev Server，默认由 `npm run dev:app` 启动

Web 默认请求 `http://localhost:3001/api`，可通过 `NEXT_PUBLIC_API_BASE_URL` 覆盖。

移动端默认 iOS 使用 `http://127.0.0.1:3001/api`，Android 模拟器使用 `http://10.0.2.2:3001/api`。真机调试时，需要在 App 设置页把 API 地址改成电脑局域网地址，例如 `http://192.168.1.8:3001/api`。

## 常用命令

```bash
# 全工作区
npm run dev
npm run build
npm run lint
npm run test
npm run test:unit
npm run verify

# Web
npm run dev:web
npm run build:web
npm run test:smoke -w packages/web

# API
npm run dev:server
npm run build:server
npm run test:e2e -w packages/server

# App
npm run dev:app
npm run app:ios
npm run app:android
npm run typecheck -w packages/app

# Desktop
npm run desktop:dev
npm run test -w packages/desktop
npm run desktop:pack
npm run desktop:dist:mac
npm run desktop:dist:mac:signed
npm run desktop:dist:win
npm run desktop:dist:linux

# 大书库烟测
npm run test:large
```

`test:smoke` 需要先成功运行一次 `npm run build -w packages/web`。

`test:large` 会生成临时大书库、启动生产 API、执行迁移、扫描、搜索、本地 AI 问答和阅读进度更新，结束后默认清理临时目录；加 `-- --keep` 可保留夹具。

## 环境变量

服务端示例配置位于 `packages/server/.env.example`。

常用项：

```bash
DATABASE_URL="file:./dev.db"
CORS_ORIGINS="http://127.0.0.1:3000,http://localhost:3000"
ALLOW_REMOTE_API="false"
API_ACCESS_TOKEN=""
API_BODY_LIMIT="50mb"
AI_CONFIG_SECRET="replace-with-a-long-random-secret"

AI_BASE_URL="https://api.openai.com/v1"
AI_MODEL="gpt-4o-mini"
AI_API_KEY=""
AI_REQUEST_TIMEOUT_MS="60000"

AI_EMBEDDING_PROVIDER="local"
AI_EMBEDDING_BASE_URL="https://api.openai.com/v1"
AI_EMBEDDING_MODEL="text-embedding-3-small"
AI_EMBEDDING_API_KEY=""
AI_EMBEDDING_TIMEOUT_MS="30000"

AI_RAG_SOURCE_COUNT="5"
AI_RAG_CONTEXT_CHARS="12000"
AI_RAG_EXCERPT_CHARS="520"
```

移动端可通过 `EXPO_PUBLIC_API_BASE_URL` 指定默认 API 地址，也可以在 App 设置页保存到 SecureStore。启用远程 API 时，可在 App 设置页填写访问令牌（同样保存在 SecureStore），或用 `EXPO_PUBLIC_API_ACCESS_TOKEN` 提供开发期默认值。Web 端可使用 `NEXT_PUBLIC_API_ACCESS_TOKEN`，所有 API fetch 和受保护的本地图片请求都会携带 Bearer Token。JSON 和表单请求体默认上限为 `50mb`，可通过 `API_BODY_LIMIT` 调整。

## 书库目录约定

扫描时，指定根目录下每个一级子目录会被识别为一本书。子目录内的 `.md` 文件会递归识别为章节。章节顺序按相对路径自然排序，前端会按目录层级展示。

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

扫描会写入：

- `Book`：书籍标题、路径、描述、标签、封面、最近阅读时间
- `Chapter`：章节标题、相对文件名、正文内容、顺序、进度
- `ChapterChunk`：用于搜索和 RAG 的正文切片
- FTS5 表：用于正文全文检索
- `VectorData`：用于语义检索

扫描和重扫支持后台任务进度。服务会把最近扫描任务状态写入本地 JSON 文件，默认路径是当前服务工作目录下的 `.moxu/scan-jobs.json`。服务重启时，未完成任务会标记为中断。

## 服务端 API

所有 API 默认挂载在 `/api` 下。

核心路由：

```text
GET    /api/health
GET    /api/books
GET    /api/books/stats
GET    /api/books/:bookId
PUT    /api/books/:bookId
DELETE /api/books/:bookId
GET    /api/books/:bookId/chapters/:chapterId
PUT    /api/books/:bookId/chapters/:chapterId/progress

POST   /api/scan
POST   /api/scan/rescan-known
POST   /api/scan/jobs
POST   /api/scan/rescan-known/jobs
GET    /api/scan/jobs/:id
POST   /api/scan/jobs/:id/cancel

GET    /api/search
GET    /api/search/index-status

POST   /api/ai/chat
POST   /api/ai/chat/stream
GET    /api/ai/config
PUT    /api/ai/config

GET    /api/bookmarks
POST   /api/bookmarks
PUT    /api/bookmarks/:id
DELETE /api/bookmarks/:id

GET    /api/backup/export
POST   /api/backup/import

GET    /api/assets/books/:bookId/files?path=...
```

## 搜索与 RAG

墨序的检索分三层：

1. 书籍和章节元数据：通过 Prisma `contains` 查询标题、描述、标签、文件名。
2. 正文全文检索：扫描时把 chunk 写入 SQLite FTS5 表，通过 `MATCH` 和 `bm25` 排序。
3. 语义检索：扫描时为 chunk 写入 `VectorData`，当书名、章节名和 FTS 都无词法命中时，再用余弦相似度做回退，远程 Embedding 不会拖慢已有关键词结果。

Embedding 默认使用本地 hash 向量，不需要外部服务。配置 `AI_EMBEDDING_PROVIDER=openai-compatible` 并提供 key 后，会调用兼容 `/embeddings` 的接口。向量配置变化时，服务会自动重建本地向量数据。

AI 默认使用本地抽取式回答，不会编造未在资料中出现的结论。RAG 先使用当前章节、FTS 和本地章节内容，只有本地来源无有效命中时才尝试语义回退。配置 OpenAI-compatible `baseUrl`、`model`、`apiKey` 后，会调用兼容 `/chat/completions` 的接口生成回答。如果远程模型请求失败且已检索到资料，会自动降级为本地抽取式回答。

独立运行 Server 时，建议在 `packages/server/.env` 中设置稳定的 `AI_CONFIG_SECRET`，用于加密保存 API Key。Desktop 会在首次启动时自动生成仅当前用户可读的随机密钥并持续复用。

## Web 端

Web 端位于 `packages/web`，主要页面：

- `/`：书库首页、扫描入口、阅读统计、快速搜索
- `/book/[bookId]`：书籍章节列表
- `/book/[bookId]/[chapterId]`：阅读器
- `/search`：全库搜索
- `/management`：书籍管理、封面、书签、备份、重扫
- `/settings`：阅读偏好、主题、语言、AI/RAG 配置

Web 使用 Zustand 持久化本地阅读偏好，包括侧栏、AI 面板宽度、字号、行高、亮度、护眼色温和休息提醒。API Key 不写入 Zustand、localStorage 或前端偏好备份。

## 移动端

移动端位于 `packages/app`，使用 Expo Router，并参考 `magic-native-app` 的分层方式组织代码：

```text
packages/app/src/
  app/              Expo Router 路由
  application/      Provider、设置状态、跨功能应用服务
  design-system/    颜色 token 与基础 UI primitive
  domains/          library、reader 等领域模型和纯逻辑
  features/         library、search、reader、assistant、settings 页面
  infrastructure/   API client 与服务端适配
  shared/           通用工具
```

当前移动端已实现：

- 书库列表和阅读统计
- 服务端路径扫描、已知书籍重扫、扫描任务进度和取消
- 书籍章节列表、书名/描述/标签/封面编辑与删除
- 章节阅读、Markdown 基础渲染、阅读进度、真实阅读时长和位置恢复
- 章节书签的创建、跳转和删除
- 全库搜索
- AI 问答
- API 地址、访问令牌、AI 模式、Embedding 和 RAG 参数配置

移动端调试提示：

- iOS 模拟器可以直接使用 `http://127.0.0.1:3001/api`。
- Android 模拟器默认使用 `http://10.0.2.2:3001/api`。
- 真机必须使用电脑局域网 IP，并同时设置 `ALLOW_REMOTE_API=true` 与非空 `API_ACCESS_TOKEN`，再在 App 设置页填写相同令牌。
- 如果 `8081` 被其他 Metro 占用，可以执行 `npm run start -w packages/app -- --port 8082`。

## 桌面端

桌面端位于 `packages/desktop`。Electron 壳会先应用 Prisma migration，再启动本地 API 和 Next standalone Web 服务，默认在窗口中打开 `http://127.0.0.1:3000`。可用 `MOXU_WEB_PORT` 和 `MOXU_API_PORT` 修改端口；两者必须不同且启动前会检查占用，自定义 Web 端口会自动加入本地 CORS 来源。自动化 smoke 可用绝对路径 `MOXU_USER_DATA_DIR` 隔离数据库、扫描任务和本地密钥。

常用产物：

- macOS：`.app`、`.dmg`、`.zip`
- Windows：`nsis` 安装包、portable 可执行文件
- Linux：`AppImage`、`.deb`

`desktop:dist:mac` 默认跳过本机证书自动发现，用于稳定生成本地未签名 `.dmg` / `.zip`。正式签名发布使用 `desktop:dist:mac:signed`，由 electron-builder 读取平台环境变量完成，例如 macOS 可使用 `CSC_LINK`、`CSC_KEY_PASSWORD` 和 Apple notarization 相关变量。

正式打包版本默认从 `xiaobuliukun/ai-rag` 的 GitHub Release 检查更新，也可以通过安全的 `UPDATE_URL` 和 `UPDATE_CHANNEL` 覆盖为自建更新源。多平台发布、签名凭据和产物校验流程见 `docs/releasing.md`。

## 备份与恢复

管理页支持导出和导入 JSON 备份。导入模式：

- 合并：保留现有数据，按书籍路径和章节文件名更新重复内容。
- 替换：清空现有数据后恢复备份。

备份内容包括：

- 书籍元数据
- 章节内容和 chunk
- 阅读进度和阅读时长
- 书签
- AI/RAG 配置
- 浏览器本地阅读偏好

导出的 AI API Key 会脱敏，不会写入备份文件。

导入后会重建受影响书籍的 FTS 和向量索引。由于备份不包含密钥，使用“替换”导入后需要在设置页重新填写 AI API Key；“合并”导入不会因备份省略密钥而清空现有 Key。

## 本地安全

API 默认监听 `127.0.0.1`，并且默认同时校验请求的 Host 与实际 socket 来源地址。只有两者都属于本机回环地址时，才按本地请求放行：

- `localhost`
- `127.0.0.1`
- `[::1]`

因此，即使远程客户端伪造 `Host: localhost`，或误把 `HOST` 改成 `0.0.0.0`，默认仍会拒绝。只有明确设置 `ALLOW_REMOTE_API=true` 且提供非空 `API_ACCESS_TOKEN` 时，才允许非本机访问；缺少令牌时服务会拒绝远程请求。

开放局域网访问前，必须生成高强度随机值并设置 `API_ACCESS_TOKEN`：

```bash
openssl rand -hex 32
```

配置后，所有非本机请求必须携带 `Authorization: Bearer <token>`；本机桌面/Web 默认模式仍不需要令牌。Web 客户端可配置 `NEXT_PUBLIC_API_ACCESS_TOKEN`，移动端可在设置页安全保存令牌。`NEXT_PUBLIC_*` 会进入浏览器产物，它只适合受信任的本地/局域网部署，不能替代正式的多用户登录体系。使用普通 HTTP 时令牌不会被加密传输，跨不可信网络应使用 HTTPS、VPN 或 SSH 隧道。

书籍资源接口会同时检查规范路径与 `realpath`，防止通过 `..` 或符号链接读取书籍目录外文件；接口只提供常见图片格式，并返回 `nosniff` 与内容隔离响应头。

AI API Key 使用 AES-256-GCM 加密后保存到本地 SQLite。Desktop 首次启动时会在用户数据目录生成权限为 `0600` 的随机 `AI_CONFIG_SECRET`；已有 Desktop 数据会兼容旧密钥并在读取配置时自动轮换。独立运行 Server 时如果未设置该变量，仍会退回到数据库 URL 或默认本地字符串，因此正式部署建议显式配置。

OpenAI-compatible Chat 与 Embedding 的 Base URL 只接受带协议的 `http://` 或 `https://` 绝对地址，因此 `http://127.0.0.1:11434/v1` 等本地模型地址仍可用，而 `file:`、`ftp:` 等危险 scheme 会被拒绝。远程请求分别受 `AI_REQUEST_TIMEOUT_MS`（默认 60 秒）和 `AI_EMBEDDING_TIMEOUT_MS`（默认 30 秒）限制。

## 测试与质量

已有测试覆盖：

- 服务健康检查
- CORS 和本地访问保护
- Prisma 服务
- 扫描、后台扫描任务和取消
- 书籍统计、阅读进度和阅读时长
- chunk 切分
- FTS 查询、搜索排序和语义检索合并
- AI 本地回答、RAG source 限制、流式输出、配置加密
- 备份导入合并和索引重建
- Web 章节树、Markdown 图片、阅读偏好

推荐提交前运行：

```bash
npm run test:unit
npm run typecheck
npm run lint
```

完整发布前验证可运行 `npm run verify`，它还会串行执行 Server E2E、全工作区构建、Web smoke 和大书库 smoke。

如果改动 Web UI，再运行：

```bash
npm run build -w packages/web
npm run test:smoke -w packages/web
```

## 当前边界

- 书库扫描只识别根目录下的一级子目录为书；根目录直接放 `.md` 不会被识别为独立书籍。
- 移动端当前是核心闭环版本，Markdown 渲染为轻量实现，不等同于 Web 端完整 `react-markdown` 能力。
- 本地 hash embedding 是轻量兜底方案，语义质量不等同于真实 embedding 模型。
- 远程 AI 和 embedding 均依赖 OpenAI-compatible 服务可用性；Chat 失败时会降级到本地抽取式回答，Embedding 失败时 FTS 关键词检索仍可用，旧向量会保留但不会通过 freshness 校验或参与新查询，等待后续成功重建。
