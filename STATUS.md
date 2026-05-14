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
- M4 已完成：已建立 SDK smoke harness，并用真实 HTTP/SSE 服务验证 snapshot、event-driven incremental fetch、重连补洞与历史翻页闭环。
- M5 已完成：已明确 `sessionId + messageOrdinal` 消息锚点策略，补齐增量消费文档、SDK 显式 anchor contract 与兼容性测试，并把原始 message page 与 transcript helper 的分页语义边界收敛到统一口径。

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
- 将 `sdk/ts` 包导出切换到自动生成的发布产物：runtime 与类型入口统一走 `dist/*`，避免消费方直接命中未构建源码，同时持续压缩手工维护 `dist` 的风险面。
- 新增 `sdk/ts/test/dist.test.js` 与共享 contract suite，让 `npm test` 同时覆盖 `src` 源实现和实际对外发布的 `dist` 入口，降低 `dist` 与源码漂移后仍被打包发布的风险。
- 新增 `sdk/ts/test/dist-types.test.js`，对包导出的类型入口与 `src` 公共声明面做 contract 检查，降低 runtime 入口已验证但类型入口漂移后仍被打包发布的风险。
- 新增 `.gitignore` 中的 `sdk/ts/*.tgz` 忽略规则，并清理误入工作区的 SDK 打包产物，避免本地 `npm pack` 结果再次混入后续提交。
- 新增 `sdk/ts/examples/smoke/run.js` 与 `sdk/ts/examples/smoke/README.md`，提供直接消费发布态 `dist` SDK 的 smoke harness，用于手工验证 `listSessions -> getSession -> getMessages -> getToolCalls` 和 `session.updated / message.appended -> incremental getMessages` 闭环。
- 新增 `sdk/ts/examples/smoke/smoke_test.go`，以真实 `server.New(...)` + SQLite + `/api/source/v1/events` + Node SDK 脚本的组合方式覆盖 M4 的消费闭环回归。
- 扩展 `sdk/ts/examples/smoke`：支持期望最终消息数、重连开关与 reopen 观测，并补充真实服务回归覆盖“断线重连后用 latest ordinal 补齐缺口”以及“`tool_calls` 为空不影响快照主路径”。
- 继续扩展 `sdk/ts/examples/smoke`：补充 `source.error` surfaced 回归，验证 source adapter 首次 appended backfill 失败后，消费方仍能在后续 refresh 中补齐缺口而不丢消息。
- 修正 SDK 对空页响应的兼容性：当现有 `/api/v1/sessions/{id}/messages` 返回 `messages: null` 时，`CaSessionSourceClient` 现在会归一为空数组，不再在增量补洞或空结果场景下因 `.map(...)` 崩溃。
- 将 smoke 中验证过的消费模式沉淀为 SDK helper：新增 transcript helper，用统一的 `SessionMessageBuffer + fetchSessionTranscriptSnapshot + consumeTranscriptEvent` 复用“快照分页 + latest ordinal 增量补洞 + source.error surfaced”逻辑，降低消费方重复实现成本。
- 在 transcript helper 之上继续补自动 watch orchestration：新增 `watchSessionTranscript(...)`，把 snapshot、`watchEvents(...)` 与 buffer update 收敛成一步式消费入口，并让 smoke harness 直接 dogfood 该入口。
- 继续补齐大 session 冷启动体验：为 transcript helper 新增 `tailMessageCount` 与 `startOrdinal`，允许消费方只拉最近 N 条消息建立尾部快照，同时保持后续增量补洞语义不变；并新增真实 smoke 回归覆盖该路径。
- 将“历史窗口继续向前翻页”收敛为更完整的消费 API：新增 `fetchEarlierSessionTranscriptPage(...)` 与 `watched.fetchEarlierPage(...)`，统一处理 `desc` 拉取、升序回放、buffer 去重合并和 `hasMore` 判定，并补充真实 smoke 回归覆盖尾部快照后的历史翻页。
- 修正 SDK 发布反模式：引入 `unbuild`（`mkdist`）作为 `sdk/ts` 的正式编译发布链路，统一从 `src/*.ts` 生成 `dist/*.js` 与 `dist/*.d.ts`，并通过薄 postbuild rewrite 收敛相对 specifier 到发布态 `.js`；不再手工双写 `dist` 运行时代码或声明文件。
- 为 SDK 补充独立类型检查：新增 `npm run typecheck`，统一用 `tsc --noEmit` 校验 `src/` 公共源码的类型正确性，让运行时构建和类型诊断职责分离。
- 修正 transcript buffer 的规模化热点：`SessionMessageBuffer` 现在缓存 `earliestOrdinal / latestOrdinal / messages`，避免在大 session 的快照、历史翻页与增量补洞路径上重复全量扫描和排序。
- 在 `sdk/ts/package.json`、`sdk/ts/README.md` 中补充 `npm run smoke` 与运行说明，降低后续消费方和仓内联调的启动成本。
- 新增 `docs/source/message-anchor.md` 与 `docs/source/incremental-consumption.md`，把 M5 的消息锚点、`message.appended` fast path、`session.updated` fallback、重复事件幂等与 reconnect 补洞语义收敛为权威文档。
- 在 `sdk/ts` 中显式新增 `MessageAnchor` / `createMessageAnchor(...)` / `latestAnchor` 返回值，统一 SDK transcript snapshot、增量消费结果与历史翻页结果的消息锚点口径，同时保持 `sourceUuid / sourceType / sourceSubtype` 为可选增强字段。
- 扩展 SDK contract tests，覆盖缺失 `sourceUuid`、重复 `message.appended`、`session.updated` fallback、历史翻页边界与 unknown event type 忽略语义，降低后续协议演进对消费方的回归风险。
- 收敛 SDK 源码热点：将原先职责过载的 `sdk/ts/src/transcript.ts` 拆为 `transcript-buffer.ts`、`transcript-sync.ts` 和薄 `transcript.ts` facade；同时将 `sdk/ts/src/client.ts` 拆出 `client-mappers.ts` 与 `client-transport.ts`，降低后续 M6 REST 合同演进时的单文件耦合。

## 当前待办

- 继续完善 M1：评估是否需要在 facade 中补更明确的 `updatedAt` / 空值语义说明，并为后续 source API 预留更稳定的 filter/DTO 约束。
- 继续完善 M2：评估是否需要进一步缩小初次 connect 时的全量 snapshot 成本，并确认后续 SDK 是否直接消费 `source_event` / PRD 定义的 `camelCase` 协议。
- 持续观察 M5 后续反馈：关注真实 Codex / Claude session 下更大规模分页体验、长时间断线后的补洞成本，以及 M6 `/api/source/v1/*` 是否需要把 helper 里的 `hasMore`/anchor 语义进一步下沉为稳定 REST 合同。
- 继续观察 SDK 模块边界：若后续 transcript helper 或 `/api/source/v1/*` 继续扩展，优先沿现有 `buffer / sync / watch` 与 `transport / mapper / facade` 分层演进，避免重新回到单文件职责堆积。
- 评估 M6 之前是否需要新增 `/api/source/v1/sessions*` facade，逐步把 SDK 从 `/api/v1` 底座切到稳定 source REST 合同。
- 持续维护 `docs/source/fork-patch-map.md`，避免 source 改动扩散到 upstream 核心目录。

## 已知说明

- 本文件记录“当前真实进展”，不替代规格与计划。
- 若 `STATUS.md` 与 [SPEC.md](./SPEC.md) 或 [PLAN.md](./PLAN.md) 冲突，以规格和计划判断目标，以 `STATUS.md` 反映现状。
- 当前 M2 已为 source facade 提供 broadcaster -> SourceEvent adapter，并新增 `/api/source/v1/events`；底层 broadcaster 仍是 coarse-grained `scope` 事件，因此 `message.appended` 语义仍由 source adapter 通过快照 diff 与增量消息查询补齐。
- 当前 M3 SDK 仍以“稳定 client contract + 复用现有服务端接口”为主：sessions/messages/tool-calls 先走 `/api/v1`，稳定 source 事件走 `/api/source/v1/events`，待后续 `/api/source/v1/*` REST facade 收敛后再平滑切换底层实现。
