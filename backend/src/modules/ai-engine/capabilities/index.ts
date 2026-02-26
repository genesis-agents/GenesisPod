/**
 * AI Engine Capabilities - Re-export shim
 * 此目录内容已迁移到 orchestration/capabilities/
 * 保留此文件以保持向后兼容性
 */
export * from "../orchestration/capabilities/ai-capability-resolver.service";
export * from "../orchestration/capabilities/types";

// 向后兼容：导出旧名称作为别名
export { AICapabilityResolver as CapabilityResolver } from "../orchestration/capabilities/ai-capability-resolver.service";
