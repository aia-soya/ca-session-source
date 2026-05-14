# Fork Patch Map

本文记录 `ca-session-source` 相对 upstream AgentsView 的 fork patch 面，目标是让改动可枚举、可审计、可在同步 upstream 时快速定位风险。

## 基线快照

快照时间：`2026-05-13`

已验证事实：

- `upstream` remote 已配置为 `https://github.com/wesm/agentsview.git`
- `origin` remote 已配置为 `https://github.com/aia-soya/ca-session-source.git`
- `upstream/main`、`origin/main` 与 `merge-base(HEAD, upstream/main)` 当前都指向 `c8bb17c067ed27b9d71e4eeea6b2abd8ce3e7398`
- 当前 `HEAD` 为 `df8836d08b10c66f93b5b3231b109b12ac07158a`
- 当前 `HEAD` 相对 `upstream/main` 领先 `3` 个提交，且这些提交均为 `ca-session-source` 文档基线收敛

说明：

- 这反映的是 M0 完成时的起始基线；自 M1 起已经开始引入 source facade 代码层补丁。
- 后续每当新增代码或薄改 upstream wiring，必须更新本文。

## 当前已审计补丁

相对 `upstream/main...HEAD` 的当前文件级补丁如下：

| 类型 | 路径 | 说明 | merge 风险 |
| --- | --- | --- | --- |
| `M` | `AGENTS.md` | 建立本仓协作边界、架构不变量与文档入口 | 低 |
| `D` | `CLAUDE.md` | 删除 upstream 侧旧协作文档入口，避免与本仓规则冲突 | 低 |
| `A` | `PLAN.md` | 新增根目录计划入口 | 低 |
| `A` | `SPEC.md` | 新增根目录规格入口 | 低 |
| `A` | `STATUS.md` | 新增当前进展真相文档 | 低 |
| `A` | `docs/cass/BASELINE_NOTES.md` | 记录 fork 基线与仓库现状事实 | 低 |
| `A` | `docs/cass/ca-session-source-plan.md` | 记录 `ca-session-source` 研发计划 | 低 |
| `A` | `docs/cass/ca-session-source-prd.md` | 记录 `ca-session-source` PRD | 低 |
| `A` | `CONTRIBUTING.md` | 新增 fork 贡献约定，补齐非 agent 视角的协作边界 | 低 |

## 允许新增的 patch 面

后续 source 能力默认只应向以下区域新增：

- `internal/source/`
- `internal/sourceapi/`
- `sdk/ts/`
- `docs/source/`
- `frontend/src/source-debug/`（可选）

这些目录之外的改动，应先回答两个问题：

1. 是否真的是 source 能力必须的集成点？
2. 是否有更薄的新增模块或 wiring 方案可替代？

## 允许薄改的 upstream 集成点

为了接入 source facade / source API，可以接受的薄改点如下：

| 路径 | 允许的改动类型 | 备注 |
| --- | --- | --- |
| `cmd/agentsview/main.go` | 启动 wiring、依赖注入 | 不重写现有启动流程 |
| `internal/server/server.go` | route registration、handler 挂载 | 不破坏既有 `/api/v1/*` 行为 |
| `internal/config/*` | 配置扩展 | 只增不扭曲原配置语义 |
| `Makefile` | source 相关构建/测试命令 | 保持原 AgentsView 命令可用 |
| `frontend` 少量入口文件 | source debug 页面或 API client facade 接入 | 不重建 transcript browser |

## 默认禁止的 patch 面

以下区域默认视为 upstream 核心，不应在首期主动改写：

- `internal/parser/*`
- `internal/sync/*`
- `internal/db` 核心 schema、session/message 原始语义
- `internal/server` 既有业务 handler 的核心行为
- `frontend` 现有 transcript renderer / message viewer 核心逻辑

如确有必要改动：

- 必须在 `SPEC.md`、`PLAN.md` 或 `docs/cass` 权威文档中先说明原因。
- 必须把改动面、替代方案与 merge 风险补充到本文。

## 后续补丁登记格式

当开始进入代码阶段时，按以下格式补充：

| 日期 | 类型 | 路径 | 归属里程碑 | 改动摘要 | merge 风险 | 验证方式 |
| --- | --- | --- | --- | --- | --- | --- |
| `YYYY-MM-DD` | `A/M/D` | `internal/source/...` | `M1` | 例如：新增 SourceService facade | 低/中/高 | 单测 / smoke test |
| `2026-05-13` | `A` | `internal/source/service.go` | `M1` | 新增 Source Facade 窄接口与事件注入 seam | 低 | `go test ./internal/source -count=1` |
| `2026-05-13` | `A` | `internal/source/types.go` | `M1` | 新增 source DTO、分页与 filter 类型，隔离 DB 类型泄漏 | 低 | `go test ./internal/source -count=1` |
| `2026-05-13` | `A` | `internal/source/agentsview_service.go` | `M1` | 新增 `db.Store -> source DTO` 薄适配实现 | 低 | `go test ./internal/source -count=1` |
| `2026-05-13` | `A` | `internal/source/filters.go` | `M1` | 拆出 source facade filter 校验与转换逻辑 | 低 | `go test ./internal/source -count=1` |
| `2026-05-13` | `A` | `internal/source/hydration.go` | `M1` | 拆出 full-session hydration 策略与批量补齐逻辑 | 低 | `go test ./internal/source -count=1` |
| `2026-05-13` | `A` | `internal/source/mappers.go` | `M1` | 拆出 Session/Message/ToolCall DTO mapping 逻辑 | 低 | `go test ./internal/source -count=1` |
| `2026-05-13` | `A` | `internal/source/service_test.go` | `M1` | 新增 facade 单测覆盖 mapping、分页、空结果与未接线事件流 | 低 | `go test ./internal/source -count=1` |
| `2026-05-13` | `A` | `docs/source/message-anchor.md` | `M5` | 明确 `sessionId + messageOrdinal` 锚点策略与 `sourceUuid` 升级路径 | 低 | 文档审阅 |
| `2026-05-13` | `A` | `docs/source/incremental-consumption.md` | `M5` | 明确 `message.appended` fast path、`session.updated` fallback、幂等与 reconnect 补洞语义 | 低 | 文档审阅 |
| `2026-05-13` | `M` | `docs/source/events.md` | `M5` | 将事件契约与锚点/消费策略文档交叉引用，统一对外口径 | 低 | 文档审阅 |
| `2026-05-13` | `M` | `sdk/ts/src/types.ts` | `M5` | 显式新增 `MessageAnchor` 与 transcript helper 的 `latestAnchor` contract | 低 | `npm test` |
| `2026-05-13` | `M` | `sdk/ts/src/transcript.ts` | `M5` | 为 snapshot、增量消费与历史翻页结果补齐显式 anchor 返回值 | 低 | `npm test` |
| `2026-05-13` | `A` | `sdk/ts/src/transcript-buffer.ts` | `M5` | 拆出 transcript buffer 与 anchor 构造逻辑，降低单文件职责堆积 | 低 | `npm test` |
| `2026-05-13` | `A` | `sdk/ts/src/transcript-sync.ts` | `M5` | 拆出 snapshot、增量补洞与历史翻页逻辑，保留薄 watch facade | 低 | `npm test` |
| `2026-05-13` | `M` | `sdk/ts/src/index.ts` | `M5` | 导出 `createMessageAnchor(...)` 与 `MessageAnchor` | 低 | `npm test` |
| `2026-05-13` | `A` | `sdk/ts/src/client-mappers.ts` | `M5` | 拆出 raw DTO 与 source-oriented mapper，降低 client facade 耦合 | 低 | `npm test` |
| `2026-05-13` | `A` | `sdk/ts/src/client-transport.ts` | `M5` | 拆出 HTTP/URL/error transport helper，避免 client facade 继续膨胀 | 低 | `npm test` |
| `2026-05-13` | `M` | `sdk/ts/src/client.ts` | `M5` | 收敛为薄 client facade，组合 mapper 与 transport seam | 低 | `npm test` |
| `2026-05-13` | `M` | `sdk/ts/test/client-contract.js` | `M5` | 补兼容性测试，覆盖缺失 sourceUuid、重复事件、fallback、分页边界与未知事件 | 低 | `npm test` |
| `2026-05-13` | `M` | `sdk/ts/test/dist-types.test.js` | `M5` | 收敛发布态类型契约，避免 dist 与源码导出漂移 | 低 | `npm test` |
| `2026-05-13` | `M` | `sdk/ts/README.md` | `M5` | 同步 SDK 消费示例到显式 anchor 与分页语义 | 低 | 文档审阅 |
| `2026-05-13` | `M` | `STATUS.md` | `M5` | 记录消息锚点与消费语义收敛进展 | 低 | 文档审阅 |
| `2026-05-14` | `A` | `internal/sourceapi/types.go` | `M6` | 新增稳定 source REST 响应壳、camelCase DTO mapper 与 `schemaVersion` 常量 | 低 | `go test ./internal/source ./internal/server -count=1` |
| `2026-05-14` | `A` | `internal/server/source_api.go` | `M6` | 新增 `/api/source/v1/sessions*`、`tool-calls`、`version`、`health` facade handler | 低 | `go test ./internal/source ./internal/server -count=1` |
| `2026-05-14` | `M` | `internal/server/server.go` | `M6` | 挂载 M6 source REST 路由，新增稳定 source contract 集成点 | 低 | `go test ./internal/source ./internal/server -count=1` |
| `2026-05-14` | `M` | `internal/server/source_events.go` | `M6` | 将 source SSE 的错误路径统一到带 `schemaVersion` 的 source error envelope | 低 | `go test ./internal/source ./internal/server -count=1` |
| `2026-05-14` | `M` | `internal/source/types.go` | `M6` | 为 source `ToolCall` DTO 补齐 `resultContentLength`、`ordinal`、`timestamp` | 低 | `go test ./internal/source ./internal/server -count=1` |
| `2026-05-14` | `M` | `internal/source/mappers.go` | `M6` | 扩展 tool-call mapper，保留 result metadata 到 source facade | 低 | `go test ./internal/source ./internal/server -count=1` |
| `2026-05-14` | `M` | `internal/source/agentsview_service.go` | `M6` | 在 flattened tool-call 路径补齐父 message 的 ordinal/timestamp 上下文 | 低 | `go test ./internal/source ./internal/server -count=1` |
| `2026-05-14` | `A` | `internal/server/source_api_test.go` | `M6` | 新增 source REST 合同测试，覆盖 camelCase/schemaVersion、version/health 与 error envelope | 低 | `go test ./internal/source ./internal/server -count=1` |
| `2026-05-14` | `M` | `internal/server/source_events_test.go` | `M6` | 更新 source SSE 错误合同测试，校验 `schemaVersion` | 低 | `go test ./internal/source ./internal/server -count=1` |
| `2026-05-14` | `M` | `sdk/ts/src/client.ts` | `M6` | 将 SDK 默认 REST base path 切换到 `/api/source/v1/` | 低 | `npm test` |
| `2026-05-14` | `M` | `sdk/ts/src/client-mappers.ts` | `M6` | 将 SDK mapper 收敛到单一 source camelCase contract，移除开发期双协议兼容 | 低 | `npm test` |
| `2026-05-14` | `M` | `sdk/ts/test/client-contract.js` | `M6` | 收敛 SDK 合同测试到唯一 `/api/source/v1` 协议 | 低 | `npm test` |
| `2026-05-14` | `M` | `sdk/ts/README.md` | `M6` | 明确 SDK 仅支持 `/api/source/v1` 稳定协议 | 低 | 文档审阅 |
| `2026-05-14` | `A` | `docs/source/openapi.yaml` | `M6` | 新增 `/api/source/v1/*` 的 OpenAPI 合同文档 | 低 | 文档审阅 |
| `2026-05-14` | `M` | `STATUS.md` | `M6` | 记录 Source API 稳定化完成情况与后续观察点 | 低 | 文档审阅 |
| `2026-05-14` | `A` | `internal/server/request_filters.go` | `M6` | 抽出 sessions/messages 共享 query parser，避免 `/api/v1` 与 `/api/source/v1` 校验逻辑双写漂移 | 低 | `go test ./internal/server -count=1` |
| `2026-05-14` | `A` | `sdk/ts/src/client-payloads.ts` | `M6` | 新增 source REST payload envelope 层，复用公共 DTO 降低 SDK 内部 schema 副本数量 | 低 | `npm test` |
| `2026-05-14` | `A` | `sdk/ts/test/contract-helpers.js` | `M6` | 抽出 SDK contract suite 的 fetch/SSE 共用 helper，降低测试样板重复 | 低 | `npm test` |
| `2026-05-14` | `A` | `sdk/ts/test/contract-fixtures.js` | `M6` | 抽出 source REST/event 的共享 fixture builder，集中维护测试 payload 缺省值与 schema 常量 | 低 | `npm test` |
| `2026-05-14` | `A` | `sdk/ts/test/client-rest-contract.js` | `M6` | 将 REST 合同断言从 catch-all 测试文件中拆出，收敛测试职责边界 | 低 | `npm test` |
| `2026-05-14` | `A` | `sdk/ts/test/client-session-rest-contract.js` | `M6` | 将 sessions REST contract 独立成 suite，单独覆盖 query/header/source DTO 映射语义 | 低 | `npm test` |
| `2026-05-14` | `A` | `sdk/ts/test/client-message-rest-contract.js` | `M6` | 将 messages REST contract 独立成 suite，隔离 message/tool-call/anchor/null-page 合同回归 | 低 | `npm test` |
| `2026-05-14` | `A` | `sdk/ts/test/client-tool-call-rest-contract.js` | `M6` | 将 flattened tool-call REST contract 独立成 suite，避免与 messages/version/error 测试混堆 | 低 | `npm test` |
| `2026-05-14` | `A` | `sdk/ts/test/client-metadata-rest-contract.js` | `M6` | 将 `version/health` metadata contract 独立成 suite，便于后续扩 capability 字段 | 低 | `npm test` |
| `2026-05-14` | `A` | `sdk/ts/test/client-error-rest-contract.js` | `M6` | 将 REST error path contract 独立成 suite，隔离 ApiError 映射回归 | 低 | `npm test` |
| `2026-05-14` | `A` | `sdk/ts/test/transcript-contract.js` | `M6` | 将 transcript helper 合同拆成独立 suite，避免继续膨胀单文件测试入口 | 低 | `npm test` |
| `2026-05-14` | `A` | `sdk/ts/test/events-contract.js` | `M6` | 将 SSE/reconnect contract 独立成 events suite，提升定位与扩展可维护性 | 低 | `npm test` |
| `2026-05-14` | `A` | `sdk/ts/examples/smoke/lib/runner.js` | `M6` | 抽出 smoke harness 执行器，分离 run.js 的 env 解析、状态机与结果输出职责 | 低 | `go test ./sdk/ts/examples/smoke -count=1` |
| `2026-05-14` | `A` | `sdk/ts/test/transcript-snapshot-contract.js` | `M6` | 将 transcript snapshot/history contract 拆成独立 suite，降低 transcript catch-all 文件膨胀风险 | 低 | `npm test` |
| `2026-05-14` | `A` | `sdk/ts/test/transcript-event-contract.js` | `M6` | 将 `consumeTranscriptEvent` contract 独立成 event-focused suite，便于单点扩展 source.error 与幂等回归 | 低 | `npm test` |
| `2026-05-14` | `A` | `sdk/ts/test/transcript-watch-contract.js` | `M6` | 将 `watchSessionTranscript` orchestration contract 独立成 watch suite，避免 snapshot/event/watch 混堆 | 低 | `npm test` |
| `2026-05-14` | `A` | `sdk/ts/examples/smoke/smoke_env_test.go` | `M6` | 抽出 smoke 测试环境搭建 helper，分离 SQLite/server 初始化职责 | 低 | `go test ./sdk/ts/examples/smoke -count=1` |
| `2026-05-14` | `A` | `sdk/ts/examples/smoke/smoke_process_test.go` | `M6` | 抽出 smoke Node 进程编排、结果等待与 SDK build helper，降低 support file 混合职责 | 低 | `go test ./sdk/ts/examples/smoke -count=1` |
| `2026-05-14` | `A` | `sdk/ts/examples/smoke/smoke_transport_test.go` | `M6` | 抽出 source events 断连注入 helper，隔离 HTTP transport 语义测试 seam | 低 | `go test ./sdk/ts/examples/smoke -count=1` |

## 与 upstream merge 的关系

本文只回答两个问题：

1. 我们改了哪里？
2. 哪些地方是下次同步 upstream 时必须优先看的？

具体同步步骤、检查清单与 smoke tests，请看 [upstream-merge-checklist.md](./upstream-merge-checklist.md)。
