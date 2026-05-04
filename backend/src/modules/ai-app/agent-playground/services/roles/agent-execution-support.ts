import { Logger } from "@nestjs/common";
import { AgentRunner, type IAgentEvent } from "@/modules/ai-harness/facade";
import { MissionAbortRegistry } from "@/modules/ai-harness/facade";
import type { InvocationContext } from "./agent-invoker.service";

export class AgentExecutionSupport {
  private readonly log = new Logger(AgentExecutionSupport.name);

  constructor(
    private readonly runner: AgentRunner,
    private readonly abortRegistry: MissionAbortRegistry,
  ) {}

  async invoke<TSpec extends Parameters<AgentRunner["run"]>[0]>(
    Spec: TSpec,
    input: Parameters<AgentRunner["run"]>[1],
    ctx: InvocationContext,
    onEvent: (event: IAgentEvent) => Promise<void>,
  ): Promise<Awaited<ReturnType<AgentRunner["run"]>>> {
    const signal = this.abortRegistry.getSignal(ctx.missionId);
    return this.runner.run(Spec, input, {
      userId: ctx.userId,
      environment: ctx.envAdapter,
      budgetMultiplier: ctx.budgetMultiplier,
      toolRecallHint: ctx.toolRecallHint,
      loopOverride: ctx.loopOverride,
      signal,
      billingMeta: {
        moduleType: "agent-playground",
        operationType: ctx.role,
        referenceId: ctx.missionId,
      },
      onEvent,
    });
  }

  async runWithConcurrency<TIn, TOut>(
    items: readonly TIn[],
    concurrency: number,
    fn: (item: TIn, idx: number) => Promise<TOut>,
  ): Promise<TOut[]> {
    const results: TOut[] = [];
    let cursor = 0;
    const workers = Array.from(
      { length: Math.min(concurrency, items.length) },
      async () => {
        while (cursor < items.length) {
          const idx = cursor++;
          results[idx] = await fn(items[idx], idx);
        }
      },
    );
    await Promise.all(workers);
    return results;
  }

  async runDagConcurrency<
    TIn extends { id: string; dependsOn?: string[] },
    TOut,
  >(
    items: readonly TIn[],
    concurrency: number,
    fn: (item: TIn, idx: number) => Promise<TOut>,
  ): Promise<TOut[]> {
    if (items.length === 0) return [];
    const ids = new Set(items.map((i) => i.id));
    const inDeg = new Map<string, number>();
    const adj = new Map<string, string[]>();
    const idToIdx = new Map<string, number>();
    items.forEach((it, i) => idToIdx.set(it.id, i));
    for (const it of items) {
      const deps = (it.dependsOn ?? []).filter((d) => ids.has(d));
      inDeg.set(it.id, deps.length);
      for (const d of deps) {
        const arr = adj.get(d) ?? [];
        arr.push(it.id);
        adj.set(d, arr);
      }
    }

    const tmpInDeg = new Map(inDeg);
    const reachable = new Set<string>();
    const tmpQ: string[] = [];
    for (const [id, n] of tmpInDeg) {
      if (n === 0) {
        reachable.add(id);
        tmpQ.push(id);
      }
    }
    while (tmpQ.length > 0) {
      const id = tmpQ.shift()!;
      for (const child of adj.get(id) ?? []) {
        tmpInDeg.set(child, (tmpInDeg.get(child) ?? 0) - 1);
        if (tmpInDeg.get(child) === 0) {
          reachable.add(child);
          tmpQ.push(child);
        }
      }
    }
    if (reachable.size < items.length) {
      this.log.warn(
        `[runDagConcurrency] cycle or missing deps detected - fallback to flat`,
      );
      return this.runWithConcurrency(items, concurrency, fn);
    }

    const results: TOut[] = new Array(items.length);
    const ready: string[] = [];
    for (const [id, n] of inDeg) {
      if (n === 0) ready.push(id);
    }
    let activeCount = 0;
    let completed = 0;
    let firstError: unknown = null;

    return new Promise<TOut[]>((resolve, reject) => {
      const tryDispatch = () => {
        if (firstError) {
          if (activeCount === 0) reject(firstError);
          return;
        }
        while (activeCount < concurrency && ready.length > 0) {
          const id = ready.shift()!;
          const idx = idToIdx.get(id)!;
          const item = items[idx];
          activeCount++;
          Promise.resolve()
            .then(() => fn(item, idx))
            .then(
              (out) => {
                results[idx] = out;
                activeCount--;
                completed++;
                for (const child of adj.get(id) ?? []) {
                  const next = (inDeg.get(child) ?? 0) - 1;
                  inDeg.set(child, next);
                  if (next === 0) ready.push(child);
                }
                if (completed === items.length) resolve(results);
                else tryDispatch();
              },
              (err) => {
                activeCount--;
                if (!firstError) firstError = err;
                tryDispatch();
              },
            );
        }
        if (
          activeCount === 0 &&
          ready.length === 0 &&
          completed < items.length &&
          !firstError
        ) {
          reject(
            new Error("runDagConcurrency: scheduler stalled (unreachable)"),
          );
        }
      };
      tryDispatch();
    });
  }
}
