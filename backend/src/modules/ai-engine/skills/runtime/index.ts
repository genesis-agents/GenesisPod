/**
 * AI Engine - SKILL.md Runtime
 *
 * Barrel export for the unified SKILL.md runtime components.
 */

export { PromptSkillAdapter } from "./prompt-skill.adapter";
export {
  PromptSkillRegistrationService,
  type PromptSkillRegistrationResult,
} from "./prompt-skill-registration.service";
export { PromptSkillRegistrationService as PromptSkillBridge } from "./prompt-skill-registration.service";
export {
  InputBindingResolver,
  type BindingContext,
} from "./skill-input-binding-resolver.service";
export { EngineSkillProvider } from "./engine-skill-provider.adapter";
