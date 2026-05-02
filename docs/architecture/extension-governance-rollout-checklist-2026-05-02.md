# 扩展治理与目录优化执行清单

**日期：** 2026-05-02  
**状态：** 待执行  
**约束来源：**

- [16-ai-engine-harness-structure.md](D:/projects/codes/genesis-agent-teams/.claude/standards/16-ai-engine-harness-structure.md)
- [17-extension-governance.md](D:/projects/codes/genesis-agent-teams/.claude/standards/17-extension-governance.md)
- [extension-governance-and-customization-audit-2026-05-02.md](D:/projects/codes/genesis-agent-teams/docs/audits/extension-governance-and-customization-audit-2026-05-02.md)

---

## 1. 目标

本清单用于把扩展治理标准转化为可执行整改项，并确保目录优化与能力边界同步推进。

---

## 2. P0 清单

### P0-1. 主线 SkillRegistry 唯一化

现状：

- engine 有主线 `SkillRegistry`
- harness 仍有 `BuiltInReActSkillRegistry`

目标：

- engine 保留唯一主线 `SkillRegistry`
- harness 内部注册表降格为 `BuiltInSkillCatalog` / `BuiltinSkillSource`

涉及目录：

- `backend/src/modules/ai-engine/skills/registry/`
- `backend/src/modules/ai-harness/agents/builtin-skills/`
- `backend/src/modules/ai-harness/agents/learning/`
- `backend/src/modules/ai-harness/harness.module.ts`

动作：

- 重命名 harness 内部 registry 语义
- 调整 learning coordinator 写入路径
- 更新 facade/export/test

### P0-2. Memory tool 反向注册治理

现状：

- `ai-harness/memory/working/memory.module.ts` 在 `onModuleInit()` 中把 memory tools 注册进 engine `ToolRegistry`

目标：

- 建立正式的 `memory tool provider` 契约
- 禁止长期依赖隐式反向注册

涉及目录：

- `backend/src/modules/ai-harness/memory/working/`
- `backend/src/modules/ai-harness/memory/tools/`
- `backend/src/modules/ai-engine/tools/`

动作：

- 明确 memory tool 的 provider surface
- 重构注册入口
- 为后续 manifest 契约预留接口

### P0-3. Checkpoint 主契约唯一化

现状：

- `memory/checkpoint/`
- `memory/state-checkpoint/`

目标：

- 统一 `CheckpointStore` / `CheckpointScope` 顶层语义
- 区分 agent / mission / session scope，而不是双主语义并存

涉及目录：

- `backend/src/modules/ai-harness/memory/checkpoint/`
- `backend/src/modules/ai-harness/memory/state-checkpoint/`

动作：

- 对齐命名
- 抽统一 contract
- 收敛测试命名与导出结构

### P0-4. 测试碎片命名清理

现状：

- `supplemental` 107 个
- `extra` 29 个
- `legacy` 7 个

目标：

- 只保留 `spec / integration / e2e` 三类后缀

动作：

- 先按目录批量登记
- 再合并/改名
- 最后补守护规则

---

## 3. P1 清单

### P1-1. facade 稳定面中的领域接口复核

候选：

- `ai-engine/facade/abstractions/research.interface.ts`
- `ai-engine/facade/abstractions/simulation.interface.ts`

目标：

- 判断是否为跨 app 能力接口
- 否则迁回 app port/interface

### P1-2. engine 中的“业务线沉淀能力”复核

候选：

- `ai-engine/content/figure/`
- `ai-engine/tools/categories/processing/template-render.tool.ts`

目标：

- 判断是真通用能力还是单业务上浮

### P1-3. harness built-in skill packs 与 runtime core 解耦

候选：

- `leader-mid-mission-assess`
- `mece-mission-planning`
- `multi-judge-mission-review`

目标：

- 把玩法型 skill 与 runtime core 结构解耦

### P1-4. collaboration / todo / mission executor 语义收敛

候选：

- `ai-harness/teams/collaboration/todo/`
- `ai-harness/lifecycle/manager/mission-executor.service.ts`

目标：

- 明确哪些是通用原语
- 哪些应下沉到领域装配层

---

## 4. 目录优化建议

### 4.1 ai-harness/memory

建议目标结构：

```text
memory/
├── working/             # 运行态 working memory
├── semantic/            # 语义记忆与召回协调
├── checkpoint/          # 统一 checkpoint contract + scoped implementations
├── consolidation/       # 原 dream/ 收敛
├── indexing/            # 原 auto-index/ 收敛
├── stores/              # 内部 store 实现
└── tools-provider/      # 向 engine 提供 memory tools 的正式 provider
```

说明：

- `dream/` 应并入 `consolidation/`
- `auto-index/` 应并入 `indexing/`
- `tools/` 不应长期作为“直接反向注册入口”

### 4.2 ai-harness/agents/builtin-skills

建议目标结构：

```text
agents/
├── builtin-skills/
│   ├── catalog/
│   ├── loader/
│   ├── activator/
│   └── packs/
```

说明：

- `skill-registry.ts` 语义降级为 catalog/source
- `built-in/` 更适合改为 `packs/`

### 4.3 ai-engine/facade/abstractions

建议目标：

- 只保留稳定跨域能力接口
- 业务命名接口迁回领域 port

### 4.4 测试目录

建议目标：

- 同一主题测试优先合并回主 spec
- 无法合并时，使用 `integration` 明示层级
- 禁止继续增长 `supplemental/extra/legacy`

---

## 5. 波次建议

### W18 前

1. 固化 `17-extension-governance.md`
2. 确认 P0-1 / P0-2 / P0-3 的目标命名和 contract
3. 冻结新增碎片化测试命名

### W18

1. engine 命名规范对齐
2. 同时处理 engine 侧“伪通用”候选

### W19 前

1. 先清理测试碎片命名
2. 先收敛 harness built-in skill / memory 目录目标结构

### W19

1. harness 命名规范对齐
2. 同时处理 memory / builtin-skills / collaboration 归位

### W20+

1. 引入正式 manifest / provider contracts
2. 补 extension / memory / customization 自动化守护

---

## 6. 逐项登记模板

| 文件/目录 | 分类       | 当前问题                   | 目标位置/目标语义   | 动作                           | 优先级 | 波次 |
| --------- | ---------- | -------------------------- | ------------------- | ------------------------------ | ------ | ---- |
| 示例      | C 业务定制 | 位于 core 但只服务单一业务 | 下沉回 app 领域目录 | move + rename + import rewrite | P1     | W18  |

---

## 7. 完成判定

以下条件全部满足，才算“扩展治理与目录优化”完成：

1. 主线 registry 唯一
2. checkpoint 主 contract 唯一
3. memory 目录职责收敛
4. 测试后缀白名单落地
5. 定制代码已完成归类和归位
6. 标准文档、架构文档、整改清单一致
