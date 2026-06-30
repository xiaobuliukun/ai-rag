# 墨序

本地优先的 Markdown 小册阅读平台。它会扫描本地书库目录，把 Markdown 文件整理成可阅读的私人图书馆，并提供全文搜索、阅读进度、书签、备份以及基于本地内容的 AI 辅助问答。

## 技术栈

- `packages/web`：Next.js 16 App Router、React 19、Tailwind CSS 4
- `packages/server`：NestJS 11、Prisma、SQLite、SQLite FTS5
- `packages/shared`：前后端共享 TypeScript 类型
- `packages/desktop`：Electron 桌面壳、托盘、自动更新入口、electron-builder 打包

## 快速开始

```bash
npm install
cp packages/server/.env.example packages/server/.env
npm exec -w packages/server prisma migrate deploy
npm run dev:server
npm run dev:web
```

也可以用一个命令同时启动本地 API 和 Web：

```bash
npm run local
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
npm run test:large
npm run test:e2e -w packages/server
npm run test:smoke -w packages/web
```

`test:smoke` 需要先成功运行一次 `npm run build -w packages/web`。
`test:large` 会生成临时大书库、启动生产 API、执行迁移、扫描、搜索、本地 AI 问答和阅读进度更新，结束后默认清理临时目录；加 `-- --keep` 可保留夹具。

## 桌面安装包

桌面壳会启动本地 API 和 Web 服务，并在 Electron 窗口中打开 `http://127.0.0.1:3000`。macOS 会有托盘菜单；打包版本支持通过 `UPDATE_URL` 配置 generic provider 自动更新。

```bash
npm run desktop:dev
npm run desktop:pack
npm run desktop:dist:mac
npm run desktop:dist:mac:signed
```

常用产物：

- macOS：`.app`、`.dmg`、`.zip`
- Windows：`nsis` 安装包、portable 可执行文件
- Linux：`AppImage`、`.deb`

`desktop:dist:mac` 默认跳过本机证书自动发现，用于稳定生成本地未签名 `.dmg` / `.zip`。正式签名发布使用 `desktop:dist:mac:signed`，由 electron-builder 读取平台环境变量完成，例如 macOS 可使用 `CSC_LINK`、`CSC_KEY_PASSWORD`、Apple notarization 相关变量。

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

扫描和重扫支持后台任务进度，管理页会显示当前阶段、已扫描书籍数、章节数和跳过数量，也可以取消正在运行的任务。任务状态默认持久化到 `packages/server/.moxu/scan-jobs.json` 所在的当前服务工作目录；服务重启时未完成任务会标记为中断。

## AI 与 RAG

AI 默认使用本地抽取式回答，不需要外部服务。配置 OpenAI-compatible `baseUrl`、`model`、`apiKey` 后，会调用兼容 `/chat/completions` 的接口生成回答。

Embedding 默认使用本地 hash 向量；配置 `AI_EMBEDDING_PROVIDER=openai-compatible` 和 embedding API key 后，会调用兼容 `/embeddings` 的接口。向量配置变化时，服务会自动重建本地向量数据。

建议在 `packages/server/.env` 中设置稳定的 `AI_CONFIG_SECRET`，用于加密保存 API Key。

## 备份

管理页支持导出和导入 JSON 备份。导入有两种模式：

- 合并：保留现有数据，按书籍路径和章节文件名更新重复内容。
- 替换：清空现有数据后恢复备份。

导出的 AI API Key 会脱敏，不会写入备份文件。

备份文件还会附带浏览器本地阅读偏好，例如主题、字号、行高、亮度、休息提醒和 AI 面板宽度。导入备份后会恢复这些偏好。

## 本地安全

API 默认监听 `127.0.0.1`，并且默认只接受本机 Host（`localhost`、`127.0.0.1`、`[::1]`）请求。即使误把 `HOST` 改成 `0.0.0.0`，非本机访问也会被拒绝。只有明确设置 `ALLOW_REMOTE_API=true` 时，才允许局域网或远程 Host 访问。
