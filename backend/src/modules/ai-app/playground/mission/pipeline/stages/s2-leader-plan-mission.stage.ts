/**
 * Stage S2 — Leader plans the mission
 *
 * Boilerplate（emit started/completed/failed/lifecycle/narrate）由 harness
 * `runWithStageInstrumentation` 接管。stage 文件只剩业务核心。
 *
 *   reads  ctx: leader, missionId, userId
 *   writes ctx: plan = { themeSummary, dimensions, goals, initialRisks }
 *
 * Failure: leader.plan() 抛错 → wrapper 自动 emit lifecycle:failed + rethrow。
 */

import type {
  MissionInvariants,
  PlanPhaseCtx,
} from "../../context/mission-context";
import type { MissionDeps } from "../../context/mission-deps";
import type { SubgraphResult } from "@/modules/ai-engine/facade";
import { narrate } from "../../artifacts/narrative.util";
import { runWithStageInstrumentation } from "@/modules/ai-harness/facade";

interface PlanResult {
  themeSummary: string;
  dimensions: ReadonlyArray<{ name: string }>;
  goals: ReadonlyArray<unknown>;
  initialRisks?: ReadonlyArray<unknown>;
}

export async function runLeaderPlanStage(
  ctx: MissionInvariants & PlanPhaseCtx,
  deps: MissionDeps,
): Promise<void> {
  const { missionId, userId, leader } = ctx;

  await runWithStageInstrumentation<PlanResult>(
    { missionId, userId, pool: ctx.pool },
    deps,
    {
      eventPrefix: "playground",
      stageId: "s2-leader-plan",
      role: "leader",
      narrate,
      narrateThinking:
        "Leader 开始分析 topic，准备维度规划与声明 successCriteria",
      narrateSuccess: (out) =>
        `Leader 拆出 ${out.dimensions.length} 个研究维度：${out.dimensions
          .map((d) => d.name)
          .slice(0, 3)
          .join(" / ")}${out.dimensions.length > 3 ? " 等" : ""}`,
      emitExtras: async (out) => {
        await deps
          .emit({
            type: "playground.leader:goals-set",
            missionId,
            userId,
            payload: {
              goals: out.goals,
              initialRisks: out.initialRisks ?? [],
            },
          })
          .catch((err: unknown) => {
            deps.log.warn(
              `[${missionId}] emit leader:goals-set failed: ${err instanceof Error ? err.message : String(err)}`,
            );
          });
      },
      customMetrics: (out) => ({
        dimensions: out.dimensions,
        themeSummary: out.themeSummary,
      }),
    },
    async (): Promise<PlanResult> => {
      // ★ P0#2 (2026-04-29): S12 → S2 闭环 —— 召回该用户最近 3 个 mission postmortem
      const priorPostmortems = await deps.store
        .listRecentPostmortems(userId, 3)
        .catch((err) => {
          deps.log.warn(
            `[s2 ${missionId}] listRecentPostmortems failed (non-fatal): ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
          return [];
        });
      if (priorPostmortems.length > 0) {
        deps.log.log(
          `[s2 ${missionId}] injected ${priorPostmortems.length} prior postmortems to Leader plan`,
        );
      }

      // ★ Phase 3 (2026-06-15): 从知识本体查询与 topic 相关的背景知识，注入 Leader 规划
      let priorKnowledge: string | undefined;
      // 可观测性：记录本次规划参考了哪些本体实体（透到前端 LeadJournalPanel）。
      let ontologyUsage:
        | {
            entityCount: number;
            linkCount: number;
            entities: { label: string; typeKey: string }[];
          }
        | undefined;
      // ★ 创建时开关：useOntology !== false 才利用本体（DTO 默认 true；显式关闭则跳过）
      if (deps.ontologyService && ctx.input?.useOntology !== false) {
        try {
          const topic = ctx.input?.topic ?? "";
          if (topic) {
            const subgraph =
              await deps.ontologyService.searchRelevantSubgraph(topic);
            if (subgraph.nodes.length > 0) {
              priorKnowledge = formatSubgraphAsText(subgraph);
              ontologyUsage = {
                entityCount: subgraph.nodes.length,
                linkCount: subgraph.links.length,
                entities: subgraph.nodes
                  .slice(0, 20)
                  .map((n) => ({ label: n.label, typeKey: n.typeKey })),
              };
              deps.log.log(
                `[s2 ${missionId}] ontology subgraph: ${subgraph.nodes.length} nodes, ${subgraph.links.length} links → injected as priorKnowledge`,
              );
            }
          }
        } catch (err) {
          deps.log.warn(
            `[s2 ${missionId}] ontology searchRelevantSubgraph failed (non-fatal): ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }

      // M0: leader.plan() 内部自动 emit lifecycle / appendLeaderJournal
      const planResult = await leader.plan({
        priorPostmortems: priorPostmortems.map((p) => ({
          missionId: p.missionId,
          topic: p.topic,
          summary: p.summary,
          recommendations: p.recommendations,
          leaderSigned: p.leaderSigned,
          qualityScore: p.qualityScore,
          createdAt: p.createdAt.toISOString(),
        })),
        priorKnowledge,
      });

      // 可观测性：把本体使用情况写入 leader journal（前端 LeadJournalPanel 展示）。
      if (
        ontologyUsage &&
        typeof deps.store?.appendLeaderJournal === "function"
      ) {
        void deps.store
          .appendLeaderJournal(missionId, { ontologyContext: ontologyUsage })
          .catch((err: unknown) =>
            deps.log.warn(
              `[s2 ${missionId}] append ontologyContext to journal failed (non-fatal): ${
                err instanceof Error ? err.message : String(err)
              }`,
            ),
          );
      }

      // ★ P1-D (2026-04-29): leader 返回空维度时必须 fail-fast
      if (!planResult.dimensions || planResult.dimensions.length === 0) {
        throw new Error(
          "Leader plan failed: dimensions[] is empty. Cannot proceed with researcher dispatch.",
        );
      }

      // 写 ctx（CrossStageState）
      ctx.plan = {
        themeSummary: planResult.themeSummary,
        dimensions: planResult.dimensions,
        goals: planResult.goals,
        initialRisks: planResult.initialRisks ?? [],
      };

      // ★ 2026-05-07 R2 共识 P0 (architect): cascade rerun 删 reset-before-rerun 后
      //   s2 必须主动持久化 dimensions + themeSummary 到主行 — 否则从 s2 重跑且
      //   cascade 中途失败时主行字段保持旧值（vs 本次新 plan）→ 前端任务列表 / 维度
      //   渲染指向上一轮 plan 不一致。与 s6/s7/s8/s8b/s10 同模式（PR-R4 主动持久化）。
      //   ★ 防御：旧 wiring（spec mock / 老 deps）可能没装 markIntermediateState — 用
      //   typeof 判断兜底，缺失时记 warn 但不阻塞 stage 流程。
      if (typeof deps.store?.markIntermediateState === "function") {
        await deps.store
          .markIntermediateState(
            ctx.missionId,
            {
              dimensions: planResult.dimensions as unknown,
              themeSummary: planResult.themeSummary,
            },
            ctx.userId,
          )
          .catch((err: unknown) => {
            deps.log.warn(
              `[${ctx.missionId}] S2 markIntermediateState failed (non-fatal): ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
          });
      }

      return ctx.plan as unknown as PlanResult;
    },
  );
}

/**
 * 将本体子图格式化为可读的纯文本背景知识段落，供 Leader 规划时参考。
 *
 * 输出格式：
 *   已知背景知识（来自知识本体）
 *   实体：
 *   - {label}（{typeKey}）[{key}: {val}, ...]
 *   关系：
 *   - {fromLabel} —[{linkTypeKey}]→ {toLabel}
 */
function formatSubgraphAsText(subgraph: SubgraphResult): string {
  const lines: string[] = ["已知背景知识（来自知识本体）", "实体："];

  const nodeById = new Map(subgraph.nodes.map((n) => [n.id, n]));

  for (const node of subgraph.nodes) {
    const props = node.properties ?? {};
    const propStr = Object.entries(props)
      .filter(([, v]) => v !== null && v !== undefined && v !== "")
      .slice(0, 3)
      .map(([k, v]) => `${k}: ${String(v).slice(0, 60)}`)
      .join(", ");
    lines.push(
      `- ${node.label}（${node.typeKey}）${propStr ? `[${propStr}]` : ""}`,
    );
  }

  if (subgraph.links.length > 0) {
    lines.push("关系：");
    for (const link of subgraph.links) {
      const fromNode = nodeById.get(link.fromId);
      const toNode = nodeById.get(link.toId);
      const fromLabel = fromNode?.label ?? link.fromId;
      const toLabel = toNode?.label ?? link.toId;
      lines.push(`- ${fromLabel} —[${link.linkTypeKey}]→ ${toLabel}`);
    }
  }

  return lines.join("\n");
}
