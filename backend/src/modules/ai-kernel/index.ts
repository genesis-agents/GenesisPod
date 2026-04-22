/**
 * AI Kernel (deprecated)
 *
 * 所有 kernel 能力已迁移到 ai-engine/runtime/ 下。
 * 保留 AiKernelModule（空壳）+ facade（向后兼容 re-exports）+ abstractions（type barrel）。
 * PR 6 将完成最终清理。
 */
export { AiKernelModule } from "./ai-kernel.module";
