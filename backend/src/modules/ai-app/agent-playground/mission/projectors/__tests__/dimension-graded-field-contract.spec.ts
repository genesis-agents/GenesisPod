/**
 * dimension-graded-field-contract.spec.ts
 *
 * 锁定 mission-view.projector 与 per-dim-pipeline emitter +
 * DimensionGradedSchema 三者间 `overall` 字段名一致性。
 *
 * 2026-05-27 回归 fix：projector 之前读 `p.overallScore`，emitter 实际写
 * `p.overall`，导致所有 dim grade.overall 都是 0/100。本 spec 锁住字段名不漂移。
 */

import type { MissionDetail } from "../../lifecycle/mission-store.service";
import type { MissionQueryInputs } from "../../query/mission-query.service";
import { projectMissionView } from "../mission-view.projector";

function makeInputs(
  events: Array<{ type: string; payload: unknown; timestamp: number }>,
): MissionQueryInputs {
  const baseTs = 1700000000000;
  const row: MissionDetail = {
    id: "m-1",
    userId: "u-1",
    topic: "test",
    depth: "deep",
    language: "zh-CN",
    maxCredits: null,
    status: "completed",
    startedAt: new Date(baseTs - 1000),
    completedAt: new Date(baseTs + events.length * 1000),
    failedAt: null,
    cancelledAt: null,
    themeSummary: null,
    dimensions: [
      { name: "DimA", rationale: "test" },
    ] as MissionDetail["dimensions"],
    finalScore: null,
    errorMessage: null,
    reportFull: null,
    reconciliationReport: null,
    lastCompletedStage: 11,
  } as unknown as MissionDetail;

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
  };
}

describe("§ dimension:graded payload contract — projector reads `overall` not `overallScore`", () => {
  it("projector 把 payload.overall 写入 dimensionPipelines[dim].grade.overall", () => {
    const view = projectMissionView(
      makeInputs([
        {
          type: "agent-playground.dimension:graded",
          payload: {
            dimension: "DimA",
            overall: 85,
            grade: "A",
            summary: "ok",
          },
          timestamp: 1700000000000,
        },
      ]),
    );

    const pipe = view.dimensionPipelines["DimA"];
    expect(pipe).toBeDefined();
    expect(pipe.grade).toBeDefined();
    expect(pipe.grade?.overall).toBe(85);
    expect(pipe.grade?.grade).toBe("A");
  });

  it("payload 用旧字段名 overallScore（错的）→ overall 兜底 0（防止 silent fallback）", () => {
    const view = projectMissionView(
      makeInputs([
        {
          type: "agent-playground.dimension:graded",
          payload: {
            dimension: "DimA",
            overallScore: 85, // 错误字段名
            grade: "A",
            summary: "x",
          },
          timestamp: 1700000000000,
        },
      ]),
    );

    expect(view.dimensionPipelines["DimA"].grade?.overall).toBe(0);
  });

  it("payload.overall 非 number → 兜底 0", () => {
    const view = projectMissionView(
      makeInputs([
        {
          type: "agent-playground.dimension:graded",
          payload: {
            dimension: "DimA",
            overall: "85",
            grade: "A",
            summary: "x",
          },
          timestamp: 1700000000000,
        },
      ]),
    );

    expect(view.dimensionPipelines["DimA"].grade?.overall).toBe(0);
  });

  it("chapter:writing:* / chapter:done 用 payload.chapterIndex（不是 p.index）", () => {
    // 模拟 cache hit 6 个事件：3 章 × 2 事件 (writing:started + done)，所有事件
    // 都用相同 chapterIndex —— projector 应该把 3 章合并成 3 个 entries 而不是
    // 6 个（之前 bug：读 p.index → undefined → 每次 push）。
    const view = projectMissionView(
      makeInputs([
        {
          type: "agent-playground.chapter:writing:started",
          payload: {
            dimension: "DimA",
            chapterIndex: 1,
            heading: "Ch 1",
            attempt: 1,
          },
          timestamp: 1700000000001,
        },
        {
          type: "agent-playground.chapter:done",
          payload: {
            dimension: "DimA",
            chapterIndex: 1,
            wordCount: 1284,
          },
          timestamp: 1700000000002,
        },
        {
          type: "agent-playground.chapter:writing:started",
          payload: {
            dimension: "DimA",
            chapterIndex: 2,
            heading: "Ch 2",
            attempt: 1,
          },
          timestamp: 1700000000003,
        },
        {
          type: "agent-playground.chapter:done",
          payload: {
            dimension: "DimA",
            chapterIndex: 2,
            wordCount: 1350,
          },
          timestamp: 1700000000004,
        },
      ]),
    );

    const chapters = view.dimensionPipelines["DimA"].chapters;
    expect(chapters).toHaveLength(2);
    expect(chapters[0]).toMatchObject({
      index: 1,
      heading: "Ch 1",
      wordCount: 1284,
      status: "done",
    });
    expect(chapters[1]).toMatchObject({
      index: 2,
      heading: "Ch 2",
      wordCount: 1350,
      status: "done",
    });
  });

  it("chapter heading 在后续事件回补（首事件没 heading，后续事件有 → chapter.heading 被填）", () => {
    const view = projectMissionView(
      makeInputs([
        {
          type: "agent-playground.chapter:writing:started",
          payload: { dimension: "DimA", chapterIndex: 1, attempt: 1 },
          timestamp: 1700000000001,
        },
        {
          type: "agent-playground.chapter:done",
          payload: {
            dimension: "DimA",
            chapterIndex: 1,
            chapterTitle: "From done event",
            wordCount: 1284,
          },
          timestamp: 1700000000002,
        },
      ]),
    );

    expect(view.dimensionPipelines["DimA"].chapters).toHaveLength(1);
    expect(view.dimensionPipelines["DimA"].chapters[0].heading).toBe(
      "From done event",
    );
  });

  it("payload.failed / skipped / phase 也被 projector 接出来（防止失败 dim 误显示已完成）", () => {
    const view = projectMissionView(
      makeInputs([
        {
          type: "agent-playground.dimension:graded",
          payload: {
            dimension: "DimA",
            overall: 0,
            grade: "F",
            summary: "no findings",
            failed: true,
            skipped: false,
            phase: "no-findings",
          },
          timestamp: 1700000000000,
        },
      ]),
    );

    const g = view.dimensionPipelines["DimA"].grade!;
    expect(g.failed).toBe(true);
    expect(g.skipped).toBe(false);
    expect(g.phase).toBe("no-findings");
  });
});
