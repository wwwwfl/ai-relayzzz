# AI Relay Local Relay 产品稿

> 版本：v0.1  
> 日期：2026-06-10  
> 状态：Review Draft  
> 主题：Vercel / Cloudflare / Mac App 三种部署形态并行

## 1. 背景

AI Relay 当前核心卖点是：

- Vercel 一键部署，低门槛上线
- Cloudflare Pages 自动部署，D1 + KV 免费层可用
- Admin 后台统一管理 Provider、Key Pool、模型别名、优先级、用量统计
- OpenAI / Anthropic 兼容接口，调用方只需要修改 `base_url`

随着使用强度提升，纯 Serverless Relay 会遇到不可完全规避的平台限制：

- Vercel 免费层存在 invocation、流量、回源流量等额度边界
- Cloudflare Workers 免费层存在请求量与 CPU time 限制
- 流式响应和 usage 解析对 CPU、连接时长、回源流量更敏感
- 为适配免费层，需要引入采样、缓存、极致优化，可能牺牲统计完整性或稳定性

因此需要新增第三种运行形态：**Local Relay**。它不是替代 Vercel / Cloudflare，而是作为重度用户、本机 Agent 用户、隐私敏感用户的稳定增强选项。

## 2. 产品定位

AI Relay 的长期形态：

> 一个可云端部署、也可本机运行的个人 AI Gateway。轻量用户用 Vercel / Cloudflare 起步，重度用户用 Local Relay 稳定进阶。

三种部署方式并行：

| 形态 | 主要价值 | 适合用户 |
|---|---|---|
| Vercel | 2 分钟上线、最低门槛、适合公开演示和轻量个人使用 | 新用户、轻量使用者、开源试用用户 |
| Cloudflare | 边缘部署、免费层更工程化、适合会配置 GitHub Actions 的用户 | 技术用户、开源部署党 |
| Local Relay / Mac App | 本机转发，不消耗云端请求和回源流量额度，低延迟，密钥可本机化 | 重度个人开发者、本机 Agent/IDE 高频用户 |

推荐对外表达：

> 免费云端起步，本机稳定进阶。

英文表达：

> Start free on Vercel. Scale locally with Local Relay. Keep the same config, same API, same routing logic.

## 3. 核心假设

1. 用户仍然需要云端 Admin，因为“随时随地管理配置”是 AI Relay 的核心差异化。
2. 高频请求、长 streaming、usage 采集是免费 Serverless 的主要压力来源。
3. 本机 AI Agent / IDE / CLI 是 Local Relay 的最佳首发场景。
4. 用户愿意运行一个本机常驻服务，只要它能自动接入 Codex、Claude Code 等主流 Agent。
5. Local Relay 的第一版不需要完整 Mac App；CLI + 后台进程 + 自动配置 Agent 即可验证价值。

## 4. 用户角色

| 角色 | 场景 | 核心诉求 |
|---|---|---|
| 个人开发者 | 使用 Codex、Claude Code、Cursor、脚本高频调用模型 | 稳定、本机低延迟、不要被免费层额度影响 |
| 小团队技术负责人 | 云端管理统一配置，团队成员各自在本机运行 Relay | 配置集中、请求本地化、可观测 |
| 隐私敏感用户 | 不希望 AI 请求经过自己的 Vercel / CF 部署 | Provider Key 和请求链路尽量留在本机 |
| 开源试用用户 | 先用 Vercel 快速跑通，后续升级到本机 | 迁移成本低，同一套配置继续使用 |

## 5. 产品目标

### 5.1 用户目标

- 用户可以在 10 分钟内从云端 Admin 配置 Provider，并在本机启动 Local Relay。
- 用户可以一条命令把 Codex / Claude Code 配置到 `localhost` Relay。
- 用户无需手动修改多个配置文件，即可验证本机 Agent 请求经过 AI Relay。
- 用户可以在云端 Admin 继续修改 Provider、Key、模型别名、优先级规则，本机自动同步。
- 用户可以在云端 Admin 查看本机上报的聚合用量和设备在线状态。

### 5.2 产品目标

- 保留 Vercel / Cloudflare 的低门槛获客能力。
- 为重度用户提供一个更稳定的第三种部署方式。
- 降低用户从“云端 Relay”迁移到“本机 Relay”的成本。
- 建立 AI Relay 的核心心智：同一套 Gateway 能在云端和本机自由切换。

## 6. 范围

### 6.1 MVP 包含

1. Local Relay CLI
   - `ai-relay local start`
   - `ai-relay local stop`
   - `ai-relay local status`
   - `ai-relay local doctor`

2. 云端配置同步
   - 本机设备绑定
   - 本机主动拉取云端配置快照
   - 支持 Provider、Key Pool、模型别名、优先级规则、fallback 配置
   - 配置版本号 / ETag，避免重复拉取

3. 本机 OpenAI / Anthropic 兼容 endpoint
   - `http://127.0.0.1:3147/v1/chat/completions`
   - `http://127.0.0.1:3147/v1/responses`
   - `http://127.0.0.1:3147/v1/messages`
   - `http://127.0.0.1:3147/v1/models`

4. Agent 自动配置
   - Codex CLI / Codex App
   - Claude Code CLI
   - 通用 OpenAI-compatible 环境变量输出
   - 配置写入前自动备份
   - 支持 dry-run、doctor、uninstall

5. Usage 本机记录与云端上报
   - 本机 SQLite 记录请求摘要
   - 定期上传聚合 usage
   - 请求日志明细默认仅保留本机

6. 基础设备状态
   - 云端 Admin 显示设备在线 / 离线
   - 显示本机 Relay 版本、最近心跳、配置版本、监听端口

### 6.2 MVP 不包含

- 完整 Mac App UI
- 自动更新、签名、公证
- 端到端加密密钥体系
- 多用户组织权限
- 团队设备策略
- 公网 tunnel
- Windows / Linux GUI
- 完整成本中心
- 请求 prompt / completion 云端同步

## 7. 用户旅程

### 7.1 新用户从 Vercel 起步

1. 用户通过 Vercel 一键部署 AI Relay。
2. 登录云端 Admin。
3. 添加 Provider Key。
4. 复制云端 Relay 地址，完成第一条请求。
5. 当调用量变大或 Agent 本机高频使用时，进入“Local Relay”页。
6. 按指引安装 CLI。
7. 执行设备绑定命令。
8. 执行 `ai-relay local start`。
9. 执行 `ai-relay agent install codex`。
10. Codex 请求开始走 `localhost` Relay。

### 7.2 既有用户启用 Local Relay

1. 用户已有 Vercel / CF 部署和 Provider 配置。
2. 打开 Admin 的“Local Relay”页。
3. 创建本机设备 token。
4. 在本机执行：

```bash
ai-relay login https://example.vercel.app
ai-relay local start
ai-relay agent install codex
ai-relay agent doctor
```

5. CLI 输出本机 endpoint、配置版本、已配置 Agent。
6. Admin 设备页显示该 Mac 在线。

### 7.3 云端修改配置，本机自动生效

1. 用户在云端 Admin 调整模型别名或优先级规则。
2. 云端配置版本号递增。
3. Local Relay 下次轮询时发现版本变化。
4. 本机拉取新快照并热更新。
5. 后续 Agent 请求使用新策略。

## 8. 功能设计

## 8.1 Local Relay 管理页

### 入口

Admin 侧边栏新增：

```text
Local Relay
```

### 页面模块

| 模块 | 内容 |
|---|---|
| 快速开始 | 安装 CLI、登录云端、启动本机 Relay、配置 Agent |
| 设备列表 | 设备名、状态、版本、端口、最近心跳、配置版本 |
| 配置同步 | 当前云端配置版本、最近发布时间、同步状态 |
| Agent 接入 | Codex、Claude Code、OpenAI-compatible 示例 |
| 安全提示 | 本机 token、撤销设备、密钥存储说明 |

### 设备状态

| 状态 | 规则 |
|---|---|
| Online | 最近 90 秒内收到心跳 |
| Degraded | 最近 5 分钟内无心跳，或配置版本落后 |
| Offline | 超过 5 分钟无心跳 |
| Revoked | 用户在云端撤销设备 |

### 验收标准

- Admin 可以生成一次性设备绑定 token。
- Admin 可以看到本机设备上线。
- Admin 可以撤销设备。
- 设备撤销后，本机同步和 usage 上传失败，CLI 给出可读提示。

## 8.2 Local Relay CLI

### 命令设计

```bash
ai-relay login <cloud-admin-url>
ai-relay local start
ai-relay local stop
ai-relay local status
ai-relay local doctor
ai-relay local logs
ai-relay agent list
ai-relay agent install codex
ai-relay agent install claude
ai-relay agent doctor
ai-relay agent uninstall codex
```

### `ai-relay login`

流程：

1. 用户输入云端 Admin URL。
2. CLI 打开浏览器或展示设备码。
3. 云端 Admin 确认绑定。
4. CLI 保存设备 token 到本机安全存储。
5. CLI 拉取初始配置快照。

验收标准：

- 支持复制设备码登录。
- 登录成功后本机保存 cloud URL、device id、device token。
- 登录失败时显示明确错误原因。

### `ai-relay local start`

流程：

1. 检查本机登录状态。
2. 检查端口 `3147` 是否可用。
3. 拉取最新配置。
4. 启动本机 HTTP server。
5. 启动配置轮询、usage flush、heartbeat。

验收标准：

- `GET /health` 返回本机健康状态。
- `GET /v1/models` 返回云端配置中的模型列表。
- `POST /v1/chat/completions` 能正常转发。
- streaming 响应可透传。

### `ai-relay local doctor`

检查项：

| 检查 | 说明 |
|---|---|
| Login | 是否已绑定云端 |
| Config | 是否能拉取配置 |
| Port | 本机端口是否监听 |
| Provider | 是否至少有一个 Provider Key |
| Chat | 是否能完成一次测试请求 |
| Usage | 是否能写入本机 usage |
| Upload | 是否能上报 usage 聚合 |

验收标准：

- 每个检查项有 pass / warn / fail。
- fail 项给出下一步建议。
- 不暴露 Provider Key 明文。

## 8.3 Agent 自动配置

### 支持目标

| Agent | MVP 支持 | 接入方式 |
|---|---:|---|
| Codex CLI / Codex App | 是 | 修改 `~/.codex/config.toml`，配置自定义 provider 或 base URL |
| Claude Code CLI | 是 | 写入 shell profile 片段或生成可 source 的 env 文件 |
| 通用 OpenAI-compatible 工具 | 是 | 输出 `OPENAI_BASE_URL` / `OPENAI_API_KEY` |
| Claude Desktop App | P1 | 视配置格式和版本支持情况决定 |
| Cursor | P1 | 生成配置指引，后续评估自动写入 |
| Hermes / OpenClaw | P1 | 复用现有 cc-switch export 能力 |

### 命令

```bash
ai-relay agent list
ai-relay agent install codex
ai-relay agent install claude
ai-relay agent install openai-env
ai-relay agent doctor codex
ai-relay agent uninstall codex
```

### 自动配置原则

1. 默认只写用户级配置，不改项目配置。
2. 写入前必须创建备份。
3. 支持 `--dry-run` 展示 diff。
4. 支持 `uninstall` 恢复安装前状态。
5. 不覆盖用户已有非 AI Relay 配置；必要时追加独立 block。
6. 写入失败时不得留下半写入文件。
7. 所有敏感 token 写入前提示目标路径。

### Codex 配置

目标：

- 将 Codex 的模型请求指向 `http://127.0.0.1:3147/v1`
- 使用 AI Relay 的本机 relay key 或 local token
- 默认模型使用云端配置推荐模型

配置策略：

- 优先使用 Codex 支持的自定义 provider 配置。
- 如果检测到用户已有 Codex 配置，追加 `ai-relay-local` provider。
- 不删除用户已有 provider。

示例输出：

```toml
model_provider = "ai-relay-local"
model = "gpt-5.4"
disable_response_storage = true

[model_providers.ai-relay-local]
name = "AI Relay Local"
base_url = "http://127.0.0.1:3147/v1"
wire_api = "chat"
requires_openai_auth = true
```

### Claude Code 配置

目标：

- 将 Claude Code 请求指向 Local Relay 的 Anthropic-compatible endpoint。
- 使用 `ANTHROPIC_BASE_URL` 和 `ANTHROPIC_AUTH_TOKEN`。

配置策略：

- MVP 优先生成 `~/.ai-relay/agents/claude.env`。
- 可选写入 shell profile：

```bash
export ANTHROPIC_BASE_URL="http://127.0.0.1:3147"
export ANTHROPIC_AUTH_TOKEN="<local-relay-key>"
export ANTHROPIC_MODEL="claude-sonnet"
```

### Agent Doctor

检查项：

| 检查 | Codex | Claude Code |
|---|---|---|
| 安装检测 | `codex` 命令 / App 配置目录 | `claude` 命令 |
| 配置文件存在 | `~/.codex/config.toml` | shell profile 或 env 文件 |
| base URL 指向 localhost | 是 | 是 |
| auth token 存在 | 是 | 是 |
| 测试请求经过 Local Relay | 通过 trace id 验证 | 通过 trace id 验证 |

### 验收标准

- `ai-relay agent install codex --dry-run` 能展示将要写入的 TOML diff。
- `ai-relay agent install codex` 能备份并写入配置。
- `ai-relay agent uninstall codex` 能恢复安装前配置。
- `ai-relay agent doctor codex` 能确认 Codex 配置指向 Local Relay。
- Claude Code 至少支持生成 env 文件和 doctor 检查。

## 8.4 配置同步

### 配置内容

MVP 同步以下配置：

| 配置 | 是否同步 | 说明 |
|---|---:|---|
| Provider 基础配置 | 是 | base URL、header format、model prefixes、models |
| Provider Key Pool | 是 | MVP 可先从云端同步明文；正式版升级加密 |
| Fallback 链 | 是 | 与现有云端配置一致 |
| 模型别名 | 是 | 本机解析别名 |
| 优先级规则 | 是 | 本机执行路由规则 |
| Smart Routing | P1 | MVP 可关闭或仅同步静态策略 |
| Webhook | 否 | 云端继续处理 |
| Admin UI 设置 | 否 | 云端专属 |

### 同步策略

- 本机主动拉取，云端不尝试连接本机。
- 默认每 30 秒检查配置版本。
- 配置有变化时拉取完整快照。
- 拉取失败时继续使用本机最近一次成功快照。
- 设备被撤销时停止同步并提示用户重新登录。

### 验收标准

- 云端修改模型别名后，本机 60 秒内生效。
- 云端修改 Provider Key 后，本机 60 秒内生效。
- 云端不可用时，本机能继续使用最近一次配置。
- 配置快照损坏时，本机拒绝应用并保留旧配置。

## 8.5 Usage 与日志

### 本机记录

本机 SQLite 记录：

- 请求时间
- trace id
- model
- provider
- status
- http status
- latency
- token usage
- key hash
- error summary

默认不记录：

- prompt 全文
- completion 全文
- Provider Key 明文

### 云端上报

云端只接收聚合数据：

- 每分钟请求数
- Provider 维度 token
- status code 统计
- latency p50 / p95
- key hash 维度错误数

### 验收标准

- 本机断网时 usage 进入待上传队列。
- 网络恢复后 usage 自动补传。
- 重复上传不会造成云端重复计数。
- 云端 Admin 可以区分 cloud runtime 与 local runtime usage。

## 9. 安全设计

### MVP 安全策略

MVP 允许云端保存 Provider Key，并通过 HTTPS 同步到本机。该模式开发成本低，但云端仍可见 key。

必须做到：

- 设备 token 可撤销。
- 同步 API 必须校验设备 token。
- 本机配置文件权限尽量限制为当前用户可读。
- CLI 输出永不打印完整 Provider Key。
- Admin 明确提示当前密钥模式。

### 正式版安全策略

正式版升级为端到端加密配置：

```text
云端保存：加密后的 Provider Key
本机保存：解密密钥 / Keychain item
云端能力：存储、同步、版本管理，但不能解密 Provider Key
```

P1/P2 能力：

- macOS Keychain 保存本机解密密钥
- 设备级加密密钥
- 撤销设备后重新轮换 Provider Key 的引导
- 导出 / 导入加密配置

## 10. 成功指标

### MVP 指标

| 指标 | 目标 |
|---|---|
| Local Relay 首次启动成功率 | >= 80% |
| Agent 自动配置成功率 | >= 70% |
| 从安装 CLI 到 Codex 跑通 | <= 10 分钟 |
| 配置同步延迟 | P95 <= 60 秒 |
| 本机请求成功率 | 不低于同配置云端 Relay |

### 长期指标

| 指标 | 说明 |
|---|---|
| Local Relay 日活设备数 | 衡量第三部署形态是否真实使用 |
| 本机 runtime usage 占比 | 衡量重度用户是否迁移 |
| Agent install 使用率 | 衡量自动接入价值 |
| 云端免费层错误下降 | 衡量数据面迁移效果 |

## 11. 分阶段计划

## Phase 0：设计与抽象

目标：先让代码具备三 runtime 并行的边界。

交付：

- Relay Core 边界设计
- Config Store 接口设计
- Usage Store 接口设计
- Local Runtime POC
- Agent 配置写入策略确认

## Phase 1：Local Relay CLI MVP

目标：本机能跑，能拉云端配置，能被 OpenAI SDK 调用。

交付：

- `ai-relay login`
- `ai-relay local start`
- 本机 `/v1/chat/completions`
- 配置快照 API
- 本机 SQLite usage
- `local doctor`

## Phase 2：Agent 一键接入

目标：用户不手动改配置，Codex / Claude Code 能接入。

交付：

- `agent list`
- `agent install codex`
- `agent install claude`
- `agent doctor`
- `agent uninstall`
- 配置备份 / dry-run / diff

## Phase 3：云端 Admin 增强

目标：Local Relay 成为可见、可管理的第三部署形态。

交付：

- Local Relay 页面
- 设备列表
- 设备撤销
- usage runtime 维度
- 配置版本管理

## Phase 4：Mac App

目标：降低 CLI 心智成本，变成稳定常驻体验。

交付：

- 菜单栏 App
- 开机启动
- 状态展示
- 打开 Admin
- 日志查看
- 自动更新
- 签名与公证

## 12. 风险与边界

| 风险 | 影响 | 应对 |
|---|---|---|
| 自动修改 Agent 配置导致用户不放心 | 影响采用率 | dry-run、备份、diff、uninstall |
| 各 Agent 配置格式变化 | 自动配置失效 | adapter 化，doctor 检测，保留手动配置输出 |
| 本机服务未运行导致请求失败 | 用户体验受损 | Agent doctor、菜单栏状态、开机启动 |
| 云端明文保存 Provider Key | 隐私卖点不足 | MVP 明示，正式版 E2E 加密 |
| 多设备同时运行导致 usage 统计复杂 | 报表口径混乱 | usage 带 runtime/device 维度 |
| 本机端口冲突 | 启动失败 | 自动换端口或提示配置 |
| 云端不可用 | 无法同步配置 | 本机保留最近一次配置，可离线运行 |

## 13. Open Questions

1. MVP 是否接受云端明文 Provider Key，还是必须第一版就做端到端加密？
2. Local Relay 默认端口是否固定为 `3147`，还是首次冲突后自动选择？
3. Agent 自动配置是否默认写入，还是默认 dry-run 后二次确认？
4. Codex 配置是写全局 `~/.codex/config.toml`，还是优先支持项目级配置？
5. Claude Code 是否只做 env 文件，还是允许自动修改 shell profile？
6. 云端 usage 是否展示请求日志摘要，还是只展示聚合指标？
7. Mac App 是否只支持 macOS，还是同时保留跨平台 CLI？

