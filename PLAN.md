# PLAN.md

本项目的详细实施计划以 [docs/cass/ca-session-source-plan.md](./docs/cass/ca-session-source-plan.md) 为准。

当前实际进展、阻塞与下一步以 [STATUS.md](./STATUS.md) 为准。

当前实施路线简要如下：

1. 稳定 fork 基线与 upstream merge 策略。
2. 建立 source facade。
3. 整理 source event / SSE adapter。
4. 提供 TypeScript SDK。
5. 做 source API / SDK 消费闭环验证。
6. 对齐消息锚点与增量消费语义。
7. 稳定 `/api/source/v1` 与工程化测试。

如果 `PLAN.md` 与详细计划冲突，以 [docs/cass/ca-session-source-plan.md](./docs/cass/ca-session-source-plan.md) 为准。
