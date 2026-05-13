# AGENTS.md

## 项目

本仓库是 AgentsView 的 fork，用于构建 `ca-session-source`。

`ca-session-source` 的核心职责是统一提供本机 Coding Agent transcript source，复用 AgentsView 已有的 session discovery、parser、sync、SQLite、REST API、SSE 与前端浏览能力，为上层产品提供稳定的 Thread / Session transcript 数据源。

除非明确要求，不得重写 AgentsView 的核心 session 摄取模型、parser、sync、原始 session / message 语义或 transcript browser。

## 工作语言

本项目默认工作语言为中文。

## Harness 原则

`AGENTS.md` 只定义 Coding Agent 的工作边界与协作规则。详细需求、规格、计划与基线采用渐进式披露：

- 规格与产品语义：读 [SPEC.md](./SPEC.md)
- 实施路线与阶段任务：读 [PLAN.md](./PLAN.md)
- 当前进展、阻塞与下一步：读 [STATUS.md](./STATUS.md)
- 仓库基线与现状事实：读 [docs/cass/BASELINE_NOTES.md](./docs/cass/BASELINE_NOTES.md)

当任务涉及 source 协议、架构边界、里程碑、upstream merge 约束时，必须先阅读对应文档，不要只凭记忆或猜测实现。

## 架构不变量

必须遵守以下不变量：

- AgentsView 的 sessions / messages 是源数据。
- source 层只提供 transcript source，不承载项目管理、协作分享、标注分析或其它上层业务逻辑。
- 首期以 fork 增强为主，优先新增模块，而不是重写 ingestion。
- 优先新增的目录为：

```text
internal/source/
internal/sourceapi/
sdk/ts/
docs/source/
```

- 尽量不改 `internal/parser`、`internal/sync`、`internal/db` 的核心语义。
- 上层产品通过 SDK / source API 接入，不直接耦合 AgentsView 内部实现。
- source DTO 不直接暴露完整 DB 类型。
- 事件契约以 [docs/cass/ca-session-source-prd.md](./docs/cass/ca-session-source-prd.md) 为准，包含：

```text
session.created
session.updated
message.appended
source.error
```

## 开发前规则

编辑代码之前，必须：

1. 检查现有项目约定与最小需要修改的文件集合。
2. 判断是否需要先阅读 [SPEC.md](./SPEC.md)、[PLAN.md](./PLAN.md)、[STATUS.md](./STATUS.md) 或 [docs/cass/BASELINE_NOTES.md](./docs/cass/BASELINE_NOTES.md)。
3. 优先复用已有 API、service、store、watcher、SSE、测试机制。
4. 说明实现计划与主要改动面。
5. 若实现会触碰 fork 边界或破坏 upstream merge 可维护性，先停止并说明原因。

## 开发中规则

实现时保持 KISS：

- 优先薄 facade、薄 wiring，不扩散修改面。
- 优先新增模块，不轻易改动 upstream 核心目录。
- source API / SDK 不混入上层业务模型。
- 若底层事件粒度不足，可在 facade 层补齐 `message.appended` 语义，但不要直接扭曲底层核心模型。
- 与 source 无关的 analytics、pins、stars、insights 等能力，不要被复制进 source 层。

## 审查规则

进行代码审查、重构建议、冗长度评估或反模式排查时，默认只审查 fork patch 面，排除 upstream 代码。

- 审查范围优先限定在 [docs/source/fork-patch-map.md](./docs/source/fork-patch-map.md) 中登记的新增/薄改路径，以及当前分支相对 `upstream/main` 的实际补丁文件。
- 不得把 upstream 原生的大文件、既有复杂度或历史设计债当作本次任务的主要审查结论，除非用户明确要求审查 upstream。
- 若某个问题横跨 fork patch 与 upstream 集成点，需明确区分：
  1. fork 新增问题
  2. upstream 既有约束
  3. 两者交界处的集成风险

## 开发后规则

编辑代码之后，必须：

1. 运行最相关的测试。
2. 如果无法运行测试，说明原因。
3. 汇报已修改的文件。
4. 汇报风险与后续工作。
5. 更新 [STATUS.md](./STATUS.md)，反映进度。
6. 若规格或计划有变化，同步更新 [SPEC.md](./SPEC.md)、[PLAN.md](./PLAN.md) 以及 `docs/cass` 下的权威文档。

## 非目标

不得做以下事情，除非用户明确改变规格：

- 不新建独立云服务。
- 不重写 parser / sync / ingestion。
- 不修改原始 AgentsView session / message 表结构与核心语义。
- 不复制 analytics / stars / pins / insights 给 source 层。
- 不把项目管理、协作分享、标注分析等上层业务塞入 source 层。
- 不重建 transcript browser。

## 文档维护

- [SPEC.md](./SPEC.md) 是根目录规格入口，权威内容指向 [docs/cass/ca-session-source-prd.md](./docs/cass/ca-session-source-prd.md)。
- [PLAN.md](./PLAN.md) 是根目录实施入口，权威内容指向 [docs/cass/ca-session-source-plan.md](./docs/cass/ca-session-source-plan.md)。
- [STATUS.md](./STATUS.md) 是当前进展真相，记录实际状态、阻塞与下一步。
- [docs/cass/BASELINE_NOTES.md](./docs/cass/BASELINE_NOTES.md) 记录仓库基线事实。
