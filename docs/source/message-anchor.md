# Message Anchor Policy

本文定义 `ca-session-source` 在 M5 阶段对消费方承诺的消息锚点策略。

## MVP 锚点

首期稳定锚点固定为：

```text
sessionId + messageOrdinal
```

其中：

- `sessionId` 标识 transcript 所属 session
- `messageOrdinal` 标识该 session 内的单调递增消息位置

消费方只要持久化这两个字段，就可以完成：

- 增量拉取起点计算
- 重连补洞
- 重复 `message.appended` 去重
- 本地 transcript merge

## 预留字段

当前 source DTO 与 SDK 会继续透出以下保留字段，但它们在 M5 不作为主锚点：

```text
sourceUuid
sourceType
sourceSubtype
```

原因：

- AgentsView messages 已有 `source_uuid` / `source_type` / `source_subtype`
- 但真实 Codex session 的上游 API 返回里，这些字段目前并不保证稳定可见
- 因此不能把 `sourceUuid` 作为 MVP 的必备消费前提

## 稳定性边界

M5 对外承诺的是“同一 session 内 ordinal 递增可用于增量消费”，而不是更强的跨源全局 message identity。

这意味着：

- 不要求消费方理解 AgentsView 底层 DB 主键
- 不要求消费方依赖完整源文件路径
- 不要求消费方等待 `sourceUuid` 才能建立本地 transcript

## Ordinal Drift 风险

MVP 默认假设同一 session 的消息只追加、不重排。

若未来出现以下情况，需要重新评估锚点策略：

- 上游 source 对历史消息做重写或插入
- 同一 session 出现非 append-only 的 ordinal 漂移
- 需要跨不同 source 类型统一同一条 message identity

在这些情形下，单独依赖 `messageOrdinal` 可能不足以表达稳定身份。

## 升级路径

当 `sourceUuid` 在真实 source 上可稳定提供后，升级顺序如下：

1. 保持 `sessionId + messageOrdinal` 继续可用，避免破坏现有消费方。
2. 在 SDK 和 source API 中继续透出 `sourceUuid`。
3. 将 `sourceUuid` 提升为增强锚点，而不是直接替换 ordinal。
4. 若未来确需更强 identity，再定义版本化 anchor policy，而不是静默改写 M5 语义。

## 当前 SDK 对应关系

M5 后，SDK transcript helper 会显式暴露：

- `MessageAnchor`
- `createMessageAnchor(message)`
- `SessionMessageBuffer.latestAnchor`
- snapshot / history page / event sync result 上的 `latestAnchor`

这几个字段都遵循同一策略：MVP 必含 `sessionId + messageOrdinal`，其余 source 元信息按可用性附带。
