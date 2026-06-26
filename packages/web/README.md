# Juejin Flow Web

Next.js 16 App Router + React 19 前端，用于本地 Markdown 小册阅读、书库管理、搜索、AI 助手、书签和阅读偏好设置。

## Scripts

```bash
npm run dev -w packages/web
npm run build -w packages/web
npm run lint -w packages/web
npm run test -w packages/web
npm run test:smoke -w packages/web
```

开发服务默认绑定 `127.0.0.1`。前端 API 地址默认是 `http://localhost:3001/api`，可通过 `NEXT_PUBLIC_API_BASE_URL` 覆盖。
`test:smoke` 需要先有一次成功的 `npm run build -w packages/web`，它会启动 `next start` 并检查核心页面是否能返回应用壳。

## Routes

- `/`：书库首页、扫描入口、阅读统计
- `/book/[bookId]`：章节列表
- `/book/[bookId]/[chapterId]`：阅读器、进度保存、书签、AI 上下文
- `/search`：标题、章节和正文检索
- `/management`：书籍元数据、封面、书签、备份
- `/settings`：语言、主题、阅读偏好、AI 配置

## Next 16 Notes

- `params` 和 `searchParams` 按 Next 15+ 约定作为 `Promise` 处理。
- 页面读取仍由 Server Components 发起；交互密集的阅读器、管理页、搜索页使用 Client Components。
- 本地封面和 Markdown 图片通过后端 `/api/assets` 服务读取，`next/image` 使用 `unoptimized` 避免本地文件代理造成优化限制。
