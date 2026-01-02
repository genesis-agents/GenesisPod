# AI Teams 产品文档

> AI Teams 是 DeepDive Engine 的核心能力，实现"像真实公司一样运作的 AI 团队"。

---

## 文档索引

### 产品规划

| 文档                                         | 说明                             | 状态  |
| -------------------------------------------- | -------------------------------- | ----- |
| [产品架构愿景](./ai-teams-product-vision.md) | 整体产品架构、三层设计、演进路线 | Draft |

### 技术设计

| 文档            | 说明                       | 状态 |
| --------------- | -------------------------- | ---- |
| Engine 核心设计 | AI Teams Engine 技术架构   | TODO |
| 约束引擎设计    | Constraint Engine 详细设计 | TODO |
| 数据模型设计    | Team/Role/Skill 数据库设计 | TODO |
| API 接口设计    | AI Teams API 规范          | TODO |

### 场景设计

| 文档          | 说明                 | 状态 |
| ------------- | -------------------- | ---- |
| Research Team | 深度研究场景详细设计 | TODO |
| Report Team   | 报告撰写场景详细设计 | TODO |
| Debate Team   | 辩论推演场景详细设计 | TODO |

### 用户体验

| 文档         | 说明                   | 状态 |
| ------------ | ---------------------- | ---- |
| 交互设计规范 | 用户交互流程、界面设计 | TODO |
| 约束配置体验 | 约束条件的用户配置体验 | TODO |

---

## 核心概念速览

```
用户任务 (Mission)
     │
     ▼
┌─────────────────────────────────┐
│  AI Team                        │
│  ┌───────────┐                  │
│  │  Leader   │ ← 任务分解、调度、审核
│  └─────┬─────┘                  │
│        │                        │
│  ┌─────┴─────┬─────────┐       │
│  ▼           ▼         ▼       │
│ Member    Member    Member     │
│ (Role)    (Role)    (Role)     │
│ Skills    Skills    Skills     │
│ Tools     Tools     Tools      │
└─────────────────────────────────┘
     │
     ▼
约束条件 (Constraints)
├── 成本 (Cost)
├── 质量 (Quality)
└── 效率 (Efficiency)
```

---

## 相关技术文档

这些文档位于 `docs/architecture/`，包含现有实现的技术细节：

- [AI Teams 架构改进计划](../architecture/ai-teams-architecture-improvement-plan.md)
- [AI Teams 核心集成计划](../architecture/ai-teams-core-integration-plan.md)

---

**最后更新**: 2026-01-01
