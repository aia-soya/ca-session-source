# Source Events

本文定义 `ca-session-source` 面向消费方暴露的稳定 Source Event 契约。

## 目标

- 对外只暴露 source 领域事件，不直接泄漏 AgentsView 内部 `data_changed` / `scope` 语义。
- SSE transport 可以发送 `heartbeat` keepalive，但 `heartbeat` 不属于 Source Event。
- `SourceEvent` 作为面向消费方的稳定协议，遵循 PRD 中定义的 `camelCase` JSON 字段。

## SSE Endpoint

M2 当前提供：

```text
GET /api/source/v1/events
```

SSE event name 固定为：

```text
source_event
```

SSE transport 也可能额外发送：

```text
heartbeat
```

其中 `heartbeat` 仅用于 keepalive，不属于领域事件。

## Event Schema

`source_event` 的 `data` 为 JSON：

```json
{
  "schemaVersion": "ca-session.event.v1",
  "type": "session.updated",
  "sessionId": "sess_123",
  "agent": "codex",
  "messageCount": 42,
  "messageOrdinal": 41,
  "role": "assistant",
  "sourcePath": "/Users/example/.codex/sessions/foo.jsonl",
  "error": ""
}
```

字段说明：

- `schemaVersion`: 当前固定为 `ca-session.event.v1`
- `type`: 事件类型
- `sessionId`: session 标识
- `agent`: agent 标识
- `messageCount`: 当前 session 最新 message 总数
- `messageOrdinal`: 追加消息的 ordinal，仅 `message.appended` 使用
- `role`: 追加消息的 role，仅 `message.appended` 使用
- `sourcePath`: session 源文件路径；未知时可省略
- `error`: 错误文本，仅 `source.error` 使用

## Event Types

稳定事件类型仅包含：

```text
session.created
session.updated
message.appended
source.error
```

### `session.created`

用于表示 source 层首次观察到一个 session。

示例：

```json
{
  "schemaVersion": "ca-session.event.v1",
  "type": "session.created",
  "sessionId": "sess_123",
  "agent": "codex",
  "messageCount": 3
}
```

当前 adapter 会在创建事件后，为该 session 当前已存在的消息继续发出对应的 `message.appended`，便于消费方直接建立本地增量锚点。

### `session.updated`

用于表示某个已存在 session 的稳定快照发生变化。

示例：

```json
{
  "schemaVersion": "ca-session.event.v1",
  "type": "session.updated",
  "sessionId": "sess_123",
  "agent": "codex",
  "messageCount": 4
}
```

当前 M2 adapter 基于 session 快照 diff 发出该事件。若消息数增长，通常会紧接着发出一到多个 `message.appended`。

### `message.appended`

用于表示某个 session 追加了新消息。

示例：

```json
{
  "schemaVersion": "ca-session.event.v1",
  "type": "message.appended",
  "sessionId": "sess_123",
  "agent": "codex",
  "messageCount": 4,
  "messageOrdinal": 3,
  "role": "assistant"
}
```

首期消费锚点策略：

```text
sessionId + messageOrdinal
```

这与当前 PRD/计划中的 MVP 锚点策略一致。

### `source.error`

用于表示 source adapter 在补齐稳定事件语义时遇到错误。

示例：

```json
{
  "schemaVersion": "ca-session.event.v1",
  "type": "source.error",
  "sessionId": "sess_123",
  "error": "querying messages: database is locked"
}
```

## 当前实现说明

- 现有 AgentsView broadcaster 仍然只提供粗粒度 `scope` 变化。
- M2 通过 `internal/source` adapter 在 source 层做 session 快照 diff，并在消息数增长时查询增量消息，补齐 `message.appended`。
- 因此 `/api/source/v1/events` 暂时是“稳定 contract + adapter 推导语义”，而不是底层原生事件直通。
