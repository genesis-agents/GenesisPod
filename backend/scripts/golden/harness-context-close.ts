/**
 * 小助手：只关闭**已初始化**的 harness CLI context。
 *
 * 为避免 tsx / ESM 模块解析问题（harness-context.ts 静态 import
 * 整个 Nest graph），此处只在 GOLDEN_JUDGE_ENABLED=1 且 STUB=0 的
 * 真 LLM 场景下才去解析。
 */

export async function closeHarnessCLIContext(): Promise<void> {
  const needsCleanup =
    process.env.GOLDEN_JUDGE_ENABLED === "1" &&
    process.env.HARNESS_AGENTS_STUB === "0";
  if (!needsCleanup) return;

  try {
    const { getCachedHarnessCLIContext } = await import("./harness-context");
    const ctx = getCachedHarnessCLIContext();
    if (ctx) {
      await ctx.close();
    }
  } catch {
    // harness-context 从未加载 → 无需关闭
  }
}
