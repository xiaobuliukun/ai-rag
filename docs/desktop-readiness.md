# Electron 桌面端验收记录

核对日期：2026-10-16。当前结构为 Electron 主进程 + 沙箱 preload + 静态 React renderer + 本地 Nest HTTP API。

## 目标逐项验收

| 目标要求 | 当前证据 | 尚缺条件 |
| --- | --- | --- |
| 桌面端到端流程 | `test/e2e/run.cjs` 覆盖真实 Electron / Nest / SQLite 的扫描、阅读、搜索、AI SSE 和备份；提交 `2c01243` 的 `desktop-smoke` 运行 38841014944 中 macOS arm64、macOS x64、Windows x64、Linux x64 全部通过 | 各系统安装器、签名 / 公证和真实更新流程 |
| 原生文件 / 目录对话框 | 主进程 Electron dialog、受限 preload、React 调用均已接通；取消、文件错误和返回值已有验证 | 各系统文件选择器的人工点击验收 |
| Renderer CSP 与 preload 类型安全 | 内联脚本及未许可连接被真实浏览器阻止；沙箱与 Node 全局隔离已核对；共享桥接类型纳入 TypeScript 检查；四平台 smoke 均通过 | 无本机功能阻塞；系统文件选择器仍需人工点击验收 |
| Nest 异常恢复 | 真实子进程连续两次崩溃后成功重启；新端口重载、持久数据恢复、退出清理均通过；四平台 smoke 均通过 | 各系统安装器、签名 / 公证和真实更新流程 |
| 文档与发布检查 | 完整验证、实际成品启动、依赖审计失败处理及四平台工作流已接入；提交 `2c01243` 的 CI 运行 38841014930 的完整验证和 Electron 流程通过 | 依赖审计通过；原生平台、安装器、签名 / 公证与真实更新验收 |

所有目标要求均满足后才能将“达到可发布状态”标记完成；已接入的检查和未运行的检查不能视为通过。

## 远程检查记录

[提交 `2c01243` 的 CI 运行 38841014930](https://github.com/xiaobuliukun/ai-rag/actions/runs/38841014930) 已完成：依赖安装和 Linux Clang 安装成功，`audit:policy` 仍失败；在安装和编译器准备成功后，完整 `verify` 与 Electron 流程均继续执行并通过。`audit:policy` 是该运行唯一失败步骤。

[提交 `2c01243` 的 `desktop-smoke` 运行 38841014944](https://github.com/xiaobuliukun/ai-rag/actions/runs/38841014944) 的 macOS arm64、macOS x64、Windows x64、Linux x64 四个 job 全部通过。该工作流验证未签名解包应用和自动化对话框替身；系统文件选择器自身仍需人工点击验收。

## 已实现

- 书库和管理页的原生目录选择；管理页的原生备份导入、导出、确认和封面图片选择。
- 取消图片选择不会再次打开浏览器文件框；读取失败会显示错误；图片异步限量读取，并检查扩展名、文件头及 1.5 MB 上限。
- Renderer CSP 限制脚本和网络连接；preload 与共享前端共用接口类型，并纳入桌面 TypeScript 检查。
- 修正 Tailwind 扫描范围，桌面构建包含共享 React 组件的布局样式。
- Nest 异常退出后提供“重启服务 / 退出应用”；恢复时强制刷新当前路由，使 preload 取得新端口。退出时等待服务结束，超时强制终止。
- 增加真实 Electron 流程测试和 CI / 原生平台发布流程中的测试入口；发布流程还会启动实际打包的应用验证内置资源、首次迁移和退出清理。
- 增加独立 `desktop-smoke` 工作流：相关 PR 和手动运行均可在四个平台构建未签名应用并运行 E2E / 成品启动检查；只使用读取权限，无需发布凭据。正式发布仍必须通过依赖审计与签名检查。
- CI 的审计失败仍使工作流失败；在安装和编译器准备成功且任务未取消时，继续运行完整验证，成功后再运行 Electron E2E，避免审计失败遮蔽桌面回归结果。
- CI 的 Electron E2E 在 runner 临时失败时最多自动重试一次；第二次失败仍会阻止工作流，避免把真实回归变成软失败。
- 运行时准备脚本通过 Node 执行当前 npm CLI，避免 Windows 直接启动 `npm.cmd` 失败，并保持 npm 版本一致。含空格和 `&` 的 CLI 路径已有真实子进程回归验证。
- Linux 原生模块重建默认采用系统 Clang，并保留显式 `CC` / `CXX` 配置；构建后恢复调用进程的编译器环境。Linux CI 增加编译器安装步骤。
- Electron 升至 43.7.11，Nest 升至 11.2.7，Next / eslint-config-next 升至 16.3.8，并更新可兼容的安全补丁依赖。
- 根目录使用 npm 11.21.0 验证 workspace 覆盖：`mysql2`、`deepmerge-ts`、`postcss-selector-parser` 和 `uuid` 已固定到兼容的修复版本；桌面 CSS 输出、Prisma 迁移和 Xcode UUID 生成均已复核。
- 同步 Expo SDK 57 补丁版本和 React Native 0.86.3，显式声明所需 peer 依赖；Jest 从 Expo 自身的安装位置解析 expo-modules-core，避免依赖 npm 是否将其提升到根目录。
- 根目录固定 eslint-plugin-react-hooks 7.0.1，保持原有检查规则。本次安全更新不包含 React 编译器新规则迁移。

## 本机验证

macOS arm64，Electron 43.7.11：

- Desktop 单元测试 37 项、Nest 单元测试 117 项、Web 单元测试 22 项、App 单元测试 4 项、发布工具测试 8 项通过。
- 完整 `npm run verify` 通过：全工作区 lint、类型检查、单元测试、Nest HTTP E2E、Expo Doctor、全部构建、桌面原生运行时、Web 冒烟和大书库检查。大书库夹具包含 18 本书、504 个章节和 2,520 个文本块。
- Electron 43.7.11 的 macOS arm64 二进制由 npmmirror 下载，SHA-256 与官方 npm 包内 checksums.json 一致；原生运行时已针对该版本重建，并通过真实迁移及 better-sqlite3 验证。
- macOS arm64 未签名 `.app` 打包及 `test:packaged` 通过。从临时工作目录和全新 userData 启动实际产物后，迁移、页面导航、preload、Nest HTTP 和退出清理均通过。本机打包使用 `electronDist` 复用已校验的 Electron 43.7.11，并关闭证书自动发现；未进行正式签名或发布。
- Electron E2E 在临时数据目录完成数据库迁移、原生选择返回值、扫描、封面、阅读图片、阅读进度、书签、搜索、AI 面板 SSE、备份导出/导入和数据恢复。
- 连续两次终止真实 Nest 子进程后恢复成功；CSP 阻止内联脚本及未允许的连接；应用退出后 HTTP 服务不可访问。
- 在只复制 manifests、lockfile 和 Prisma 配置/模型的隔离临时目录使用 `npm@11.21.0 ci` 完成干净安装，依赖树没有 missing 或 invalid 项；Prisma client 已生成，better-sqlite3 原生查询通过。迁移沿用桌面启动器的 `RUST_LOG=schema_engine=info` 配置；直接运行未设置该变量的 Prisma CLI 仍会出现 schema engine error。
- 系统模态对话框的返回值由测试驱动；窗口、preload、React、HTTP、Nest 和 SQLite 均为真实运行。系统文件选择器自身的交互仍需人工验收。

macOS x64（Apple Silicon 上通过 Rosetta 运行）：

- 在独立临时源码目录安装 Node 24.19.0 x64、npm 11.21.0 和 Electron 43.7.11 x64；Node 下载校验与官方 SHASUMS256.txt 一致，Electron 下载校验与官方 npm 包 checksums.json 一致。
- 从 lockfile 干净安装，通过桌面构建、x86_64 SQLite 原生模块重建和 Prisma 首次迁移；生成未签名 x64 `.app`。
- 真实 Electron E2E 和 `test:packaged` 均通过，包含阅读/扫描/备份/搜索/AI SSE、连续两次 Nest 恢复、CSP、全新 userData 迁移及退出清理。
- 该证据覆盖 x64 程序在 Rosetta 下的运行；GitHub `desktop-smoke` 的 macOS x64 原生 runner 也已通过。Intel 硬件、安装器、签名 / 公证和更新验收仍待执行。

Linux x64（Docker `node:24.19.0-bookworm`，x86_64 模拟运行）：

- 使用干净 npm 11.21.0 安装，安装 Clang 19 后完成 better-sqlite3 的 Electron ABI 重建；GCC 和 Clang 14 的失败结果已作为构建约束记录。
- Prisma 迁移、未签名 Linux unpacked 应用、无头 Electron E2E 和 `test:packaged` 均通过；测试覆盖扫描、阅读、备份、搜索、AI SSE、Nest 恢复、CSP 和退出清理。
- 使用合法的 `moxu-desktop` 可执行文件名完成未签名 AppImage 与 deb 构建；两种产物生成后再次运行 packaged smoke 通过。electron-builder 的 Linux 桌面入口元数据已设置 `desktopName` 与 `syncDesktopName`，避免窗口关联警告。
- 容器使用非 root 用户与 Xvfb，并配置 `seccomp=unconfined` 允许 Chromium 创建命名空间；Electron 的 sandbox、Node 隔离和 CSP 保持启用，未使用 `--no-sandbox`。这些结果不代表宿主系统的默认沙箱配置已验收。
- 该容器验证覆盖 Linux x64 的代码路径；GitHub `desktop-smoke` 的 Ubuntu x64 runner 也已通过。Linux 安装器、签名和发行包下载验收仍待执行。

复现命令：

```bash
npm run test:desktop:e2e
npm run desktop:pack
npm run test:packaged -w packages/desktop -- "../../release/desktop/mac-arm64/墨序.app/Contents/MacOS/墨序"
```

Linux 无图形会话时在 E2E 命令前加 `xvfb-run -a`。截图位于 `.moxu/e2e-results/`。

## 依赖覆盖维护

以下覆盖位于根目录 `package.json`，均由 npm 11.21.0 生成 lockfile 并通过完整验证。升级依赖它们的上游包后，应检查能否移除对应覆盖，再重新运行验证。

| 包及固定版本 | 原因和兼容性验证 |
| --- | --- |
| `mysql2@3.24.6` | Prisma 工具链固定了旧补丁版本；更新后真实 SQLite 迁移通过。本项目没有 MySQL 业务连接。 |
| `deepmerge-ts@8.0.2` | 修复旧版本公告；Prisma 配置仍使用兼容的 `deepmerge` 接口，干净安装、配置加载和迁移通过。 |
| `postcss-selector-parser@7.1.6` | Tailwind typography 所用接口兼容；桌面 CSS 与更新前逐字节一致，全部前端构建通过。 |
| `uuid@11.1.1` | Expo 的 Xcode 工具只使用 `v4()`；实际 `generateUuid()` 检查和移动端构建、Doctor 通过。 |

未覆盖 `decode-uri-component`：0.5.0 的 ESM 导出会使现有 `query-string@7.1.3` 抛出 `decodeComponent is not a function`。需要随 Expo 路由依赖一起兼容升级。

## 发布前仍需处理

1. **依赖安全检查未通过。** 已消除 Electron、Next、Nest / Express 相关的本轮可直接修复报告；当前全仓库审计有 69 个受影响包条目（53 high、16 moderate、0 critical），来自下列 4 个公告源，包含传递依赖计数。`npm run audit:policy` 已验证会失败并阻止发布；网络错误、异常退出、不完整报告和白名单严重级别变化也会阻止通过。未放宽审计白名单。
2. **剩余依赖需要单独处理。** 当前未通过审计的公告源为 `braces`、`decode-uri-component`、`node-forge` 和 `sprintf-js`。其中部分暂无可用上游修复版本；`decode-uri-component` 的修复版本是 ESM，而现有 `query-string` 依赖 CommonJS 接口，不能直接覆盖。不能通过批量强制覆盖版本或放宽白名单来宣称问题已经解决。
3. **多平台安装与发布验收。** 四个平台的 GitHub smoke 已通过，但它验证的是未签名解包应用和自动化对话框替身。系统对话框、安装器、签名 / 公证及真实更新流程仍需在对应环境验证。

上述项目完成前，桌面功能可在本机开发验证，但“达到可正式发布状态”的目标仍应保持进行中。
