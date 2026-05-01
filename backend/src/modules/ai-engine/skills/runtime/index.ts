/**
 * AI Engine - SKILL.md Runtime
 *
 * Barrel export for the unified SKILL.md runtime components.
 */

export { PromptSkillAdapter } from "./prompt-skill-adapter";
export {
  PromptSkillBridge,
  type BridgeRegistrationResult,
} from "./prompt-skill-bridge.service";
export {
  InputBindingResolver,
  type BindingContext,
} from "./input-binding-resolver";
export { EngineSkillProvider } from "./engine-skill-provider";
