/**
 * LLM Cost Calculator
 *
 * 模型价格的权威源是 ai_models 表（price_input_per_million / price_output_per_million）。
 * 此处不持有任何硬编码价格 —— 未通过 admin 配置价格的模型，cost = 0。
 * 调用方需要精确成本时，应通过 ai-models 服务读价格后自行计算或注入到此处的
 * pricing 参数。
 */

export function estimateCost(
  _model: string,
  _inputTokens: number,
  _outputTokens: number,
  pricing?: { inputPerMillion: number; outputPerMillion: number },
): number {
  if (!pricing) return 0;
  return (
    (_inputTokens / 1_000_000) * pricing.inputPerMillion +
    (_outputTokens / 1_000_000) * pricing.outputPerMillion
  );
}
