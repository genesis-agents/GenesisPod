/**
 * LLM Cost Calculator
 *
 * çº¯å‡½æ•°æ¨¡å—ï¼šæä¾› LLM è°ƒç”¨æˆæœ¬ä¼°ç®—èƒ½åŠ›ã€‚
 * ä»Ž ai-harness/tracing/observability/ai-observability.service.ts æå–ï¼Œ
 * ä»¥æ¶ˆé™¤ ai-engine â†’ ai-harness çš„åå‘ä¾èµ–ã€‚
 *
 * æ—  NestJS æ³¨å…¥ï¼Œå¯åœ¨ ai-engine å†…éƒ¨ä»»æ„ä½ç½®ç›´æŽ¥ importã€‚
 */

/**
 * LLM æˆæœ¬ä¼°ç®—ï¼ˆç¾Žå…ƒ/1K tokensï¼‰
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
 * ä¼°ç®— LLM è°ƒç”¨æˆæœ¬
 *
 * åŸºäºŽé¢„å®šä¹‰çš„ä»·æ ¼è¡¨è®¡ç®—æˆæœ¬ï¼ˆè¾“å…¥å’Œè¾“å‡º tokens åˆ†åˆ«è®¡ä»·ï¼‰ã€‚
 *
 * @param model - æ¨¡åž‹åç§°
 * @param inputTokens - è¾“å…¥ tokens æ•°
 * @param outputTokens - è¾“å‡º tokens æ•°
 * @returns ä¼°ç®—æˆæœ¬ï¼ˆç¾Žå…ƒï¼‰
 */
export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = COST_PER_1K_TOKENS[model] || COST_PER_1K_TOKENS["default"];
  const inputCost = (inputTokens / 1000) * pricing.input;
  const outputCost = (outputTokens / 1000) * pricing.output;
  return inputCost + outputCost;
}
