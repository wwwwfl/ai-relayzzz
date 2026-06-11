# AI Relay Local Relay 技术架构设计

> 版本：v0.1  
> 日期：2026-06-10  
> 状态：Review Draft  
> 关联产品稿：`docs/product/local-relay-prd.md`

## 1. 设计目标

AI Relay 需要从“单一 Serverless Runtime”演进为多 runtime 并行：

```text
Vercel Runtime
Cloudflare Runtime
Local Runtime / Mac App
Server Runtime / VPS / Docker
```

所有 runtime 必须共享同一套 Relay 能力：

- Provider 解析
- 模型别名
- 优先级规则
- Key 轮换
- fallback
- cooldown / rate limit
- streaming 透传
- usage event schema
- request log schema

核心工程原则：

> Relay Core 只维护一份，Vercel / Cloudflare / Local / Server 只是 runtime adapter。

## 2. 当前架构观察

当前项目已经具备部分可演进基础：

| 模块 | 现状 | 改造判断 |
|---|---|---|
| Relay 主逻辑 | `src/lib/relay/relay.ts` 已集中核心转发逻辑 | 可复用，需剥离 Next route 绑定 |
| Provider Resolver | `src/lib/providers/resolver.ts` 集中处理 provider、alias、priority | 可复用，需抽象配置源 |
| Admin Config | `src/lib/admin/admin-config.ts` 直接读 Vercel KV / CF KV / mock KV | 需要重点抽象 |
| Usage Storage | `src/lib/usage/factory.ts` 已支持 KV / D1 切换 | 可扩展 Local SQLite |
| Route Handler | `src/app/v1/**/route.ts` 处理 NextRequest、auth、usage、stream wrapping | 需要抽出 transport-independent handler |
| Agent 配置导出 | `src/lib/admin/cc-switch-export.ts` 已生成 Codex / Claude 等配置片段 | 可升级为本机自动写入 adapter |

最大改造点不是 AI 转发本身，而是：

1. 配置读取从“直接 KV”变成“可替换 ConfigStore”。
2. Local / Server runtime 需要独立 HTTP server 包装 Relay Core。
3. Local 设备需要与云端控制面进行安全同步。
4. Server runtime 需要支持 Docker/VPS 长驻服务、持久化和公网安全边界。
5. Agent 自动配置需要可靠的文件写入、备份、回滚。

## 3. 目标架构

```text
                         ┌────────────────────────┐
                         │ Cloud Control Plane     │
                         │ Vercel / Cloudflare     │
                         │                        │
                         │ - Admin UI              │
                         │ - Config Store          │
                         │ - Device Registry       │
                         │ - Usage Aggregation     │
                         │ - Webhook / Alerts      │
                         └───────────┬────────────┘
                                     │
                 config pull / usage push / heartbeat
                                     │
          ┌──────────────────────────┴──────────────────────────┐
          │                                                     │
┌─────────▼──────────┐                              ┌───────────▼───────────┐
│ Local Relay Runtime │                              │ Server Runtime         │
│ Mac / localhost     │                              │ VPS / Docker           │
│                     │                              │                       │
│ - Local HTTP Server │                              │ - Public/Private HTTP  │
│ - Relay Core        │──────► Upstream Providers   │ - Relay Core           │────► Upstream Providers
│ - SQLite State      │        OpenAI / Claude / ...│ - SQLite/Postgres      │      OpenAI / Claude / ...
│ - Config Sync       │                              │ - Config Store         │
│ - Agent Config      │                              │ - Admin UI optional    │
└─────────▲──────────┘                              └───────────▲───────────┘
          │                                                     │
Agent / IDE / CLI                                  CI / Team / Server workloads
OpenAI SDK / Claude CLI                            OpenAI-compatible clients
```

### 3.1 Control Plane

云端继续负责：

- Admin UI
- Provider 配置管理
- Key Pool 管理
- 模型别名
- 优先级规则
- fallback 配置
- 设备注册与撤销
- usage 聚合展示
- Webhook / 告警

### 3.2 Data Plane

Local Relay 负责：

- 本机 `localhost` endpoint
- 请求认证
- Provider 选择
- Key 轮换
- fallback / cooldown
- streaming 转发
- 本机 usage 与 request log
- 周期性上传 usage 聚合
- 周期性拉取云端配置

### 3.3 Server Runtime

Server Runtime 面向 VPS / Docker / NAS / 私有服务器部署，负责：

- 提供可被团队、CI、服务器、移动端访问的稳定 endpoint
- 避免 Vercel / Cloudflare 免费层 invocation、CPU time、回源流量限制
- 复用 Relay Core 与 Admin UI
- 支持 SQLite 起步，按需升级 Postgres
- 支持 Docker Compose、反向代理、TLS、健康检查、日志采集

Server Runtime 有两种模式：

| 模式 | 说明 | 适合场景 |
|---|---|---|
| Standalone | 控制面和数据面同机，Admin UI、Relay API、数据库都在 VPS/Docker 内 | 团队共享、自托管、生产稳定 endpoint |
| Managed Worker | VPS/Docker 只跑数据面，从 Vercel/CF 云端控制面拉配置并上报 usage | 已有云端 Admin，希望把高频请求迁到服务器 |

## 4. 模块拆分

建议逐步演进为以下边界：

```text
src/
  lib/
    relay-core/
      relay-request.ts
      route-request.ts
      provider-selection.ts
      stream-usage.ts
      errors.ts
      types.ts

    config-store/
      types.ts
      vercel-kv-config-store.ts
      cloudflare-kv-config-store.ts
      remote-config-store.ts
      local-sqlite-config-store.ts
      server-sqlite-config-store.ts
      server-postgres-config-store.ts
      memory-config-store.ts

    usage-store/
      types.ts
      kv-usage-store.ts
      d1-usage-store.ts
      sqlite-usage-store.ts
      postgres-usage-store.ts
      batch-uploader.ts

    runtime/
      next/
        chat-route.ts
        responses-route.ts
        messages-route.ts
      cloudflare/
        worker-adapter.ts
      local/
        server.ts
        daemon.ts
        config-sync.ts
        heartbeat.ts
      server/
        server.ts
        docker-entrypoint.ts
        config-loader.ts
        healthcheck.ts
        migrations.ts

    agent-config/
      types.ts
      codex-adapter.ts
      claude-code-adapter.ts
      openai-env-adapter.ts
      file-backup.ts
      doctor.ts
```

MVP 不一定需要立即移动所有文件，可以先在现有结构下增加接口层，再逐步迁移。

## 5. 核心接口设计

## 5.1 ConfigStore

目标：让 Relay Core 不知道配置来自 Vercel KV、CF KV、远程云端还是本机 SQLite。

```typescript
export interface ConfigStore {
  getSnapshot(options?: { forceRefresh?: boolean }): Promise<RelayConfigSnapshot>;
  getVersion(): Promise<number | string>;
  getProviderKeys(providerName: string): Promise<string[] | null>;
  getProviderKeysVersion(providerName: string): Promise<number | string>;
  saveSnapshot?(snapshot: RelayConfigSnapshot): Promise<void>;
}

export interface RelayConfigSnapshot {
  version: number | string;
  generatedAt: string;
  providers: Record<string, ProviderConfig>;
  providerKeys: Record<string, string[]>;
  keyVersions: Record<string, number | string>;
  modelAliases: ModelAliasConfig;
  priorityRules: PriorityRule[];
  fallbackChains: Record<string, string[]>;
  quotas?: RelayQuotaConfig;
  smartRouting?: SmartRoutingConfig;
}
```

### Store 实现

| Store | 用途 |
|---|---|
| `VercelKVConfigStore` | Vercel runtime 直接读写 KV |
| `CloudflareKVConfigStore` | CF runtime 直接读写 KV binding |
| `RemoteConfigStore` | Local runtime 通过 HTTPS 从云端拉配置 |
| `LocalSQLiteConfigStore` | 本机缓存最近一次成功配置 |
| `ServerSQLiteConfigStore` | Docker/VPS standalone 模式本地配置存储 |
| `ServerPostgresConfigStore` | Docker/VPS 团队或生产模式配置存储 |
| `MemoryConfigStore` | 测试 |

## 5.2 UsageStore

目标：保留现有 usage event schema，增加 runtime/device 维度。

```typescript
export interface UsageStore {
  record(event: UsageEvent): Promise<void>;
  recordError(event: ErrorEvent): Promise<void>;
  getDailyReport(date: string): Promise<DailyReportData | null>;
  getUsageTrend(options: UsageTrendQuery): Promise<UsageTrendResult>;
}

export interface LocalUsageUploader {
  flush(options?: { maxBatchSize?: number }): Promise<FlushResult>;
}
```

UsageEvent 新增字段：

```typescript
interface UsageEvent {
  runtime?: 'vercel' | 'cloudflare' | 'local' | 'server';
  deviceId?: string;
  serverId?: string;
}
```

## 5.3 Runtime Adapter

目标：把 Next.js route 与 Relay Core 分离。

```typescript
export interface RelayHttpRequest {
  method: string;
  url: string;
  headers: Headers;
  body: unknown;
  rawBody?: ReadableStream<Uint8Array>;
}

export interface RelayHttpResponse {
  status: number;
  headers: Headers;
  body: BodyInit | ReadableStream<Uint8Array>;
}

export interface RelayRuntimeContext {
  runtime: 'vercel' | 'cloudflare' | 'local' | 'server';
  configStore: ConfigStore;
  usageStore: UsageStore;
  requestLogger: RequestLogger;
  auth: RelayAuth;
}
```

Route handler 只负责：

- 把平台 request 转成 `RelayHttpRequest`
- 调用共享 handler
- 把 `RelayHttpResponse` 转回平台 response

## 5.4 Runtime Capability

不同 runtime 的能力边界不同，建议用 capability 描述，而不是在业务逻辑里散落判断：

```typescript
export interface RuntimeCapabilities {
  runtime: 'vercel' | 'cloudflare' | 'local' | 'server';
  persistentProcess: boolean;
  publicEndpoint: boolean;
  localAgentSetup: boolean;
  supportsCron: boolean;
  supportsPushConfig: boolean;
  storage: 'kv' | 'd1' | 'sqlite' | 'postgres' | 'remote';
}
```

能力矩阵：

| Runtime | 长驻进程 | 公网 endpoint | Agent 自动配置 | 默认存储 | 典型用途 |
|---|---:|---:|---:|---|---|
| Vercel | 否 | 是 | 否 | KV / Upstash | 低门槛云端起步 |
| Cloudflare | 否 | 是 | 否 | KV + D1 | 免费边缘部署 |
| Local | 是 | 否，默认 localhost | 是 | SQLite | 本机 Agent / IDE |
| Server | 是 | 是，可选内网 | 否 | SQLite / Postgres | VPS/Docker 团队共享 |

## 6. Local Runtime 设计

## 6.1 进程模型

MVP 推荐使用 Node.js HTTP server：

```text
ai-relay local start
  ├─ load local profile
  ├─ sync config
  ├─ open sqlite
  ├─ start HTTP server on 127.0.0.1:3147
  ├─ start config polling loop
  ├─ start usage flush loop
  └─ start heartbeat loop
```

后续 Mac App 只负责管理这个 daemon：

- 启动 / 停止
- 开机自启
- 菜单栏状态
- 打开 Admin
- 查看日志

## 6.2 本机监听地址

默认：

```text
host: 127.0.0.1
port: 3147
base_url: http://127.0.0.1:3147/v1
```

端点：

| Endpoint | 说明 |
|---|---|
| `GET /health` | 本机健康状态 |
| `GET /v1/models` | 模型列表 |
| `POST /v1/chat/completions` | OpenAI Chat Completions |
| `POST /v1/responses` | OpenAI Responses API |
| `POST /v1/messages` | Anthropic Messages |
| `POST /v1/messages/count_tokens` | Anthropic token counting |

## 6.3 本机目录

建议：

```text
~/.ai-relay/
  config.json
  local.db
  logs/
    ai-relay.log
  backups/
    codex-config-20260610-120000.toml
    shell-profile-20260610-120000
  agents/
    claude.env
```

配置：

```json
{
  "cloudUrl": "https://example.vercel.app",
  "deviceId": "dev_xxx",
  "listenHost": "127.0.0.1",
  "listenPort": 3147,
  "configVersion": 42,
  "lastSyncAt": "2026-06-10T12:00:00.000Z"
}
```

MVP 可把 device token 放入 `config.json` 并限制文件权限。正式版迁移到 macOS Keychain。

## 6.4 SQLite Schema

```sql
CREATE TABLE local_config_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  applied_at TEXT NOT NULL
);

CREATE TABLE local_usage_events (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  api_key_hash TEXT,
  status_code INTEGER NOT NULL,
  prompt_tokens INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  latency_ms INTEGER DEFAULT 0,
  is_stream INTEGER DEFAULT 0,
  uploaded_at TEXT
);

CREATE TABLE local_request_logs (
  trace_id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  model TEXT,
  provider TEXT,
  status TEXT NOT NULL,
  http_status INTEGER,
  latency_ms INTEGER,
  error_type TEXT,
  error_message TEXT
);

CREATE TABLE local_provider_state (
  provider TEXT PRIMARY KEY,
  cooldown_until TEXT,
  circuit_state TEXT,
  last_error TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE local_key_state (
  provider TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  cooldown_until TEXT,
  success_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (provider, key_hash)
);
```

MVP 可以先只实现 `local_config_snapshots`、`local_usage_events`、`local_request_logs`。

## 7. Server Runtime 设计

Server Runtime 是未来 VPS / Docker 部署的基础形态。它和 Local Runtime 一样是长驻进程，但面向公网或内网共享 endpoint，不负责自动配置用户本机 Agent。

## 7.1 运行模式

| 模式 | 控制面 | 数据面 | 配置来源 | Usage 去向 | 适合场景 |
|---|---|---|---|---|---|
| Standalone | Server 本机 | Server 本机 | 本机 SQLite / Postgres | 本机数据库 | 团队自托管、生产 endpoint、替代 new-api 轻量形态 |
| Managed Worker | Vercel / CF 云端 | Server 本机 | 云端 Control Plane | 上传到云端 | 已有云端 Admin，只把高频 Relay 迁到 VPS |

推荐演进顺序：

1. Local Runtime 先验证长驻 HTTP server 和共享 Relay Core。
2. Server Managed Worker 复用 Local 的 `RemoteConfigStore`、usage uploader、heartbeat。
3. Server Standalone 增加本地 Admin、数据库迁移、Docker Compose。

## 7.2 Server 进程模型

```text
ai-relay server start
  ├─ load server profile / env
  ├─ run migrations
  ├─ open sqlite or postgres
  ├─ load config store
  ├─ start HTTP server on 0.0.0.0:3000
  ├─ start relay routes
  ├─ start admin routes (standalone only)
  ├─ start healthcheck endpoint
  └─ start optional config sync / usage upload loops (managed worker only)
```

Server Runtime 端点：

| Endpoint | Standalone | Managed Worker | 说明 |
|---|---:|---:|---|
| `GET /health` | 是 | 是 | 容器和反向代理健康检查 |
| `GET /admin` | 是 | 否 | Standalone 管理后台 |
| `POST /v1/chat/completions` | 是 | 是 | OpenAI Chat Completions |
| `POST /v1/responses` | 是 | 是 | Responses API |
| `POST /v1/messages` | 是 | 是 | Anthropic Messages |
| `GET /v1/models` | 是 | 是 | 模型列表 |
| `GET /metrics` | P1 | P1 | Prometheus 指标，可选 |

## 7.3 Docker 形态

建议提供官方镜像：

```text
ghcr.io/moyufamily/ai-relay:latest
```

最小 Docker Compose：

```yaml
services:
  ai-relay:
    image: ghcr.io/moyufamily/ai-relay:latest
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      RELAY_RUNTIME: server
      RELAY_SERVER_MODE: standalone
      RELAY_STORAGE: sqlite
      RELAY_API_KEY: ${RELAY_API_KEY}
      RELAY_ADMIN_KEY: ${RELAY_ADMIN_KEY}
      RELAY_SIGNING_SECRET: ${RELAY_SIGNING_SECRET}
      DATABASE_URL: file:/data/ai-relay.db
    volumes:
      - ./data:/data
```

Postgres 版本：

```yaml
services:
  ai-relay:
    image: ghcr.io/moyufamily/ai-relay:latest
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      RELAY_RUNTIME: server
      RELAY_SERVER_MODE: standalone
      RELAY_STORAGE: postgres
      DATABASE_URL: postgres://ai_relay:password@postgres:5432/ai_relay
      RELAY_API_KEY: ${RELAY_API_KEY}
      RELAY_ADMIN_KEY: ${RELAY_ADMIN_KEY}
      RELAY_SIGNING_SECRET: ${RELAY_SIGNING_SECRET}
    depends_on:
      - postgres

  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: ai_relay
      POSTGRES_USER: ai_relay
      POSTGRES_PASSWORD: password
    volumes:
      - postgres-data:/var/lib/postgresql/data

volumes:
  postgres-data:
```

## 7.4 Server 配置

环境变量：

| 变量 | 说明 | 默认 |
|---|---|---|
| `RELAY_RUNTIME` | runtime 类型，Server 固定为 `server` | `server` |
| `RELAY_SERVER_MODE` | `standalone` 或 `managed-worker` | `standalone` |
| `RELAY_STORAGE` | `sqlite` 或 `postgres` | `sqlite` |
| `DATABASE_URL` | SQLite 文件或 Postgres URL | `file:/data/ai-relay.db` |
| `RELAY_PUBLIC_URL` | 对外访问 URL，用于 Admin 示例和 webhook | 空 |
| `RELAY_TRUST_PROXY` | 是否信任反向代理 headers | `false` |
| `RELAY_BIND_HOST` | 监听 host | `0.0.0.0` |
| `RELAY_PORT` | 监听端口 | `3000` |
| `RELAY_CLOUD_URL` | Managed Worker 绑定的云端控制面 | 空 |
| `RELAY_SERVER_TOKEN` | Managed Worker 的 server token | 空 |

## 7.5 Standalone 存储

Standalone 模式建议用统一 SQL schema，SQLite 和 Postgres 共用 Drizzle schema：

```text
providers
provider_keys
model_aliases
priority_rules
fallback_chains
usage_events
request_logs
webhook_settings
server_settings
```

SQLite 适合：

- 单人或小团队
- 一台 VPS
- 低运维成本
- volume 备份即可

Postgres 适合：

- 多实例部署
- 团队共享
- 更长 usage 保留
- 未来组织和权限模型

## 7.5.1 Local 与 Server 存储复用

Local Runtime 和 Server Runtime 的存储应该尽量复用，区别不在“存储实现”，而在“数据所有权”：

| Runtime | 存储角色 | 配置来源 | 数据库定位 |
|---|---|---|---|
| Local | 配置缓存 + 本机运行态 | 云端 Control Plane | 本机缓存库 |
| Server Managed Worker | 配置缓存 + 服务器运行态 | 云端 Control Plane | 服务器缓存库 |
| Server Standalone | 权威配置 + 运行态 + Admin 数据 | 本机 Admin / API | 权威业务库 |

因此建议抽象为两层：

```text
SQL Storage Core
  ├─ config_snapshots
  ├─ usage_events
  ├─ request_logs
  ├─ provider_state
  ├─ key_state
  └─ upload_queue

Runtime Store Adapter
  ├─ LocalSQLiteStore
  ├─ ServerManagedSQLiteStore
  ├─ ServerStandaloneSQLiteStore
  └─ ServerStandalonePostgresStore
```

可以复用的表：

| 表 | Local | Server Managed Worker | Server Standalone | 说明 |
|---|---:|---:|---:|---|
| `config_snapshots` | 是 | 是 | 可选 | Local / Managed Worker 缓存云端快照；Standalone 可用于配置版本历史 |
| `usage_events` | 是 | 是 | 是 | 请求用量事件，增加 `runtime`、`device_id`、`server_id` 维度 |
| `request_logs` | 是 | 是 | 是 | 请求摘要日志，默认不存 prompt / completion |
| `provider_state` | 是 | 是 | 是 | provider cooldown、熔断、健康状态 |
| `key_state` | 是 | 是 | 是 | key cooldown、成功/失败计数、轮换状态 |
| `upload_queue` | 是 | 是 | 否 | Local / Managed Worker 上传云端 usage；Standalone 不需要上传队列 |

需要 runtime-specific 的表：

| 表 | Runtime | 说明 |
|---|---|---|
| `agent_installs` | Local | Codex / Claude Code 自动配置记录、备份 manifest |
| `local_profile` | Local | cloud URL、device id、端口、本机配置 |
| `server_settings` | Server Standalone | public URL、trust proxy、admin enabled、存储模式 |
| `providers` / `provider_keys` | Server Standalone | Standalone 模式的权威 Provider 配置 |
| `webhook_settings` | Server Standalone | Standalone 自带告警时使用 |

实现上不建议为 Local 和 Server 各写一套 SQLite 逻辑，而是共享 repository：

```typescript
interface SqlRelayStore {
  configSnapshots: ConfigSnapshotRepository;
  usageEvents: UsageEventRepository;
  requestLogs: RequestLogRepository;
  providerState: ProviderStateRepository;
  keyState: KeyStateRepository;
}
```

不同 runtime 只组合不同 adapter：

```text
LocalSQLiteConfigStore
  = RemoteConfigStore + SqlRelayStore.configSnapshots

ServerManagedSQLiteConfigStore
  = RemoteConfigStore + SqlRelayStore.configSnapshots

ServerStandaloneSQLiteConfigStore
  = SqlProviderRepository + SqlKeyRepository + SqlRoutingRepository
```

这样做的收益：

- Local CLI 验证出来的长驻进程存储能力，可以直接服务 VPS/Docker。
- SQLite 起步，后续迁移 Postgres 时只替换 driver / repository 实现。
- usage、request log、provider state 的查询和聚合逻辑可以共享。
- 避免 Local 和 Server 后续出现两套 schema、两套统计口径。

需要注意的边界：

- Local / Managed Worker 的配置快照是“云端副本”，不能直接在本地 Admin 修改为权威配置。
- Server Standalone 的配置表是“权威数据”，必须支持 Admin 写入、备份、迁移。
- Local 有 Agent 配置备份，这部分不要污染 Server schema。
- Server 可能是公网服务，Admin、密钥加密、反向代理安全配置不能照搬 Local 默认值。

## 7.6 Managed Worker 同步

Managed Worker 和 Local Relay 一样从云端拉配置，但身份是 server node，而不是 user device。

新增概念：

```typescript
interface ServerNode {
  id: string;
  name: string;
  mode: 'managed-worker';
  tokenHash: string;
  publicUrl?: string;
  region?: string;
  version?: string;
  configVersion?: string | number;
  status: 'online' | 'degraded' | 'offline' | 'revoked';
  createdAt: string;
  lastSeenAt?: string;
  revokedAt?: string;
}
```

可复用 Local Sync API，但建议路径区分：

```text
POST /api/server/nodes/session
POST /api/server/nodes/token
GET  /api/server/config/version
GET  /api/server/config/snapshot
POST /api/server/nodes/heartbeat
POST /api/server/usage/batch
```

差异：

- Server node 可配置 `publicUrl` 和 `region`。
- Server node 可以被云端 Admin 标记为 primary / backup。
- Server node 未来可支持 push-style config reload webhook，但 MVP 仍用 polling。

## 7.7 Server 安全边界

Server Runtime 可能暴露在公网，安全要求高于 Local Runtime：

- 默认要求配置 `RELAY_ADMIN_KEY` 和 `RELAY_API_KEY`。
- Admin 路由必须可关闭：`RELAY_ADMIN_ENABLED=false`。
- 建议通过 Caddy / Nginx / Traefik 终止 TLS。
- 支持 `TRUST_PROXY`，但默认关闭。
- Docker secret / env file 不应进入镜像。
- request log 默认不记录 prompt / completion。
- Provider Key 在数据库中应支持加密存储。
- Managed Worker 的 server token 必须可撤销。
- `/metrics` 默认关闭或要求 token。
- 允许配置 IP allowlist 保护 Admin。

## 7.8 与 Local Runtime 的复用关系

| 能力 | Local Runtime | Server Runtime | 复用方式 |
|---|---|---|---|
| HTTP server | 127.0.0.1 | 0.0.0.0 / public URL | 共享 runtime server 包装层 |
| Config sync | 云端拉取 | Managed Worker 云端拉取 | 共享 RemoteConfigStore |
| Usage upload | 上传云端聚合 | Managed Worker 上传云端聚合 | 共享 batch uploader |
| Local SQLite | 是 | Standalone SQLite | 共享 SQLite store，schema 有差异 |
| Agent 自动配置 | 是 | 否 | 仅 Local 启用 |
| Admin UI | 否，打开云端 Admin | Standalone 可内置 | 复用 Next Admin |

## 8. Cloud Sync API

所有 Local Relay / Server Managed Worker 同步都由数据面主动发起。云端不主动连接本机或 VPS 节点。

## 8.1 设备绑定

### 创建设备码

```http
POST /api/local/devices/session
Authorization: Bearer <admin-key>
```

响应：

```json
{
  "deviceCode": "ABCD-EFGH",
  "userCode": "ABCD-EFGH",
  "verificationUrl": "https://example.vercel.app/admin/local-relay",
  "expiresAt": "2026-06-10T12:10:00.000Z"
}
```

### CLI 轮询设备码

```http
POST /api/local/devices/token
Content-Type: application/json
```

请求：

```json
{
  "deviceCode": "ABCD-EFGH",
  "deviceName": "Parsifal MacBook Pro",
  "platform": "darwin",
  "cliVersion": "0.1.0"
}
```

响应：

```json
{
  "deviceId": "dev_abc123",
  "deviceToken": "arl_dev_xxx",
  "cloudUrl": "https://example.vercel.app"
}
```

## 8.2 配置版本检查

```http
GET /api/local/config/version
Authorization: Bearer <device-token>
X-AI-Relay-Device: dev_abc123
```

响应：

```json
{
  "version": 42,
  "updatedAt": "2026-06-10T12:00:00.000Z"
}
```

## 8.3 配置快照拉取

```http
GET /api/local/config/snapshot?since=41
Authorization: Bearer <device-token>
X-AI-Relay-Device: dev_abc123
```

响应：

```json
{
  "version": 42,
  "generatedAt": "2026-06-10T12:00:00.000Z",
  "providers": {},
  "providerKeys": {},
  "keyVersions": {},
  "modelAliases": { "aliases": {}, "hidden": [] },
  "priorityRules": [],
  "fallbackChains": {}
}
```

如果配置无变化：

```http
304 Not Modified
```

## 8.4 Heartbeat

```http
POST /api/local/devices/heartbeat
Authorization: Bearer <device-token>
X-AI-Relay-Device: dev_abc123
Content-Type: application/json
```

请求：

```json
{
  "cliVersion": "0.1.0",
  "runtimeVersion": "2.12.0",
  "listen": "127.0.0.1:3147",
  "configVersion": 42,
  "status": "online",
  "agentAdapters": {
    "codex": "configured",
    "claude": "not_configured"
  }
}
```

## 8.5 Usage 上传

```http
POST /api/local/usage/batch
Authorization: Bearer <device-token>
X-AI-Relay-Device: dev_abc123
Idempotency-Key: usage_batch_xxx
Content-Type: application/json
```

请求：

```json
{
  "batchId": "batch_abc123",
  "events": [
    {
      "id": "evt_abc",
      "timestamp": "2026-06-10T12:00:00.000Z",
      "runtime": "local",
      "deviceId": "dev_abc123",
      "provider": "openai",
      "model": "gpt-5.4",
      "statusCode": 200,
      "promptTokens": 120,
      "completionTokens": 80,
      "latencyMs": 1340,
      "isStream": true
    }
  ]
}
```

响应：

```json
{
  "accepted": 1,
  "duplicates": 0
}
```

幂等要求：

- 云端按 `event.id` 或 `batchId + event.id` 去重。
- 本机只有收到成功响应后才标记 `uploaded_at`。
- 上传失败保留待上传队列。

## 9. 云端数据模型

可先使用现有 KV / D1，后续再迁移到 Postgres。

## 9.1 Device Registry

```typescript
interface LocalDevice {
  id: string;
  name: string;
  platform: 'darwin' | 'linux' | 'win32';
  status: 'online' | 'degraded' | 'offline' | 'revoked';
  tokenHash: string;
  cliVersion?: string;
  runtimeVersion?: string;
  listen?: string;
  configVersion?: string | number;
  agentAdapters?: Record<string, 'configured' | 'not_configured' | 'unknown'>;
  createdAt: string;
  lastSeenAt?: string;
  revokedAt?: string;
}
```

KV keys：

```text
local:device:{deviceId}
local:device-token:{tokenHash}
local:device-session:{deviceCode}
local:config:version
local:usage:dedupe:{eventId}
server:node:{serverId}
server:node-token:{tokenHash}
server:node-session:{serverCode}
```

D1 / SQL 表可选：

```sql
CREATE TABLE local_devices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  platform TEXT NOT NULL,
  status TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  cli_version TEXT,
  runtime_version TEXT,
  listen TEXT,
  config_version TEXT,
  created_at TEXT NOT NULL,
  last_seen_at TEXT,
  revoked_at TEXT
);

CREATE TABLE local_usage_events (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  prompt_tokens INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  latency_ms INTEGER DEFAULT 0,
  is_stream INTEGER DEFAULT 0
);

CREATE TABLE server_nodes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  public_url TEXT,
  region TEXT,
  version TEXT,
  config_version TEXT,
  created_at TEXT NOT NULL,
  last_seen_at TEXT,
  revoked_at TEXT
);
```

## 10. Agent Config Manager

## 10.1 Adapter 接口

```typescript
export interface AgentAdapter {
  id: 'codex' | 'claude' | 'openai-env';
  label: string;
  detect(): Promise<AgentDetectResult>;
  planInstall(options: AgentInstallOptions): Promise<AgentInstallPlan>;
  install(plan: AgentInstallPlan): Promise<AgentInstallResult>;
  doctor(): Promise<AgentDoctorResult>;
  uninstall(): Promise<AgentUninstallResult>;
}
```

## 10.2 文件写入保障

所有 adapter 必须通过统一 file operation 层：

```typescript
interface ManagedFileEdit {
  path: string;
  before?: string;
  after: string;
  backupPath: string;
  diff: string;
}
```

写入流程：

1. 读取原文件。
2. 生成新内容。
3. 生成 diff。
4. dry-run 直接输出 diff。
5. install 时创建备份。
6. 写入临时文件。
7. 原子 rename。
8. 写入 manifest。

Manifest：

```json
{
  "installedAt": "2026-06-10T12:00:00.000Z",
  "agent": "codex",
  "files": [
    {
      "path": "/Users/name/.codex/config.toml",
      "backupPath": "/Users/name/.ai-relay/backups/codex-config-20260610.toml"
    }
  ]
}
```

## 10.3 Codex Adapter

目标文件：

```text
~/.codex/config.toml
```

写入策略：

- 如果文件不存在，创建最小配置。
- 如果已存在，追加或更新 `ai-relay-local` provider block。
- 不删除用户已有 provider。
- 如果已有 `model_provider`，安装时提示是否切换；MVP 可默认只写 provider block，用户通过 flag 切换默认。

建议命令：

```bash
ai-relay agent install codex --set-default
ai-relay agent install codex --dry-run
```

配置片段：

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

Auth：

- MVP 可写入 Codex 期望的 OpenAI API key 来源。
- 如果 Codex 当前版本只支持环境变量，CLI 输出 shell env 或生成 `.env`。
- adapter doctor 需要验证实际生效方式。

## 10.4 Claude Code Adapter

MVP 采用 env 文件策略，避免直接修改用户 shell profile：

```text
~/.ai-relay/agents/claude.env
```

内容：

```bash
export ANTHROPIC_BASE_URL="http://127.0.0.1:3147"
export ANTHROPIC_AUTH_TOKEN="<local-relay-key>"
export ANTHROPIC_MODEL="claude-sonnet"
```

安装输出：

```bash
source ~/.ai-relay/agents/claude.env
claude
```

P1 再支持：

```bash
ai-relay agent install claude --write-shell-profile
```

## 10.5 OpenAI Env Adapter

输出通用环境变量：

```bash
export OPENAI_BASE_URL="http://127.0.0.1:3147/v1"
export OPENAI_API_KEY="<local-relay-key>"
```

用于 Cursor、脚本、OpenAI SDK、其他 OpenAI-compatible 工具。

## 11. 安全模型

## 11.1 MVP

MVP 安全模型：

```text
云端保存 Provider Key 明文或现有形式
Local Relay 使用 device token 拉取配置
本机配置文件保存 device token 和本机 relay key
Server Managed Worker 使用 server token 拉取配置
Server Standalone 使用本机数据库保存配置
```

必要控制：

- device token 只展示一次。
- 云端只保存 token hash。
- token 可撤销。
- 所有 sync API 校验 device token。
- 本机只监听 `127.0.0.1`，默认不监听 `0.0.0.0`。
- Server Runtime 如监听公网，必须配置 Relay API Key 和 Admin Key。
- Server Runtime 的 Admin UI 建议放在反向代理和 IP allowlist 后。
- request log 不记录 prompt / completion 全文。
- 错误日志脱敏 Authorization、api_key、x-api-key。

## 11.2 正式版

正式版引入端到端加密：

```text
Device public key -> 云端加密 Provider Keys
Device private key -> 本机 Keychain
Cloud -> 只保存密文
Local -> 拉取密文后本机解密
```

后续能力：

- 每台设备独立密钥
- 设备撤销后停止推送新密文
- Provider Key 轮换引导
- 迁移密钥备份 / 恢复
- Server Standalone 支持数据库字段级加密或外部 secret manager

## 12. 改造步骤

## Step 1：抽 ConfigStore 接口

目标：

- `providers/resolver.ts` 不再直接 import `admin-config.ts`
- `relay/key-pool.ts` 不再直接 import `admin-config.ts`

任务：

1. 新增 `ConfigStore` 类型。
2. 新增默认 store factory。
3. 先用 `VercelKVConfigStore` 包住现有 `admin-config.ts` 函数。
4. 在 resolver / key-pool 中通过 store 读取配置。
5. 保持现有测试通过。

## Step 2：抽共享 HTTP handler

目标：

- Next route 和 Local server 共用请求处理逻辑。

任务：

1. 把 `src/app/v1/chat/completions/route.ts` 中的平台无关逻辑抽到 shared handler。
2. 保留 Next route 作为 adapter。
3. 增加 local server 调用同一 handler。
4. 补 streaming 测试。

## Step 3：新增 Local Runtime

任务：

1. 新增 CLI entry。
2. 新增 local profile。
3. 新增 local HTTP server。
4. 新增 SQLite usage store。
5. 支持 `local start/status/doctor`。

## Step 4：新增 Cloud Sync API

任务：

1. 设备码创建与确认。
2. device token 签发与 hash 存储。
3. config version endpoint。
4. config snapshot endpoint。
5. heartbeat endpoint。
6. usage batch endpoint。

## Step 5：Agent Config Manager

任务：

1. 抽 agent adapter 接口。
2. 实现 file backup / diff / atomic write。
3. 实现 Codex adapter。
4. 实现 Claude Code env adapter。
5. 实现 OpenAI env adapter。
6. 实现 doctor / uninstall。

## Step 6：Server Runtime 预留

任务：

1. 在 Runtime Capability 中加入 `server`。
2. 让 shared HTTP handler 可被 long-running server 调用。
3. 预留 `ServerSQLiteConfigStore` 和 `ServerPostgresConfigStore` 接口。
4. 预留 Docker entrypoint 和 healthcheck。
5. 先不要求完整 Docker 发布，但避免 Local Runtime 写死 `localhost` 假设。

## Step 7：Admin UI

任务：

1. Local Relay 页面。
2. 设备列表。
3. 快速开始命令。
4. 设备撤销。
5. usage runtime/device 维度展示。
6. P1 增加 Server Nodes 页面。

## 13. 测试策略

## 13.1 单元测试

- ConfigStore snapshot merge
- Provider resolver 使用 injected config
- Key pool version refresh
- SQLite usage store idempotency
- Server runtime capability detection
- Agent config TOML patch
- File backup / restore
- Sensitive data redaction

## 13.2 集成测试

- Local server 启动后 `/health`
- Local server `/v1/models`
- Server runtime 启动后 `/health`
- Server runtime 使用 SQLite 完成一次 chat completion
- Chat completion non-stream
- Chat completion stream
- Config update 后本机热更新
- Usage 上传去重
- Device revoked 后同步失败
- Server node revoked 后同步失败

## 13.3 E2E 手测脚本

```bash
pnpm build
ai-relay login http://localhost:3000
ai-relay local start
curl http://127.0.0.1:3147/health
curl http://127.0.0.1:3147/v1/models -H "Authorization: Bearer <key>"
ai-relay agent install codex --dry-run
ai-relay agent install codex
ai-relay agent doctor codex
```

Server Runtime 手测脚本：

```bash
docker compose up -d
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3000/v1/models -H "Authorization: Bearer <key>"
```

## 14. 成本评估

| 阶段 | 范围 | 估算 |
|---|---|---|
| ConfigStore + shared handler | 架构边界抽象 | 4-7 天 |
| Local Runtime MVP | CLI、本机 server、SQLite、doctor | 5-8 天 |
| Cloud Sync API | device、config、heartbeat、usage | 5-8 天 |
| Agent 自动配置 MVP | Codex、Claude env、backup、doctor | 4-7 天 |
| Admin Local Relay 页 | 设备列表、快速开始、runtime usage | 3-5 天 |
| Server Runtime 预留 | capability、server adapter、Docker 设计、接口不落死 | 2-4 天 |

端到端 MVP 总体估算：

```text
2.5-4 周：单人高强度 / 已熟悉代码，包含 Server Runtime 架构预留
4-6 周：包含 Review、测试、文档、边界打磨
```

Mac App 正式产品化另计：

```text
2-4 周：菜单栏、开机启动、日志、打包
1-2 周：签名、公证、自动更新
1-2 周：Keychain / E2E 加密第一版
```

Server Runtime 正式产品化另计：

```text
1-2 周：Standalone SQLite + Docker Compose
1-2 周：Postgres 支持、迁移、备份文档
1 周：反向代理/TLS/metrics/healthcheck 文档与验证
```

## 15. 关键决策点

1. MVP 是否接受云端明文 key。
2. Local Runtime CLI 是否放在当前 Next.js repo，还是拆独立 package。
3. 本机 SQLite 依赖选择：`better-sqlite3`、`sqlite3`、还是纯文件 JSON 起步。
4. Codex adapter 是否默认切换全局 `model_provider`。
5. Claude adapter 是否允许修改 shell profile。
6. Local Relay 是否支持局域网访问。
7. usage 云端是否只存聚合，还是允许上传 request log 摘要。
8. Server Runtime 是先做 Standalone，还是先做 Managed Worker。
9. Docker 版默认用 SQLite 还是 Postgres。
10. Server Standalone 是否内置 Admin UI，还是只提供 API + 外部云端控制面。

## 16. 推荐 MVP 技术取舍

建议第一版采用以下保守方案：

- 不做 Mac App，先做 CLI。
- 不做端到端加密，先清楚标注安全边界。
- 不监听局域网，只监听 `127.0.0.1`。
- 不自动修改 shell profile，只生成 env 文件。
- Codex adapter 支持 dry-run，默认需要用户确认写入。
- Usage 只上传聚合和请求摘要，不上传 prompt / completion。
- 本机配置同步失败时继续使用最近一次成功配置。
- Server Runtime 只做架构预留，不进入 Local Relay MVP 主链路。
- 所有 shared handler、ConfigStore、UsageStore 都避免写死 Local-only 假设。

这样能最快验证核心问题：

> 用户是否愿意把本机 Agent 的 AI 请求切到 AI Relay Local，并继续用云端 Admin 管配置。

同时为下一阶段验证另一个问题留下空间：

> 团队和生产用户是否需要一个轻量 Docker/VPS 版，作为 new-api 这类重型自托管方案之外的选择。

## 17. 实现前资料校验

Agent 配置属于外部工具集成，字段和配置路径可能随版本变化。实现 adapter 前需要重新校验：

| 目标 | 需校验内容 | 参考入口 |
|---|---|---|
| Codex | `config.toml` 位置、自定义 `model_providers` 字段、认证方式、是否支持全局/项目级配置 | `https://developers.openai.com/codex/config-reference` |
| Codex | hooks、profiles、config override 是否影响本机 provider 切换 | `https://developers.openai.com/codex/config-advanced` |
| Claude Code | `ANTHROPIC_BASE_URL`、`ANTHROPIC_AUTH_TOKEN`、默认模型环境变量是否仍可用 | `https://docs.claude.com/en/docs/claude-code/settings` |

实现原则：

- 以官方文档和本机实际检测为准。
- adapter 内部保留版本检测与能力降级。
- 如果某个 Agent 的自动写入不稳定，MVP 降级为生成配置片段和 doctor 检查。
