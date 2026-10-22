# 发布指南

桌面端当前验证结果和未完成事项见 [Electron 桌面端验收记录](desktop-readiness.md)。

## 发布前检查

发布版本必须同步更新根目录和所有 workspace 的 `version`，并同步移动端的 iOS `buildNumber`、Android `versionCode`。标签格式固定为 `v<version>`，例如 `v0.1.0`。

当前 `desktop-release` 只发布稳定 `latest` 通道，因此拒绝带 `-beta`、`-rc` 等后缀的预发布标签。需要预发布时，应先增加独立 channel 和 GitHub prerelease 流程，不能复用稳定发布元数据。

在干净工作区执行：

```bash
npm install --global npm@11.21.0
npm ci
npm run release:check-version
npm run audit:policy
npm run verify
```

本地和 CI 都使用 npm 11.21.0，避免旧 npm 对 workspace 依赖覆盖规则的处理差异。审计脚本遇到网络错误、异常退出或不完整报告会阻止发布；白名单只接受包名和严重级别仍与审核记录一致的公告。

Linux 原生模块从源码重建需要较新的 Clang（建议 18 或更新版本），以及 Python、make 和系统 C/C++ 开发库。Electron 43 的 V8 头文件在 GCC 下存在属性语法兼容问题，Clang 14 也无法提供所需的 `std::source_location`。运行时准备脚本默认使用 `clang` / `clang++`，也支持显式 `CC` / `CXX`，例如 `CC=clang-19 CXX=clang++-19 npm run desktop:pack`。CI 的 Linux runner 已增加 Clang 安装步骤。

本机可以用 `npm run desktop:dist:mac` 生成未签名 macOS 测试包。正式 macOS 产物必须由 Release 工作流签名和公证。

桌面发布前至少执行一次下面的本地检查，确认静态 renderer、preload 能力和 Nest 子进程链路都通过：

```bash
npm run build:desktop
npm test -w packages/desktop
npm run test:desktop:e2e
npm run desktop:pack
# macOS arm64 示例；其他平台传入对应的可执行文件路径
npm run test:packaged -w packages/desktop -- "../../release/desktop/mac-arm64/墨序.app/Contents/MacOS/墨序"
```

`test:desktop:e2e` 会构建并准备隔离运行时，在临时 userData 中启动真正的 Electron、preload、静态 React、Nest 和 SQLite，验证首次迁移、目录扫描、封面、阅读图片/进度/书签、搜索、AI SSE、备份导入导出、连续两次服务崩溃恢复和退出清理。测试只替换系统模态对话框的选择结果，不调用外部 AI；失败截图位于 `.moxu/e2e-results/failure.png`。Linux 无桌面环境时运行 `xvfb-run -a npm run test:desktop:e2e`；CI 和原生平台 Release 构建已接入同一流程。

自动化测试之外，发布包仍应在各目标系统实际点击一次目录、备份和图片的系统对话框，并检查安装、首次启动、签名和更新流程。当前机器的测试结果不代表其他平台已经验收。

`test:packaged` 从临时工作目录启动实际打包的可执行文件，使用全新 userData 和本地更新检查响应，检查内置资源、数据库迁移、页面导航、preload、Nest HTTP 和退出清理。Release 各平台构建已接入该检查；它验证解包后的应用，不替代安装器、签名和真实自动更新验收。

### 提前运行多平台桌面验证

`.github/workflows/desktop-smoke.yml` 在涉及桌面、后端、共享代码、Web 组件或依赖锁文件的 PR 上自动运行，也可在 Actions 中手动触发。它在 macOS arm64、macOS x64、Windows x64、Linux x64 的原生 runner 上执行类型检查、单元测试、桌面构建、未签名应用打包、Electron E2E 和成品启动测试，失败时保存测试截图。

此工作流只有仓库读取权限，不使用签名或发布 secrets，便于在发布准备阶段单独验证平台兼容性。它只证明上述运行检查成功；正式 Release 仍必须通过 `audit:policy`、完整验证、签名及产物校验等原有门禁。

## GitHub Secrets

创建名为 `desktop-release` 的 GitHub Environment，把它限制为受保护的 `v*` 标签，启用必需审核者并禁止发起人自行批准。以下凭据只应保存为该 Environment 的 secrets，不要保存为普通仓库 secrets。

macOS 两个构建任务需要：

- `CSC_LINK`：Developer ID Application 证书文件、URL 或 base64 内容；
- `CSC_KEY_PASSWORD`：证书密码；
- `APPLE_ID`：用于公证的 Apple ID；
- `APPLE_APP_SPECIFIC_PASSWORD`：App 专用密码；
- `APPLE_TEAM_ID`：Apple Developer Team ID。

Windows 构建需要：

- `WINDOWS_CSC_LINK`：受信任 Authenticode 代码签名证书；
- `WINDOWS_CSC_KEY_PASSWORD`：证书密码。

Linux 构建需要：

- `LINUX_GPG_PRIVATE_KEY`：ASCII-armored 私钥；
- `LINUX_GPG_PASSPHRASE`：私钥密码，可为空；
- `LINUX_GPG_FINGERPRINT`：用于签名和导出公钥的完整 fingerprint。

移动端 EAS 工作流需要 `EXPO_TOKEN` 和 `EAS_PROJECT_ID`。App Store Connect 与 Google Play 的提交凭据由 EAS 项目安全管理，不应写入仓库。

## 桌面端发布

1. 更新版本和 `CHANGELOG.md`，运行完整验证。
2. 提交改动并创建与版本完全一致的标签。
3. 推送标签：`git push origin v0.1.0`。
4. `desktop-release` 工作流会在原生 runner 上构建：
   - macOS arm64（`macos-15`）；
   - macOS x64（`macos-15-intel`）；
   - Windows x64（`windows-2025`）；
   - Linux x64（`ubuntu-24.04`）。
5. 工作流合并双架构 macOS 自动更新元数据，验证所有 updater metadata 的版本、文件大小和 SHA-512，生成覆盖完整打包目录的 CycloneDX SBOM 与统一 `SHA256SUMS.txt`，然后创建同名 GitHub Release。

正式 Release 被视为不可变；同名 Release 已存在时工作流会失败，必须提升版本并创建新标签，不能覆盖旧二进制。macOS、Windows 和 Linux 的签名凭据缺失或验证失败都会阻止发布。

## 移动端发布

在 Actions 中手动运行 `mobile-release`，选择平台和 `preview` / `production` profile。工作流只触发云端构建，不自动提交商店；确认构建和商店元数据后再执行：

```bash
npm run submit:ios -w packages/app
npm run submit:android -w packages/app
```

生产构建由 EAS 远程递增原生构建号。首次提交前还需要在 Apple Developer、App Store Connect、Google Play Console 和 EAS 项目中完成应用登记与凭据配置。

## 校验下载产物

下面的命令要求已经下载 Release 中的全部文件：

```bash
shasum -a 256 -c SHA256SUMS.txt
```

Linux 也可以使用 `sha256sum -c SHA256SUMS.txt`。Windows 可用 `Get-FileHash -Algorithm SHA256` 对照清单。macOS 还可以执行：

如果只下载单个文件，可筛选对应条目，例如：

```bash
artifact="Moxu-0.1.0-arm64.dmg"
grep "  ${artifact}$" SHA256SUMS.txt | shasum -a 256 -c -
```

Linux 包还可以使用 Release 中的公钥和 detached signature：

```bash
gpg --import Moxu-Linux-Signing-Key.asc
gpg --verify Moxu-0.1.0-x64.AppImage.asc Moxu-0.1.0-x64.AppImage
```

macOS 还可以执行：

```bash
codesign --verify --deep --strict --verbose=2 /Applications/墨序.app
spctl --assess --type execute --verbose=4 /Applications/墨序.app
xcrun stapler validate /Applications/墨序.app
```
