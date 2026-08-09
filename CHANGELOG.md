# 更新日志

本项目遵循语义化版本，并在这里记录面向使用者的重要变化。

## [未发布]

## [0.1.0] - 2026-08-09

### 新增

- 本地 Markdown 书库扫描、章节阅读、全文搜索、语义检索、书签和阅读进度。
- Web、Electron 桌面端与 Expo 移动端，共用本地 NestJS API。
- 本地抽取式 AI 问答，以及 OpenAI-compatible Chat/Embedding 配置。
- 备份导出、合并导入和带恢复快照保护的替换导入。
- macOS、Windows、Linux 桌面安装包与 iOS/Android EAS 构建配置。
- 桌面 Release 的多平台构建、SBOM、SHA-256 校验和 GitHub Release 流程。

### 安全

- API 默认仅接受回环地址请求；远程访问需要显式开启并配置 Bearer Token。
- AI API Key 加密保存，所有配置响应只返回脱敏状态。
- API 输入增加运行时校验，资源读取防止路径穿越与符号链接逃逸。
- Electron 启用 sandbox、导航和外链白名单、权限默认拒绝及签名/公证校验。

### 可靠性

- 扫描与 chunk 写入增加事务边界及失败恢复。
- 备份导入重映射外来 ID，替换操作需要显式确认并在执行前生成恢复备份。
- CI 覆盖 lint、类型检查、单元/E2E、Web smoke、Expo doctor、大书库 smoke 和依赖审计策略。

[未发布]: https://github.com/xiaobuliukun/ai-rag/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/xiaobuliukun/ai-rag/releases/tag/v0.1.0
