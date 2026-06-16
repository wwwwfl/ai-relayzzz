# ❓ 常见问题 (FAQ)

使用 AI Relay 过程中遇到的问题及解决方案。

---

## 部署相关

### Cloudflare 部署后 Admin 登录报 "Invalid API key"

**症状：** 部署到 Cloudflare Pages 后，访问 `/admin` 登录时提示 `Invalid API key`。

**原因：** `RELAY_ADMIN_KEY` 没有正确同步到 Cloudflare。

**解决方案：**

1. **确认 GitHub Secrets 已配置**
   - 进入你的 Fork 仓库 → **Settings → Secrets and variables → Actions**
   - 确认 `RELAY_ADMIN_KEY` 存在于 **Repository secrets**（不是 Environment secrets）

2. **手动触发 Workflow 同步**
   - 进入仓库 → **Actions** → 选择 "Deploy to Cloudflare Pages" → 点击 **Run workflow**
   - 等待 workflow 完成，它会自动把 Secrets 同步到 Cloudflare

3. **验证**
   - workflow 完成后访问你的 Cloudflare Pages 地址
   - 用 `RELAY_ADMIN_KEY` 的值登录 admin 后台

**注意事项：**
- `RELAY_ADMIN_KEY` 是可选的，未设置时会回退到 `RELAY_API_KEY`
- Key 建议使用字母、数字、短横线，避免特殊字符和空格
- 修改 Secret 后必须重新触发 workflow 才会生效

> 相关 Issue：[#22](https://github.com/MoyuFamily/ai-relay/issues/22)

---

### Vercel 部署后访问 404

**症状：** Vercel 部署成功，但访问域名显示 404。

**解决方案：**
1. 检查 Vercel 项目的 **Settings → Build & Development Settings**
2. 确认 **Framework Preset** 为 `Next.js`
3. 确认 **Build Command** 为 `pnpm build`
4. 确认 **Output Directory** 为 `.next`

---

## 使用相关

### 请求返回 401 Unauthorized

**症状：** 调用 API 时返回 `401 Unauthorized`。

**原因：** 请求头中的 API Key 不正确或未提供。

**解决方案：**
1. 确认请求头格式：`Authorization: Bearer <your-api-key>`
2. 确认使用的 Key 与环境变量 `RELAY_API_KEY` 一致
3. 如果配置了多个 Key（逗号分隔），确认使用的是其中一个

---

### 模型请求失败

**症状：** 调用特定模型时返回错误。

**解决方案：**
1. 确认对应的 Provider Key 已配置（如 `OPENAI_KEYS`、`CLAUDE_KEYS`）
2. 在 Admin 后台检查 Key 状态和余额
3. 查看请求日志获取详细错误信息

---

## 配置相关

### 如何配置多个 API Key？

在环境变量中用英文逗号分隔：

```
RELAY_API_KEY=key1,key2,key3
```

### 如何设置每日/每月请求限制？

配置以下环境变量：

```
RELAY_DAILY_LIMIT=1000      # 每日请求上限
RELAY_MONTHLY_LIMIT=30000   # 每月请求上限
```

---

## 本地 Relay 相关

### airelay 命令找不到

**症状：** 运行 `airelay` 提示 `command not found`。

**解决方案：**
1. 确认已执行 `npm link`（在 ai-relay 项目根目录下）
2. 检查 npm 全局 bin 目录是否在 PATH 中：`npm bin -g`
3. 如果使用 zsh，确认没有 alias 冲突：`which airelay`

---

### 本地 Relay 启动后无法连接

**症状：** `airelay local:start` 启动成功，但请求返回连接错误。

**解决方案：**
1. 确认本地服务正在运行：`curl http://localhost:8787/health`
2. 检查端口是否被占用：`lsof -i :8787`
3. 如果使用 `--host 0.0.0.0`，检查防火墙设置
4. 确认 Provider Keys 已配置（云端同步或环境变量）

---

### 本地 Relay 与云端配置如何同步？

**方案：** 使用 `airelay login` 命令登录云端，本地启动时会自动拉取最新配置。

```bash
airelay login https://你的项目.vercel.app
airelay local:start  # 自动从云端同步 Provider、Routing 等配置
```

如果只想覆盖部分配置（混合模式），可以用 `--config` 参数叠加本地文件：
```bash
export RELAY_CLOUD_URL="https://你的项目.vercel.app"
airelay local:start --config ./local-overrides.json
```

---

### 本地 Relay 支持哪些 Provider？

与云端完全一致：OpenAI、Claude、DeepSeek、MiMo 及任何 OpenAI 兼容的自定义 Provider。配置方式不变，只是运行环境从云端变为本地。

---

## 其他问题

如果以上内容没有解决你的问题，请：

1. 查看 [GitHub Issues](https://github.com/MoyuFamily/ai-relay/issues) 是否有人遇到过类似问题
2. 提交新的 Issue，附上：
   - 部署方式（Vercel / Cloudflare / 本地）
   - 错误信息或截图
   - 相关日志
