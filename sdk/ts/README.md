# `@aia/ca-session-source-client`

`ca-session-source` 的 TypeScript SDK。

当前 M3 版本复用现有服务端能力：

- 读取接口走 `GET /api/v1/sessions*`
- 事件订阅走稳定的 `GET /api/source/v1/events`

SDK 对外暴露 source-oriented 的 camelCase 类型，消费方不需要直接耦合 AgentsView 的内部 JSON 细节。

## 安装方式

当前包会发布仓内维护的 `dist/` 产物，适合被 workspace、Git URL 或 tarball 直接引用。

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

## 脚本

- `npm test`
- `npm run build`
