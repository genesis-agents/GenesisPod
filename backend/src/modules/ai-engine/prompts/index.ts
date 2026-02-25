/**
 * Prompts Module - Re-export shim
 * 此目录内容已迁移到 llm/prompts/
 * 保留此文件以保持向后兼容性
 */

export { PromptsModule } from "../llm/prompts/prompts.module";
export {
  PromptTemplateService,
  PromptTemplateData,
  CreatePromptTemplateDto,
} from "../llm/prompts/prompt-template.service";
export { PromptRegistryService } from "../llm/prompts/prompt-registry.service";
