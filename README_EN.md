<div align="center">

<img src="docs/assets/logo-banner.svg" alt="AI Relay" width="400">

**Your personal AI API gateway — deploy to cloud or run locally, one endpoint for all LLM providers**

<p>
  <a href="https://vercel.com/new/clone?repository-url=https://github.com/MoyuFamily/ai-relay&env=RELAY_API_KEY,RELAY_ADMIN_KEY,RELAY_SIGNING_SECRET&envDescription=API%20authentication%20keys%20(required%20for%20security)&envLink=https://github.com/MoyuFamily/ai-relay#-quick-start">
    <img src="https://vercel.com/button" alt="Deploy with Vercel" height="36">
  </a>
  &nbsp;
  <a href="#-deploy-to-cloudflare-pages">
    <img src="https://img.shields.io/badge/⚡_Deploy_to_Cloudflare-F38020?style=for-the-badge&logo=cloudflare&logoColor=white" alt="Deploy to Cloudflare" height="36">
  </a>
  &nbsp;
  <a href="#-run-locally-cli">
    <img src="https://img.shields.io/badge/💻_Run_Locally-000?style=for-the-badge&logo=terminal&logoColor=white" alt="Run locally" height="36">
  </a>
</p>

[![Version](https://img.shields.io/badge/Version-2.13.0-green.svg)](CHANGELOG.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[English](README_EN.md) · [中文](README.md)

</div>

---

> **One gateway for all your AI APIs.**
>
> Unify OpenAI, Claude, DeepSeek and more behind a single endpoint.
> Automatic key rotation, failover, and circuit breaking — no glue code needed.
>
> Three ways to run, pick what fits:
> - ☁️ **Vercel / Cloudflare** — live in 2 minutes, zero servers
> - 💻 **Local CLI** — `airelay local:start`, no cloud quota consumed
> - 🔧 **Dev mode** — `npm run dev`, edit and iterate

### Who should use which?

| | ☁️ Vercel | ☁️ Cloudflare | 💻 Local CLI |
|---|---|---|---|
| **Best for** | Light users, quick tryout | Heavy coding users | Agent / multimodal / power users |
| **Monthly volume** | Low-mid (< 500M tokens/month) | High frequency (daily coding sessions) | Unlimited, depends on network bandwidth |
| **Token stats** | Sampling-based (configurable rate) | Sampling-based (CF CPU budget) | **Precise** (SQLite per-request logging) |
| **Runtime** | Edge Serverless, cold start < 50ms | Edge Worker, global distribution | Persistent local process, no cold start |
| **Storage** | Upstash Redis (KV) | Cloudflare D1 + KV | Local SQLite |
| **Typical use** | Personal chat, light API relay | Copilot / Cursor high-freq coding | Codex / Claude Code local agent, large image/video multimodal, local key storage |
| **Key limit** | Free tier has traffic and storage caps; high-freq or multimodal usage will hit limits | CF Worker CPU time limited, long responses need optimization | Must keep process running yourself |

> **⚠️ Vercel Hobby usage guidance:**
> - **Good fit**: Personal chat, light API relay, dev/debugging phase
> - **Not ideal**: High-frequency coding calls (e.g. Copilot/Cursor continuous use), large image/video multimodal, long reasoning tasks
> - Free-tier storage and traffic are limited; the project provides usage sampling and multi-key rotation settings to help — all adjustable from the admin dashboard
>
> Heavy coding users should go directly with Cloudflare. Agent and multimodal users should use Local CLI.

> **TL;DR:** Start with Vercel to try it out. Switch to Cloudflare for heavy coding. Go local CLI for agents and multimodal. All three share the same config and API — migrate anytime.

## 🎯 Why AI Relay?

| | |
|---|---|
| **Serverless** | No server, no Docker, no ops — deploy to Vercel / Cloudflare in 2 minutes |
| **Zero cost to start** | Runs on free tiers — personal devs pay nothing |
| **One endpoint, drop-in** | Compatible with OpenAI SDK — just change `base_url`, zero code changes |
| **Multi-key, multi-provider** | Automatic rotation, failover, circuit breaking — built-in resilience |
| **Three deployment modes** | Cloud serverless / local CLI / dev mode — same config, same API |

## 🚀 Quick Start

### ☁️ Deploy to Vercel (recommended for new users)

> Prerequisites: [Vercel account](https://vercel.com/signup) (free) + at least one AI provider API key

1. Click **Deploy with Vercel** above, fill in 3 environment variables:

| Variable | Description |
|----------|-------------|
| `RELAY_API_KEY` | Client authentication key (use a strong password) |
| `RELAY_ADMIN_KEY` | Admin dashboard login key (can be same as above) |
| `RELAY_SIGNING_SECRET` | Temp key signing secret (can be same as above) |

2. After deploy, go to Vercel Dashboard → **Storage** → Create **Upstash for Redis** (Free tier) → Connect to project
3. Access the Admin dashboard to add Provider keys, then start calling:

```bash
curl -X POST https://your-project.vercel.app/v1/chat/completions \
  -H "Authorization: Bearer YOUR_R...KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt-5.4", "messages": [{"role": "user", "content": "Hello!"}]}'
```

<details>
<summary><strong>☁️ Deploy to Cloudflare Pages</strong></summary>

**Prerequisites:** [Cloudflare account](https://dash.cloudflare.com/sign-up) (free) + GitHub repo

> ⚠️ You must configure GitHub Secrets first, or the deploy will fail.

**Step 1 — Fork and configure GitHub Secrets**

Go to **Settings → Secrets and variables → Actions → Repository secrets** and add:

| Secret | Description | Required |
|--------|-------------|----------|
| `CLOUDFLARE_API_TOKEN` | CF API Token (Pages:Edit + D1:Edit + KV:Edit) | ✅ |
| `CLOUDFLARE_ACCOUNT_ID` | CF Account ID | ✅ |
| `RELAY_API_KEY` | Client auth key | ✅ |
| `RELAY_ADMIN_KEY` | Admin login key (optional, defaults to API key) | ⬜ |
| `RELAY_SIGNING_SECRET` | Temp key signing secret (optional) | ⬜ |

<details>
<summary>How to get a Cloudflare API Token</summary>

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens)
2. Click **Create Token** → **Create Custom Token**
3. Permissions: Account → Cloudflare Pages / D1 / Workers KV Storage → Edit
4. Copy the token

</details>

**Step 2 — Push to deploy**

Push to `main` — GitHub Actions auto-handles: D1 setup → KV creation → build → deploy → env config.

**Step 3 — Verify**

```bash
curl https://your-project.pages.dev/health
# → {"status":"ok"}
```

> **Storage:** CF uses D1 (usage stats) + KV (config). Free tier supports ~30-50K requests/day.

</details>

<details>
<summary><strong>💻 Run Locally (CLI)</strong></summary>

Beyond cloud deploy, AI Relay provides a local CLI to run a lightweight relay on your machine — no cloud quota consumed.

> 📖 Full docs: [CLI_GUIDE.md](CLI_GUIDE.md)

```bash
# 1. Clone and install
git clone https://github.com/MoyuFamily/ai-relay.git && cd ai-relay && pnpm install

# 2. Install CLI globally
npm link

# 3. Start (4 config options supported)
airelay local:start                              # local config file
airelay local:start --config ./relay-config.json  # specify config file
export OPENAI_KEYS="sk-xxx" && airelay local:start  # environment variables
airelay login https://your-project.vercel.app && airelay local:start  # sync from cloud
```

**Use cases:** Local dev/debug · Intranet environments · Quick provider testing · CI/CD integration

</details>

<details>
<summary><strong>🔧 Local Development (Web App)</strong></summary>

```bash
git clone https://github.com/MoyuFamily/ai-relay.git && cd ai-relay
npm install
cp .env.local.example .env.local
# Edit .env.local with your API keys
npm run dev  # http://localhost:3000
```

</details>

## ✨ Core Capabilities

**Routing & Resilience**
| Feature | Description |
|---------|-------------|
| Multi-provider routing | OpenAI · Claude · DeepSeek · MiMo · Custom — single endpoint |
| Multi-key rotation | Round-robin + 429 auto-backoff, single key failure doesn't affect service |
| Multi-level fallback | Provider → Key chain failover with configurable recovery |
| Circuit breaker | Auto-remove failing providers, auto-restore when recovered |
| Smart routing | Latency / cost / availability priority, auto-select optimal provider |

**Protocol & Compatibility**
| Feature | Description |
|---------|-------------|
| OpenAI compatible | `/v1/chat/completions` · `/v1/responses` · SSE streaming — use OpenAI SDK directly |
| Anthropic native | `/v1/messages` endpoint — Claude clients connect without conversion |
| Virtual model mapping | Route virtual model names to real providers, swap underlying models on demand |

**Management & Monitoring**
| Feature | Description |
|---------|-------------|
| Admin dashboard | Web UI for key management, quota config, usage stats, model testing |
| Provider wizard | 3-step creation: pick template → add key → test & save |
| Model aliases | CSV import/export, inline edit, model visibility control |
| Request logs | Real-time request tracing with memory / KV / Postgres backends |

**Security & Notifications**
| Feature | Description |
|---------|-------------|
| Temp API keys | HMAC-SHA256 stateless signing, auto-expiring — perfect for CI/CD |
| Key security | Masked display, health monitoring, rotation alerts, audit logs |
| Webhook alerts | WeCom / Feishu / DingTalk / Slack — daily reports + threshold alerts |

**Deployment & Ops**
| Feature | Description |
|---------|-------------|
| Zero servers | Vercel Edge Runtime / Cloudflare Workers — global edge, < 50ms latency |
| Dual platform | Vercel one-click; Cloudflare via GitHub Actions push-to-deploy |
| Local CLI | `airelay local:start` — same config, same API, no cloud quota used |
| Usage sampling | Configurable sample rate for high-concurrency scenarios |

## 🏗️ Architecture

```
                  ┌─────────────────────────────────────────┐
                  │           AI Relay Gateway               │
                  ├─────────────────────────────────────────┤
  Client ────────▶│  Edge Runtime                           │
  (OpenAI SDK)    │    ├─ Circuit breaker + Fallback chain  │
                  │    ├─ Key rotation (Round-robin + 429)  │
                  │    ├─ Smart routing (latency/cost/avail)│
                  │    └─ Protocol bridge (OpenAI ↔ Anthropic)│
                  ├──────────┬──────────┬───────────────────┤
                  │  Vercel  │   CF     │  Local CLI         │
                  │  Edge    │  Workers │  (airelay start)   │
                  │  + Redis │  + D1+KV │  + SQLite/KV      │
                  └──────────┴──────────┴───────────────────┘
                    ▼           ▼           ▼
                  OpenAI    Claude    DeepSeek    Custom ...
```

## 📖 Usage

### OpenAI SDK

```python
from openai import OpenAI

client = OpenAI(
    api_key="YOUR_RELAY_API_KEY",
    base_url="https://your-project.vercel.app/v1"
)

# Standard call
response = client.chat.completions.create(
    model="gpt-5.4",
    messages=[{"role": "user", "content": "Hello!"}]
)

# Streaming
stream = client.chat.completions.create(
    model="gpt-5.4",
    messages=[{"role": "user", "content": "Tell me a story"}],
    stream=True
)
for chunk in stream:
    print(chunk.choices[0].delta.content or "", end="")
```

### Claude / Anthropic Messages API

```bash
curl -X POST https://your-project.vercel.app/v1/messages \
  -H "x-api-key: YOUR_RELAY_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### Responses API

```bash
curl -X POST https://your-project.vercel.app/v1/responses \
  -H "Authorization: Bearer YOUR_R...KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt-5.4", "input": "Hello!", "stream": true}'
```

> Responses API currently only supports OpenAI-format providers.

## 🏁 Comparison

| | AI Relay | OneAPI / new-api | FastGPT | OpenRouter |
|---|---|---|---|---|
| **Deploy** | One-click (Vercel / CF / Local CLI) | Self-hosted (Docker) | Self-hosted (Docker) | SaaS only |
| **Server cost** | **Zero** (free tier works) | Needs server | Needs server | Pay per use |
| **Key differentiator** | Edge latency + circuit breaker + local CLI | Multi-key mgmt | Knowledge base + API | API marketplace |

**Choose AI Relay when:** You want a self-controlled AI API gateway without servers, Docker, or ops overhead.

## 🔧 Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `RELAY_API_KEY` | Client auth key (comma-separated for multiple) | ✅ |
| `RELAY_ADMIN_KEY` | Admin login key (falls back to `RELAY_API_KEY`) | ⬜ |
| `RELAY_SIGNING_SECRET` | Temp key signing secret | ⬜ |
| `OPENAI_KEYS` | OpenAI API Keys | ⬜ |
| `CLAUDE_KEYS` | Anthropic API Keys | ⬜ |
| `DEEPSEEK_KEYS` | DeepSeek API Keys | ⬜ |
| `RELAY_UPSTREAM_TIMEOUT_MS` | Upstream timeout (default 50000, 0 to disable) | ⬜ |
| `RELAY_KV_USAGE_SAMPLE_RATE` | Usage sampling rate (default 1, 0.1 = 10% sample) | ⬜ |

> Provider keys are recommended to be configured via Admin dashboard (stored in Redis), not environment variables.

### Supported Providers

| Provider | Example Models | Status |
|----------|---------------|--------|
| OpenAI | gpt-5.4, gpt-5.4-mini | ✅ Built-in |
| Anthropic (Claude) | claude-sonnet-4-6, claude-opus-4-7 | ✅ Built-in |
| DeepSeek | deepseek-v4-flash, deepseek-v4-pro | ✅ Built-in |
| MiMo | mimo-v2.5, mimo-v2.5-pro | ✅ Built-in |
| Custom | Any OpenAI-compatible API | ✅ Configurable |

## 📊 Admin Dashboard

Access `/admin` with `RELAY_ADMIN_KEY`:

- **Provider Keys** — Key management + connectivity testing
- **Routing Policy** — Priority rules + Fallback Chain, drag-to-reorder
- **Usage Monitor** — Date range, provider filter, trend charts
- **Model Testing** — Test specific model connectivity and responses
- **Notifications** — Webhook push, alert thresholds, daily reports

<details>
<summary>View screenshots</summary>

![Overview](docs/assets/screenshots/admin-overview.png)
![Key Management](docs/assets/screenshots/admin-keys.png)
![Tools](docs/assets/screenshots/admin-tools.png)

</details>

## 🎯 Use Cases

- **Multi-key consolidation** — Unify scattered OpenAI / Claude / DeepSeek keys behind one endpoint
- **Agent / IDE integration** — Codex, Claude Code, Cursor → local relay, low latency, no cloud quota
- **Team sharing** — Shared relay instance, quota management, admin visibility
- **CI/CD integration** — HMAC temp keys, auto-expiring, no cleanup needed
- **Cost optimization** — Route by model/task to different providers, virtual model mapping

## 📢 Notifications & Alerts

Supports WeCom / Feishu / DingTalk / Slack / Generic Webhook.

- **Daily reports** — Cron-scheduled with daily totals, per-provider breakdown, day-over-day comparison
- **Threshold alerts** — Per-provider or global request/token volume thresholds

Configure: Admin → Notification Settings → Add Webhook → Enable

## 🤝 Contributing

1. Fork → Create branch → Commit → Push → Open Pull Request

See [Release Flow](docs/RELEASE-FLOW.md): changes merge to `pre-release` first, then `main` after verification.

## 🙏 Acknowledgments

- [OpenRouter](https://openrouter.ai) · [OneAPI](https://github.com/songquanpeng/one-api) · [new-api](https://github.com/Calcium-Ion/new-api) · [FastGPT](https://github.com/labring/FastGPT)
- [Vercel](https://vercel.com) · [OpenAI](https://platform.openai.com) · [Linux Do](https://linux.do/)

## ❓ FAQ

See [FAQ](docs/FAQ.md) for deployment, configuration, and local relay issues.

## 📝 Changelog

See [CHANGELOG.md](CHANGELOG.md).

## 📄 License

MIT — [LICENSE](LICENSE)

## 👥 Team

| | Name | Role |
|---|---|---|
| <img src="https://avatars.githubusercontent.com/u/7930911?v=4" width="28" height="28" style="border-radius:50%"> | Parsifal | Founder & Project Lead |
| <img src="https://avatars.githubusercontent.com/u/286714101?v=4" width="28" height="28" style="border-radius:50%"> | 小赫 (Xiaohe) | Coordinator |
| <img src="https://avatars.githubusercontent.com/u/286719582?v=4" width="28" height="28" style="border-radius:50%"> | 像素姐 (Pixel) | Design Director |
| <img src="https://avatars.githubusercontent.com/u/286715358?v=4" width="28" height="28" style="border-radius:50%"> | 码飞 (Mafei) | Tech Director |
| <img src="https://avatars.githubusercontent.com/u/286716759?v=4" width="28" height="28" style="border-radius:50%"> | 饼哥 (Bingge) | Product Director |
