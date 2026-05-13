# ca-session-source PRD  
基于 AgentsView fork 的 CA 本地 T/S Source 基础设施

## 1. 产品定位

**ca-session-source** 是基于 AgentsView fork 构建的本地 Coding Agent T/S Source 基础设施。

它复用 AgentsView 已有的本地 session discovery、parser、sync、SQLite、REST API、SSE 与前端浏览能力，为 DevCompass、WU Room、DevShare、WU Lab 提供统一的 CA Thread / Session transcript 数据源。

一句话：

> ca-session-source 只回答：**本机 Coding Agent 产生了哪些 T/S，它们发生了什么变化。**

它不负责 WU 识别、不负责项目管理、不负责分享房间、不负责标注分析。

AgentsView 本身已经具备本地优先、自动发现多种 coding agent sessions、同步到 SQLite、REST/SSE 查询与 live updates 等能力，因此本项目应以 fork 增强为主，而不是重写一套 ingestion。

---

## 2. 核心目标

1. 复用 AgentsView 的 CA session 发现、解析、同步和查询能力。
2. 将 AgentsView 的 T/S 数据源能力整理成稳定的 Source API / SDK。
3. 支持 DevCompass 持续监听 CA T/S，发现 WU 候选与 WU 变更。
4. 支持 WU Room / DevShare 持续监听并转发 transcript。
5. 支持 WU Lab 在 AgentsView fork 内继续做标注、比较、验证增强。
6. 保持对 upstream AgentsView 的可合并性。

---

## 3. 非目标

首期不做：

1. 不重写 AgentsView parser。
2. 不重写 AgentsView sync engine。
3. 不修改 AgentsView 原始 session / message 核心语义。
4. 不把 WU、Room、Annotation 业务逻辑放入 source 层。
5. 不做独立云服务。
6. 不做复杂权限系统。
7. 不重建 transcript browser。
8. 不复制 AgentsView analytics、pins、stars、insights 等产品功能给上层产品。

WU Lab 也应继续遵守“标注层独立、只读引用 AgentsView sessions/messages、不污染原始数据”的边界。

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
  ├── source SDK
  └── WU Lab modules
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

AgentsView 当前 server 已经提供 sessions、messages、tool-calls、watch、events、sync 等 API 路由，应优先作为 source API 的底座。

### 4.4 上层产品隔离

```text
ca-session-source
  只提供 transcript source

DevCompass
  WU detection / projection

WU Room / DevShare
  transcript relay / review / comment

WU Lab
  annotation / compare / verification
```

---

## 5. 核心使用方

### 5.1 DevCompass

DevCompass 订阅 session/message 变化，生成 WU signal。

```text
ca-session-source event
  -> DevCompass source adapter
  -> WU signal
  -> WU projection
```

### 5.2 WU Room / DevShare

WU Room / DevShare 订阅 transcript 更新，转发给 room viewer。

```text
ca-session-source event
  -> local relay
  -> cloud gateway
  -> room frontend
```

### 5.3 WU Lab

WU Lab 继续在 AgentsView fork 内工作。

短期：

```text
WU Lab -> AgentsView DB / Store
```

中期：

```text
WU Lab -> SourceReader -> source API / DB adapter
```

WU Lab 当前设计已经采用 `SourceReader` 作为访问原始 session/message 的边界，这是后续接入 ca-session-source 的正确接口。

---

## 6. 产品形态

### 6.1 首期形态

首期不是独立第五仓库，而是 AgentsView fork 内的增强模块。

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

面向上层产品的稳定事件。

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
- 不在 source 层加入 WU / Room / Annotation 逻辑。
- 不改变 AgentsView 已有 session/message 写入语义。

### 8.3 Watch

复用 AgentsView file watcher 与 session watch 能力。

要求：

- 支持目录 watch。
- 支持 debounce。
- 支持 watcher 不可用时 fallback polling。
- 支持 SSE 事件。
- 对上层产品暴露 source-oriented event stream。

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

> 能复用 `/api/v1/*` 就不新增；只有上层产品需要稳定协议时，才加 `/api/source/v1/*` facade。

### 8.5 SDK

提供 TypeScript SDK。

```ts
const client = new CaSessionSourceClient()

const sessions = await client.listSessions()
const messages = await client.getMessages(sessionId)

client.watchEvents(event => {
  // DevCompass / WU Room / DevShare consume event
})
```

SDK 不包含 WU、Room、Annotation 业务模型。

---

## 9. WU Lab 对齐

WU Lab 仍作为 AgentsView fork 内的增强模块。

要求：

- 不重写 AgentsView session ingestion。
- 不修改原始 session/message 表语义。
- WU Lab 数据使用独立 `wu_` 表。
- WU Lab 后端放在独立模块。
- WU Lab 前端放在独立模块。
- 通过 SourceReader 访问原始 session/message。

当前 WU Lab 架构已经要求 API 使用 `/api/wu-lab/*`，后端模块独立，数据表使用 `wu_` 前缀，不修改原始 session/message，前端只做轻量 ViewModel 和交互状态。

---

## 10. DevCompass 接入

DevCompass 作为外部 monorepo，不直接 import WU Lab 或 AgentsView 内部代码。

接入方式：

```text
DevCompass
  -> @aia/ca-session-source-client
  -> AgentsView fork source API
```

DevCompass 内部负责：

```text
source event
  -> WuSignal
  -> WuCandidate
  -> WuChange
  -> ProjectProjection
```

DevCompass 不负责：

```text
Codex parser
Claude parser
OpenCode parser
file watcher
transcript SQLite schema
```

---

## 11. WU Room / DevShare 接入

WU Room / DevShare 作为外部 monorepo，通过 SDK 或 HTTP/SSE 接入。

```text
WU Room / DevShare
  -> source event stream
  -> fetch session messages
  -> relay transcript
  -> room viewer
```

它们只维护：

```text
room
share link
viewer state
comments
relay state
auth
```

不维护 CA parser / watcher。

---

## 12. Upstream Merge 策略

### 12.1 不移动 upstream 核心代码

首期不移动：

```text
internal/parser
internal/sync
internal/db
internal/server
frontend existing session viewer
```

### 12.2 新增代码集中放置

新增代码集中在：

```text
internal/source/
internal/sourceapi/
sdk/ts/
docs/source/
frontend/src/source-debug/，可选
```

### 12.3 修改点保持薄

对 upstream 文件的修改应尽量只做：

```text
route registration
service wiring
config extension
event adapter
build script extension
```

### 12.4 Fork Patch 可审计

每次 upstream merge 后，只检查少数集成点。

```text
cmd/agentsview/main.go
internal/server/server.go
internal/config/*
internal/db schema migration impact
frontend route registration，可选
```

---

## 13. MVP 范围

### Must Have

```text
基于 AgentsView fork
复用 AgentsView parser/discovery/sync/db/server
Source API 文档
TypeScript SDK
DevCompass adapter spike
WU Room / DevShare adapter spike
WU Lab SourceReader 对齐
SSE event consumption
```

### Should Have

```text
/api/source/v1 facade
message.appended event
source health/version endpoint
SDK daemon discovery
source event schema version
```

### Could Have

```text
独立 ca-sessiond mode
headless-only serve mode
Go SDK
OpenAPI generated client
source debug page
```

### Won’t Have in MVP

```text
独立第五仓库
重写 parser
重写 sync engine
云端同步
WU detection
room sharing
annotation compare
完整新 UI
```

---

## 14. 验收标准

MVP 满足：

1. Fork 后仍能正常运行 AgentsView 原有 session browser。
2. 启动后能发现并同步 AgentsView 已支持的 CA sessions。
3. 可通过 API 查询 session list。
4. 可通过 API 查询 session messages。
5. 可通过 API 查询 tool calls。
6. transcript 变化后可触发 SSE 更新。
7. TypeScript SDK 可订阅事件并拉取 session/messages。
8. DevCompass 可基于 SDK 监听 CA T/S 变化。
9. WU Room / DevShare 可基于 SDK 拉取并转发 transcript。
10. WU Lab 可继续基于 AgentsView 原始 session/message 做标注增强。
11. 新增代码不破坏 upstream parser/sync/db/server 的核心行为。
12. 后续 upstream merge 时，冲突集中在少量 wiring 文件。

---

## 15. 推荐里程碑

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
source event model
```

### M2：TypeScript SDK

交付：

```text
sdk/ts
listSessions()
getSession()
getMessages()
getToolCalls()
watchEvents()
```

### M3：外部产品接入 Spike

交付：

```text
DevCompass adapter spike
WU Room / DevShare adapter spike
event -> fetch incremental messages flow
```

### M4：WU Lab 对齐

交付：

```text
WU Lab SourceReader
AgentsViewDBSourceReader
可选 CaSessionSourceReader
session/message anchor 校验
```

### M5：Source API 稳定化

交付：

```text
/api/source/v1，可选
schemaVersion
OpenAPI
兼容性测试
upstream merge checklist
```

---

## 16. 成功指标

短期：

```text
DevCompass、WU Room、DevShare 不再各自实现 Codex / Claude transcript watcher
```

中期：

```text
所有外部产品通过同一套 SDK/API 消费 AgentsView fork 的 T/S source
```

长期：

```text
ca-session-source 能在保持 upstream 可合并的前提下，成为 Agentic Development 工具链的统一本地 transcript source
```
