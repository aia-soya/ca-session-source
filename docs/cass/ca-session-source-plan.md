# ca-session-source 研发计划

基于 AgentsView fork，面向本仓 source facade、Source API 与 TypeScript SDK 交付。

## 0. 总体策略

采用 **“Fork 增强 + 薄 Facade + SDK 复用”** 路线。

不重写 AgentsView 的 parser、sync、DB、server。AgentsView 已经具备本地 session 自动发现、SQLite 同步、REST API、SSE live updates、session browser 等基础能力，应作为底座复用。

研发重点不是重造 ingestion，而是：

```text
1. 稳定 fork 边界
2. 增加 source-oriented facade
3. 整理 SourceEvent 与 SSE adapter
4. 提供 TypeScript SDK
5. 验证 source API / SDK 消费闭环
6. 收敛消息锚点与增量消费语义
7. 保持 upstream merge 成本可控
```

---

## 1. 研发阶段总览

```text
M0：Fork 基线与上游合并策略
M1：Source Facade 内部接口
M2：Source Event 与 SSE Adapter
M3：TypeScript SDK
M4：消费闭环验证
M5：消息锚点与消费语义收敛
M6：Source API 稳定化
M7：工程化、测试与发布
```

当前 `M0 ~ M7` 已完成；本文保留里程碑定义、任务边界与验收语义，真实进展与后续观察点以 [`STATUS.md`](../../STATUS.md) 为准。

---

# M0：Fork 基线与上游合并策略

## 目标

建立可长期维护的 AgentsView fork，明确哪些地方允许改，哪些地方禁止改。

## 主要任务

### SRC-001：建立 fork 基线

```text
目标：
  fork AgentsView upstream/main，建立 ca-session-source 开发基线。

交付：
  - upstream remote
  - origin remote
  - main 作为本项目默认开发 / 发布分支
  - upstream/main 作为上游权威基线持续可同步
  - AGENTS.md / CONTRIBUTING.md 增加 fork 约束
```

推荐分支：

```text
main                 # 本项目默认开发 / 发布分支
upstream-sync        # 可选：fork 内部 upstream 镜像分支
feature/source-*     # 具体功能分支
```

### SRC-002：梳理 fork patch map

记录所有新增和修改点。

```text
docs/source/fork-patch-map.md
```

内容：

```text
新增目录：
  internal/source/
  internal/sourceapi/
  sdk/ts/
  docs/source/

可能修改：
  cmd/agentsview/main.go
  internal/server/server.go
  internal/config/*
  Makefile / package scripts
```

### SRC-003：建立 upstream merge checklist

```text
docs/source/upstream-merge-checklist.md
```

每次同步 upstream 时检查：

```text
internal/parser 是否变化
internal/sync 是否变化
internal/db schema 是否变化
internal/server route 是否变化
frontend build 是否变化
go.mod 是否变化
```

## 验收标准

```text
- 能从 upstream/main 干净 rebase / merge
- 能运行原 AgentsView 测试
- 原 AgentsView serve / session browser 正常
- fork 修改点可枚举、可审计
```

---

# M1：Source Facade 内部接口

## 目标

在不改动 AgentsView 核心逻辑的前提下，建立一个 source-oriented 内部服务层。

AgentsView 现在已有 `db.Store` 和 `service.SessionService`，但它们面向完整 AgentsView 产品能力，不适合作为长期 source contract。`db.Store` 包含 sessions、messages、search、analytics、usage、stars、pins、insights、management、upload 等大量能力。

因此需要新增一个更窄的 Source Facade。

## 主要任务

### SRC-010：定义 SourceService 接口

新增：

```text
internal/source/service.go
```

接口：

```go
type Service interface {
    ListSessions(ctx context.Context, f SessionFilter) (SessionPage, error)
    GetSession(ctx context.Context, id string) (*Session, error)
    GetMessages(ctx context.Context, sessionID string, f MessageFilter) (MessagePage, error)
    GetToolCalls(ctx context.Context, sessionID string) ([]ToolCall, error)
    WatchEvents(ctx context.Context) (<-chan Event, error)
}
```

原则：

```text
只暴露 source 能力
不暴露 analytics
不暴露 pins/stars
不暴露 insights
不暴露任何上层业务
```

### SRC-011：定义 Source DTO

新增：

```text
internal/source/types.go
```

类型：

```go
type Session struct {}
type Message struct {}
type ToolCall struct {}
type Event struct {}
type SessionFilter struct {}
type MessageFilter struct {}
```

这些 DTO 可以从 `db.Session` / `db.Message` 转换而来，但不要直接暴露完整 DB 类型。

### SRC-012：实现 AgentsViewStoreSourceService

新增：

```text
internal/source/agentsview_service.go
```

职责：

```text
db.Store / service.SessionService
  -> source DTO
```

复用：

```text
ListSessions
GetSession
GetMessages
GetAllMessages / ToolCalls
```

### SRC-013：增加 source 单元测试

```text
internal/source/service_test.go
```

覆盖：

```text
Session DTO mapping
Message DTO mapping
ToolCall DTO mapping
empty result
not found
pagination
```

## 验收标准

```text
- 不改 parser/sync/db 核心逻辑
- SourceService 能读取已有 AgentsView sessions/messages/tool_calls
- DTO 不泄漏上层业务字段
```

---

# M2：Source Event 与 SSE Adapter

## 目标

把 AgentsView 现有 live update 能力整理成面向消费方的 source event。

AgentsView server 已经有 session watch 与 events 路由，包括 `/api/v1/sessions/{id}/watch` 与 `/api/v1/events`。

以 PRD 为准，`message.appended` 属于对消费方暴露的稳定事件契约。

实现阶段可以先用 `session.updated` 打通订阅闭环；如果底层 broadcaster 暂时只提供 coarse-grained session 变化，则由 source adapter / facade 通过增量查询补齐 `message.appended` 语义。

## 主要任务

### SRC-020：定义 Source Event Schema

新增：

```text
docs/source/events.md
internal/source/events.go
```

事件：

```go
type Event struct {
    SchemaVersion  string `json:"schemaVersion"`
    Type           string `json:"type"`
    SessionID      string `json:"sessionId,omitempty"`
    Agent          string `json:"agent,omitempty"`
    MessageCount   int    `json:"messageCount,omitempty"`
    MessageOrdinal int    `json:"messageOrdinal,omitempty"`
    Role           string `json:"role,omitempty"`
    Error          string `json:"error,omitempty"`
}
```

SourceEvent 类型：

```text
session.created
session.updated
message.appended
source.error
```

SSE transport 可额外发送 `heartbeat` 作为 keepalive，但它不属于上层业务消费的 SourceEvent 领域事件。

### SRC-021：适配 AgentsView Broadcaster

新增：

```text
internal/source/event_adapter.go
```

职责：

```text
AgentsView internal event
  -> SourceEvent
```

当前实现策略：

```text
收到 session 更新事件
  -> 查询 session 当前状态 / 增量消息
  -> 发出 session.updated / message.appended
```

### SRC-022：新增 source events endpoint

```text
GET /api/source/v1/events
```

实现约束：

```text
对外暴露稳定 source 协议
内部继续复用 AgentsView broadcaster
```

### SRC-023：事件测试

覆盖：

```text
SSE connect
heartbeat
session.updated event
message.appended event
multiple subscribers
client disconnect
```

## 验收标准

```text
- 客户端可订阅 /api/source/v1/events
- transcript 变化后能收到 session.updated / message.appended
- 不破坏原 /api/v1/events
```

---

# M3：TypeScript SDK

## 目标

让消费方不直接依赖 AgentsView 内部实现，只依赖 SDK。

## 主要任务

### SRC-030：建立 SDK 目录

```text
sdk/ts/
  package.json
  tsconfig.json
  src/
    client.ts
    types.ts
    events.ts
    errors.ts
```

包名：

```text
@aia/ca-session-source-client
```

### SRC-031：实现基础 Client

```ts
class CaSessionSourceClient {
  listSessions(filter?: SessionFilter): Promise<SessionPage>
  getSession(sessionId: string): Promise<Session>
  getMessages(sessionId: string, options?: MessageOptions): Promise<MessagePage>
  getToolCalls(sessionId: string): Promise<ToolCall[]>
  watchEvents(onEvent: (event: SourceEvent) => void): EventSubscription
}
```

### SRC-032：实现 daemon / server discovery

当前采用显式 baseUrl：

```ts
new CaSessionSourceClient({
  baseUrl: 'http://127.0.0.1:8080'
})
```

state file discovery 不在当前计划内。

### SRC-033：SDK 测试

使用 mock HTTP server 覆盖：

```text
listSessions
getMessages
watchEvents
SSE reconnect
error handling
schema/version negotiation，待首个服役版本后再评估
```

### SRC-034：SDK 发布准备

当前不要求直接发布到 npm，但需要能被其它 workspace 或 Git URL / tarball 使用。

```text
pnpm pack
npm package metadata
README
usage example
```

## 验收标准

```text
- SDK 能读取 sessions/messages
- SDK 能读取 tool calls
- SDK 能订阅 events
- SDK 不要求消费方 import AgentsView 内部代码
```

---

# M4：消费闭环验证

## 目标

验证 Source Facade + SDK 是否真的满足 source 消费需求。

## 主要任务

### SRC-040：建立 SDK smoke harness

在本仓新增一个最小 smoke harness。

```text
sdk/ts/examples/smoke/
```

验证：

```text
- 能连接本地 AgentsView fork server
- 能读取 sessions
- 能读取某个 session messages
- 能订阅 session.updated / message.appended
```

### SRC-041：验证增量拉取闭环

```text
SourceEvent
  -> getMessages(sessionId, sinceOrdinal)
  -> append local cache
```

目标：

```text
- session.updated 可兜底触发消息刷新
- message.appended 可精确触发增量拉取
- 断线重连后可用 latest ordinal 补齐缺口
```

### SRC-042：验证快照拉取闭环

```text
listSessions
  -> getSession
  -> getMessages
  -> getToolCalls
```

目标：

```text
- 冷启动能构建完整 transcript snapshot
- 大 session 支持分页或分批加载
- 缺失 tool calls 不影响 messages 主路径
```

### SRC-043：反馈回流

根据 smoke 结果修正 SDK 与 source facade：

```text
字段缺失
事件粒度不足
分页不便
message anchor 不稳定
error handling 不足
```

## 验收标准

```text
- 本仓 smoke harness 不需要自己实现 Codex/Claude watcher
- 本仓 smoke harness 能通过 SDK 获取 transcript
- 本仓 smoke harness 能完成 event -> incremental fetch 闭环
- 反馈项沉淀为 source API / SDK issue 或后续任务
```

---

# M5：消息锚点与消费语义收敛

## 目标

稳定消息锚点、增量消费与 source DTO 的兼容语义。

当前采用：

```text
sessionId + messageOrdinal
```

同时预留：

```text
sourceUuid?
sourceType?
sourceSubtype?
```

因为 AgentsView messages 已有 `source_uuid` 字段，但当前真实 Codex session 的 API 返回中并不能稳定看到 `source_uuid`。

## 主要任务

### SRC-050：定义消息锚点策略

新增：

```text
docs/source/message-anchor.md
```

内容：

```text
MVP anchor: sessionId + messageOrdinal
reserved stable fields: sourceUuid / sourceType / sourceSubtype
ordinal drift 风险
sourceUuid 可用后的升级路径
```

### SRC-051：定义增量消费策略

新增：

```text
docs/source/incremental-consumption.md
```

内容：

```text
lastSeenOrdinal
session.updated fallback
message.appended fast path
reconnect gap fill
duplicate event idempotency
```

### SRC-052：补齐 DTO 字段与分页语义

检查：

```text
SourceSession updatedAt / messageCount
SourceMessage ordinal / sourceUuid / timestamp
MessagePage nextCursor / hasMore
SourceEvent messageOrdinal
```

### SRC-053：合同容错测试

覆盖：

```text
缺失 sourceUuid
重复 message.appended
session.updated 后主动刷新
分页边界
unknown event type
```

## 验收标准

```text
- 文档明确 MVP anchor policy
- SDK 对重复事件与断线补齐具备明确策略
- 消费方不需要了解 AgentsView 内部 DB 结构
```

---

# M6：Source API 稳定化

## 目标

在消费闭环验证后，把 source API 固化为版本化协议。

## 主要任务

### SRC-060：新增 `/api/source/v1/*`

路由：

```http
GET /api/source/v1/sessions
GET /api/source/v1/sessions/{id}
GET /api/source/v1/sessions/{id}/messages
GET /api/source/v1/sessions/{id}/tool-calls
GET /api/source/v1/events
GET /api/source/v1/version
GET /api/source/v1/health
```

### SRC-061：OpenAPI 文档

```text
docs/source/openapi.yaml
```

### SRC-062：Schema version

所有响应带：

```json
{
  "schemaVersion": "ca-session.source.v1"
}
```

事件带：

```json
{
  "schemaVersion": "ca-session.event.v1"
}
```

### SRC-063：协议容错测试

覆盖：

```text
缺失字段
新增字段
unknown event type
error envelope / schemaVersion 稳定性
```

## 验收标准

```text
- 消费方不再依赖 /api/v1 内部形态
- SDK 只消费 /api/source/v1
- API schema 可生成 client
```

---

# M7：工程化、测试与发布

## 目标

让 ca-session-source fork 可长期维护、可同步 upstream、可稳定使用。

## 主要任务

### SRC-070：测试矩阵

```text
Go unit tests
Go integration tests
SDK unit tests
SSE tests
source API smoke tests
upstream merge smoke tests
```

### SRC-071：Fixtures

建立最小 fixtures：

```text
testdata/
  codex/
  claude/
```

不要依赖本机真实 `~/.codex` / `~/.claude`。

### SRC-072：CI

```text
go test ./...
pnpm --dir sdk/ts test
pnpm --dir sdk/ts build
source API smoke
```

### SRC-073：发布策略

短期：

```text
SDK 通过 Git tag / tarball 使用
```

中期：

```text
npm package
binary release
OpenAPI artifact
```

### SRC-074：Upstream sync 流程

建议节奏：

```text
每周或每两周同步 upstream/main
如保留镜像分支，先更新 upstream-sync
再同步 main
跑 smoke tests
修 patch map
```

## 验收标准

```text
- 新增功能有测试
- SDK 可被固定版本依赖
- upstream merge 后能快速定位冲突
```

当前完成情况：

```text
- 已提供固定仓库命令入口：make source-test / source-sdk-test / source-sdk-build / source-sdk-release-check / source-sdk-pack-check / source-smoke / source-ci
- 已建立独立 source CI job，并将 make source-ci 纳入主链
- 已建立 Codex/Claude 顶层 fixture 矩阵，避免依赖真实 ~/.codex / ~/.claude
- 已通过 fixture-driven smoke 覆盖正常、malformed、truncated、pagination、tool-call、richer tool semantics 等主场景
- 已建立 SDK tarball-first 发布校验、release metadata gate 与 export-level pack verifier
- 已将工程化入口、fixture 约束与 upstream merge smoke 要求沉淀到文档
```

---

## 8. 说明

- 本文保留里程碑设计与验收语义，供后续演进或回顾时对照。
- 执行顺序、阶段拆分、优先级与最小闭环等实施期说明已不再单独维护；若后续出现新增里程碑或重排计划，以增量方式更新本文。
