/**
 * ai-engine/content/report-template —— 报告格式化标准（沉淀自 ai-app/contracts, 2026-04-29）
 *
 * 13 类内容规则的唯一实现：
 *   L1 Prompt 常量 → L2 后处理 pipeline → L3 前端渲染
 *
 * 历史路径 `@/modules/ai-app/contracts/report-template` 保留 re-export shim，
 * TI 商用基线零改动；Playground/新 ai-app 应通过本路径或 ai-engine/facade 消费。
 */
export * from "./constants/report-writing-standards";
export * from "./pipeline/report-formatting.utils";
export * from "./pipeline/formatting-pipeline";
