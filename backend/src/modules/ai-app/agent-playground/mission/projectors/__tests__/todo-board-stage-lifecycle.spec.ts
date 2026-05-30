/**
 * todo-board-stage-lifecycle.spec.ts —— 防 stage:lifecycle 回归（Screenshot_52）
 *
 * 根因复述：BusinessTeamMissionDispatcher emit 单事件 `stage:lifecycle` with
 * `payload.status="started"|"completed"|"failed"`。todo-board projector 之前
 * 只识别 split 形态（stage.started / stage:started 等），完全 miss 单事件 →
 * system stage todos 永远 status='pending' → UI 14 stage 行卡 "待启动"。
 *
 * 本 spec 验证 projector 正确处理 stage:lifecycle 单事件路径，避免再回归。
 */

import { projectTodoBoard } from "../todo-board.projector";
import type { MissionDetail } from "../../lifecycle/mission-store.service";

function fakeRow(): MissionDetail {
  return {
    id: "m-test",
    userId: "u-test",
    topic: "test",
    depth: "deep",
    language: "zh-CN",
    status: "running",
    startedAt: new Date("2026-05-27T00:00:00Z"),
    completedAt: null,
    elapsedWallTimeMs: null,
    finalScore: null,
    tokensUsed: null,
    costUsd: null,
    reportTitle: null,
    reportSummary: null,
    errorMessage: null,
    terminalOutcome: null,
    failureCode: null,
    configSnapshot: null,
    maxCredits: 300,
    themeSummary: null,
    dimensions: null,
    reportFull: null,
    verdicts: null,
    trajectoryStored: null,
    reportArtifactVersion: null,
    userProfile: null,
    reconciliationReport: null,
    leaderJournal: null,
    leaderOverallScore: null,
    leaderSigned: null,
    leaderVerdict: null,
    lastCompletedStage: null,
    outlinePlan: null,
    analystOutput: null,
    heartbeatAt: null,
    visibility: "PRIVATE",
  } as unknown as MissionDetail;
}

describe("§ todo-board projector × stage:lifecycle (Screenshot_52 regression guard)", () => {
  it("stage:lifecycle status=started → system todo 转 in_progress + startedAt", () => {
    const out = projectTodoBoard(fakeRow(), [
      {
        type: "agent-playground.stage:lifecycle",
        payload: { stepId: "s2-leader-plan", status: "started" },
        timestamp: 1700000000000,
      },
    ]);
    expect(out.kind).toBe("todo-board");
    const items = out.kind === "todo-board" ? (out.items ?? []) : [];
    const s2 = items.find((t) => t.systemStageId === "s2-leader-plan");
    expect(s2).toBeDefined();
    expect(s2!.status).toBe("in_progress");
    expect(s2!.startedAt).toBe(1700000000000);
  });

  it("stage:lifecycle status=completed → system todo 转 done + endedAt", () => {
    const out = projectTodoBoard(fakeRow(), [
      {
        type: "agent-playground.stage:lifecycle",
        payload: { stepId: "s2-leader-plan", status: "started" },
        timestamp: 1700000000000,
      },
      {
        type: "agent-playground.stage:lifecycle",
        payload: { stepId: "s2-leader-plan", status: "completed" },
        timestamp: 1700000001000,
      },
    ]);
    const items = out.kind === "todo-board" ? (out.items ?? []) : [];
    const s2 = items.find((t) => t.systemStageId === "s2-leader-plan");
    expect(s2!.status).toBe("done");
    expect(s2!.endedAt).toBe(1700000001000);
  });

  it("stage:lifecycle status=failed → system todo 转 failed + error narrative", () => {
    const out = projectTodoBoard(fakeRow(), [
      {
        type: "agent-playground.stage:lifecycle",
        payload: {
          stepId: "s5-reconciler",
          status: "failed",
          error: "LLM timeout",
        },
        timestamp: 1700000000000,
      },
    ]);
    const items = out.kind === "todo-board" ? (out.items ?? []) : [];
    const s5 = items.find((t) => t.systemStageId === "s5-reconciler");
    expect(s5!.status).toBe("failed");
    expect(s5!.endedAt).toBe(1700000000000);
    // narrative 包含 error 文本
    const errorNarr = s5!.narrativeLog.find((n) => n.text === "LLM timeout");
    expect(errorNarr).toBeDefined();
    expect(errorNarr!.tone).toBe("error");
  });

  it("已 done 不被重复 started 事件回退（status 状态机只前进）", () => {
    const out = projectTodoBoard(fakeRow(), [
      {
        type: "agent-playground.stage:lifecycle",
        payload: { stepId: "s2-leader-plan", status: "completed" },
        timestamp: 1700000001000,
      },
      // 之后又来一个 started（rerun 等场景）—— in_progress upsert 仅在 status===pending
      // 时生效，已 done 的不回退
      {
        type: "agent-playground.stage:lifecycle",
        payload: { stepId: "s2-leader-plan", status: "started" },
        timestamp: 1700000002000,
      },
    ]);
    const items = out.kind === "todo-board" ? (out.items ?? []) : [];
    const s2 = items.find((t) => t.systemStageId === "s2-leader-plan");
    expect(s2!.status).toBe("done"); // 维持 done，未回退
  });

  it("旧 split 形态（stage:started）兼容路径仍正常（fixture / legacy）", () => {
    const out = projectTodoBoard(fakeRow(), [
      {
        type: "agent-playground.stage:started",
        payload: { stepId: "s2-leader-plan" },
        timestamp: 1700000000000,
      },
    ]);
    const items = out.kind === "todo-board" ? (out.items ?? []) : [];
    const s2 = items.find((t) => t.systemStageId === "s2-leader-plan");
    expect(s2!.status).toBe("in_progress");
  });

  it("failed mission + 早期 stage 事件被 buffer evict → 失败点之前的 system stage 补 done（Screenshot_26/27 回归）", () => {
    // 单维度 local-rerun 场景：rerun 事件洪水把 s1/s2 的原始 done 事件挤出
    // MissionEventBuffer FIFO(5000)，projector 重放看不到 → 不修复会残留 pending →
    // 前端 sweepStatus 把 pending system stage 一律扫成 failed → s1/s2 误显红。
    const row = fakeRow();
    (row as { status: string }).status = "failed";
    const out = projectTodoBoard(row, [
      // s1/s2 的 done 事件已被 evict（此处缺失）；只剩 rerun 后的近期事件：
      {
        type: "agent-playground.stage:lifecycle",
        payload: { stepId: "s3-researcher-collect", status: "completed" },
        timestamp: 1700000003000,
      },
      {
        type: "agent-playground.stage:lifecycle",
        payload: {
          stepId: "s4-leader-assess",
          status: "failed",
          error: "cascade aborted",
        },
        timestamp: 1700000004000,
      },
    ]);
    const items = out.kind === "todo-board" ? (out.items ?? []) : [];
    const byStage = (id: string) => items.find((t) => t.systemStageId === id);
    // 失败点（s4，idx 3）之前的 system stage：s1/s2/s3 → 补 done
    expect(byStage("s1-budget")!.status).toBe("done");
    expect(byStage("s2-leader-plan")!.status).toBe("done");
    expect(byStage("s3-researchers")!.status).toBe("done");
    // 失败点本身维持 failed
    expect(byStage("s4-leader-assess")!.status).toBe("failed");
    // 失败点之后的 system stage 维持 pending（"停在哪里"语义，前端再按终态扫）
    expect(byStage("s5-reconciler")!.status).toBe("pending");
    expect(byStage("s11-persist")!.status).toBe("pending");
  });

  it("failed mission 早期失败（s1 failed）→ 不误补任何 stage 为 done", () => {
    const row = fakeRow();
    (row as { status: string }).status = "failed";
    const out = projectTodoBoard(row, [
      {
        type: "agent-playground.stage:lifecycle",
        payload: { stepId: "s1-budget", status: "failed", error: "余额不足" },
        timestamp: 1700000000000,
      },
    ]);
    const items = out.kind === "todo-board" ? (out.items ?? []) : [];
    const byStage = (id: string) => items.find((t) => t.systemStageId === id);
    expect(byStage("s1-budget")!.status).toBe("failed");
    // s2+ 没有任何 stage 跑过 → 不补 done，维持 pending
    expect(byStage("s2-leader-plan")!.status).toBe("pending");
    expect(byStage("s6-analyst")!.status).toBe("pending");
  });

  it("step-id 映射：s3-researcher-collect → s3-researchers（mapStepToFrontendStage）", () => {
    const out = projectTodoBoard(fakeRow(), [
      {
        type: "agent-playground.stage:lifecycle",
        payload: { stepId: "s3-researcher-collect", status: "started" },
        timestamp: 1700000000000,
      },
    ]);
    const items = out.kind === "todo-board" ? (out.items ?? []) : [];
    const s3 = items.find((t) => t.systemStageId === "s3-researchers");
    expect(s3).toBeDefined();
    expect(s3!.status).toBe("in_progress");
  });
});
