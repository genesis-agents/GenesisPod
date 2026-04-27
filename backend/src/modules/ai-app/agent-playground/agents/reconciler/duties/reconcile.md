# Reconciler Duty: RECONCILE — 跨维度对账

> 当前状态: `ReconcilerAgent` 仍使用内联 prompt（`reconciler.agent.ts`）。
> 本 duty.md 是后续 PR 迁移目标，soul.md 已就位。

## 输入

- 多个 dim 的 researcher 完成产物
- 每个 dim 的 findings + figureCandidates

## 输出 5 类

1. **factTable**: 三元组 `{entity, attribute, value, sources[]}`
2. **conflicts**: 同一 entity+attribute 不同 value → `{factIds[], resolutionType, rationale}`
3. **overlaps**: 跨 dim 重复信息 → 合并标记
4. **gaps**: mission 该回答但没回答的部分 → severity=critical/minor
5. **figureCandidates**: 去重 + 黑名单过滤后的图候选池
6. **deduplicationStats**: 去重统计
7. **termGlossary**: 术语对照表

## Output schema

详见 `reconciler.agent.ts` 的 Output zod schema。
