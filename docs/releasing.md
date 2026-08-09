# 发布指南

## 发布前检查

发布版本必须同步更新根目录和所有 workspace 的 `version`，并同步移动端的 iOS `buildNumber`、Android `versionCode`。标签格式固定为 `v<version>`，例如 `v0.1.0`。

当前 `desktop-release` 只发布稳定 `latest` 通道，因此拒绝带 `-beta`、`-rc` 等后缀的预发布标签。需要预发布时，应先增加独立 channel 和 GitHub prerelease 流程，不能复用稳定发布元数据。

在干净工作区执行：

```bash
npm ci
npm run release:check-version
npm run audit:policy
npm run verify
```

本机可以用 `npm run desktop:dist:mac` 生成未签名 macOS 测试包。正式 macOS 产物必须由 Release 工作流签名和公证。

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
