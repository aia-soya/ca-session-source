# SDK Smoke Harness

这个 smoke harness 直接消费仓内提交态 `dist/` SDK，并连接真实运行中的 `ca-session-source` 服务，验证两条最小消费闭环：

- 冷启动快照：`listSessions -> getSession -> getMessages -> getToolCalls`
- 事件驱动增量：`session.updated / message.appended -> getMessages(from=...)`

## 手工运行

先启动本地服务，然后指定一个仍会继续追加消息的 session：

```bash
export CASS_BASE_URL=http://127.0.0.1:8080
export CASS_SESSION_ID=<your-session-id>
export CASS_PAGE_LIMIT=50
node sdk/ts/examples/smoke/run.js
```

可选环境变量：

- `CASS_AUTH_TOKEN`：服务开启鉴权时传入 bearer token
- `CASS_EVENT_TIMEOUT_MS`：等待事件闭环的超时时间，默认 `15000`
- `CASS_EXPECT_FINAL_MESSAGE_COUNT`：期望最终消息总数；默认按“初始快照 + 1 条新增消息”判断
- `CASS_SNAPSHOT_TAIL_COUNT`：冷启动只拉取最近 N 条消息，适合大 session 验证分页/分批加载
- `CASS_HISTORY_PAGE_LIMIT`：在初始快照后继续向前回翻一页历史窗口，并记录该页结果
- `CASS_RECONNECT`：是否启用 SDK 内建断线重连，默认 `false`
- `CASS_RETRY_DELAY_MS`：启用重连后的首次重试等待，默认 `1000`

脚本会先输出：

```text
SMOKE_READY
```

这表示 SSE 订阅已经建立。此时继续向目标 session 追加一条消息；脚本完成快照与增量验证后会输出：

```text
SMOKE_RESULT {...json...}
```

结果 JSON 会包含：

- 初次快照的 `startOrdinal`，用于确认是否按尾部窗口启动
- 初次快照拿到的分页批次数与 ordinal cache
- 可选历史翻页的 `beforeOrdinal / fetchedOrdinals / hasMore`
- SSE 建链次数（包含重连后的 reopen）
- `source.error` 是否被正常 surfaced 到消费方事件流
- `session.updated` / `message.appended` 的到达顺序
- 每次事件触发的 `getMessages(from=...)` 增量拉取结果
