# CONTRIBUTING

`ca-session-source` 是基于 AgentsView 的 fork，本仓贡献规则以“保持 upstream 可合并、最小侵入扩展 source 能力”为第一原则。

## 贡献目标

- 复用 AgentsView 既有 parser、sync、SQLite、REST API、SSE 与 transcript browser。
- 在 fork 内新增 source facade、source API、TypeScript SDK 与相关文档。
- 让后续 `upstream/main` 同步成本保持可控，冲突集中在少量 wiring 文件。

## 分支策略

当前采用以下分支约定：

```text
upstream/main         # 上游权威基线
main                  # 本项目默认开发 / 发布分支
upstream-sync         # 可选：fork 内部的 upstream 镜像分支
feature/source-*      # 具体功能分支
```

约束：

- `main` 作为本项目默认主线，承担日常开发、发布和打 tag。
- `upstream/main` 只通过 remote 跟踪，不再复用 `main` 分支承担镜像角色。
- 如需在 fork 内保留上游镜像，使用 `upstream-sync` 之类不会与默认主线冲突的名称。
- source 研发工作优先在 `main` 或 `feature/source-*` 上进行。
- 若当前分支状态与上述约定不一致，先参考 [docs/source/upstream-merge-checklist.md](./docs/source/upstream-merge-checklist.md) 校正，再继续扩展功能。

## 允许新增的区域

优先新增而不是重写，新增代码应尽量集中在：

- `internal/source/`
- `internal/sourceapi/`
- `sdk/ts/`
- `docs/source/`
- `frontend/src/source-debug/`（仅在明确需要调试页时）

## 允许薄改的集成点

如果必须修改 upstream 文件，改动应尽量限制在以下薄 wiring 面：

- `cmd/agentsview/main.go`
- `internal/server/server.go`
- `internal/config/*`
- `Makefile`
- `frontend` 中与 source 调试入口或 API facade 注册直接相关的少量文件

这类修改应满足：

- 只做 route registration、service wiring、config extension、event adapter 或 build script extension。
- 不改变原 AgentsView API 的既有语义，除非规格文档明确要求。
- 改动理由必须能在 [docs/source/fork-patch-map.md](./docs/source/fork-patch-map.md) 中审计。

## 默认禁止的修改

除非规格、计划和状态文档明确升级范围，否则不要主动改动：

- `internal/parser/*`
- `internal/sync/*`
- `internal/db` 的核心 schema 与 session/message 原始语义
- `internal/server` 现有 `/api/v1/*` 的既有行为
- `frontend` 现有 transcript browser 核心渲染逻辑

同时禁止把以下能力塞入 source 层：

- analytics
- pins / stars
- insights
- 项目管理
- 协作分享
- 标注分析

## 开工前检查

提交改动前，请先完成：

1. 阅读 `AGENTS.md`、`SPEC.md`、`PLAN.md`、`STATUS.md`，必要时补读 `docs/cass/*` 权威文档。
2. 判断本次改动是否触碰 fork 边界、upstream merge 可维护性或 source 协议。
3. 选择最小改动面，优先新增模块、薄 facade、薄 wiring。
4. 若会修改 upstream 核心目录，先在变更说明里写清理由与风险。

## 提交后要求

- 更新 `STATUS.md`，反映真实进展、风险与下一步。
- 若规格或计划发生变化，同步更新 `SPEC.md`、`PLAN.md` 及 `docs/cass` 权威文档。
- 若新增或扩大了 fork patch 面，同步更新 [docs/source/fork-patch-map.md](./docs/source/fork-patch-map.md)。
- 若同步了 upstream 或调整了 merge 策略，同步更新 [docs/source/upstream-merge-checklist.md](./docs/source/upstream-merge-checklist.md)。

## Upstream 同步

所有 upstream 合并、rebase、冲突检查与 smoke test，统一按 [docs/source/upstream-merge-checklist.md](./docs/source/upstream-merge-checklist.md) 执行。
