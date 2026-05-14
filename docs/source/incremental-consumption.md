# Incremental Consumption Policy

本文定义 `ca-session-source` 在 M5 阶段推荐的 transcript 增量消费语义。

## 核心状态

消费方最少只需要维护：

```text
lastSeenOrdinal
```

它等价于当前本地 transcript buffer 中最新一条消息的 `messageOrdinal`。

若使用 SDK transcript helper，对应字段为：

- `SessionMessageBuffer.latestOrdinal`
- `SessionMessageBuffer.latestAnchor`

## 事件消费策略

推荐按以下优先级处理 SourceEvent：

### 1. `message.appended` fast path

若事件带有：

```text
type = message.appended
messageOrdinal = N
```

则优先按 `from = N` 发起增量拉取。

原因：

- 这是最精确的追加提示
- 可直接覆盖单条或多条 append 的常见场景
- 即使收到重复事件，也可通过 `sessionId + messageOrdinal` 和本地 buffer 去重

### 2. `session.updated` fallback

若事件为：

```text
type = session.updated
```

则按：

```text
from = lastSeenOrdinal + 1
```

发起补拉。

原因：

- 底层 broadcaster 仍然是 coarse-grained session 变化
- 某些情况下 source adapter 可能只能稳定给出“session 变了”，而不是每条消息的精确追加锚点

## 重连补洞

SSE 断开重连后，不应假设事件绝对连续。

推荐策略：

1. 保留本地 `lastSeenOrdinal`
2. 重连后继续监听事件
3. 一旦收到 `session.updated` 或 `message.appended`，按上述规则补拉 `getMessages(from=...)`
4. 用本地 `sessionId + messageOrdinal` 去重 merge

这也是当前 SDK `consumeTranscriptEvent(...)` 与 `watchSessionTranscript(...)` 的默认做法。

## 重复事件与幂等

以下情况都应被视为正常：

- 相同 `message.appended` 被重复投递
- 先收到 `session.updated`，后收到相同区间的 `message.appended`
- reconnect 后重新补拉到已经落地的消息

M5 期望消费方具备幂等 merge 能力。

当前 SDK 的 `SessionMessageBuffer` 以 ordinal 为键缓存消息，因此：

- 重复拉取不会重复追加
- 重复事件只会带来额外 fetch，不会破坏本地 transcript

## 分页语义

当前消息读取底座是稳定的 `/api/source/v1/sessions/{id}/messages`：

- 正向增量读取依赖 `from + direction=asc`
- 向前补历史依赖 `beforeOrdinal - 1 + direction=desc`

因此 M5 现阶段不对原始 `MessagePage` 承诺稳定的 cursor contract。

推荐做法：

- 把 `ordinal` 视为历史窗口边界
- 正向增量读取使用 `from`
- 历史翻页使用 `beforeOrdinal`
- 是否还有更早历史，优先使用 SDK transcript helper 返回的 `hasMore`

换句话说：

- 原始 message page 仍是 ordinal-window 语义
- `hasMore` 已在 SDK helper 的历史翻页结果中稳定暴露
- 当前 source REST 仍保持 ordinal-window 语义；若后续需要 cursor contract，再在 source 协议内显式扩展

## Unknown Event Type

消费方应忽略未知 `type`，而不是把它当成致命错误。

这样可以：

- 允许服务端未来增量扩展事件类型
- 避免旧版 SDK 因新增事件而中断既有 transcript watch

当前 SDK helper 对未知事件类型会直接返回 `null`，保持无害忽略。
