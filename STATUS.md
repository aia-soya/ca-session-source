# STATUS.md

本文记录 `ca-session-source` 的当前实际进展、仍需持续观察的事项，以及对外文档口径。

## 当前状态

- `M0 ~ M7` 已按当前仓内范围完成，项目已形成可用的 source facade、稳定 source API、TypeScript SDK、fixture-driven smoke 与独立工程化入口。
- 当前稳定消费契约为 `/api/source/v1/*` 与 `GET /api/source/v1/events`；SDK 也仅支持这一组稳定 source contract。
- `SourceEvent` 的稳定事件类型为：

```text
session.created
session.updated
message.appended
source.error
```

- 当前消息锚点策略为 `sessionId + messageOrdinal`，`sourceUuid / sourceType / sourceSubtype` 继续作为可选增强字段透出。
- 当前工程化主链路为 `make source-ci`；本地最近一次已通过，覆盖 source Go contract、SDK test/build、release/pack gate 与 smoke harness。

## 已完成范围

- `internal/source/` 已提供窄 source facade，隔离 AgentsView 原始 store/service 与 source DTO。
- `internal/server/` 已提供稳定 `/api/source/v1/sessions*`、`tool-calls`、`version`、`health` 与 `/events` facade。
- `sdk/ts/` 已提供稳定的 source-oriented client、event watcher 与 transcript helper。
- `docs/source/` 已沉淀事件、锚点、增量消费、OpenAPI、工程化与 upstream merge 文档。
- `testdata/codex` 与 `testdata/claude` 已提供最小、异常、分页、rich tool-call 等 fixture，并接入 source smoke 主链。

## 当前待办

- 持续观察更大规模真实 session 下的分页体验、断线补洞成本与 `hasMore` / anchor 语义是否需要继续下沉为更强 REST 合同。
- 持续维护 `docs/source/fork-patch-map.md`，避免 source 改动扩散到 upstream 核心目录。
- 当决定切换到 npm 正式发布时，再补版本/tag 约定、dry-run publish gate 与发布物策略。

## 已知说明

- 本文件记录“当前真实进展”，不替代规格与计划；若与 [SPEC.md](./SPEC.md) 或 [PLAN.md](./PLAN.md) 冲突，以规格和计划定义目标，以本文件反映现状。
- 当前 `message.appended` 仍由 source adapter 基于 coarse-grained broadcaster scope 信号、session snapshot diff 与增量消息查询补齐，不是底层原生事件直通。
- 当前仓内不存在历史服役版本负担，因此文档中的“容错测试”仅指首个稳定协议发布前的字段/事件前向容错，不包含旧 SDK / 新 server 的跨版本兼容矩阵。
