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

## 与 upstream merge 的关系

本文只回答两个问题：

1. 我们改了哪里？
2. 哪些地方是下次同步 upstream 时必须优先看的？

具体同步步骤、检查清单与 smoke tests，请看 [upstream-merge-checklist.md](./upstream-merge-checklist.md)。
