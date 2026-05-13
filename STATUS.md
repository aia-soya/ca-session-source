# STATUS.md

本文记录 `ca-session-source` 的当前实际进展、已知阻塞与下一步。

## 当前状态

- 根目录协作文档已建立：`AGENTS.md`、`SPEC.md`、`PLAN.md`、`STATUS.md`。
- 根目录入口文档与 `docs/cass` 权威文档已完成一轮一致性收敛。
- 文档口径已统一为 `ca-session-source` 本仓，不再以历史下游项目命名组织产品边界。
- M0 所需的 fork 基线文档已建立：`CONTRIBUTING.md`、`docs/source/fork-patch-map.md`、`docs/source/upstream-merge-checklist.md`。
- 已验证当前 Git 基线：`upstream/main` 与 `origin/main` 同指向 `c8bb17c067ed27b9d71e4eeea6b2abd8ce3e7398`，当前 `HEAD` 仅领先 3 个文档提交。
- 已创建 `ca-session-source` 开发分支，后续 source 研发工作可不再继续堆叠在 `main`。
- M1 已进入代码阶段，新增 `internal/source/` facade 雏形，并完成基于 `db.Store` 的窄 DTO 读取适配与单测。
- M2 已进入代码阶段，新增 source event adapter 与 `/api/source/v1/events` SSE 路由，开始把 broadcaster 粗粒度刷新信号收敛为稳定 SourceEvent。
- M3 已进入代码阶段，新增 `sdk/ts/` TypeScript SDK，开始以 source-oriented client 形式复用现有 `/api/v1` 读接口与 `/api/source/v1/events` 稳定事件流。

## 最近完成

- 补全根目录 `AGENTS.md`、`SPEC.md`、`PLAN.md`。
- 清理 `docs/cass` 中与 `WU`、`WUB` 及具名下游产品相关的残留叙述。
- 对齐 SourceEvent 契约，以 PRD 为准明确：

```text
session.created
session.updated
message.appended
source.error
```

- 建立 fork patch map，记录当前 fork 补丁面与允许改动边界。
- 建立 upstream merge checklist，固化同步步骤、审计点与 smoke tests。
- 新增 `CONTRIBUTING.md`，把 fork 约束从 agent 协作文档扩展到仓库贡献约定。
- 新增 `internal/source/service.go`、`internal/source/types.go`、`internal/source/agentsview_service.go`，定义 Source Facade 接口、DTO 与 `db.Store -> source DTO` 适配层。
- 新增 `internal/source/service_test.go`，覆盖 session/message/tool-call mapping、空结果、not found、分页与事件流未接线场景。
- 修正 `internal/source.GetSession` 的可见性回归：保持 trashed session 对 source facade 不可见，同时继续允许 active session 读取完整元数据。
- 修正 `internal/source.ListSessions` 与 `GetSession` 的 DTO 语义偏差：列表项现在也会补齐 full metadata，确保 `sourcePath` / `updatedAt` 一致。
- 消除 `ListSessions` 的 N+1 full-session hydration：新增批量 full metadata 读取 helper，并由 source facade 优先走批量补齐路径。
- 收敛 `internal/db/sessions.go` 中批量/单条 full-session 读取的重复扫描逻辑，改为共享 helper，降低后续 schema 演进时的漂移风险。
- 对 `internal/source/agentsview_service.go` 做轻量重构：将 facade 方法、filter 处理、DTO mapping 与 hydration 策略拆分到独立源文件，降低 source 层自有文件的职责混合。
- 避免 remote/PG store 的冗余 full hydration：当底层 store 已无额外 full metadata 可补齐时，source facade 直接跳过二次查询，避免列表热路径双查。
- 收敛 `cmd/agentsview` 中 `prepareServeRuntimeConfig` 的 flaky 端口分配测试：为端口探测增加薄注入 seam，并让 `port=0` 用例通过 stub 验证配置回填与提示文案，不再依赖真实临时端口分配。
- 收敛整仓测试中的本地 listener 环境波动：为 `cmd/agentsview`、`internal/server`、`internal/service` 的 TCP listener / test server 场景补充共享测试 helper，在当前运行时禁止本地 bind 时自动 skip，允许时继续走真实 listener 语义验证。
- 收敛 listener 测试 helper 的重复实现：新增共享 `internal/testutil` 测试包，统一复用 TCP listener / `httptest` 启动逻辑，避免 `cmd/agentsview`、`internal/server`、`internal/service` 三处继续各自维护副本。
- 新增 `internal/source/event_adapter.go`，将现有 broadcaster 的 `scope` 信号适配为稳定 `session.created` / `session.updated` / `message.appended` / `source.error`。
- 新增 `internal/server/source_events.go` 并挂载 `GET /api/source/v1/events`，对外输出稳定 `source_event` SSE payload，同时保留 `heartbeat` keepalive。
- 新增 `docs/source/events.md`，明确 M2 的 source event schema、SSE event name 与锚点语义。
- 补充 `internal/source/event_adapter_test.go` 与 `internal/server/server_test.go`，覆盖 source event adapter、source SSE route、PG mode 不可用与 SSE query-token 鉴权链路。
- 修正 source event adapter 的初始基线失败语义：首个 snapshot 无法建立时，source watch 现在会直接返回错误，不再把空快照当作真实基线并误发全量 `session.created` / `message.appended`。
- 收敛 `/api/source/v1/events` 的订阅成本：新增 server 内共享 source event broadcaster，让全量 snapshot diff / 增量补齐只执行一次，而不是每个 SSE 订阅者各自重跑一遍。
- 收敛 source event watch 的订阅生命周期：共享 source broadcaster 现在会在最后一个 SSE 订阅者离开时停止上游 watch，并在后续新订阅到来时自动重启，避免无人消费时后台继续做 snapshot diff。
- 修正 `/api/source/v1/events` 的错误响应时序：source 订阅现在先于 SSE stream 初始化建立，确保初始 snapshot/watch 建立失败时客户端拿到明确的 `503` JSON，而不是已提交的半截 `text/event-stream` 响应。
- 新增 `sdk/ts/package.json`、`tsconfig.json`、`README.md` 与 `src/` 基础实现，建立 `@aia/ca-session-source-client` source-first SDK 包骨架。
- 新增 `sdk/ts/src/client.ts`、`types.ts`、`events.ts`、`errors.ts`、`index.ts`，提供 `CaSessionSourceClient`、camelCase source DTO mapping、fetch-based SSE 订阅与基础错误模型。
- 新增 `sdk/ts/src/client.test.ts`，覆盖 `listSessions`、`getMessages`、`getToolCalls`、JSON error handling、`watchEvents` SSE 解析与断线重连。
- 已验证 `sdk/ts` 的 `npm test`、`npm run build` 与 `npm pack`（使用本地临时 npm cache）均可通过，当前 tarball 名称为 `aia-ca-session-source-client-0.1.0.tgz`。
- 修正 source event adapter 的快照推进语义：当 `message.appended` 增量补偿失败时，source 层现在会保留该 session 的未完成消费水位，避免瞬时查询失败后永久丢失后续 `message.appended` 事件。
- 将 `sdk/ts` 包导出切换到提交态 `dist/` JS / `.d.ts` 产物，避免 workspace / Git URL / tarball 消费方直接命中原始 `.ts` 源文件。
- 新增 `sdk/ts/test/dist.test.js` 与共享 contract suite，让 `npm test` 同时覆盖 `src` 源实现和实际对外发布的 `dist` 入口，降低 `dist` 与源码漂移后仍被打包发布的风险。
- 新增 `sdk/ts/test/dist-types.test.js`，对发布态 `dist/*.d.ts` 做声明面 contract 检查，降低 runtime 入口已验证但类型声明漂移后仍被打包发布的风险。
- 新增 `.gitignore` 中的 `sdk/ts/*.tgz` 忽略规则，并清理误入工作区的 SDK 打包产物，避免本地 `npm pack` 结果再次混入后续提交。

## 当前待办

- 继续完善 M1：评估是否需要在 facade 中补更明确的 `updatedAt` / 空值语义说明，并为后续 source API 预留更稳定的 filter/DTO 约束。
- 继续完善 M2：评估是否需要进一步缩小初次 connect 时的全量 snapshot 成本，并确认后续 SDK 是否直接消费 `source_event` / PRD 定义的 `camelCase` 协议。
- 推进 M4：补 SDK smoke harness，验证“事件到达 -> 增量拉取 messages”与“初次快照拉取”在真实服务上的闭环。
- 评估 M6 之前是否需要新增 `/api/source/v1/sessions*` facade，逐步把 SDK 从 `/api/v1` 底座切到稳定 source REST 合同。
- 持续维护 `docs/source/fork-patch-map.md`，避免 source 改动扩散到 upstream 核心目录。

## 已知说明

- 本文件记录“当前真实进展”，不替代规格与计划。
- 若 `STATUS.md` 与 [SPEC.md](./SPEC.md) 或 [PLAN.md](./PLAN.md) 冲突，以规格和计划判断目标，以 `STATUS.md` 反映现状。
- 当前 M2 已为 source facade 提供 broadcaster -> SourceEvent adapter，并新增 `/api/source/v1/events`；底层 broadcaster 仍是 coarse-grained `scope` 事件，因此 `message.appended` 语义仍由 source adapter 通过快照 diff 与增量消息查询补齐。
- 当前 M3 SDK 仍以“稳定 client contract + 复用现有服务端接口”为主：sessions/messages/tool-calls 先走 `/api/v1`，稳定 source 事件走 `/api/source/v1/events`，待后续 `/api/source/v1/*` REST facade 收敛后再平滑切换底层实现。
