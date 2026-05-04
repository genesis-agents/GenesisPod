/**
 * AI Engine Facade Ã¢â‚¬â€ Base Classes
 * Ã¨Â½Â»Ã©â€¡ÂÃ¥Â­ÂÃ¦Â¨Â¡Ã¥Ââ€”Ã¯Â¼Å’Ã¤Â»â€¦Ã¥Â¯Â¼Ã¥â€¡Âº Agent/Tool Ã¥Å¸ÂºÃ§Â±Â»
 *
 * Ã¢Ëœâ€¦ Ã¦Â­Â¤Ã¦â€“â€¡Ã¤Â»Â¶Ã¤Â¸Å½ index.tsÃ¯Â¼Ë†Ã¤Â¸Â» barrelÃ¯Â¼â€°Ã¥Ë†â€ Ã§Â¦Â»Ã¯Â¼Å’Ã©ÂÂ¿Ã¥â€¦ÂÃ¥Â¾ÂªÃ§Å½Â¯Ã¤Â¾ÂÃ¨Âµâ€“Ã£â‚¬â€š
 *   index.ts Ã¥Å Â Ã¨Â½Â½ 70+ Ã¦Â¨Â¡Ã¥Ââ€”Ã¥Â½Â¢Ã¦Ë†ÂÃ§Å¡â€ž import Ã©â€œÂ¾Ã¤Â¼Å¡Ã¥â€ºÅ¾Ã¥Ë†Â°Ã¨â€¡ÂªÃ¨ÂºÂ«Ã¯Â¼Å’
 *   Ã¥Â¯Â¼Ã¨â€¡Â´ class Ã¥Å“Â¨ extends Ã¦â€”Â¶Ã¤Â¸Âº undefinedÃ£â‚¬â€š
 *   base-classes.ts Ã¥ÂÂªÃ¥Â¯Â¼Ã¥â€¡Âº 3 Ã¤Â¸ÂªÃ¥Å¸ÂºÃ§Â±Â»Ã¯Â¼Å’Ã¤Â¸ÂÃ¦â€¹â€°Ã¥â€¦Â¥Ã¦Å“ÂÃ¥Å Â¡Ã¥Â±â€šÃ¯Â¼Å’Ã©â€ºÂ¶Ã¥Â¾ÂªÃ§Å½Â¯Ã©Â£Å½Ã©â„¢Â©Ã£â‚¬â€š
 *
 * Ã§â€Â¨Ã¦Â³â€¢Ã¯Â¼Å¡
 *   import { PlanBasedAgent } from "../../../ai-engine/facade/base-classes";
 *   import { ... } from "@/modules/ai-harness/facade";
 */

// PR-X5: BaseAgent / PlanBasedAgent moved to ai-harness/agents/base
export { BaseAgent } from "../agents/base/base-agent";
export { PlanBasedAgent } from "../agents/base/plan-based-agent";
export type { IPlanBasedAgent } from "../agents/base/plan-based-agent";
export { BaseTool } from "../../ai-engine/tools/base/base-tool";
