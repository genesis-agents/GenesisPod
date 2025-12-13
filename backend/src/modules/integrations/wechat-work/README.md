# 企业微信机器人集成指南

本模块实现了企业微信自建应用的消息接收和回复功能，可以将 DeepDive 的 AI 分析能力接入到企业微信群聊中。

## 功能特性

- 接收企业微信群/私聊消息
- 通过 @AI 触发 AI 分析
- 自动分析链接内容
- 支持文本和 Markdown 回复
- 消息加解密（安全模式）

## 配置步骤

### 1. 注册企业微信

如果还没有企业微信，访问 https://work.weixin.qq.com/ 注册。个人也可以注册企业微信。

### 2. 创建自建应用

1. 登录 [企业微信管理后台](https://work.weixin.qq.com/wework_admin/frame)
2. 进入 **应用管理** → **自建** → **创建应用**
3. 填写应用信息：
   - 应用名称：DeepDive AI 助手
   - 应用 logo：上传图标
   - 可见范围：选择需要使用的部门/成员

### 3. 获取配置信息

创建应用后，记录以下信息：

| 配置项            | 获取位置                               |
| ----------------- | -------------------------------------- |
| CorpID (企业ID)   | 企业微信管理后台 → 我的企业 → 企业信息 |
| AgentId (应用ID)  | 应用管理 → 自建应用 → 应用详情页       |
| Secret (应用密钥) | 应用管理 → 自建应用 → 应用详情页       |

### 4. 配置接收消息

1. 在应用详情页，找到 **接收消息** → **设置API接收**
2. 填写以下信息：
   - **URL**: `https://your-domain.com/api/v1/wechat-work/callback`
   - **Token**: 自定义一个字符串（用于签名验证）
   - **EncodingAESKey**: 点击随机生成

3. 点击保存，企业微信会发送验证请求到你的服务器

### 5. 配置环境变量

在 `.env` 文件中添加以下配置：

```bash
# 企业微信配置
WECHAT_WORK_CORP_ID=ww1234567890abcdef      # 企业ID
WECHAT_WORK_AGENT_ID=1000001                 # 应用AgentId
WECHAT_WORK_SECRET=xxxxxxxxxxxxxxxxxxxxxxx   # 应用Secret
WECHAT_WORK_TOKEN=your_custom_token          # 回调Token
WECHAT_WORK_ENCODING_AES_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx  # EncodingAESKey (43位)
```

### 6. 配置可信域名（生产环境）

1. 在应用详情页，配置 **网页授权及JS-SDK** 的可信域名
2. 上传域名验证文件到服务器根目录

### 7. 将应用添加到群聊

1. 在企业微信客户端，打开群聊设置
2. 点击 **群机器人** → **添加**
3. 选择你创建的自建应用

## 使用方法

### 触发 AI 分析

在群聊或私聊中，使用以下方式触发 AI：

```
@AI 什么是人工智能？
@AI https://example.com/article
/分析 这篇文章讲了什么？
/总结 帮我总结以下内容...
/翻译 Hello World
```

### 自动分析链接

直接发送链接，机器人会自动分析链接内容并返回摘要。

## API 接口

### 健康检查

```
GET /api/v1/wechat-work/health
```

返回示例：

```json
{
  "status": "ready",
  "corpId": "ww12****",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### 主动发送消息（内部调用）

```
POST /api/v1/wechat-work/send
Content-Type: application/json

{
  "toUser": "user_id",
  "msgType": "text",
  "content": "Hello!"
}
```

支持的消息类型：

- `text`: 纯文本
- `markdown`: Markdown 格式
- `textcard`: 卡片消息（需要 title, description, url）

## 架构说明

```
用户消息 → 企业微信服务器 → Webhook回调
                              ↓
                    WechatWorkController (验证签名、解密)
                              ↓
                    WechatWorkService (消息处理)
                              ↓
                    AiChatService (AI分析)
                              ↓
                    企业微信API (发送回复)
```

## 文件结构

```
wechat-work/
├── wechat-work.module.ts        # 模块定义
├── wechat-work.controller.ts    # 回调控制器
├── wechat-work.service.ts       # 消息处理服务
├── wechat-work-crypto.service.ts # 加解密服务
└── README.md                    # 本文档
```

## 注意事项

1. **5秒响应限制**: 企业微信要求 5 秒内响应，否则会重试。本模块采用异步处理，先返回 `success`，再异步处理消息。

2. **消息重试**: 如果处理失败，企业微信可能会重发消息。建议实现消息去重逻辑。

3. **IP 白名单**: 生产环境需要将服务器 IP 添加到企业微信的可信 IP 列表。

4. **HTTPS**: 生产环境必须使用 HTTPS。

## 常见问题

### Q: 验证 URL 失败怎么办？

1. 检查服务是否启动并可访问
2. 确认 Token 和 EncodingAESKey 配置正确
3. 查看服务日志，确认收到验证请求

### Q: 消息收不到怎么办？

1. 检查应用是否已添加到群聊
2. 确认用户在应用的可见范围内
3. 检查服务器防火墙是否开放

### Q: AI 回复失败怎么办？

1. 确认 AI 模型已配置并启用
2. 检查 AI 服务 API Key 是否有效
3. 查看日志排查具体错误

## 参考文档

- [企业微信开发文档](https://developer.work.weixin.qq.com/document/)
- [接收消息](https://developer.work.weixin.qq.com/document/path/90930)
- [发送应用消息](https://developer.work.weixin.qq.com/document/path/90236)
- [消息加解密](https://developer.work.weixin.qq.com/document/path/90968)
