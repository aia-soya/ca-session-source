# ca-session-source 研发计划  
基于 AgentsView fork，面向 DevCompass / WU Room / DevShare / WU Lab 复用

## 0. 总体策略

采用 **“Fork 增强 + 薄 Facade + SDK 复用”** 路线。

不重写 AgentsView 的 parser、sync、DB、server。AgentsView 已经具备本地 session 自动发现、SQLite 同步、REST API、SSE live updates、session browser 等基础能力，应作为底座复用。

研发重点不是重造 ingestion，而是：

```text
1. 稳定 fork 边界
2. 增加 source-oriented facade
3. 提供 TypeScript SDK
4. 支持外部 monorepo 接入
5. 保持 upstream merge 成本可控
```

---

## 1. 研发阶段总览

```text
M0：Fork 基线与上游合并策略
M1：Source Facade 内部接口
M2：Source Event 与 SSE Adapter
M3：TypeScript SDK
M4：DevCompass / WU Room / DevShare 接入 Spike
M5：WU Lab SourceReader 对齐
M6：Source API 稳定化
M7：工程化、测试与发布
```

建议先做 **M0 ~ M4**，形成可用闭环；M5 与 WU Lab 标注开发并行；M6/M7 等外部产品接入验证后再稳定化。

---

# M0：Fork 基线与上游合并策略

## 目标

建立可长期维护的 AgentsView fork，明确哪些地方允许改，哪些地方禁止改。

## 主要任务

### WU-001：建立 fork 基线

```text
目标：
  fork AgentsView upstream/main，建立 ca-session-source 开发基线。

交付：
  - upstream remote
  - origin remote
  - main 同步 upstream/main
  - dev 或 ca-session-source/main 作为开发分支
  - AGENTS.md / CONTRIBUTING.md 增加 fork 约束
```

推荐分支：

```text
main                 # 跟踪 upstream/main，尽量干净
ca-session-source    # 本项目主开发分支
feature/source-*     # 具体功能分支
```

### WU-002：梳理 fork patch map

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

### WU-003：建立 upstream merge checklist

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

AgentsView 现在已有 `db.Store` 和 `service.SessionService`，但它们面向完整 AgentsView 产品能力，不适合作为 DevCompass / WU Room / DevShare 的长期协议。`db.Store` 包含 sessions、messages、search、analytics、usage、stars、pins、insights、management、upload 等大量能力。

因此需要新增一个更窄的 Source Facade。

## 主要任务

### WU-010：定义 SourceService 接口

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
不暴露 WU/WUB/Room 业务
```

### WU-011：定义 Source DTO

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

### WU-012：实现 AgentsViewStoreSourceService

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

### WU-013：增加 source 单元测试

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
- DTO 不泄漏 WU / Room / Annotation 业务字段
```

---

# M2：Source Event 与 SSE Adapter

## 目标

把 AgentsView 现有 live update 能力整理成面向上层产品的 source event。

AgentsView server 已经有 session watch 与 events 路由，包括 `/api/v1/sessions/{id}/watch` 与 `/api/v1/events`。

以 PRD 为准，`message.appended` 属于对上层产品暴露的稳定事件契约。

实现阶段可以先用 `session.updated` 打通外部订阅闭环；如果底层 broadcaster
暂时只提供 coarse-grained session 变化，则由 source adapter / facade 通过增量查询补齐
`message.appended` 语义。

## 主要任务

### WU-020：定义 Source Event Schema

新增：

```text
docs/source/events.md
internal/source/events.go
```

事件：

```go
type Event struct {
    SchemaVersion string `json:"schemaVersion"`
    Type          string `json:"type"`
    SessionID     string `json:"sessionId,omitempty"`
    Agent         string `json:"agent,omitempty"`
    MessageCount  int    `json:"messageCount,omitempty"`
    Error         string `json:"error,omitempty"`
}
```

SourceEvent 类型：

```text
session.created
session.updated
message.appended
source.error
```

SSE transport 可额外发送 `heartbeat` 作为 keepalive，但它不属于上层业务消费的
SourceEvent 领域事件。

### WU-021：适配 AgentsView Broadcaster

新增：

```text
internal/source/event_adapter.go
```

职责：

```text
AgentsView internal event
  -> SourceEvent
```

首期可以保守处理：

```text
收到 session 更新事件
  -> 查询 session 当前状态 / 增量消息
  -> 发出 session.updated / message.appended
```

### WU-022：新增 source events endpoint

两种选择：

#### 方案 A：复用 `/api/v1/events`

SDK 直接消费现有 events，再在 SDK 里转换。

优点：

```text
改动最少
upstream merge 成本最低
```

缺点：

```text
协议不够稳定
外部产品依赖 AgentsView 内部事件形态
```

#### 方案 B：新增 `/api/source/v1/events`

推荐作为 M2 目标。

```text
GET /api/source/v1/events
```

优点：

```text
上层产品协议稳定
后续可独立演化
```

缺点：

```text
需要新增 server route
```

建议：

> 实现 B，但内部复用 AgentsView broadcaster。

### WU-023：事件测试

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
- 外部客户端可订阅 /api/source/v1/events
- transcript 变化后能收到 session.updated / message.appended
- 不破坏原 /api/v1/events
```

---

# M3：TypeScript SDK

## 目标

让 DevCompass、WU Room、DevShare 三个独立 monorepo 不直接依赖 AgentsView 内部实现，只依赖 SDK。

## 主要任务

### WU-030：建立 SDK 目录

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

包名建议：

```text
@aia/ca-session-source-client
```

### WU-031：实现基础 Client

```ts
class CaSessionSourceClient {
  listSessions(filter?: SessionFilter): Promise<SessionPage>
  getSession(sessionId: string): Promise<Session>
  getMessages(sessionId: string, options?: MessageOptions): Promise<MessagePage>
  getToolCalls(sessionId: string): Promise<ToolCall[]>
  watchEvents(onEvent: (event: SourceEvent) => void): EventSubscription
}
```

### WU-032：实现 daemon / server discovery

首期简单配置 baseUrl：

```ts
new CaSessionSourceClient({
  baseUrl: 'http://127.0.0.1:8080'
})
```

后续再支持 state file discovery。

### WU-033：SDK 测试

使用 mock HTTP server 覆盖：

```text
listSessions
getMessages
watchEvents
SSE reconnect
error handling
version mismatch，后置
```

### WU-034：SDK 发布准备

不一定首期发布到 npm，但要能被其它 monorepo 以 Git URL 或 workspace tarball 使用。

```text
pnpm pack
npm package metadata
README
usage example
```

## 验收标准

```text
- DevCompass 可安装 SDK
- WU Room / DevShare 可安装 SDK
- SDK 能读取 sessions/messages
- SDK 能订阅 events
```

---

# M4：外部产品接入 Spike

## 目标

验证 Source Facade + SDK 是否真的满足三个独立 monorepo 的复用需求。

## 主要任务

### WU-040：DevCompass Adapter Spike

在 DevCompass 中新增：

```text
packages/ca-session-adapter/
```

职责：

```text
SourceEvent
  -> ThreadEvidence
  -> WuSignal candidate
```

Spike 目标：

```text
- 能连接 AgentsView fork server
- 能订阅 session.updated / message.appended
- 能拉取对应 session messages
- 能输出简单 WuSignal log
```

不做正式 WU 检测算法。

### WU-041：WU Room Adapter Spike

在 WU Room 中验证：

```text
message.appended / session.updated
  -> fetch incremental messages
  -> relay local mock room
```

MVP 只需本地 console / mock relay。

### WU-042：DevShare Adapter Spike

如果 DevShare 与 WU Room 功能重叠，可先共用同一 adapter 设计。

验证：

```text
source session
  -> share session payload
  -> viewer receives transcript snapshot
```

### WU-043：反馈回流

根据三个 spike 修正 SDK：

```text
字段缺失
事件粒度不足
分页不便
message anchor 不稳定
error handling 不足
```

## 验收标准

```text
- 三个外部 monorepo 都不需要自己实现 Codex/Claude watcher
- 三个外部 monorepo 都能通过 SDK 获取 transcript
- DevCompass 能形成最小 WuSignal 输入
- WU Room / DevShare 能形成最小 transcript relay 输入
```

---

# M5：WU Lab SourceReader 对齐

## 目标

WU Lab 继续保持 AgentsView fork 内增强，但源数据访问边界要与 ca-session-source 对齐。

WU Lab 当前设计已经明确：wu-lab 是独立 annotation layer，源数据只读引用 AgentsView sessions/messages，不修改原始记录。

## 主要任务

### WU-050：定义 WU Lab SourceReader

```text
internal/wu-lab/source/source_reader.go
```

接口：

```go
type SourceReader interface {
    SessionExists(ctx context.Context, sessionID string) (bool, error)
    MessageExists(ctx context.Context, sessionID string, ordinal int) (bool, error)
    MessageRangeExists(ctx context.Context, sessionID string, startOrdinal int, endOrdinal int) (bool, error)
    CountMessages(ctx context.Context, sessionID string) (int, error)
}
```

这个接口与 WU Lab 架构文档中的 SourceReader 方向一致。

### WU-051：实现 AgentsViewDBSourceReader

```text
internal/wu-lab/source/agentsview_reader.go
```

直接读当前 AgentsView DB / Store。

### WU-052：预留 SourceServiceSourceReader

后置实现：

```text
internal/wu-lab/source/source_service_reader.go
```

通过 source facade 调用，不作为 MVP 必须项。

### WU-053：Anchor 稳定性增强

WU Lab 首期可继续用：

```text
sessionId + messageOrdinal
```

但数据结构预留：

```text
sourceUuid?
sourceType?
```

因为 AgentsView messages 已有 `source_uuid` 字段。

## 验收标准

```text
- WU Lab 创建 annotation 前能通过 SourceReader 校验 anchor
- WU Lab 不直接散落访问 sessions/messages repo
- 后续切换 source service 不影响 annotation service
```

---

# M6：Source API 稳定化

## 目标

在外部 spike 验证后，把 source API 固化为版本化协议。

## 主要任务

### WU-060：新增 `/api/source/v1/*`

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

### WU-061：OpenAPI 文档

```text
docs/source/openapi.yaml
```

### WU-062：Schema version

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

### WU-063：兼容性测试

覆盖：

```text
旧 SDK 调新 server
新 SDK 调旧 server
缺失字段
新增字段
unknown event type
```

## 验收标准

```text
- 外部产品不再依赖 /api/v1 内部形态
- SDK 只消费 /api/source/v1
- API schema 可生成 client
```

---

# M7：工程化、测试与发布

## 目标

让 ca-session-source fork 可长期维护、可同步 upstream、可供多个 monorepo 稳定使用。

## 主要任务

### WU-070：测试矩阵

```text
Go unit tests
Go integration tests
SDK unit tests
SSE tests
external adapter smoke tests
upstream merge smoke tests
```

### WU-071：Fixtures

建立最小 fixtures：

```text
testdata/
  codex/
  claude/
```

不要依赖本机真实 `~/.codex` / `~/.claude`。

### WU-072：CI

```text
go test ./...
pnpm --dir sdk/ts test
pnpm --dir sdk/ts build
source API smoke
```

### WU-073：发布策略

短期：

```text
SDK 通过 Git tag / tarball 给外部 monorepo 使用
```

中期：

```text
npm package
binary release
OpenAPI artifact
```

### WU-074：Upstream sync 流程

建议固定节奏：

```text
每周或每两周同步 upstream/main
先合 main
再合 ca-session-source
跑 smoke tests
修 patch map
```

## 验收标准

```text
- 新增功能有测试
- SDK 可被外部 monorepo 固定版本依赖
- upstream merge 后能快速定位冲突
```

---

# 推荐 WU 拆分清单

## 第一批：必须先做

```text
WU-001 fork 基线
WU-002 fork patch map
WU-003 upstream merge checklist
WU-010 SourceService 接口
WU-011 Source DTO
WU-012 AgentsViewStoreSourceService
WU-020 Source Event Schema
WU-030 TypeScript SDK scaffold
WU-031 SDK 基础 Client
```

目标：形成内部 source facade + SDK 基础读能力。

---

## 第二批：打通事件闭环

```text
WU-021 Broadcaster adapter
WU-022 /api/source/v1/events
WU-023 SSE tests
WU-032 SDK server discovery / baseUrl config
WU-033 SDK tests
```

目标：外部产品能监听 session 更新。

---

## 第三批：外部接入验证

```text
WU-040 DevCompass adapter spike
WU-041 WU Room adapter spike
WU-042 DevShare adapter spike
WU-043 SDK feedback fixes
```

目标：证明复用路径成立。

---

## 第四批：WU Lab 对齐

```text
WU-050 WU Lab SourceReader
WU-051 AgentsViewDBSourceReader
WU-053 Anchor sourceUuid 预留
```

目标：WU Lab annotation 层与 source 边界稳定。

---

## 第五批：协议稳定化

```text
WU-060 /api/source/v1 sessions/messages/tool-calls
WU-061 OpenAPI
WU-062 schemaVersion
WU-063 compatibility tests
```

目标：形成可长期依赖的 source protocol。

---

# 建议优先级

## P0

```text
Fork 可维护性
SourceService
SDK list/get/watch
DevCompass adapter spike
```

## P1

```text
source event facade
WU Room / DevShare adapter spike
WU Lab SourceReader
/api/source/v1
```

## P2

```text
OpenAPI
message.appended 精细化补强
sourceUuid anchor 强化
daemon discovery
独立 headless mode
```

---

# 最小可用闭环

最小闭环建议压缩为 4 个 WU：

```text
1. Fork baseline + patch map
2. SourceService + SDK list/get messages
3. SSE event + SDK watchEvents
4. DevCompass adapter spike
```

完成后即可验证核心假设：

> 外部产品不自己监听 CA 本地文件，也能持续消费 CA T/S 变化。

---

# 关键风险与控制

## 风险 1：改动 AgentsView 核心导致 upstream 难合

控制：

```text
新增目录优先
核心文件只做 wiring
所有修改写入 patch map
```

## 风险 2：事件粒度不够

控制：

```text
对外协议保持 session.updated + message.appended
外部产品收到事件后仍可主动拉取 messages 做兜底
底层 broadcaster 粒度不足时在 facade 层补齐 message.appended
```

## 风险 3：SDK 过早稳定导致协议僵化

控制：

```text
先 spike
后 /api/source/v1
再 OpenAPI
```

## 风险 4：WU Lab 与 source service 边界混淆

控制：

```text
WU Lab 只通过 SourceReader 读源数据
annotation 仍在 wu_ 表
不把 WUB/WU 逻辑放入 source 层
```

## 风险 5：多个产品同时启动服务

MVP 可以先不解决，使用显式 baseUrl。

后续再做：

```text
state file
health/version endpoint
auto attach
single instance lock
```

---

# 一句话研发路线

> **先把 AgentsView fork 稳住；再在其上加一层极薄的 Source Facade 和 TypeScript SDK；用 DevCompass / WU Room / DevShare spike 验证复用；WU Lab 保持内嵌增强并通过 SourceReader 对齐；最后再稳定 `/api/source/v1` 与版本化协议。**
