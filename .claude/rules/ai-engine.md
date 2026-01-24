---
paths:
  - "backend/src/modules/ai-engine/**"
  - "backend/src/modules/ai-app/**"
---

# AI Engine 开发规则

## LLM 调用规范

### 必须使用语义化配置

```typescript
// 正确做法
const response = await this.aiChatService.chat({
  messages: [...],
  modelType: AIModelType.CHAT,
  taskProfile: {
    creativity: 'medium',
    outputLength: 'long',
  },
});

// 禁止硬编码
// model: 'gpt-4o'          ❌
// temperature: 0.7          ❌
// maxTokens: 4096          ❌
```

### TaskProfile 预设

| creativity | temperature | 场景 |
|------------|-------------|------|
| deterministic | 0.1 | 分类、提取、JSON |
| low | 0.3 | 分析、总结 |
| medium | 0.7 | 对话、研究 |
| high | 0.9 | 创意写作 |

| outputLength | maxTokens | 场景 |
|--------------|-----------|------|
| minimal | 500 | 分类标签 |
| short | 1500 | 摘要 |
| medium | 4000 | 标准分析 |
| long | 8000 | 报告章节 |
| extended | 16000 | 完整文档 |

## 架构原则

1. **委托优先**: AI App 委托 AI Engine 执行，不自己实现
2. **语义化配置**: 描述意图，让 Engine 决定实现
3. **单一职责**: 每个服务只做一件事
4. **事件驱动**: 使用事件进行跨服务通信

## 能力归属判断

```
问自己："如果明天做一个完全不同的 AI App，这个能力还能复用吗？"

能复用 → AI Engine
不能复用 + 常见场景 → Predefined AI Teams
不能复用 + 特定场景 → Custom AI Teams
```
