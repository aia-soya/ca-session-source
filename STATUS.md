# STATUS.md

本文记录 `ca-session-source` 的当前实际进展、已知阻塞与下一步。

## 当前状态

- 根目录协作文档已建立：`AGENTS.md`、`SPEC.md`、`PLAN.md`、`STATUS.md`。
- 根目录入口文档与 `docs/cass` 权威文档已完成一轮一致性收敛。
- 文档口径已统一为 `ca-session-source` 本仓，不再以历史下游项目命名组织产品边界。
- M0 所需的 fork 基线文档已建立：`CONTRIBUTING.md`、`docs/source/fork-patch-map.md`、`docs/source/upstream-merge-checklist.md`。
- 已验证当前 Git 基线：`upstream/main` 与 `origin/main` 同指向 `c8bb17c067ed27b9d71e4eeea6b2abd8ce3e7398`，当前 `HEAD` 仅领先 3 个文档提交。
- 已创建 `ca-session-source` 开发分支，后续 source 研发工作可不再继续堆叠在 `main`。
- M1 已进入代码阶段，新增 `internal/source/` facade 雏形，并完成基于 `db.Store` 的窄 DTO 读取适配与单测。
- M2 已进入代码阶段，新增 source event adapter 与 `/api/source/v1/events` SSE 路由，开始把 broadcaster 粗粒度刷新信号收敛为稳定 SourceEvent。
- M3 已进入代码阶段，新增 `sdk/ts/` TypeScript SDK，并在后续 M6 收敛为 source-oriented client 形式统一消费 `/api/source/v1` 稳定读接口与事件流。
- M4 已完成：已建立 SDK smoke harness，并用真实 HTTP/SSE 服务验证 snapshot、event-driven incremental fetch、重连补洞与历史翻页闭环。
- M5 已完成：已明确 `sessionId + messageOrdinal` 消息锚点策略，补齐增量消费文档、SDK 显式 anchor contract 与兼容性测试，并把原始 message page 与 transcript helper 的分页语义边界收敛到统一口径。
- M6 已完成：已新增 `/api/source/v1/sessions*`、`tool-calls`、`version`、`health` 稳定 REST facade，补齐 `schemaVersion`、OpenAPI 与合同测试，并将 SDK 收敛为仅消费 `/api/source/v1`。
- M7 已完成：已补齐 source 专项工程化入口、仓内 Codex/Claude fixture 矩阵、独立 CI job、SDK release/pack 校验与 fixture-driven smoke 主链，把测试、发布与 upstream sync 回归收敛到固定命令与文档。

## 最近完成

- 补全根目录 `AGENTS.md`、`SPEC.md`、`PLAN.md`。
- 清理 `docs/cass` 中与 `WU`、`WUB` 及具名下游产品相关的残留叙述。
- 对齐 SourceEvent 契约，以 PRD 为准明确：

```text
session.created
session.updated
message.appended
source.error
```

- 建立 fork patch map，记录当前 fork 补丁面与允许改动边界。
- 建立 upstream merge checklist，固化同步步骤、审计点与 smoke tests。
- 新增 `CONTRIBUTING.md`，把 fork 约束从 agent 协作文档扩展到仓库贡献约定。
- 新增 `internal/source/service.go`、`internal/source/types.go`、`internal/source/agentsview_service.go`，定义 Source Facade 接口、DTO 与 `db.Store -> source DTO` 适配层。
- 新增 `internal/source/service_test.go`，覆盖 session/message/tool-call mapping、空结果、not found、分页与事件流未接线场景。
- 修正 `internal/source.GetSession` 的可见性回归：保持 trashed session 对 source facade 不可见，同时继续允许 active session 读取完整元数据。
- 修正 `internal/source.ListSessions` 与 `GetSession` 的 DTO 语义偏差：列表项现在也会补齐 full metadata，确保 `sourcePath` / `updatedAt` 一致。
- 消除 `ListSessions` 的 N+1 full-session hydration：新增批量 full metadata 读取 helper，并由 source facade 优先走批量补齐路径。
- 收敛 `internal/db/sessions.go` 中批量/单条 full-session 读取的重复扫描逻辑，改为共享 helper，降低后续 schema 演进时的漂移风险。
- 对 `internal/source/agentsview_service.go` 做轻量重构：将 facade 方法、filter 处理、DTO mapping 与 hydration 策略拆分到独立源文件，降低 source 层自有文件的职责混合。
- 避免 remote/PG store 的冗余 full hydration：当底层 store 已无额外 full metadata 可补齐时，source facade 直接跳过二次查询，避免列表热路径双查。
- 收敛 `cmd/agentsview` 中 `prepareServeRuntimeConfig` 的 flaky 端口分配测试：为端口探测增加薄注入 seam，并让 `port=0` 用例通过 stub 验证配置回填与提示文案，不再依赖真实临时端口分配。
- 收敛整仓测试中的本地 listener 环境波动：为 `cmd/agentsview`、`internal/server`、`internal/service` 的 TCP listener / test server 场景补充共享测试 helper，在当前运行时禁止本地 bind 时自动 skip，允许时继续走真实 listener 语义验证。
- 收敛 listener 测试 helper 的重复实现：新增共享 `internal/testutil` 测试包，统一复用 TCP listener / `httptest` 启动逻辑，避免 `cmd/agentsview`、`internal/server`、`internal/service` 三处继续各自维护副本。
- 新增 `internal/source/event_adapter.go`，将现有 broadcaster 的 `scope` 信号适配为稳定 `session.created` / `session.updated` / `message.appended` / `source.error`。
- 新增 `internal/server/source_events.go` 并挂载 `GET /api/source/v1/events`，对外输出稳定 `source_event` SSE payload，同时保留 `heartbeat` keepalive。
- 新增 `docs/source/events.md`，明确 M2 的 source event schema、SSE event name 与锚点语义。
- 补充 `internal/source/event_adapter_test.go` 与 `internal/server/server_test.go`，覆盖 source event adapter、source SSE route、PG mode 不可用与 SSE query-token 鉴权链路。
- 修正 source event adapter 的初始基线失败语义：首个 snapshot 无法建立时，source watch 现在会直接返回错误，不再把空快照当作真实基线并误发全量 `session.created` / `message.appended`。
- 收敛 `/api/source/v1/events` 的订阅成本：新增 server 内共享 source event broadcaster，让全量 snapshot diff / 增量补齐只执行一次，而不是每个 SSE 订阅者各自重跑一遍。
- 收敛 source event watch 的订阅生命周期：共享 source broadcaster 现在会在最后一个 SSE 订阅者离开时停止上游 watch，并在后续新订阅到来时自动重启，避免无人消费时后台继续做 snapshot diff。
- 修正 `/api/source/v1/events` 的错误响应时序：source 订阅现在先于 SSE stream 初始化建立，确保初始 snapshot/watch 建立失败时客户端拿到明确的 `503` JSON，而不是已提交的半截 `text/event-stream` 响应。
- 新增 `sdk/ts/package.json`、`tsconfig.json`、`README.md` 与 `src/` 基础实现，建立 `@aia/ca-session-source-client` source-first SDK 包骨架。
- 新增 `sdk/ts/src/client.ts`、`types.ts`、`events.ts`、`errors.ts`、`index.ts`，提供 `CaSessionSourceClient`、camelCase source DTO mapping、fetch-based SSE 订阅与基础错误模型。
- 新增 `sdk/ts/src/client.test.ts`，覆盖 `listSessions`、`getMessages`、`getToolCalls`、JSON error handling、`watchEvents` SSE 解析与断线重连。
- 已验证 `sdk/ts` 的 `npm test`、`npm run build` 与 `npm pack`（使用本地临时 npm cache）均可通过，当前 tarball 名称为 `aia-ca-session-source-client-0.1.0.tgz`。
- 修正 source event adapter 的快照推进语义：当 `message.appended` 增量补偿失败时，source 层现在会保留该 session 的未完成消费水位，避免瞬时查询失败后永久丢失后续 `message.appended` 事件。
- 将 `sdk/ts` 包导出切换到自动生成的发布产物：runtime 与类型入口统一走 `dist/*`，避免消费方直接命中未构建源码，同时持续压缩手工维护 `dist` 的风险面。
- 新增 `sdk/ts/test/dist.test.js` 与共享 contract suite，让 `npm test` 同时覆盖 `src` 源实现和实际对外发布的 `dist` 入口，降低 `dist` 与源码漂移后仍被打包发布的风险。
- 新增 `sdk/ts/test/dist-types.test.js`，对包导出的类型入口与 `src` 公共声明面做 contract 检查，降低 runtime 入口已验证但类型入口漂移后仍被打包发布的风险。
- 新增 `.gitignore` 中的 `sdk/ts/*.tgz` 忽略规则，并清理误入工作区的 SDK 打包产物，避免本地 `npm pack` 结果再次混入后续提交。
- 新增 `sdk/ts/examples/smoke/run.js` 与 `sdk/ts/examples/smoke/README.md`，提供直接消费发布态 `dist` SDK 的 smoke harness，用于手工验证 `listSessions -> getSession -> getMessages -> getToolCalls` 和 `session.updated / message.appended -> incremental getMessages` 闭环。
- 新增 `sdk/ts/examples/smoke/smoke_test.go`，以真实 `server.New(...)` + SQLite + `/api/source/v1/events` + Node SDK 脚本的组合方式覆盖 M4 的消费闭环回归。
- 扩展 `sdk/ts/examples/smoke`：支持期望最终消息数、重连开关与 reopen 观测，并补充真实服务回归覆盖“断线重连后用 latest ordinal 补齐缺口”以及“`tool_calls` 为空不影响快照主路径”。
- 继续扩展 `sdk/ts/examples/smoke`：补充 `source.error` surfaced 回归，验证 source adapter 首次 appended backfill 失败后，消费方仍能在后续 refresh 中补齐缺口而不丢消息。
- 修正 SDK 对空页响应的兼容性：当 `/api/source/v1/sessions/{id}/messages` 返回 `messages: null` 时，`CaSessionSourceClient` 现在会归一为空数组，不再在增量补洞或空结果场景下因 `.map(...)` 崩溃。
- 将 smoke 中验证过的消费模式沉淀为 SDK helper：新增 transcript helper，用统一的 `SessionMessageBuffer + fetchSessionTranscriptSnapshot + consumeTranscriptEvent` 复用“快照分页 + latest ordinal 增量补洞 + source.error surfaced”逻辑，降低消费方重复实现成本。
- 在 transcript helper 之上继续补自动 watch orchestration：新增 `watchSessionTranscript(...)`，把 snapshot、`watchEvents(...)` 与 buffer update 收敛成一步式消费入口，并让 smoke harness 直接 dogfood 该入口。
- 继续补齐大 session 冷启动体验：为 transcript helper 新增 `tailMessageCount` 与 `startOrdinal`，允许消费方只拉最近 N 条消息建立尾部快照，同时保持后续增量补洞语义不变；并新增真实 smoke 回归覆盖该路径。
- 将“历史窗口继续向前翻页”收敛为更完整的消费 API：新增 `fetchEarlierSessionTranscriptPage(...)` 与 `watched.fetchEarlierPage(...)`，统一处理 `desc` 拉取、升序回放、buffer 去重合并和 `hasMore` 判定，并补充真实 smoke 回归覆盖尾部快照后的历史翻页。
- 修正 SDK 发布反模式：引入 `unbuild`（`mkdist`）作为 `sdk/ts` 的正式编译发布链路，统一从 `src/*.ts` 生成 `dist/*.js` 与 `dist/*.d.ts`，并通过薄 postbuild rewrite 收敛相对 specifier 到发布态 `.js`；不再手工双写 `dist` 运行时代码或声明文件。
- 为 SDK 补充独立类型检查：新增 `npm run typecheck`，统一用 `tsc --noEmit` 校验 `src/` 公共源码的类型正确性，让运行时构建和类型诊断职责分离。
- 修正 transcript buffer 的规模化热点：`SessionMessageBuffer` 现在缓存 `earliestOrdinal / latestOrdinal / messages`，避免在大 session 的快照、历史翻页与增量补洞路径上重复全量扫描和排序。
- 在 `sdk/ts/package.json`、`sdk/ts/README.md` 中补充 `npm run smoke` 与运行说明，降低后续消费方和仓内联调的启动成本。
- 新增 `docs/source/message-anchor.md` 与 `docs/source/incremental-consumption.md`，把 M5 的消息锚点、`message.appended` fast path、`session.updated` fallback、重复事件幂等与 reconnect 补洞语义收敛为权威文档。
- 在 `sdk/ts` 中显式新增 `MessageAnchor` / `createMessageAnchor(...)` / `latestAnchor` 返回值，统一 SDK transcript snapshot、增量消费结果与历史翻页结果的消息锚点口径，同时保持 `sourceUuid / sourceType / sourceSubtype` 为可选增强字段。
- 扩展 SDK contract tests，覆盖缺失 `sourceUuid`、重复 `message.appended`、`session.updated` fallback、历史翻页边界与 unknown event type 忽略语义，降低后续协议演进对消费方的回归风险。
- 收敛 SDK 源码热点：将原先职责过载的 `sdk/ts/src/transcript.ts` 拆为 `transcript-buffer.ts`、`transcript-sync.ts` 和薄 `transcript.ts` facade；同时将 `sdk/ts/src/client.ts` 拆出 `client-mappers.ts` 与 `client-transport.ts`，降低后续 M6 REST 合同演进时的单文件耦合。
- 新增 `internal/sourceapi/types.go`，集中定义 M6 的稳定 source REST 响应壳、camelCase DTO mapper 与 `ca-session.source.v1` schema version 常量。
- 新增 `internal/server/source_api.go` 并在 `internal/server/server.go` 挂载 `GET /api/source/v1/sessions`、`/sessions/{id}`、`/sessions/{id}/messages`、`/sessions/{id}/tool-calls`、`/version`、`/health`，对外提供带 `schemaVersion` 的稳定 source REST facade。
- 将 `/api/source/v1/events` 的错误响应统一为带 `schemaVersion` 的 source JSON envelope，避免 source REST/SSE 在错误路径上再回退到 upstream 风格 payload。
- 为 source facade 补齐 `ToolCall` 扩展字段：`resultContentLength`、`ordinal`、`timestamp`，让 M6 source REST 与 SDK 切换到底座后仍保留现有 tool-call 上下文能力。
- 将 `sdk/ts` 的 REST 读取面完全收敛到 `/api/source/v1/`，移除开发期无意义的 `restBasePath` 逃生口与旧 `/api/v1` 双协议 mapper，明确单一 source contract。
- 新增 `docs/source/openapi.yaml`，收敛 M6 `/api/source/v1/*` 的稳定 HTTP/SSE 合同，覆盖 sessions、messages、tool-calls、events、version 与 health。
- 新增 `internal/server/source_api_test.go` 与 SDK 合同用例，覆盖 source REST 的 camelCase/schemaVersion 合同、source error envelope、health/version 元数据，并同步删除旧 `/api/v1` 兼容测试。
- 为 SDK 新增 `getVersion()` 与 `getHealth()` 便捷方法，并补齐 `SourceVersion` / `SourceHealth` 类型、mapper、README 示例与 contract tests，让消费方无需手写 `/version`、`/health` 请求。
- 将 `version/health` 进一步下沉到 SDK smoke harness：`examples/smoke/run.js` 现在会先验证 source schema 与事件流能力，再进入 transcript 快照/增量闭环；对应 Go smoke 回归也已断言这些字段。
- 收敛 M6 handler 的查询解析重复：新增共享 request filter parser，让 `/api/v1/sessions*` 与 `/api/source/v1/sessions*` 复用同一套 limit/date/direction 校验，降低后续 query 语义漂移风险。
- 收敛 SDK source contract 的内部重复定义：新增 `sdk/ts/src/client-payloads.ts` 作为 source REST envelope 层，`client-mappers.ts` 直接复用公共 DTO 与 payload 壳，不再在 mapper 内维护第二套 raw schema 副本。
- 拆分过长的 SDK contract suite：`sdk/ts/test/client-contract.js` 现在只做顶层编排，REST / transcript / events 分别下沉到独立测试模块，并抽出共享 helper，避免继续向单文件堆叠所有 contract case。
- 拆分 smoke harness 的 Node/Go 热点文件：`examples/smoke/run.js` 收敛为薄入口，配置解析、结果组装与执行状态机拆到 `examples/smoke/lib/*`；原 `smoke_test.go` 则拆成 bootstrap / resilience / support / seed / result 多文件，降低职责混合与后续扩展成本。
- 继续细化 transcript contract 边界：`sdk/ts/test/transcript-contract.js` 现在只保留顶层编排，snapshot/history、event consumption、watch orchestration 分别拆到独立 suite，避免 transcript helper 的所有 contract 再次回流到单文件。
- 继续细化 smoke Go helper：将原 `smoke_support_test.go` 再拆成 env / process / transport 三个职责文件，分离测试环境搭建、Node 进程编排与断连注入 helper，降低 smoke harness 的定位成本。
- 继续细化 SDK REST contract：`sdk/ts/test/client-rest-contract.js` 现在只做 REST 顶层编排，sessions、messages、tool-calls、version/health 与 error path 分别拆到独立 suite，避免 source API 合同继续集中堆叠在单一测试文件中。
- 为 SDK contract tests 抽取共享 fixture builder：新增 `sdk/ts/test/contract-fixtures.js`，集中提供 session/message/tool-call/version/health/event payload builder，让 REST 与 transcript suites 只覆写关心字段，降低测试样板和协议字段漂移风险。
- 新增 `Makefile` 的 `source-test`、`source-smoke`、`source-sdk-*`、`source-ci` 入口，把 source REST/SSE、SDK contract/build、smoke harness 收敛成仓库级固定命令。
- 在 `.github/workflows/ci.yml` 中新增独立 `source` job，安装 Go/Node 后执行 `make source-ci`，确保 source SDK smoke harness 不再只在缺少 Node 的整仓 `go test ./...` 中被动 skip。
- 新增 [`docs/source/engineering.md`](./docs/source/engineering.md)，集中记录 M7 的测试矩阵、fixture 位置、CI 入口、SDK tarball 发布流程与 upstream 同步后的专项 smoke 要求。
- 新增顶层 `testdata/codex/minimal_session.jsonl` 与 `testdata/claude/minimal_session.jsonl`，提供脱敏、最小、稳定的 source fixture，避免后续测试依赖开发机真实 `~/.codex` / `~/.claude` 目录。
- 在 `README.md` 与 `docs/source/upstream-merge-checklist.md` 中补 source 工程化入口与 `make source-ci` smoke 步骤，让日常开发和 upstream merge 后回归都能走统一路径。
- 将顶层 fixture 真正接入 source smoke：`sdk/ts/examples/smoke` 新增 fixture-driven sync 回归，先把仓内 Codex/Claude `.jsonl` 复制到 `t.TempDir()` 下的模拟 agent 目录，再通过 `sync.Engine.SyncAll(...)` 写入测试 SQLite，验证 discovery/sync 不会扫描或污染本机真实 home 目录。
- 将 SDK tarball 校验正式接入 source 工程化主链路：`make source-ci` 现在会额外执行 `source-sdk-pack-check`，在临时目录运行 `npm pack` 并验证发布包至少包含 `package.json`、`README.md`、`dist/index.js` 与 `dist/index.d.ts`，避免“能 build 但打包产物缺主入口”后才发现发布回归。
- 扩展 fixture-driven smoke 的断言颗粒度：除“session 被 sync 入库”外，现在还会校验 fixture session 的 project、tool-call 与 file path，提升 discovery/sync 到 DB 落盘语义的回归覆盖。
- 将 tarball 校验继续升级为 export-level verifier：新增 `sdk/ts/scripts/verify-pack-artifact.mjs`，按 SDK `package.json` 中声明的 `main`、`types` 与所有 `exports` 子路径逐项检查打包产物，避免新增导出入口后只更新源码未随 tarball 一起发布。
- 已重新验证 M7 主链路：`make source-ci` 当前覆盖 source Go contract、SDK test/build、export-level tarball 校验与 fixture-driven smoke，并已在本地通过。
- 新增 `testdata/claude/malformed_session.jsonl` 与对应 smoke 回归，验证“仓内异常 fixture -> 临时 agent 目录 -> discovery/sync -> SQLite”路径下，`parser_malformed_lines`、`is_truncated`、tool-call 与 project 语义都能稳定落盘，同时继续保证不扫描真实 `~/.claude`。
- 新增 `testdata/codex/malformed_session.jsonl` 与对应 smoke 回归，验证 Codex 异常 fixture 也已进入 discovery/sync/source 主链；当前行为与 Claude 有所不同，Codex 会跳过坏行并继续落盘有效消息，但不会额外写入 `parser_malformed_lines` 元数据，这一差异已被测试固定下来。
- 将“发布前校验”正式提到 M7 主链首层：为 `sdk/ts` 新增本地 `LICENSE`、更完整的 npm package metadata，以及 `source-sdk-release-check` / `npm run release-check`；当前会校验 `license`、`repository`、`homepage`、`bugs`、`keywords`、`files`、`publishConfig` 等元数据，并在 `private: true` 下明确报告“跳过 `npm publish --dry-run`，继续按 tarball-first 策略发布”。
- 新增 `testdata/claude/truncated_session.jsonl` 与对应 smoke 回归，验证 Claude 尾部坏行样本也已进入 fixture-driven discovery/sync/source 主链；当前上游语义会落 `parser_malformed_lines=1` 与 `termination_status=truncated`，但不会额外写入 `is_truncated=true`，这一差异已被测试和文档固定下来。
- 新增 `testdata/claude/paginated_session.jsonl` 与对应 fixture-driven source API smoke，验证“大 session fixture -> discovery/sync -> source API/SDK tail snapshot -> history pagination -> 增量事件补洞”整条链路；这让 M7 不再只验证 fixture 能入库，也开始固定真实分页消费语义。
- 新增 `testdata/codex/paginated_session.jsonl`，并将大 session pagination smoke 扩成 Claude/Codex 双 agent 共用回归；现在同一条 fixture-driven smoke 会同时验证两个 agent 经 discovery/sync 后，再走 source API/SDK 的 tail snapshot、history pagination 与增量补洞路径，避免分页覆盖长期偏向单一 agent。
- 新增 `testdata/codex/truncated_session.jsonl` 与对应 smoke 回归，验证 Codex 尾部坏行样本也已进入 fixture-driven discovery/sync/source 主链；当前上游语义会直接跳过坏尾行，不会额外写入 `parser_malformed_lines`、`is_truncated=true` 或 `termination_status=truncated`，这一点已被测试和文档固定下来。
- 新增 `testdata/claude/paginated_tool_session.jsonl` 与 `testdata/codex/paginated_tool_session.jsonl`，并将 fixture-driven pagination smoke 扩到“分页 + 多 tool-call”组合场景；现在大 session smoke 不只固定 tail snapshot / history pagination / 增量补洞，也会同步固定 `getToolCalls(...)` 的数量与 tool 名称顺序。
- 新增 `testdata/claude/rich_tool_session.jsonl` 与 `testdata/codex/rich_tool_session.jsonl`，并增加 fixture-driven richer tool semantics smoke；现在 M7 还会通过真实 source API / SDK 固定 `resultContent`、`resultContentLength` 与 `subagentSessionId`，覆盖 tool result / subagent link 这层消费语义。
- 新增 `testdata/claude/paginated_rich_tool_session.jsonl` 与 `testdata/codex/paginated_rich_tool_session.jsonl`，并将 fixture-driven pagination smoke 扩到“分页 + richer tool-call semantics”组合场景；现在 tail snapshot、history pagination、增量补洞与 `resultContent` / `resultContentLength` / `subagentSessionId` 已经进入同一条大 session 主链回归。

## 当前待办

- 继续完善 M1：评估是否需要在 facade 中补更明确的 `updatedAt` / 空值语义说明，并为后续 source API 预留更稳定的 filter/DTO 约束。
- 继续完善 M2：评估是否需要进一步缩小初次 connect 时的全量 snapshot 成本，并确认后续 SDK 是否直接消费 `source_event` / PRD 定义的 `camelCase` 协议。
- 持续观察 M5/M6 后续反馈：关注真实 Codex / Claude session 下更大规模分页体验、长时间断线后的补洞成本，以及是否需要把 helper 里的 `hasMore`/anchor 语义进一步下沉为稳定 REST 合同。
- 继续观察 SDK 模块边界：若后续 transcript helper 或 `/api/source/v1/*` 继续扩展，优先沿现有 `buffer / sync / watch` 与 `transport / mapper / facade` 分层演进，避免重新回到单文件职责堆积。
- 评估后续是否要在 source 协议内继续下沉更稳定的分页 contract，以及 `version/health` 是否需要进一步承载 endpoint capability 元数据。
- M7 后续增强：如需继续提升 discovery/sync/source 全链路覆盖，可补更多带 tool call、异常行、分页边界的 fixture 样本，或把部分回归进一步下沉到更贴近真实 discovery 的路径。
- M7 后续增强：如需覆盖多次 `tool_result` 聚合、多个 subagent session link、更深 child session tree 或 Claude `is_truncated=true` 物理截断位，可追加专用 richer fixture 或生成 helper。
- M7 后续增强：当决定切换到 npm 正式发布时，再补版本约定、tag 命名、binary/OpenAPI artifact 策略，并将当前 `release-check` 升级为真正执行 `npm publish --dry-run` 的 gate。
- M7 后续增强：如需继续提高发布校验强度，可再把 `source-sdk-pack-check` 扩展到 LICENSE/CHANGELOG、dry-run 元数据或 semver/tag 一致性检查。
- 持续维护 `docs/source/fork-patch-map.md`，避免 source 改动扩散到 upstream 核心目录。

## 已知说明

- 本文件记录“当前真实进展”，不替代规格与计划。
- 若 `STATUS.md` 与 [SPEC.md](./SPEC.md) 或 [PLAN.md](./PLAN.md) 冲突，以规格和计划判断目标，以 `STATUS.md` 反映现状。
- 当前 M2 已为 source facade 提供 broadcaster -> SourceEvent adapter，并新增 `/api/source/v1/events`；底层 broadcaster 仍是 coarse-grained `scope` 事件，因此 `message.appended` 语义仍由 source adapter 通过快照 diff 与增量消息查询补齐。
- 当前 SDK 与文档均以 `/api/source/v1` 为唯一受支持的稳定 contract，不再为开发期不存在的旧服务形态保留额外兼容入口。
