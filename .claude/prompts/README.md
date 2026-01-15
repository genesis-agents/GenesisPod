# System Prompts

> Agent 系统提示词库，用于定义各个 Agent 的行为和专业领域。

## 目录结构

```
prompts/
├── system/                    # 系统级提示词
│   ├── researcher-agent.md    # 研究员 Agent
│   ├── reviewer-agent.md      # 代码审查 Agent
│   └── writer-agent.md        # 写作 Agent
└── README.md
```

## 提示词规范

### 结构要求

```markdown
# Agent 名称

## 角色定义

描述 Agent 的身份和专业领域

## 核心职责

- 职责 1
- 职责 2

## 行为准则

- 准则 1
- 准则 2

## 输出格式

描述期望的输出格式

## 示例

提供输入输出示例
```

### 变量使用

| 变量             | 描述         |
| ---------------- | ------------ |
| `{{user_input}}` | 用户输入内容 |
| `{{context}}`    | 上下文信息   |
| `{{language}}`   | 目标语言     |
| `{{project}}`    | 项目名称     |

## 使用方式

在代码中引用：

```typescript
const prompt = await readPrompt("system/researcher-agent.md");
const response = await ai.chat({
  messages: [
    { role: "system", content: prompt },
    { role: "user", content: userInput },
  ],
});
```

---

**最后更新**: 2025-01-15
