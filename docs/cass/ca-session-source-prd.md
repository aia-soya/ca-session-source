# ca-session-source PRD

基于 AgentsView fork 的 CA 本地 T/S Source 基础设施

## 1. 产品定位

**ca-session-source** 是基于 AgentsView fork 构建的本地 Coding Agent T/S Source 基础设施。

它复用 AgentsView 已有的本地 session discovery、parser、sync、SQLite、REST API、SSE 与前端浏览能力，为本仓内的 source facade、Source API、TypeScript SDK 以及未来消费方提供统一的 Coding Agent Thread / Session transcript 数据源。

一句话：

> ca-session-source 只回答：**本机 Coding Agent 产生了哪些 T/S，它们发生了什么变化。**

它不负责项目管理、协作分享、标注分析、业务判断或其它上层产品逻辑。

AgentsView 本身已经具备本地优先、自动发现多种 coding agent sessions、同步到 SQLite、REST/SSE 查询与 live updates 等能力，因此本项目应以 fork 增强为主，而不是重写一套 ingestion。

---

## 2. 核心目标

1. 复用 AgentsView 的 CA session 发现、解析、同步和查询能力。
2. 将 AgentsView 的 T/S 数据源能力整理成稳定的 Source Facade、Source API 与 TypeScript SDK。
3. 支持消费方通过 SDK / Source API 查询 sessions、messages、tool calls。
4. 支持消费方通过 source event stream 监听 transcript 变化。
5. 稳定消息锚点、增量消费与错误事件语义。
6. 保持对 upstream AgentsView 的可合并性。

---

## 3. 非目标

首期不做：

1. 不重写 AgentsView parser。
2. 不重写 AgentsView sync engine。
3. 不修改 AgentsView 原始 session / message 核心语义。
4. 不把项目管理、协作分享、标注分析或其它上层业务逻辑放入 source 层。
5. 不做独立云服务。
6. 不做复杂权限系统。
7. 不重建 transcript browser。
8. 不复制 AgentsView analytics、pins、stars、insights 等产品功能给 source 层。

---

## 4. 架构原则

### 4.1 Fork First

ca-session-source 首期作为 AgentsView fork 的增强能力存在。

```text
agentsview fork
  ├── existing parser
  ├── existing sync
  ├── existing SQLite
  ├── existing REST / SSE
  ├── existing frontend
  ├── source API compatibility layer
  ├── source facade
  └── source SDK
```

### 4.2 最小侵入

首期避免修改：

```text
internal/parser/*
internal/sync/engine.go
internal/db schema core
internal/server existing API behavior
frontend transcript renderer core
```

允许新增：

```text
internal/source/
internal/sourceapi/
sdk/ts/
docs/source/
frontend source debug page，可选
```

### 4.3 复用优先

AgentsView 已有能力优先复用：

```text
parser.Registry
agent discovery
sync.Engine
SQLite sessions/messages/tool_calls
GET /api/v1/sessions
GET /api/v1/sessions/{id}/messages
GET /api/v1/sessions/{id}/tool-calls
GET /api/v1/sessions/{id}/watch
GET /api/v1/events
```

AgentsView 当前 server 已经提供 sessions、messages、tool-calls、watch、events、sync 等 API 路由，应优先作为 Source API 的底座。

### 4.4 消费方隔离

```text
ca-session-source
  只提供 transcript source

source API / SDK 消费方
  只依赖稳定 source contract
  不直接耦合 AgentsView 内部实现
```

source 层只输出源数据、增量事件与基础健康信息，不承载消费方业务模型。

---

## 5. 核心交付面

### 5.1 Source Facade

Source Facade 是本仓内部的窄服务层，用于把 AgentsView 的 db/store/service 能力整理成 source-oriented DTO 与方法。

职责：

```text
AgentsView Store / Service
  -> Source DTO
  -> Source API / SDK
```

### 5.2 Source API

Source API 是消费方长期依赖的 HTTP / SSE contract。

首期可以复用 `/api/v1/*`；当协议需要稳定时，新增 `/api/source/v1/*` facade。

### 5.3 TypeScript SDK

TypeScript SDK 屏蔽 HTTP / SSE 细节，让消费方通过稳定 client 读取 sessions、messages、tool calls 并订阅事件。

### 5.4 Source Event Stream

Source Event Stream 输出稳定 source 事件：

```text
session.created
session.updated
message.appended
source.error
```

SSE transport 可以额外发送 keepalive，但 keepalive 不属于 SourceEvent 领域事件。

---

## 6. 产品形态

### 6.1 首期形态

首期不是独立新仓库，而是 AgentsView fork 内的增强模块。

```text
agentsview fork
  ├── cmd/agentsview
  ├── internal/parser
  ├── internal/sync
  ├── internal/db
  ├── internal/server
  ├── internal/source        # 新增：source facade
  ├── internal/sourceapi     # 新增：source-oriented API
  ├── sdk/ts                 # 新增：TypeScript client
  └── docs/source            # 新增：source protocol docs
```

### 6.2 未来形态

等接口稳定后，可再拆为独立 module / repo。

```text
Phase later:
  ca-session-source-core
  ca-session-source-client
  ca-sessiond
```

但首期不做拆仓，避免增加 upstream merge 成本。

---

## 7. 核心概念

### 7.1 Source

一个 CA transcript 来源。

示例：

```text
~/.codex/sessions
~/.codex/archived_sessions
~/.claude/projects
~/.local/share/opencode
```

AgentsView 已有 `parser.Registry` 描述不同 agent 的默认目录、环境变量、配置键、ID 前缀、watch subdirs、discover function 与 find source function。

### 7.2 Session

沿用 AgentsView session。

核心字段：

```ts
type SourceSession = {
  id: string
  agent: string
  project: string
  machine?: string
  cwd?: string
  gitBranch?: string
  firstMessage?: string
  displayName?: string
  startedAt?: string
  endedAt?: string
  messageCount: number
  userMessageCount?: number
  sourcePath?: string
  updatedAt?: string
}
```

### 7.3 Message

沿用 AgentsView message。

核心字段：

```ts
type SourceMessage = {
  id: number
  sessionId: string
  ordinal: number
  role: string
  content: string
  thinkingText?: string
  timestamp?: string
  hasThinking?: boolean
  hasToolUse?: boolean
  model?: string
  tokenUsage?: unknown
  sourceUuid?: string
  sourceType?: string
  sourceSubtype?: string
  toolCalls?: SourceToolCall[]
}
```

AgentsView 的 messages 表已经以 `(session_id, ordinal)` 作为 session 内 message 顺序锚点，并保存 thinking、tool use、model、token usage、source_uuid 等字段。

首期消息锚点采用 `sessionId + messageOrdinal`，并在 DTO 中保留 `sourceUuid`、`sourceType` 等字段以便后续增强。

### 7.4 ToolCall

沿用 AgentsView tool_calls。

```ts
type SourceToolCall = {
  toolName: string
  category?: string
  toolUseId?: string
  inputJson?: string
  skillName?: string
  resultContent?: string
  subagentSessionId?: string
}
```

### 7.5 SourceEvent

面向消费方的稳定事件。

```ts
type SourceEvent =
  | {
      schemaVersion: 'ca-session.event.v1'
      type: 'session.created'
      sessionId: string
      agent: string
    }
  | {
      schemaVersion: 'ca-session.event.v1'
      type: 'session.updated'
      sessionId: string
      agent: string
      messageCount: number
    }
  | {
      schemaVersion: 'ca-session.event.v1'
      type: 'message.appended'
      sessionId: string
      messageOrdinal: number
      role: string
    }
  | {
      schemaVersion: 'ca-session.event.v1'
      type: 'source.error'
      agent?: string
      sourcePath?: string
      error: string
    }
```

---

## 8. 功能范围

### 8.1 Discovery

复用 AgentsView discovery。

要求：

- 支持 AgentsView 已有 agent registry。
- 支持默认路径和用户配置路径。
- 缺失目录不导致服务失败。
- 无效 transcript 不影响其它 session。
- 保留 source path、mtime、size、hash 等信息。

### 8.2 Sync

复用 AgentsView sync engine。

要求：

- 启动时执行 initial sync。
- 文件变化后增量 sync。
- 支持手动 sync / resync。
- 不在 source 层加入上层业务逻辑。
- 不改变 AgentsView 已有 session/message 写入语义。

### 8.3 Watch

复用 AgentsView file watcher 与 session watch 能力。

要求：

- 支持目录 watch。
- 支持 debounce。
- 支持 watcher 不可用时 fallback polling。
- 支持 SSE 事件。
- 对消费方暴露 source-oriented event stream。
- 对外事件契约包含 `session.created`、`session.updated`、`message.appended`、`source.error`。

AgentsView 已有 fsnotify watcher，支持递归/浅层 watch、debounce、exclude、新目录自动 watch、watch budget 等能力，适合直接复用。

### 8.4 Query

优先复用 AgentsView 现有 API。

MVP 直接支持：

```http
GET /api/v1/sessions
GET /api/v1/sessions/{id}
GET /api/v1/sessions/{id}/messages
GET /api/v1/sessions/{id}/tool-calls
GET /api/v1/sessions/{id}/watch
GET /api/v1/events
POST /api/v1/sessions/sync
POST /api/v1/sync
POST /api/v1/resync
```

新增 source compatibility API 可选，作为稳定 facade：

```http
GET /api/source/v1/sessions
GET /api/source/v1/sessions/{id}
GET /api/source/v1/sessions/{id}/messages
GET /api/source/v1/sessions/{id}/tool-calls
GET /api/source/v1/events
POST /api/source/v1/sync
```

首期原则：

> 能复用 `/api/v1/*` 就不新增；只有消费方需要稳定协议时，才加 `/api/source/v1/*` facade。

### 8.5 SDK

提供 TypeScript SDK。

```ts
const client = new CaSessionSourceClient()

const sessions = await client.listSessions()
const messages = await client.getMessages(sessionId)

client.watchEvents(event => {
  // source API / SDK consumer handles event
})
```

SDK 不包含任何上层业务模型。

---

## 9. 消费边界

消费方通过 SDK 或 HTTP/SSE 接入。

```text
consumer
  -> @aia/ca-session-source-client
  -> Source API
  -> Source Facade
  -> AgentsView sessions/messages/tool_calls
```

消费方可以自行决定如何处理 transcript，但 source 层不提供业务投影、协作状态、标注状态或分享状态。

本仓只保证：

```text
session listing
session detail
message listing
tool-call listing
event stream
health/version
```

---

## 10. Upstream Merge 策略

### 10.1 不移动 upstream 核心代码

首期不移动：

```text
internal/parser
internal/sync
internal/db
internal/server
frontend existing session viewer
```

### 10.2 新增代码集中放置

新增代码集中在：

```text
internal/source/
internal/sourceapi/
sdk/ts/
docs/source/
frontend/src/source-debug/，可选
```

### 10.3 修改点保持薄

对 upstream 文件的修改应尽量只做：

```text
route registration
service wiring
config extension
event adapter
build script extension
```

### 10.4 Fork Patch 可审计

每次 upstream merge 后，只检查少数集成点。

```text
cmd/agentsview/main.go
internal/server/server.go
internal/config/*
internal/db schema migration impact
frontend route registration，可选
```

---

## 11. MVP 范围

### Must Have

```text
基于 AgentsView fork
复用 AgentsView parser/discovery/sync/db/server
Source API 文档
SourceService facade
SourceEvent schema
message.appended event
TypeScript SDK
SSE event consumption
```

### Should Have

```text
/api/source/v1 facade
source health/version endpoint
SDK daemon discovery
source event schema version
source debug page
```

### Could Have

```text
独立 ca-sessiond mode
headless-only serve mode
Go SDK
OpenAPI generated client
source debug page
```

### 不在 MVP 范围

```text
独立新仓库
重写 parser
重写 sync engine
云端同步
项目管理逻辑
协作分享逻辑
标注分析逻辑
完整新 UI
```

---

## 12. 验收标准

MVP 满足：

1. Fork 后仍能正常运行 AgentsView 原有 session browser。
2. 启动后能发现并同步 AgentsView 已支持的 CA sessions。
3. 可通过 API 查询 session list。
4. 可通过 API 查询 session messages。
5. 可通过 API 查询 tool calls。
6. transcript 变化后可触发 SSE 更新。
7. TypeScript SDK 可订阅事件并拉取 session/messages。
8. SourceEvent 对外包含 `session.created`、`session.updated`、`message.appended`、`source.error`。
9. 消费方可基于 SDK 完成增量拉取闭环。
10. 新增代码不破坏 upstream parser/sync/db/server 的核心行为。
11. 后续 upstream merge 时，冲突集中在少量 wiring 文件。

---

## 13. 推荐里程碑

### M0：基线与协议

交付：

```text
docs/source/prd.md
docs/source/source-model.md
docs/source/events.md
SDK API 草案
fork patch map
```

### M1：Source Facade

交付：

```text
internal/source/
SourceService interface
复用 db.Store / service.SessionService
source DTO
source event model
```

### M2：Source Event 与 SSE Adapter

交付：

```text
SourceEvent schema
Broadcaster adapter
/api/source/v1/events，可选
message.appended 语义补齐
```

### M3：TypeScript SDK

交付：

```text
sdk/ts
listSessions()
getSession()
getMessages()
getToolCalls()
watchEvents()
```

### M4：消费闭环验证

交付：

```text
SDK smoke harness
event -> fetch incremental messages flow
snapshot fetch flow
feedback fixes
```

### M5：消息锚点与消费语义收敛

交付：

```text
sessionId + messageOrdinal anchor policy
sourceUuid / sourceType 预留策略
增量消费说明
兼容性测试
```

### M6：Source API 稳定化

交付：

```text
/api/source/v1，可选
schemaVersion
OpenAPI
兼容性测试
upstream merge checklist
```

---

## 14. 成功指标

短期：

```text
本仓能通过 Source Facade / SDK 稳定读取 AgentsView sessions/messages/tool_calls
```

中期：

```text
消费方通过同一套 SDK/API 消费 AgentsView fork 的 T/S source
```

长期：

```text
ca-session-source 能在保持 upstream 可合并的前提下，成为 Agentic Development 工具链的统一本地 transcript source
```
