# AgentsView 基线记录

本文记录在 fork upstream AgentsView 的基线情况。

## 项目技术栈

- 后端：Go `1.26.2`，使用启用 CGO 的 SQLite（`github.com/mattn/go-sqlite3`），并通过 [`go.mod`](../../go.mod) 可选支持 PostgreSQL（`github.com/jackc/pgx/v5`）
- CLI / 服务入口：基于 Cobra 的 Go CLI，位于 [`cmd/agentsview`](../../cmd/agentsview)
- 前端：Svelte 5 + TypeScript + Vite 8，位于 [`frontend`](../../frontend)
- 前端虚拟列表：`@tanstack/virtual-core`
- 前端测试栈：Vitest + Playwright
- 打包方式：
  - 单个 Go 二进制文件，内嵌复制到 `internal/web/dist` 的 SPA 资源
  - 可选 Tauri 桌面端封装，位于 `desktop/`

## 核心入口

### 前端入口

- HTML 壳：[`frontend/index.html`](../../frontend/index.html)
- 挂载点：[`frontend/src/main.ts`](../../frontend/src/main.ts)
- App 组合根组件：[`frontend/src/App.svelte`](../../frontend/src/App.svelte)
- Vite 配置与 `/api` 代理：[`frontend/vite.config.ts`](../../frontend/vite.config.ts)

`App.svelte` 是主 UI 的组合入口，负责串联：

- 侧边栏 session 列表
- 消息查看器
- session vitals
- 基于 router / store 的 session 加载
- 当前 active session 的 SSE watch / reload 行为

### 后端入口

- CLI main：[`cmd/agentsview/main.go`](../../cmd/agentsview/main.go)
- serve 运行时启动辅助逻辑：[`cmd/agentsview/serve_runtime.go`](../../cmd/agentsview/serve_runtime.go)
- HTTP server / router 构造：[`internal/server/server.go`](../../internal/server/server.go)

`cmd/agentsview/main.go` 中的 `runServe(...)` 是后端主要启动路径，流程包括：

- 校验配置
- 打开 SQLite DB
- 初始化 sync engine / watchers
- 初始化 pricing 数据
- 构造 `server.New(...)`
- 启动 HTTP server

`internal/server/server.go` 负责 API 路由注册与 SPA 资源服务。

## Session 列表相关位置

### 前端

- Session 列表 UI：[`frontend/src/lib/components/sidebar/SessionList.svelte`](../../frontend/src/lib/components/sidebar/SessionList.svelte)
- Session 行 UI：[`frontend/src/lib/components/sidebar/SessionItem.svelte`](../../frontend/src/lib/components/sidebar/SessionItem.svelte)
- Session 列表状态 / 过滤 / 加载：[`frontend/src/lib/stores/sessions.svelte.ts`](../../frontend/src/lib/stores/sessions.svelte.ts)
- Session 列表分组 / 扁平化辅助逻辑：[`frontend/src/lib/components/sidebar/session-list-utils.ts`](../../frontend/src/lib/components/sidebar/session-list-utils.ts)
- Session 过滤 UI：[`frontend/src/lib/components/filters/SessionFilterControl.svelte`](../../frontend/src/lib/components/filters/SessionFilterControl.svelte)

说明：

- `sessions.svelte.ts` 是前端 session 加载、过滤、分页 cursor、active session、child sessions、分组 session 派生逻辑的主 store。
- `SessionList.svelte` 负责侧边栏的虚拟列表、分组、折叠逻辑，以及 child / subagent continuation-chain 的渲染。
- 在 `App.svelte` 中，路由变化会触发 `sessions.load()`、`sessions.loadProjects()` 和 `sessions.loadAgents()`。

### 后端 / API

- 路由注册：[`internal/server/server.go`](../../internal/server/server.go)
- Session 列表 handler：[`internal/server/sessions.go`](../../internal/server/sessions.go)
- Session DB model / query 区域：[`internal/db/sessions.go`](../../internal/db/sessions.go)
- Handler 使用的 service 层：[`internal/service/service.go`](../../internal/service/service.go)、[`internal/service/direct.go`](../../internal/service/direct.go)、[`internal/service/http.go`](../../internal/service/http.go)

重要列表路由：

- `GET /api/v1/sessions`

`internal/server/sessions.go` 当前已处理的 list 侧 query / filter 参数包括：

- `project`
- `exclude_project`
- `machine`
- `agent`
- `date`
- `date_from`
- `date_to`
- `active_since`
- `min_messages`
- `max_messages`
- `min_user_messages`
- `include_one_shot`
- `include_automated`
- `include_children`
- `outcome`
- `health_grade`
- `termination`
- `min_tool_failures`
- `cursor`
- `limit`

## Session 详情 / 消息查看器相关位置

### 前端

- Active-session 加载编排：[`frontend/src/App.svelte`](../../frontend/src/App.svelte)
- Message store / 加载策略：[`frontend/src/lib/stores/messages.svelte.ts`](../../frontend/src/lib/stores/messages.svelte.ts)
- Transcript / 消息列表查看器：[`frontend/src/lib/components/content/MessageList.svelte`](../../frontend/src/lib/components/content/MessageList.svelte)
- 消息渲染：[`frontend/src/lib/components/content/MessageContent.svelte`](../../frontend/src/lib/components/content/MessageContent.svelte)
- Session vitals 侧边面板：[`frontend/src/lib/components/content/SessionVitals.svelte`](../../frontend/src/lib/components/content/SessionVitals.svelte)
- Session 内搜索栏：[`frontend/src/lib/components/content/SessionFindBar.svelte`](../../frontend/src/lib/components/content/SessionFindBar.svelte)
- Tool-call 展示分组：[`frontend/src/lib/components/content/ToolCallGroup.svelte`](../../frontend/src/lib/components/content/ToolCallGroup.svelte)
- Transcript display-item 构造：[`frontend/src/lib/utils/display-items.ts`](../../frontend/src/lib/utils/display-items.ts)
- 内容解析 / 增强：[`frontend/src/lib/utils/content-parser.ts`](../../frontend/src/lib/utils/content-parser.ts)

未来 ca-session-source UI / 调试页可能复用的相关组件：

- 紧凑边界展示：[`frontend/src/lib/components/content/CompactBoundaryDivider.svelte`](../../frontend/src/lib/components/content/CompactBoundaryDivider.svelte)
- System boundary 卡片：[`frontend/src/lib/components/system/SystemBoundaryCard.svelte`](../../frontend/src/lib/components/system/SystemBoundaryCard.svelte)

说明：

- `App.svelte` 会响应 `sessions.activeSessionId` 变化，并触发：
  - `messages.loadSession(id)`
  - `sessions.loadChildSessions(id)`
  - `sessionTiming.load(id)`
  - `sync.watchSession(id, ...)`
- `messages.svelte.ts` 使用两种加载模式：
  - 小型 / 普通 session：完整升序拉取
  - 大型 session：先按倒序渐进加载，再按需加载更早消息
- `MessageList.svelte` 是虚拟化 transcript 查看器，并且已经具备 display-item 抽象，后续可用于注入 source 侧标记或调试信息。
- 当前前端 `Message` 类型公开了 `id`、`ordinal` 等字段。
- 对当前真实 Codex session 的 `/api/v1/sessions/{id}/messages` 返回，`source_uuid` 不可作为首期稳定可用字段，因此 ca-session-source 首期更适合直接使用 `(session_id, ordinal)`。

### 后端 / API

- Session 详情 handler：[`internal/server/sessions.go`](../../internal/server/sessions.go)
- Message 列表 handler：[`internal/server/messages.go`](../../internal/server/messages.go)
- Tool-call 路由：[`internal/server/tool_calls_route.go`](../../internal/server/tool_calls_route.go)
- Session activity 路由：[`internal/server/activity.go`](../../internal/server/activity.go)
- Session timing 路由：[`internal/server/session_timing.go`](../../internal/server/session_timing.go)
- Watch / SSE 路由：[`internal/server/sse.go`](../../internal/server/sse.go)、[`internal/server/events.go`](../../internal/server/events.go)

重要详情侧路由：

- `GET /api/v1/sessions/{id}`
- `GET /api/v1/sessions/{id}/messages`
- `GET /api/v1/sessions/{id}/tool-calls`
- `GET /api/v1/sessions/{id}/children`
- `GET /api/v1/sessions/{id}/activity`
- `GET /api/v1/sessions/{id}/timing`
- `GET /api/v1/sessions/{id}/search`
- `GET /api/v1/sessions/{id}/watch`

### 消息锚点基线

- `messages` 表已包含 `source_uuid` 与 `source_parent_uuid` 字段。
- 后端 `internal/db/messages.go` 已将 `SourceUUID` 暴露在 Go `Message` struct 中。
- 仓库中已有明确约定：`source_uuid` 比 `ordinal` 更稳定，消息重写或插入新边界行后，`ordinal` 可能漂移，但 `source_uuid` 更适合作为追踪键。
- 但对当前真实 Codex session，`/messages` API 返回中并不能稳定看到 `source_uuid`，因此 ca-session-source 首期锚点直接采用 `(session_id, ordinal)` 更现实。

## API 路由图

主要路由注册位于：

- [`internal/server/server.go`](../../internal/server/server.go)

与未来 ca-session-source 相关工作关系较大的路由集群包括：

- Sessions：
  - `GET /api/v1/sessions`
  - `GET /api/v1/sessions/{id}`
  - `GET /api/v1/sessions/{id}/messages`
  - `GET /api/v1/sessions/{id}/tool-calls`
  - `GET /api/v1/sessions/{id}/children`
  - `GET /api/v1/sessions/{id}/activity`
  - `GET /api/v1/sessions/{id}/timing`
  - `GET /api/v1/sessions/{id}/search`
  - `GET /api/v1/sessions/{id}/watch`
- Search 与 metadata：
  - `GET /api/v1/search`
  - `GET /api/v1/projects`
  - `GET /api/v1/machines`
  - `GET /api/v1/agents`
- Sync：
  - `POST /api/v1/sync`
  - `POST /api/v1/resync`
  - `GET /api/v1/sync/status`
- Session management：
  - rename / delete / restore / star / pin / publish / resume / import / export 等路由也注册在 `internal/server/server.go`

前端 API client 位于：

- [`frontend/src/lib/api/client.ts`](../../frontend/src/lib/api/client.ts)

如果后续通过新的后端 API 或 source API 暴露 ca-session-source 数据，这里会是主要的前端集成点。

## 开发 / 测试 / 构建命令

基线来源：

- [`README.md`](../../README.md)
- [`Makefile`](../../Makefile)

### `make dev`

用途：

- 通过 `air` 以 live reload 方式运行 Go 后端开发服务
- 通常与 `make frontend-dev` 配合使用

`Makefile` 中的实际 target 行为：

- 确保 `internal/web/dist/.keep` 存在
- 检查是否已安装 `air`
- 执行：

```bash
"$(AIR_BIN)" -c .air.toml -- $(ARGS)
```

解释：

- 这是后端单独的开发循环
- Go 服务会提供 API 和 SPA fallback
- 当配合 `frontend-dev` 使用时，前端资源由 Vite 单独处理

### `make frontend-dev`

用途：

- 启动前端 Vite 开发服务器

实际 target 行为：

```bash
cd frontend && npm run dev
```

Vite 代理行为：

- `/api` 默认代理到 `http://127.0.0.1:8080`
- 可通过 `VITE_API_TARGET` 覆盖

### `make test`

用途：

- 运行 Go 测试套件

实际 target 行为：

```bash
go test -tags fts5 ./... -v -count=1
```

解释：

- 在整个 Go module 范围内运行 CGO / SQLite FTS5 支持的测试

### `make e2e`

用途：

- 运行 Playwright 浏览器 E2E 测试

实际 target 行为：

```bash
cd frontend && npx playwright test
```

Playwright 配置：

- 配置文件：[`frontend/playwright.config.ts`](../../frontend/playwright.config.ts)
- 浏览器项目：Chromium 与 WebKit
- base URL：`http://127.0.0.1:8090`
- web server command：`bash ../scripts/e2e-server.sh`

`scripts/e2e-server.sh` 行为：

- 创建临时 SQLite DB
- 构建并运行 `cmd/testfixture`，用于写入测试 sessions
- 如果未提供预构建二进制，则构建前端和 Go server
- 启动 `agentsview serve --port 8090 --no-browser`
- 将所有 agent source directory 指向一个空临时目录，避免发现真实本地 sessions

### `make build`

用途：

- 构建内嵌前端资源的生产风格本地二进制文件

实际 target 行为：

1. 执行 `frontend` target
2. 将 `frontend/dist` 复制到 `internal/web/dist`
3. 执行 Go build：

```bash
CGO_ENABLED=1 go build -tags fts5 -ldflags="..." -o agentsview ./cmd/agentsview
```

解释：

- 最终产物是一个内嵌 SPA 资源的单体 `agentsview` 二进制文件

## 测试命令汇总

- Go 单元 / 集成式模块测试：`make test`
- 快速 Go 子集测试：`make test-short`
- PostgreSQL 集成测试：`make test-postgres`
- SSH 集成测试：`make test-ssh`
- 前端单元测试：`cd frontend && npm test`
- 前端 E2E 测试：`make e2e`

需要重点了解的 E2E specs：

- Session list：[`frontend/e2e/session-list.spec.ts`](../../frontend/e2e/session-list.spec.ts)
- Message loading / viewer 行为：[`frontend/e2e/message-loading.spec.ts`](../../frontend/e2e/message-loading.spec.ts)
- Navigation：[`frontend/e2e/navigation.spec.ts`](../../frontend/e2e/navigation.spec.ts)
