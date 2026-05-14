# Upstream Merge Checklist

本文定义 `ca-session-source` 同步 AgentsView `upstream/main` 时的标准流程，目标是让 fork 长期可维护，并把冲突收敛到少量 wiring 文件。

## 适用场景

在以下任一场景执行本文：

- 定期同步 `upstream/main`
- 准备把 fork 分支重新对齐到最新 AgentsView
- 评估上游是否引入了会影响 source facade / source API 的变更
- 处理 upstream merge 或 rebase 冲突

## 分支目标状态

分支关系：

```text
upstream/main         # 上游权威基线
origin/main           # fork 镜像分支，尽量与 upstream/main 对齐
ca-session-source     # 本项目主开发分支
feature/source-*      # 功能开发分支
```

原则：

- `main` 尽量保持“可快速追平 upstream”的状态。
- 长期 source 研发改动不要直接堆在 `main` 上。
- 功能分支优先从 `ca-session-source` 拉出。

## 同步前检查

开始前先确认：

- 工作树干净，或当前未提交改动已妥善保存。
- [fork-patch-map.md](./fork-patch-map.md) 已反映当前 fork patch 面。
- 已知的高风险改动点有明确负责人。
- 本地能够访问 `upstream` remote。

常用命令：

```bash
git status --short
git remote -v
git branch -vv
```

## 同步流程

如果 `origin/main` 作为 fork 镜像分支：

```bash
git fetch upstream main
git fetch origin main
git switch main
git merge --ff-only upstream/main
git push origin main
```

然后把 source 开发分支对齐到新的 `main`：

```bash
git switch ca-session-source
git rebase main
```

如需采用 merge，也可以：

```bash
git switch ca-session-source
git merge --no-ff main
```

约束：

- `main` 对齐 upstream 时优先使用 fast-forward。
- 除非有明确原因，不要在 `main` 上制造额外 fork-only 提交。
- 若当前仓库历史尚未完全切到该分支模型，先按本文记录事实，再逐步收敛。

## 必查差异面

每次同步 upstream 后，至少逐项检查以下区域：

### 1. parser / discovery

- `internal/parser/*`
- `internal/parser/discovery.go`
- `internal/parser/types.go`

关注点：

- 新 agent 接入方式是否变化
- source path / source metadata 语义是否变化
- transcript/message 解析边界是否变化

### 2. sync / live update

- `internal/sync/*`
- watcher、broadcaster、session refresh 相关逻辑

关注点：

- session 更新事件粒度是否变化
- 是否出现影响 `message.appended` adapter 的增量语义变化

### 3. db / schema

- `internal/db/*`
- `internal/db/schema.sql`

关注点：

- `sessions` / `messages` / `tool_calls` 表结构是否变化
- message 锚点字段如 `ordinal`、`source_uuid` 是否变化
- migration 是否影响 source DTO 或消费语义

### 4. server / route

- `internal/server/server.go`
- `internal/server/events.go`
- `internal/server/sse.go`
- `internal/server/messages.go`
- `internal/server/sessions.go`

关注点：

- `/api/v1/*` 路由行为是否变化
- SSE 事件格式、watch 语义、HTTP handler 契约是否变化
- source facade 或 `/api/source/v1` 的挂载点是否需要跟着调整

### 5. config / build / deps

- `internal/config/*`
- `go.mod`
- `go.sum`
- `Makefile`
- `frontend/package.json`
- `frontend/package-lock.json`
- `frontend/vite.config.ts`

关注点：

- Go / Node 版本门槛是否变化
- 新依赖是否会影响 source SDK、SSE 客户端或构建流程
- 前端构建方式与 `/api` 代理语义是否变化

## 重点冲突热点

如果出现冲突，优先检查这些薄集成点：

- `cmd/agentsview/main.go`
- `internal/server/server.go`
- `internal/config/*`
- `Makefile`
- `frontend` 中与 source debug 页或 API facade 相关的少量入口文件

处理原则：

- 尽量让 upstream 实现保持原样，source 逻辑只做薄挂载。
- 优先保留 upstream 新行为，再重新接回 fork 的 source wiring。
- 冲突解决后，立即回填 [fork-patch-map.md](./fork-patch-map.md)。

## Smoke Tests

完成合并后，至少执行以下检查：

### 后端基线

```bash
make test
```

### Source 专项矩阵

```bash
make source-ci
```

### 前端构建

```bash
cd frontend && npm run build
```

### 如改动触及前端交互或 SSE

```bash
cd frontend && npm run test
```

### 手工回归

- `agentsview serve` 能正常启动
- 原有 session browser 能正常加载 session list
- session 详情页能加载 messages / tool calls
- 若 source event adapter 已接入，确认事件订阅仍能工作

## 完成标准

本次 upstream 同步完成，至少满足：

- `main` 已与 `upstream/main` 对齐，或偏差已明确记录
- fork patch 面已在 [fork-patch-map.md](./fork-patch-map.md) 中更新
- 相关 smoke tests 已执行，结果已记录
- `STATUS.md` 已更新同步结论、风险与下一步
