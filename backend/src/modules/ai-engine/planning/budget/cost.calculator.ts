/**
 * LLM Cost Calculator
 *
 * 纯函数模块：提供 LLM 调用成本估算能力。
 * 从 ai-harness/tracing/observability/ai-observability.service.ts 提取，
 * 以消除 ai-engine → ai-harness 的反向依赖。
 *
 * 无 NestJS 注入，可在 ai-engine 内部任意位置直接 import。
 */

/**
 * LLM 成本估算（美元/1K tokens）
 */
export const COST_PER_1K_TOKENS: Record<
  string,
  { input: number; output: number }
> = {
  "gpt-4o": { input: 0.0025, output: 0.01 },
  "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
  "claude-3.5-sonnet": { input: 0.003, output: 0.015 },
  "claude-3-haiku": { input: 0.00025, output: 0.00125 },
  "grok-2": { input: 0.002, output: 0.01 },
  "grok-beta": { input: 0.005, output: 0.015 },
  default: { input: 0.001, output: 0.002 },
};

/**
 * 估算 LLM 调用成本
 *
 * 基于预定义的价格表计算成本（输入和输出 tokens 分别计价）。
 *
 * @param model - 模型名称
 * @param inputTokens - 输入 tokens 数
 * @param outputTokens - 输出 tokens 数
 * @returns 估算成本（美元）
 */
// ★ 全覆盖审计修 (2026-05-06): 模块级 logger（纯函数模块用 console.warn fallback）
//   注意：cost.calculator.ts 是无 NestJS 注入的纯函数模块，
//   用 console.warn 让 Railway log 可见（运维能知道要补 pricing 表）。
//   不注入 Logger 是为了保持 zero-dependency 纯函数特性。
function warnUnknownModel(model: string): void {
  // eslint-disable-next-line no-console
  console.warn(
    `[pricing] unknown model "${model}", using default 0.001/0.002 per 1K tokens. ` +
      `Add to COST_PER_1K_TOKENS to get accurate cost tracking.`,
  );
}

export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  // ★ 全覆盖审计修 (2026-05-06): 未知模型 warn，让运维在 Railway log 看到需补 pricing
  const pricing = COST_PER_1K_TOKENS[model];
  if (!pricing) {
    warnUnknownModel(model);
  }
  const resolved = pricing ?? COST_PER_1K_TOKENS["default"];
  const inputCost = (inputTokens / 1000) * resolved.input;
  const outputCost = (outputTokens / 1000) * resolved.output;
  return inputCost + outputCost;
}
