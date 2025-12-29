/**
 * Slides Engine v3.0 - Roles Module
 *
 * 五大角色服务：
 * 1. ArchitectService - 架构师（任务分解、大纲规划、质量审核）
 * 2. WriterService - 作者（内容填充、文案润色）
 * 3. RendererService - 渲染器（四步设计、HTML 生成）
 * 4. ImageGeneratorService - 图像生成器（图像生成）
 * 5. ReviewerService - 审核者（质量检查、一致性验证）
 */

export * from "./architect.service";
export * from "./writer.service";
export * from "./renderer.service";
export * from "./image-generator.service";
export * from "./reviewer.service";
