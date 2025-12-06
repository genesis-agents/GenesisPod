# Claude Code 多模式启动器

让 Claude Code 订阅用户在额度用完时，无缝切换到 Gemini/OpenAI API。

## 工作原理

```
┌─────────────────────────────────────────────────────────────┐
│                     Claude Code                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   订阅模式 (cc)              API 模式 (cc-api)               │
│   ┌─────────────┐            ┌─────────────┐                │
│   │ Claude      │            │ LiteLLM     │                │
│   │ Pro/Max     │            │ Proxy       │                │
│   │ 订阅        │            │ :4000       │                │
│   └─────────────┘            └──────┬──────┘                │
│                                     │                        │
│                          ┌──────────┼──────────┐            │
│                          ▼          ▼          ▼            │
│                    ┌─────────┐ ┌─────────┐ ┌─────────┐      │
│                    │ Gemini  │ │ OpenAI  │ │ 其他    │      │
│                    │ 2.5 Pro │ │ GPT-4o  │ │ ...     │      │
│                    └─────────┘ └─────────┘ └─────────┘      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## 快速开始

### 1. 安装 LiteLLM

```powershell
pip install "litellm[proxy]"
```

### 2. 配置 API 密钥

```powershell
cd D:\projects\deepdive\litellm-proxy
cp .env.example .env
notepad .env  # 填入你的 API 密钥
```

需要的密钥：

- **OPENAI_API_KEY**: [OpenAI Platform](https://platform.openai.com/api-keys)
- **GOOGLE_API_KEY**: [Google AI Studio](https://aistudio.google.com/app/apikey)

### 3. 安装快捷命令

```powershell
.\install.ps1
. $PROFILE  # 重新加载配置
```

### 4. 使用

```powershell
# 订阅模式 - 使用 Claude Pro/Max 订阅
cc

# API 模式 - 订阅额度用完时使用
cc-api              # 默认使用 Gemini 2.5 Pro
cc-api gpt          # 使用 OpenAI GPT-4o
cc-api o1           # 使用 OpenAI o1
```

## 支持的模型

### API 模式下可用的模型

| 模型名称         | 提供商 | 说明                    |
| ---------------- | ------ | ----------------------- |
| gemini-2.5-pro   | Google | Gemini 2.5 Pro (默认)   |
| gemini-2.5-flash | Google | Gemini 2.5 Flash (快速) |
| gemini-2.0-flash | Google | Gemini 2.0 Flash        |
| gemini-1.5-pro   | Google | Gemini 1.5 Pro          |
| gpt-4o           | OpenAI | GPT-4o 最新版           |
| gpt-4o-mini      | OpenAI | GPT-4o Mini (便宜)      |
| o1               | OpenAI | OpenAI o1 (推理)        |
| o1-mini          | OpenAI | OpenAI o1-mini          |
| o3-mini          | OpenAI | OpenAI o3-mini          |

## 文件结构

```
litellm-proxy/
├── config.yaml       # LiteLLM 模型配置
├── .env.example      # API 密钥模板
├── .env              # 实际的 API 密钥 (你需要创建)
├── start.ps1         # LiteLLM 代理启动脚本
├── start.bat         # CMD 版启动脚本
├── claude-code.ps1   # 模式切换主脚本
├── claude-code.bat   # CMD 版模式切换
├── install.ps1       # 快捷命令安装器
└── README.md         # 本文档
```

## 手动使用 (不安装快捷命令)

```powershell
cd D:\projects\deepdive\litellm-proxy

# 订阅模式
.\claude-code.ps1

# API 模式
.\claude-code.ps1 -api
.\claude-code.ps1 -api -model gpt
```

## 故障排除

### 问题: API 模式连接失败

1. 确保 LiteLLM 代理正在运行 (`cc-start-proxy`)
2. 检查 `.env` 中的 API 密钥是否正确
3. 确认防火墙未阻止 4000 端口

### 问题: 模型响应异常

- Claude Code 针对 Claude 优化，其他模型可能在某些功能上表现不同
- 建议优先使用 Gemini 2.5 Pro，它的能力最接近 Claude

### 验证 LiteLLM 状态

```powershell
# 检查健康状态
curl http://localhost:4000/health

# 查看可用模型
curl http://localhost:4000/models
```

## 注意事项

- 订阅模式和 API 模式是**互斥**的，同一终端只能用一种
- API 模式会产生 Gemini/OpenAI 的费用
- `.env` 文件包含敏感密钥，请勿提交到版本控制
