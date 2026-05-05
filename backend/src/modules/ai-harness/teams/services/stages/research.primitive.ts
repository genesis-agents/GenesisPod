/**
 * research primitive（v5.1 §3.2 §5）
 *
 * 按 fanOut 策略 fan-out × N 调 worker role；并发由 config.params.concurrency 控。
 * 业务 perItemPipeline / onPatchFailure 通过 hooks 注入（consumer 用 chapter
 * writer + reviewer + integrator + 5-axis grade）。
 */
import type { IStagePrimitive, StageRunArgs } from "./abstractions";

export interface ResearchStageOutput {
  readonly results: ReadonlyArray<unknown>;
  readonly failureCount: number;
}

export interface ResearchStageHooks {
  /** 必需：取 fanOut 子任务列表（如 plan.dimensions）*/
  readonly fanOut: (args: {
    ctx: StageRunArgs["ctx"];
    previousOutputs: StageRunArgs["previousOutputs"];
  }) => ReadonlyArray<unknown>;

  /** 必需：处理单个子任务（包含完整 worker 流程）*/
  readonly perItemPipeline: (args: {
    item: unknown;
    role: StageRunArgs["role"];
    ctx: StageRunArgs["ctx"];
  }) => Promise<unknown>;

  /** 可选：单 item 失败时累计到 crossStageState（consumer s4PatchFailures 用法）*/
  readonly onPatchFailure?: (args: {
    item: unknown;
    error: unknown;
    ctx: StageRunArgs["ctx"];
    crossStageState: StageRunArgs["crossStageState"];
  }) => void | Promise<void>;
}

export const RESEARCH_PRIMITIVE: IStagePrimitive<unknown, ResearchStageOutput> =
  {
    id: "research",
    async run(args) {
      const hooks = args.hooks as unknown as ResearchStageHooks;
      if (!hooks.fanOut || !hooks.perItemPipeline) {
        throw new Error(
          `research primitive requires hooks.fanOut + hooks.perItemPipeline`,
        );
      }

      const items = hooks.fanOut({
        ctx: args.ctx,
        previousOutputs: args.previousOutputs,
      });
      const concurrency = Math.max(
        1,
        Number(args.config.params?.concurrency ?? 1),
      );

      const results: unknown[] = [];
      let failureCount = 0;

      // 简化并发：分块顺序 await（避免引入 p-limit 依赖）
      for (let i = 0; i < items.length; i += concurrency) {
        const batch = items.slice(i, i + concurrency);
        const settled = await Promise.allSettled(
          batch.map((item) =>
            hooks.perItemPipeline({
              item,
              role: args.role,
              ctx: args.ctx,
            }),
          ),
        );
        for (let k = 0; k < settled.length; k++) {
          const s = settled[k];
          if (s.status === "fulfilled") {
            results.push(s.value);
          } else {
            failureCount++;
            if (hooks.onPatchFailure) {
              await hooks.onPatchFailure({
                item: batch[k],
                error: s.reason,
                ctx: args.ctx,
                crossStageState: args.crossStageState,
              });
            }
          }
        }
      }

      return { results, failureCount };
    },
  };
