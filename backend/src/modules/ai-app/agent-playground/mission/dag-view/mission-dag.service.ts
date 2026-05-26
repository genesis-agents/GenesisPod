/**
 * MissionDagService —— 把 mission 当前态组装成可视化用的 DAG 图谱。
 *
 * 输入:missionId + userId(经 ownership 校验后传入)
 * 输出:MissionDagGraph(节点+边+rerunable+实时状态)
 *
 * 数据来源:
 *   1. 结构 —— PLAYGROUND_PIPELINE.steps(13 stage 静态拓扑 + dag.successors)
 *   2. 实时状态 —— MissionStore.getById(): mission.status + lastCompletedStage
 *   3. 维度展开 —— mission.dimensions → S3 research-dim 子节点
 *
 * 非线性边(Writer⇄Reviewer rewrite loop / 签收 patch self-loop)在这里写死,
 * 是 playground 业务约定,不在 stage-dag-meta 里(stage-dag-meta 只描述
 * "重跑级联"用的 DAG 边,不描述运行时实际通信回环)。
 *
 * 级联计算:walk dag.successors 取传递闭包(若起点是 research-dim,先映射回
 * parentStepId 再 walk + 同时把所有同维度 research-dim 节点和共享下游节点
 * 都纳入 willRerun)。
 */

import { Injectable, NotFoundException, Logger } from "@nestjs/common";
import { MissionStore } from "../lifecycle/mission-store.service";
import { PLAYGROUND_PIPELINE } from "../../runtime/playground.config";
import type {
  MissionDagGraph,
  MissionDagNode,
  MissionDagEdge,
  MissionDagNodeStatus,
  MissionDagCascadePreview,
  MissionDagNodeKind,
  MissionDagLayoutHint,
} from "./mission-dag.types";

interface DimRef {
  readonly id: string;
  readonly name: string;
}

const RESEARCH_STEP_ID = "s3-researcher-collect";
const WRITER_STEP_ID = "s8-writer";
const REVIEWER_STEP_IDS = [
  "s8b-quality-enhancement",
  "s9-critic",
  "s9b-objective-eval",
] as const;
const SIGNOFF_STEP_ID = "s10-leader-foreword-signoff";
const PERSIST_STEP_ID = "s11-persist";

/** macro stage 显示标签(短中文) */
const STEP_LABELS: Record<string, { label: string; sub?: string }> = {
  "s1-budget": { label: "S1 预算闸" },
  "s2-leader-plan": { label: "S2 Leader 规划" },
  "s3-researcher-collect": { label: "S3 研究采集" },
  "s4-leader-assess": { label: "S4 Leader 评估" },
  "s5-reconciler": { label: "S5 对账" },
  "s6-analyst": { label: "S6 Analyst", sub: "交叉验证 / 消解" },
  "s7-writer-outline": { label: "S7 Outline" },
  "s8-writer": { label: "S8 Writer", sub: "草稿 / 返修" },
  "s8b-quality-enhancement": { label: "S8b 质量增强" },
  "s9-critic": { label: "S9 Critic" },
  "s9b-objective-eval": { label: "S9b 客观评估" },
  "s10-leader-foreword-signoff": { label: "Leader 签收" },
  "s11-persist": { label: "S11 持久化" },
};

@Injectable()
export class MissionDagService {
  private readonly log = new Logger(MissionDagService.name);

  constructor(private readonly store: MissionStore) {}

  /** 构图入口 —— ownership 校验已在 controller 完成 */
  async buildGraph(
    missionId: string,
    userId: string,
  ): Promise<MissionDagGraph> {
    const mission = await this.store.getById(missionId, userId);
    if (!mission) {
      throw new NotFoundException(`mission ${missionId} not found`);
    }

    const steps = PLAYGROUND_PIPELINE.steps;
    const stepIndexById = new Map(steps.map((s, i) => [s.id, i]));
    const lastCompleted = mission.lastCompletedStage ?? -1;
    const missionStatus = mission.status;
    const dims = this.normalizeDimensions(mission.dimensions);

    const nodes: MissionDagNode[] = [];
    const edges: MissionDagEdge[] = [];

    // 1) 13 macro 节点(每个 step 一个),状态由 lastCompletedStage 推导
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const status = this.deriveMacroStatus(
        i,
        lastCompleted,
        missionStatus,
        step.id,
      );
      const meta = STEP_LABELS[step.id] ?? { label: step.id };
      const kind: MissionDagNodeKind = this.classifyKind(step.id);
      const layout: MissionDagLayoutHint =
        step.id === WRITER_STEP_ID ? "split" : "spine";
      const dag = step.dag;
      const rerunable = dag?.rerunable ?? true;
      const rerunableReason = dag?.rerunableReason;

      nodes.push({
        id: step.id,
        kind,
        label: meta.label,
        sub:
          step.id === "s2-leader-plan" && dims.length > 0
            ? `${dims.length} 维度`
            : meta.sub,
        status,
        rerunable,
        rerunableReason,
        layout,
      });
    }

    // 2) S3 展开:为每个维度生成一个 research-dim 子节点
    //    状态先复用 parent S3 状态(精细到每维度的运行态需要从 events 派生,放到 Phase 2)
    const s3Idx = stepIndexById.get(RESEARCH_STEP_ID) ?? -1;
    const s3Status =
      s3Idx >= 0
        ? this.deriveMacroStatus(
            s3Idx,
            lastCompleted,
            missionStatus,
            RESEARCH_STEP_ID,
          )
        : "idle";
    const s3Step = steps[s3Idx];
    const s3Rerunable = s3Step?.dag?.rerunable ?? true;
    for (const dim of dims) {
      const dimId = `${RESEARCH_STEP_ID}::${dim.id}`;
      nodes.push({
        id: dimId,
        kind: "research-dim",
        label: `R · ${this.shortDim(dim.name)}`,
        sub: dim.name,
        status: s3Status,
        rerunable: s3Rerunable, // 子节点继承父 stage 的 rerunable
        rerunableReason: s3Step?.dag?.rerunableReason,
        layout: "fan",
        dimensionRef: dim.name,
        parentStepId: RESEARCH_STEP_ID,
      });
    }

    // 3) 边
    //    3a) macro stage 沿 pipeline 顺序的 flow 边(用每个 step 的 successors 的"直接后继",
    //        其它远距 successors 在 dag-meta 里只是 cascade 链,不用画)
    //    简化:用 pipeline 数组顺序 i → i+1 作为可视的 flow 边,跳过 S3(由 fan 替代)
    for (let i = 0; i < steps.length - 1; i++) {
      const from = steps[i].id;
      const to = steps[i + 1].id;
      // S2 -> S3 fan, S3 -> S4 fan: 由下面 fan-out / fan-in 替代,这里跳过
      if (from === "s2-leader-plan" && to === RESEARCH_STEP_ID) continue;
      if (from === RESEARCH_STEP_ID && to === "s4-leader-assess") continue;
      edges.push({ from, to, kind: "flow" });
    }
    // 3b) S2 → 每个 research-dim(fan-out)
    for (const dim of dims) {
      edges.push({
        from: "s2-leader-plan",
        to: `${RESEARCH_STEP_ID}::${dim.id}`,
        kind: "fan",
      });
    }
    // 3c) 每个 research-dim → S4(fan-in)
    for (const dim of dims) {
      edges.push({
        from: `${RESEARCH_STEP_ID}::${dim.id}`,
        to: "s4-leader-assess",
        kind: "fan",
      });
    }
    // 3d) 若没有维度(早期/失败),保留 S2 → S3 → S4 直边
    if (dims.length === 0) {
      edges.push({
        from: "s2-leader-plan",
        to: RESEARCH_STEP_ID,
        kind: "flow",
      });
      edges.push({
        from: RESEARCH_STEP_ID,
        to: "s4-leader-assess",
        kind: "flow",
      });
    }
    // 3e) Writer ⇄ Reviewer 重写回环(写到 reviewer 第一个: s8b)
    edges.push({
      from: REVIEWER_STEP_IDS[0],
      to: WRITER_STEP_ID,
      kind: "rewrite-loop",
    });
    // 3f) 签收 patch self-loop
    edges.push({
      from: SIGNOFF_STEP_ID,
      to: SIGNOFF_STEP_ID,
      kind: "self-loop",
    });

    return {
      missionId,
      mission: {
        status: missionStatus,
        topic: mission.topic,
        finalScore: mission.finalScore,
      },
      nodes,
      edges,
    };
  }

  /** 重跑级联预览 */
  async computeCascade(
    missionId: string,
    userId: string,
    nodeId: string,
  ): Promise<MissionDagCascadePreview> {
    const graph = await this.buildGraph(missionId, userId);
    const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
    const origin = nodeMap.get(nodeId);
    if (!origin) {
      throw new NotFoundException(`node ${nodeId} not in mission dag`);
    }
    if (!origin.rerunable) {
      return {
        origin: nodeId,
        willRerun: [],
        kept: graph.nodes.filter((n) => n.id !== nodeId).map((n) => n.id),
        rerunable: false,
        reason: origin.rerunableReason ?? "该节点不允许重跑",
      };
    }

    // 起点对应的 stepId(若是 research-dim,映射回 s3-researcher-collect)
    const originStepId =
      origin.kind === "research-dim" ? origin.parentStepId! : origin.id;
    const steps = PLAYGROUND_PIPELINE.steps;
    const stepById = new Map(steps.map((s) => [s.id, s]));
    const fromStep = stepById.get(originStepId);
    if (!fromStep) {
      throw new NotFoundException(`step ${originStepId} not in pipeline`);
    }
    // dag.successors 是 cascade 的传递闭包枚举(playground.config 里已展开),
    // 直接拿来用
    const cascadeSet = new Set<string>(fromStep.dag?.successors ?? []);

    // 把级联里的 stepId 翻译成节点 ids:
    //   - macro 节点直接保留 stepId
    //   - 若级联包含 RESEARCH_STEP_ID,扩展成所有 research-dim 子节点(同维度全跑)
    const willRerun: string[] = [];
    for (const sid of cascadeSet) {
      if (sid === RESEARCH_STEP_ID) {
        // 该维度自身的 research-dim 在 origin 是 research-dim 时不入列(它就是起点;
        //   但通常 research-dim 的 successors 不含自身)
        // 其它情况: macro cascade 链路里包含 S3 → 14 个子节点都重跑
        for (const n of graph.nodes) {
          if (n.kind === "research-dim" && n.id !== nodeId)
            willRerun.push(n.id);
        }
        if (origin.kind !== "research-dim") {
          // origin 是上游 macro(S1/S2) → research-dim 起点也要重跑
          // 但起点 nodeId 已是 origin,不重复加
        }
        willRerun.push(sid); // macro 标记本身
      } else {
        willRerun.push(sid);
      }
    }
    const willSet = new Set(willRerun);
    willSet.delete(nodeId); // 起点不算下游
    const kept = graph.nodes
      .filter((n) => n.id !== nodeId && !willSet.has(n.id))
      .map((n) => n.id);

    return {
      origin: nodeId,
      willRerun: [...willSet],
      kept,
      rerunable: true,
    };
  }

  // ─── helpers ──────────────────────────────────────────────────────

  private classifyKind(stepId: string): MissionDagNodeKind {
    if (stepId === WRITER_STEP_ID) return "writer";
    if (
      REVIEWER_STEP_IDS.includes(stepId as (typeof REVIEWER_STEP_IDS)[number])
    )
      return "reviewer";
    if (stepId === PERSIST_STEP_ID) return "persist";
    return "macro";
  }

  /**
   * 推 macro 状态:
   *   stepIdx < lastCompleted   → done
   *   stepIdx === lastCompleted → 取 mission.status(running/failed/etc.)
   *   stepIdx > lastCompleted   → idle
   * 已完成 mission 中所有 step 视作 done(除非 mission failed,失败 step = failed)。
   */
  private deriveMacroStatus(
    stepIdx: number,
    lastCompleted: number,
    missionStatus: string,
    _stepId: string,
  ): MissionDagNodeStatus {
    if (missionStatus === "completed") return "done";
    if (missionStatus === "cancelled") {
      if (stepIdx <= lastCompleted) return "done";
      return "cancelled";
    }
    if (missionStatus === "failed") {
      if (stepIdx < lastCompleted) return "done";
      if (stepIdx === lastCompleted) return "failed";
      return "idle";
    }
    // running / starting / idle
    if (stepIdx < lastCompleted) return "done";
    if (stepIdx === lastCompleted) {
      return missionStatus === "running" || missionStatus === "starting"
        ? "running"
        : "idle";
    }
    return "idle";
  }

  private normalizeDimensions(raw: unknown): DimRef[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((d, i): DimRef | null => {
        if (!d || typeof d !== "object") return null;
        const obj = d as { id?: unknown; name?: unknown };
        const name = typeof obj.name === "string" ? obj.name : null;
        if (!name) return null;
        const id = typeof obj.id === "string" && obj.id ? obj.id : `dim-${i}`;
        return { id, name };
      })
      .filter((x): x is DimRef => x !== null);
  }

  private shortDim(name: string): string {
    return name.length > 8 ? name.slice(0, 7) + "…" : name;
  }
}
