/**
 * mission-view-derivations.spec.ts —— P0-A 派生（memoryIndex / verdicts）回归守护
 *
 * 锁定两个契约矩阵（表 3）修复：
 *
 * 1. extractMemoryIndex 后缀匹配补 "memory:indexed"（注册名，playground.events.ts）。
 *    此前只匹配 "memory.index"/"memory:index" —— 即使发射端恢复 emit，canonical
 *    memoryIndex 也恒 null（MemoryIndexPanel 永远 "backend 待补数据"）。
 *
 * 2. extractVerdicts row 分支兼容能力轨 verifierVerdicts 形状 [{dimension,score}]
 *    （10 维客观评估逐维分，无 verifierId 字段）。此前 filter 要求 verifierId:string
 *    → row 命中但产出 []，且不回落 events 分支 → canonical verdicts 恒空。
 */

import { projectMissionView } from "../mission-view.projector";
import type { MissionQueryInputs } from "../../query/mission-query.service";
import type { MissionDetail } from "../../lifecycle/mission-store.service";

function fakeRow(overrides: Partial<MissionDetail> = {}): MissionDetail {
  return {
    id: "m-view-test",
    userId: "u-test",
    topic: "test",
    depth: "deep",
    language: "zh-CN",
    status: "running",
    startedAt: new Date("2026-06-10T00:00:00Z"),
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
    ...overrides,
  } as unknown as MissionDetail;
}

function makeInputs(
  row: MissionDetail,
  events: MissionQueryInputs["events"],
): MissionQueryInputs {
  return {
    mode: "row-loaded",
    missionId: row.id,
    row,
    events,
    resume: { resumable: false, reason: undefined },
    rerunnableStages: [],
    reportVersions: [],
    composedArtifact: {
      kind: "empty-artifact",
      reason: "not-yet-materialized",
    },
  } as MissionQueryInputs;
}

describe("§ extractMemoryIndex 后缀匹配（矩阵表 3 memory:indexed）", () => {
  it("'playground.memory:indexed'（注册名）→ memoryIndex 非 null", () => {
    const view = projectMissionView(
      makeInputs(fakeRow(), [
        {
          type: "playground.memory:indexed",
          payload: { chunks: 12, namespace: "u-test", tags: ["deep-insight"] },
          timestamp: 1700000000000,
        },
      ]),
    );
    expect(view.memoryIndex).not.toBeNull();
    expect(view.memoryIndex?.chunks).toBe(12);
    expect(view.memoryIndex?.namespace).toBe("u-test");
    expect(view.memoryIndex?.tags).toEqual(["deep-insight"]);
  });

  it("旧后缀 'memory:index' 兼容保留", () => {
    const view = projectMissionView(
      makeInputs(fakeRow(), [
        {
          type: "playground.memory:index",
          payload: { chunks: 3 },
          timestamp: 1700000000000,
        },
      ]),
    );
    expect(view.memoryIndex?.chunks).toBe(3);
  });

  it("无 memory 事件 → memoryIndex null", () => {
    const view = projectMissionView(makeInputs(fakeRow(), []));
    expect(view.memoryIndex).toBeNull();
  });
});

describe("§ extractVerdicts row 分支 verifierId 缺失兼容（矩阵表 3 verdicts 恒空）", () => {
  it("row.verdicts=[{dimension,score}]（能力轨 S10 形状）→ verifierId 回退 dimension", () => {
    const view = projectMissionView(
      makeInputs(
        fakeRow({
          verdicts: [
            { dimension: "accuracy", score: 86 },
            { dimension: "depth", score: 74 },
          ],
        }),
        [],
      ),
    );
    expect(view.verdicts).toHaveLength(2);
    expect(view.verdicts[0]).toMatchObject({
      verifierId: "accuracy",
      score: 86,
    });
    expect(view.verdicts[1]).toMatchObject({ verifierId: "depth", score: 74 });
  });

  it("row.verdicts 带显式 verifierId（基线形状）→ 原样保留", () => {
    const view = projectMissionView(
      makeInputs(
        fakeRow({
          verdicts: [{ verifierId: "critic-eval", score: 80, critique: "ok" }],
        }),
        [],
      ),
    );
    expect(view.verdicts).toEqual([
      expect.objectContaining({
        verifierId: "critic-eval",
        score: 80,
        critique: "ok",
      }),
    ]);
  });

  it("row.verdicts 全部不可用时回落 events 派生（不再 length>0 即 return []）", () => {
    const view = projectMissionView(
      makeInputs(fakeRow({ verdicts: [{ bogus: true }] }), [
        {
          type: "playground.verifier:verdict",
          payload: { verifierId: "critic-eval", score: 77 },
          timestamp: 1700000000000,
        },
      ]),
    );
    expect(view.verdicts).toEqual([
      expect.objectContaining({ verifierId: "critic-eval", score: 77 }),
    ]);
  });
});
