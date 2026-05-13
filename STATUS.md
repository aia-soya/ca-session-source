# STATUS.md

本文记录 `ca-session-source` 的当前实际进展、已知阻塞与下一步。

## 当前状态

- 根目录协作文档已建立：`AGENTS.md`、`SPEC.md`、`PLAN.md`、`STATUS.md`。
- 根目录入口文档与 `docs/cass` 权威文档已完成一轮一致性收敛。
- 文档口径已统一为 `ca-session-source` 本仓，不再以历史下游项目命名组织产品边界。
- M0 所需的 fork 基线文档已建立：`CONTRIBUTING.md`、`docs/source/fork-patch-map.md`、`docs/source/upstream-merge-checklist.md`。
- 已验证当前 Git 基线：`upstream/main` 与 `origin/main` 同指向 `c8bb17c067ed27b9d71e4eeea6b2abd8ce3e7398`，当前 `HEAD` 仅领先 3 个文档提交。
- 已创建 `ca-session-source` 开发分支，后续 source 研发工作可不再继续堆叠在 `main`。

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

## 当前待办

- 按 [PLAN.md](./PLAN.md) 与 [docs/cass/ca-session-source-plan.md](./docs/cass/ca-session-source-plan.md) 进入 M1，开始实现 `internal/source/` facade 与 DTO。
- 当进入代码阶段后，持续维护 `docs/source/fork-patch-map.md`，避免 source 改动扩散到 upstream 核心目录。
- 在首次 source 代码合入后，补充更细的里程碑进度、阻塞、测试结果与风险。

## 已知说明

- 本文件记录“当前真实进展”，不替代规格与计划。
- 若 `STATUS.md` 与 [SPEC.md](./SPEC.md) 或 [PLAN.md](./PLAN.md) 冲突，以规格和计划判断目标，以 `STATUS.md` 反映现状。
