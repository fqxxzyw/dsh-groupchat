# 自动化验证 — 1.1.0-beta.11

- `npm run check`：通过。
- `npm test`：79 项通过，0 失败。
- `npm run test:browser`：3 项 Chromium 检查通过，0 失败。
- 成员栏默认展开、文字新增按钮、无悬浮诊断入口及会话切换/缩放：通过浏览器回归。
- 默认角色并发创建、当前模型继承和已有成员保留：通过宿主回归。

所有模型返回均为测试桩，未调用真实提供商。真实 DSH 环境、PowerShell 安装、账号与网关需要按 [TESTING.md](TESTING.md) 验收。
