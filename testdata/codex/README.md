# Codex Fixtures

这里存放 `ca-session-source` 顶层可复用的最小 Codex transcript fixture。

约束：

- 仅提交脱敏、最小、稳定的样本
- 不依赖本机 `~/.codex` 实际数据
- 优先用于 source/discovery/sync 相关集成测试的临时目录播种

当前样本：

- `minimal_session.jsonl`：最小正常 transcript
- `malformed_session.jsonl`：中间夹带坏行但整体仍可恢复的 transcript
- `paginated_session.jsonl`：10 条消息的大 session transcript，用于验证 tail snapshot 与 history pagination
- `paginated_tool_session.jsonl`：带多个 tool call 的 10 条消息大 session transcript，用于同时验证分页与 tool-call 落盘/消费
- `paginated_rich_tool_session.jsonl`：带 wait output / subagent link 语义的 10 条消息大 session transcript，用于同时验证分页与 richer tool-call 消费字段
- `rich_tool_session.jsonl`：带 wait output / subagent link 语义的 transcript，用于验证 `resultContent` 与 `subagentSessionId`
- `truncated_session.jsonl`：尾部坏行 / 截断尾巴样本；当前上游语义下会被跳过，但不会额外落 `parser_malformed_lines` 或 `is_truncated=true`
