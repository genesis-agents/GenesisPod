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
