# AI Relay CLI 使用指南

## 快速开始

### 安装

```bash
# 全局安装
npm link

# 验证
airelay --help
```

### 基本用法

```bash
# 方式 1: 云端配置（推荐）
airelay login https://cfairelay.izmw.me
airelay local:start

# 方式 2: 本地配置文件
airelay local:start --config ./relay-config.json

# 方式 3: 环境变量
export RELAY_CLOUD_URL="https://cfairelay.izmw.me"
airelay local:start

# 方式 4: 自定义端口和主机
airelay local:start --port 3000 --host localhost
# ⚠️ 警告：使用 --host 0.0.0.0 会暴露到公网，仅在安全网络环境下使用
```

## 配置方式

### 云端配置

最简单的方式，所有配置从云端同步：

```bash
# 1. 创建 profile
mkdir -p ~/.airelay
cat > ~/.airelay/config.json << 'INNER_EOF'
{
  "cloudUrl": "https://cfairelay.izmw.me",
  "deviceName": "my-laptop",
  "listenHost": "127.0.0.1",
  "listenPort": 8787
}
INNER_EOF

# 2. 启动
airelay local:start
```

### 本地文件配置

```bash
# 创建配置文件
cat > relay-config.json << 'INNER_EOF'
{
  "version": 1,
  "providers": {
    "openai": {
      "name": "OpenAI",
      "apiKeys": ["sk-..."],
      "baseUrl": "https://api.openai.com"
    },
    "anthropic": {
      "name": "Anthropic",
      "apiKeys": ["sk-ant-..."],
      "baseUrl": "https://api.anthropic.com"
    }
  }
}
INNER_EOF

# 启动
airelay local:start --config ./relay-config.json
```

### 环境变量配置

```bash
# 设置 keys（自动发现所有 XXX_KEYS）
export OPENAI_KEYS="sk-xxx"
export OPENAI_BASE_URL="https://api.openai.com"  # 可选

export CLAUDE_KEYS="sk-ant-xxx"
export DEEPSEEK_KEYS="sk-deepseek-xxx"

# 启动（自动发现所有 provider）
airelay local:start
```

### 混合模式

```bash
# 云端基础配置 + 本地覆盖
export RELAY_CLOUD_URL="https://cfairelay.izmw.me"
airelay local:start --config ./local-overrides.json
```

## 验证

```bash
# 健康检查
curl http://localhost:8787/health

# 获取模型列表
curl http://localhost:8787/v1/models

# 测试 OpenAI 接口
curl http://localhost:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer any-key" \
  -d '{"model":"gpt-4","messages":[{"role":"user","content":"hi"}]}'

# 测试 Anthropic 接口
curl http://localhost:8787/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: any-key" \
  -H "anthropic-version: 2023-06-01" \
  -d '{"model":"claude-opus-4-8","messages":[{"role":"user","content":"hi"}],"max_tokens":1024}'
```

## 故障排查

### 问题 1: command not found: airelay

```bash
# 检查 npm global bin 目录
npm config get prefix

# 添加到 PATH
export PATH="$(npm config get prefix)/bin:$PATH"
```

### 问题 2: tsx 未安装

```bash
npm install -g tsx
```

### 问题 3: 端口被占用

```bash
airelay local:start --port 3000
```

### 问题 4: 无法连接云端

```bash
# 测试网络
curl https://cfairelay.izmw.me/health

# 检查配置
cat ~/.airelay/config.json
```

## 卸载

```bash
npm unlink -g airelay
```

## 开发者模式

```bash
# 本地开发（修改代码后立即生效）
npm link

# 测试
airelay local:start

# 取消链接
npm unlink -g airelay
```

## Shell 自动补全

安装后可以启用命令自动补全，按 Tab 键自动提示：

### Bash

```bash
# 临时启用（当前会话）
source cli/completions.sh

# 永久启用
echo "source $(pwd)/cli/completions.sh" >> ~/.bashrc
source ~/.bashrc
```

### Zsh

```bash
# 临时启用（当前会话）
source cli/completions.zsh

# 永久启用
echo "source $(pwd)/cli/completions.zsh" >> ~/.zshrc
source ~/.zshrc
```

### 使用效果

```bash
# 输入 aire 然后按 Tab
airelay

# 输入 airelay 然后按 Tab，显示所有命令
airelay [Tab]
login  local  local:start  local:status  agent:install  ...

# 输入 airelay local: 然后按 Tab
airelay local:[Tab]
local:start  local:status
```

现在输入 `aire` + Tab 就可以自动补全了！
