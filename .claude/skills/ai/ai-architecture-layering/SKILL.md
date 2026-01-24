---
name: AI Architecture Layering
description: |
  Decide where AI capabilities belong in the layered architecture.
  Trigger keywords: ai architecture, layering, ai engine, ai teams, capability placement
  Not for: AI Teams implementation (-> ai-teams-expert), Service patterns (-> ai-service-expert)
allowed-tools: [Read, Grep, Glob]
tags: [architecture, ai-engine, ai-teams, decision, layering]
boundaries:
  includes:
    - AI capability placement decisions
    - Layer boundary definitions
    - Architecture pattern guidance
  excludes:
    - AI Teams implementation details
    - AI service integration code
  handoff:
    - skill: ai-teams-expert
      when: AI Teams implementation
    - skill: ai-service-expert
      when: AI service integration
---

# AI Architecture Layering

> Decide where AI capabilities should be placed in DeepDive Engine's layered architecture.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  AI Engine（核心能力层）- 领域无关的通用机制                       │
│  Orchestration / LLM / Search / Context / Constraint            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  AI Teams（协作机制层）- 多 Agent 协作的运作方式                   │
│  Mission / Task / Review / Execution                            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  Predefined AI Teams（官方应用层）- 开箱即用的配置                 │
│  AI Studio / AI Office / AI Simulation                          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  Custom AI Teams（用户配置层）- 用户自定义团队                     │
│  小说创作 / 技术文档 / 个性化场景                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Decision Framework

### Question 1: Is it Domain-Agnostic?

**"如果做一个完全不同的 AI App，这个能力还能复用吗？"**

| Answer      | Layer             | Examples                      |
| ----------- | ----------------- | ----------------------------- |
| ✅ Reusable | AI Engine         | LLM调用, 搜索增强, 上下文演进 |
| ❌ Not      | Continue → Step 2 | 小说提示词模板, 研究报告格式  |

### Question 2: Is it an Official Scenario?

**"这是官方针对常见场景优化的配置吗？"**

| Answer      | Layer               | Examples                   |
| ----------- | ------------------- | -------------------------- |
| ✅ Official | Predefined AI Teams | 研究报告(Studio), 商务文档 |
| ❌ Not      | Continue → Step 3   | 用户自己的小说团队配置     |

### Question 3: Does User Configure It?

**"这需要用户自己配置吗？"**

| Answer         | Layer           | Examples             |
| -------------- | --------------- | -------------------- |
| ✅ User config | Custom AI Teams | 自定义角色, 协作规则 |
| ❌ No          | May not need    | -                    |

## Red Flags (Anti-Patterns)

### Don't Put in AI Engine

- Scene-specific prompt templates
- Domain-specific quality standards
- Specific output formats

### Don't Put in AI Teams

- Generic LLM call logic
- Domain-agnostic error handling
- Generic token management

## Related Docs

- [Decision Examples](references/decision-examples.md)
- [Layer Characteristics](references/layer-characteristics.md)
