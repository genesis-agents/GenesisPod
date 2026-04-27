# Analyst Duty: ANALYZE — 跨维度综合分析

> 当前状态: `AnalystAgent` 仍使用内联 prompt（`analyst.agent.ts`）。
> 本 duty.md 是后续 PR 迁移目标，soul.md 已就位。

## 输入

- factTable + conflicts + gaps（来自 Reconciler）
- 多 dim 的 raw findings
- mission goals（来自 Leader M0 plan）

## 输出 4 类

1. **insights**: 跨 dim 综合判断（headline + narrative + supportingDimensions ≥ 2）
2. **contradictions**: 处理跨源冲突的判断（claim + conflictingSources + resolution）
3. **gaps**: 分析过程中识别的新缺口（与 reconciler.gaps 互补）
4. **strategicRecommendations** / **riskAssessment** / **crossDimAnalysis**（按业务需要）

## 硬约束

- insight.supportingDimensions ≥ 2（单 dim 不算 insight）
- 不能直接复制 finding.claim 当 insight
- contradictions 必须给具体 resolution（不能"待定"）

## Output schema

详见 `analyst.agent.ts` 的 Output zod schema。
