# Source Engineering

本文收敛 `ca-session-source` 在 M7 阶段的工程化、测试与发布入口，目标是让 source patch 在 fork 内可重复验证、可被固定版本消费、可随 upstream 同步持续维护。

## 测试矩阵

推荐按以下顺序执行：

```bash
make source-test
make source-sdk-install
make source-sdk-test
make source-sdk-build
make source-smoke
```

如果只想跑与 source 相关的一整套最小矩阵，直接执行：

```bash
make source-ci
```

覆盖面如下：

- `make source-test`：`internal/source` 与 `internal/server` 的 source REST/SSE/DTO 合同测试
- `make source-sdk-test`：`sdk/ts` 的 runtime、types、dist 导出与 transcript/event contract
- `make source-sdk-build`：验证发布态 `dist/` 可由正式构建链路产出
- `make source-sdk-release-check`：校验 SDK 的 package metadata、LICENSE、README、`publishConfig` 与当前发布策略 gate
- `make source-sdk-pack-check`：在临时目录执行 `npm pack`，并按 `package.json` 的 `main`、`types` 与 `exports` 校验 tarball 实际包含所有声明的发布入口
- `make source-smoke`：真实 Go server + SQLite + Node SDK 的 source API smoke harness

## Fixtures

M7 固定使用仓内 fixture，不依赖开发机真实 `~/.codex` 或 `~/.claude` 目录。

当前最小 fixture 位于：

- [`testdata/codex/minimal_session.jsonl`](../../testdata/codex/minimal_session.jsonl)
- [`testdata/codex/malformed_session.jsonl`](../../testdata/codex/malformed_session.jsonl)
- [`testdata/codex/paginated_session.jsonl`](../../testdata/codex/paginated_session.jsonl)
- [`testdata/codex/paginated_rich_tool_session.jsonl`](../../testdata/codex/paginated_rich_tool_session.jsonl)
- [`testdata/codex/paginated_tool_session.jsonl`](../../testdata/codex/paginated_tool_session.jsonl)
- [`testdata/codex/rich_tool_session.jsonl`](../../testdata/codex/rich_tool_session.jsonl)
- [`testdata/codex/truncated_session.jsonl`](../../testdata/codex/truncated_session.jsonl)
- [`testdata/claude/minimal_session.jsonl`](../../testdata/claude/minimal_session.jsonl)
- [`testdata/claude/malformed_session.jsonl`](../../testdata/claude/malformed_session.jsonl)
- [`testdata/claude/paginated_session.jsonl`](../../testdata/claude/paginated_session.jsonl)
- [`testdata/claude/paginated_rich_tool_session.jsonl`](../../testdata/claude/paginated_rich_tool_session.jsonl)
- [`testdata/claude/paginated_tool_session.jsonl`](../../testdata/claude/paginated_tool_session.jsonl)
- [`testdata/claude/rich_tool_session.jsonl`](../../testdata/claude/rich_tool_session.jsonl)
- [`testdata/claude/truncated_session.jsonl`](../../testdata/claude/truncated_session.jsonl)

使用原则：

- parser / discovery / sync 相关测试优先从仓内 fixture 复制到临时目录
- 不要在测试中直接扫描开发机 home 目录
- 如需新增 fixture，优先追加最小样本，不要复制真实私有 transcript
- 对异常样本，优先覆盖“可恢复但带告警”的情况，例如 malformed lines、truncated tail、空 tool-call 结果等
- 对分页/大 session 样本，优先让它们走现有 `tailMessageCount + fetchEarlierPage(...)` smoke 主链，而不是只停留在“能 sync 入库”的静态断言
- 对带 tool call 的分页样本，除 message ordinals 外，还要至少固定一次 `getToolCalls(...)` 结果和 tool 名称顺序，避免只验证消息分页却漏掉 tool-call 落盘/消费回归
- 对 richer tool-call 样本，优先固定 `resultContent`、`resultContentLength` 和 `subagentSessionId`，因为这些字段已经对 source API / SDK 消费方可见
- 对“分页 + richer tool-call semantics”组合样本，优先复用现有 `tailMessageCount + fetchEarlierPage(...) + SSE` smoke 主链，同时固定 tool result 与 subagent link，避免 richer 字段只在最小 happy path 下被测到
- 注意不同 agent 的 parser 元数据语义可能不同：当前 Claude 会落盘 `parser_malformed_lines`，而 Codex 对坏行采取“跳过但不计数”的上游语义
- 对 Codex 而言，当前尾部坏行 / truncated tail 也沿用同样策略：坏尾行会被跳过，但不会额外落 `parser_malformed_lines`、`is_truncated=true` 或 `termination_status=truncated`
- 对 Claude 而言，`termination_status=truncated` 与 `is_truncated=true` 也不是完全等价：尾部坏行可触发 truncated termination，但只有“最后一行无换行的物理截断”才会落 `is_truncated=true`

## CI

CI 中新增独立 `source` job，执行：

```bash
make source-ci
```

这保证 source 专属测试矩阵不会被整仓 `go test ./...` 的宽覆盖掩盖，也能在安装 Node 后真实执行 SDK smoke harness。

## SDK 发布

当前短期发布策略保持与计划一致：先确保 SDK 可被 workspace、Git URL 或 tarball 固定消费。

推荐流程：

```bash
make source-sdk-install
make source-sdk-test
make source-sdk-build
make source-sdk-release-check
make source-sdk-pack-check
make source-sdk-pack
```

产物为 `sdk/ts/*.tgz`，适合：

- 仓内 smoke 验证
- 其它 workspace 通过 tarball 固定版本接入
- 后续 Git tag 发布前的预发检查

当前不要求立即发布到 npm，但每次准备对外消费前都应至少完成上述四步。

当前 `sdk/ts/package.json` 仍保留 `private: true`，这是有意为之：

- 当前阶段默认发布策略仍是 workspace / Git URL / tarball
- `source-sdk-release-check` 会在 `private: true` 下明确报告“跳过 `npm publish --dry-run`”
- 当后续准备真正切到 npm 发布时，再移除 `private` 并让该检查自动升级到 dry-run

## Upstream 同步

建议每周或每两周同步一次 `upstream/main`，并在同步后至少执行：

```bash
make test
make source-ci
cd frontend && npm run build
```

更完整的同步步骤、冲突热点与手工回归项，统一以 [upstream-merge-checklist.md](./upstream-merge-checklist.md) 为准。
