# `@aia/ca-session-source-client`

`ca-session-source` 的 TypeScript SDK。

当前 M3 版本复用现有服务端能力：

- 读取接口走 `GET /api/v1/sessions*`
- 事件订阅走稳定的 `GET /api/source/v1/events`

SDK 对外暴露 source-oriented 的 camelCase 类型，消费方不需要直接耦合 AgentsView 的内部 JSON 细节。

当前 M5 的消息锚点策略为：

```text
sessionId + messageOrdinal
```

`sourceUuid / sourceType / sourceSubtype` 会继续透出，但仅作为增强元信息预留，不是消费方建立 transcript 增量语义的前提。

## 安装方式

当前包会发布由 `unbuild` 自动生成的 `dist/` 运行时代码与 `.d.ts` 声明入口，适合被 workspace、Git URL 或 tarball 直接引用。

## 用法

```ts
import { CaSessionSourceClient } from "@aia/ca-session-source-client";

const client = new CaSessionSourceClient({
  baseUrl: "http://127.0.0.1:8080"
});

const page = await client.listSessions({ limit: 20 });
const session = await client.getSession(page.sessions[0]!.id);
const messages = await client.getMessages(session.id, { from: 0, limit: 50 });

const sub = client.watchEvents(async (event) => {
  if (event.type === "message.appended" && event.sessionId) {
    await client.getMessages(event.sessionId, {
      from: event.messageOrdinal,
      direction: "asc"
    });
  }
});

// 稍后停止订阅
sub.close();
await sub.closed;
```

如果消费方想直接拿到“一步式 transcript watch”，可以优先使用 `watchSessionTranscript(...)`：

```ts
import {
  CaSessionSourceClient,
  watchSessionTranscript
} from "@aia/ca-session-source-client";

const client = new CaSessionSourceClient();
const watched = await watchSessionTranscript(client, "sess-1", {
  pageLimit: 100,
  tailMessageCount: 200,
  onUpdate(update) {
    if (update.kind !== "messages") {
      console.error(update.event.error);
      return;
    }

    console.log(update.latestAnchor);
    console.log(update.appendedMessages);
  }
});

console.log(watched.snapshot.messages);
console.log(watched.snapshot.startOrdinal);
console.log(watched.snapshot.latestAnchor);

const olderPage = await watched.fetchEarlierPage({ pageLimit: 100 });
console.log(olderPage.fetchedMessages);
console.log(olderPage.hasMore);

// 稍后停止订阅
watched.close();
await watched.closed;
```

如果消费方想自己控制 watch 生命周期，也可以复用更底层的 transcript helper：

```ts
import {
  CaSessionSourceClient,
  createMessageAnchor,
  consumeTranscriptEvent,
  fetchEarlierSessionTranscriptPage,
  fetchSessionTranscriptSnapshot
} from "@aia/ca-session-source-client";

const client = new CaSessionSourceClient();
const session = await client.getSession("sess-1");
const snapshot = await fetchSessionTranscriptSnapshot(client, session.id, {
  expectedMessageCount: session.messageCount,
  tailMessageCount: 200,
  pageLimit: 100
});

const olderPage = await fetchEarlierSessionTranscriptPage(client, snapshot.buffer, {
  pageLimit: 100
});

const sub = client.watchEvents(async (event) => {
  const update = await consumeTranscriptEvent(client, snapshot.buffer, event, {
    pageLimit: 100
  });

  if (!update || update.kind !== "messages") {
    return;
  }

  console.log(update.latestAnchor);
  console.log(update.appendedMessages);
});

const latestMessage = snapshot.messages.at(-1);
const anchor = latestMessage
  ? createMessageAnchor(latestMessage)
  : snapshot.latestAnchor;
console.log(anchor);
```

推荐消费语义：

- `message.appended` 作为 fast path，优先使用 `event.messageOrdinal` 发起补拉
- `session.updated` 作为 fallback，使用 `buffer.latestOrdinal + 1` 补拉
- 对重复事件与 reconnect 补洞保持幂等，SDK `SessionMessageBuffer` 默认按 ordinal 去重
- 原始 `getMessages(...)` 仍是 ordinal-window 语义；若需要稳定的历史翻页 `hasMore`，优先使用 transcript helper

## 脚本

- `npm test`
- `npm run build`
- `npm run typecheck`
- `npm run smoke`

`npm run smoke` 会执行 [`sdk/ts/examples/smoke/run.js`](./examples/smoke/run.js)。
它面向一个真实运行中的本地服务，验证：

- 冷启动快照：`listSessions -> getSession -> getMessages -> getToolCalls`
- 事件驱动增量：`session.updated / message.appended -> getMessages(from=...)`

运行前需要先设置至少两个环境变量：

```bash
export CASS_BASE_URL=http://127.0.0.1:8080
export CASS_SESSION_ID=<your-session-id>
npm run smoke
```

更完整的说明见 [`sdk/ts/examples/smoke/README.md`](./examples/smoke/README.md)。
