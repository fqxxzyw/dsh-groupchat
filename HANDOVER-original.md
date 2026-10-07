# dsh-groupchat 多 AI 群聊插件 — 交付说明

> 本文件记录：需求功能、代码位置、安装方式、已实现功能、已知 Bug。供后续接手者参考。

---

## 一、需求功能（用户原始需求）

1. **开启多个 AI 群聊对话** —— 一个插件里可以建多个群聊，每个群聊是独立对话。
2. **每个 AI 成员可选模型 + 接入的 API** —— 群里的每个 AI 成员都能独立选择「模型」和「API 提供商」。
3. **已接入的 API 直接选择** —— 已经配置好的 API（DeepSeek 官方 / 账号登录 / pi-ai 接入的 OpenAI 等网关）在下拉里直接选。
4. **模型可自定义性格** —— 每个成员可以填一段「性格设定（persona）」。
5. **群聊 = 聊天窗口形式** —— 用户在右侧，AI 在左侧。
6. **头像可自定义** —— 支持 emoji、图片 URL、以及**上传本地图片**。
7. **直接改变聊天窗口** —— 把主聊天区改造成群聊对话窗口（作为 conversation 视图的一个「群聊」标签）。
8. **@群聊成员共同工作** —— 发消息用 `@成员名` 点名；成员之间也能互相 @ 自动接力。
9. **群成员可读取记忆** —— 群共享「记忆」会注入每个成员的上下文。
10. **共同完成任务** —— 群「任务板」（状态/负责人），成员在对话里参考任务协作。

---

## 二、代码文件位置

| 文件 | 说明 |
|---|---|
| `E:\deepseek_work\dsh-groupchat\package.json` | 包声明：入口、`dsh.client` 客户端声明、`dsh.bundle` 挂载声明、peerDependencies |
| `E:\deepseek_work\dsh-groupchat\cordis.patch.yml` | 插件挂载声明（`insert` 把 `groupchat` 行插入 profile 配置树） |
| `E:\deepseek_work\dsh-groupchat\lib\index.js` | **宿主端**（Node）：群聊引擎、成员管理、@解析、轮流回复、记忆/任务、HTTP 路由、SSE 推送 |
| `E:\deepseek_work\dsh-groupchat\lib\client.js` | **客户端**（浏览器）：群聊视图、气泡 UI、成员编辑、@输入、任务/记忆面板、头像上传 |
| `E:\deepseek_work\dsh-groupchat\README.md` | 简要使用说明 |

### 关键实现位置（lib/index.js 宿主端）

| 功能 | 位置（函数/区块） |
|---|---|
| 状态持久化 | `storageDir()` / `loadState()` / `saveState()`（写入 `$DSH_HOME/storages/dsh-groupchat/state.json`） |
| 群/成员/消息/任务数据结构 | `normalizeGroup` / `normalizeMember` / `normalizeMessage` / `normalizeTask` |
| @成员解析 | `parseMentions()`（支持 `@所有人`/`@all`/`@everyone`） |
| 成员回复（流式） | `GroupChatEngine.replyMember()` —— 调 `ctx.llm.stream({provider, model, system, messages})` |
| 轮流回复引擎 | `GroupChatEngine.runTurn()` —— @成员（或全员）依次回复，成员间 @ 触发追加讨论轮 |
| 系统提示词组装 | `buildSystemPrompt()`（性格 + 群成员 + 共享记忆 + 任务 + 发言规则） |
| 上下文组装 | `buildMessages()`（自己的历史=assistant 角色，他人=user 角色带前缀） |
| 模型目录 | `buildCatalog()`（`ctx.llm.listProviders/listModels/resolveModelInfo`） |
| HTTP 路由 | `/groupchat/state`、`/groupchat/catalog`、`/groupchat/events`(SSE)、`/groupchat/command` |

### 关键实现位置（lib/client.js 客户端）

| 功能 | 位置（函数/区块） |
|---|---|
| 注册「群聊」视图 | `apply()` 里 `ctx.slots.inject("conversation.view", ...)`（id `group-chat`） |
| 注册群聊输入框 | `apply()` 里 `ctx.slots.inject("conversation.composer", ...)`（链槽，select 判断视图） |
| 全局数据加载 + SSE | `apply()` 里 `syncEvents()` + `api.refresh()`（全局生命周期，不随视图卸载） |
| 群聊视图组件 | `GroupChatView`（顶部群标签 + 消息区 + 侧栏面板） |
| 气泡组件 | `MessageBubble`（AI 左 / 用户右 / 系统居中） |
| 输入框组件 | `GroupChatComposer`（@ 自动补全 + 发送/停止） |
| 成员编辑弹窗 | `MemberEditor`（名字/头像/颜色/性格/API/模型/温度/最大输出/启用） |
| 头像上传 | `MemberEditor` 里 `#gc-avatar-file`（FileReader + canvas 压到 128×128 → data URL） |
| 任务面板 | `SidePanel`（添加/状态/负责人/删除） |
| 记忆面板 | `SidePanel`（textarea + 保存） |
| 错误边界 | `GcErrorBoundary`（渲染出错时显示错误文字，不整片空白） |

---

## 三、安装方式

```bash
# 本地源码 link 安装（改动即时生效，需配合 hmr 监视）
dsh plugin --profile desktop add link:E:/deepseek_work/dsh-groupchat
```

安装后插件会出现在 profile 的 `dsh.profile.bundles` 里，可在 设置 → 插件 中开关。

开发时热重载（把插件目录加入 hmr 监视，profile 的 `cordis.patch.yml` 里）：

```yaml
- id: hmr
  name: "@deepseek-ai/dsh-hmr"
  config:
    root:
      - E:/deepseek_work/dsh-groupchat
```

---

## 四、已实现功能（实测通过部分）

以下为宿主端已通过端到端自动化测试验证的功能：

- ✅ 建群 / 删群 / 重命名 / 清空消息
- ✅ 添加/编辑/删除成员，每个成员独立选 provider + model
- ✅ 自定义性格（persona）、头像、标识色、温度、最大输出、启用开关
- ✅ `@成员名` 单点回复、`@所有人` 全员回复
- ✅ 成员之间互相 `@` 自动接力讨论（`autoDiscussionRounds` 轮数上限）
- ✅ 共享记忆注入成员上下文（成员回复中能引用记忆内容）
- ✅ 共享任务板（成员回复中能引用任务状态/负责人）
- ✅ 流式逐字回复（SSE 推送 delta）、「正在输入」提示、可停止
- ✅ 头像上传图片（data URL，128×128，宿主上限 256KB）

---

## 五、已知 Bug（用户反馈，尚未完全解决）

> 以下 bug 用户实测仍存在，已停止继续修复。建议后续接手者优先排查。

### Bug 1：会话切换后视图塌缩 / 输入框顶到最上方
- **现象**：第一次进入群聊正常；但「新建一个会话后，返回旧会话」时，群聊视图又出现空白、输入框顶到最上方。
- **已排查方向**：
  - 视图根容器高度：已从 `height:100%` → `flex:1` → `flex:auto`（对齐官方 ChatView），但会话切换后仍复现。
  - 怀疑与会话作用域（session scope）的槽位重挂载 + 全局 store 状态有关。
  - 相关代码：`lib/client.js` 的 `GroupChatView` 与 `apply()` 里 `syncEvents()`。

### Bug 2：新建会话发送消息无响应（消息框点击无响应）
- **现象**：新建的会话里，群聊输入框点击发送没反应（卡在发送）。
- **已排查方向**：
  - 输入框/发送按钮在 `group === undefined` 时被 `disabled`（`GroupChatComposer` 里 `disabled: group === void 0`）。
  - 即 `activeGroupId` 为 null 导致拿不到当前群。已把数据加载/SSE 移到 `apply()` 全局层（不再随视图卸载清空 `activeGroupId`），但仍可能有时序问题。
  - 相关代码：`lib/client.js` 的 `apply()`、`GroupChatComposer`。

### Bug 3：一直加载（loading 状态不结束）
- **现象**：切换群聊模式后一直显示「正在加载群聊…」。
- **已排查方向**：
  - 之前「群状态」和「模型目录」两个请求绑在一起，目录请求慢会卡住状态加载。已拆开（状态优先、目录后台）。
  - 若仍复现，需检查 `/groupchat/state`、`/groupchat/catalog` 从浏览器能否正常 fetch（宿主路由本身经 HTTP 测试返回 200）。

### Bug 4：当前对话框看不到历史
- **现象**：群聊视图里看不到消息历史。
- **已排查方向**：群聊数据全局存储于 `state.json`，视图读取 `store.groups`。若视图因 Bug 1/3 未正常渲染，则看不到消息。

### 已修复（历史）的 Bug（供参考，避免重蹈覆辙）

| Bug | 根因 | 修复 |
|---|---|---|
| 启动崩溃 `_ModuleLoader__ is not defined` | 客户端 bundle 第一行用了单下划线 `_ModuleLoader__`，而第三方插件必须用 `window.__ModuleLoader__` | 已改为 `window.__ModuleLoader__.load(...)` |
| 首次「无法加载 + 空白」 | 视图根容器 `height:100%` 在 flex 父容器里失效导致塌缩 | 已改 `flex:auto` |
| profile 补丁里 `groupchat` 开关冲突（disabled:false/true 并存）导致插件被反复禁用 | 手动改 patch 时残留多条同 id 覆盖项 | 清除冲突项，改用 `set_bundle`/`set_plugin` 工具操作 |
| 成员 assistant 消息缺 `source` 导致 `replayState` 崩溃 | `buildMessages` 里构造 assistant 消息时没带 `source: {kind:"model", provider, model}` | 已补上 |
| 用户消息前缀「我：」被模型模仿 | 上下文里用户消息用 `我: ` 前缀 | 已改为「用户: 」 |

---

## 六、架构要点（后续接手必读）

1. **第三方插件必须 SDK-free**：宿主端只能 `import` Node 内置模块，**不能** `import` 任何 `@deepseek-ai/*` 包（link 安装的插件解析不到共享运行时包）。所有能力通过 `ctx` 服务访问：`ctx.llm`、`ctx.webServer`（inject: `["llm", "webServer"]`）。

2. **客户端 bundle 格式**：`lib/client.js` 第一行必须是 `window.__ModuleLoader__.load({ id: "dsh-groupchat", factory: (require) => { ... } })`，工厂返回 `exports.apply` + `exports.inject`。

3. **客户端通信**：通过 HTTP 路由（宿主端 `ctx.webServer.register`，客户端 `fetch("/groupchat/xxx")`），不是 `@Remote`/typert（SRC 模式没有客户端投影，第三方插件用不了）。

4. **AI 成员回复**：直接 `ctx.llm.stream(options)`（流式、单次尝试、不重试）。模型选择字段 `{provider, model, reasoningEffort?, temperature?, maxTokens?, system, messages, signal}`。

5. **持久化**：`$DSH_HOME/storages/dsh-groupchat/state.json`（JSON，每个群一条记录，消息上限 `maxHistoryMessages`）。

6. **会话切换 bug 的怀疑点**（供重点排查）：
   - `conversation.view` / `conversation.composer` 是 **session 作用域**的槽，会话切换时组件会被强制重挂载（key 用 `sessionGenerationKeyOf`）。
   - 全局 store（`createSnapshotStore`）跨会话共享，但 `GroupChatView` 曾用 `useEffect` 卸载清理 `activeGroupId`（已移除，改到 `apply()`）。
   - 建议：在 `GroupChatView` / `GroupChatComposer` 里加 `console.log` 打印 `state.activeGroupId`、`state.groups`、`group`，观察会话切换时的状态流转，定位是「数据没加载」还是「渲染被挂载生命周期打断」。

---

*文档生成时间：随代码打包。*
