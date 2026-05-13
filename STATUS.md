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

## 当前待办

- 继续完善 M1：评估是否需要在 facade 中补更明确的 `updatedAt` / 空值语义说明，并为后续 source API 预留更稳定的 filter/DTO 约束。
- 进入 M2：把 `WatchEvents` 的注入 seam 接到现有 broadcaster / SSE 适配上，输出稳定 SourceEvent。
- 持续维护 `docs/source/fork-patch-map.md`，避免 source 改动扩散到 upstream 核心目录。

## 已知说明

- 本文件记录“当前真实进展”，不替代规格与计划。
- 若 `STATUS.md` 与 [SPEC.md](./SPEC.md) 或 [PLAN.md](./PLAN.md) 冲突，以规格和计划判断目标，以 `STATUS.md` 反映现状。
- 当前 `WatchEvents` 仍是 M1 级别注入 seam，默认未接线时返回 `ErrEventsNotConfigured`；稳定事件语义与 transport adapter 仍归属 M2。
