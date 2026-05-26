/**
 * fixture-replay.spec.ts —— Fixture replay scaffold（B1-3）
 *
 * 落地依据：thinning plan §B1-3 / §6.8 / §B2-4
 *
 * B1-3 阶段：仅验证 fixture 加载、必填字段、shape sanity。
 * B2-4 阶段：接入 MissionViewProjectorService.project()，断言 fixture.expectedView 等价 projector 输出。
 *
 * 当前断言走 listMaterializedFixtures（B1 只 materialize playground-completed），
 * 其余 8 个 fixture 在 B1-2 follow-up PR 完整 5 文件落盘后自动加入测试。
 */

import {
  KNOWN_FIXTURE_IDS,
  listMaterializedFixtures,
  loadFixture,
} from "../../../../../../__tests__/fixtures/mission/types";
import {
  TERMINAL_MISSION_STATUSES,
  type MissionStatus,
} from "../../../api/contracts/view-state.contract";

describe("§6.8 fixture catalog", () => {
  it("KNOWN_FIXTURE_IDS 覆盖 6 单点 + 3 组合态 = 9 类（§6.8.1 + §6.8.1.b）", () => {
    expect(KNOWN_FIXTURE_IDS).toHaveLength(9);
    expect(KNOWN_FIXTURE_IDS).toEqual(
      expect.arrayContaining([
        "playground-completed",
        "playground-failed",
        "playground-quality-failed",
        "playground-cancelled",
        "playground-reopened",
        "playground-resumable",
        "playground-partial-failure-mid-run",
        "playground-multi-stage-rerun-in-flight",
        "playground-multi-agent-retry",
      ]),
    );
  });

  it("至少 1 个 fixture 已 materialize（B1-2 reference fixture）", () => {
    const materialized = listMaterializedFixtures();
    expect(materialized.length).toBeGreaterThanOrEqual(1);
    expect(materialized).toContain("playground-completed");
  });
});

describe("§6.8 materialized fixture 形状一致性", () => {
  const materialized = listMaterializedFixtures();

  it.each(materialized)("[%s] meta.kind 必声明（§6.8.4.b mandatory）", (id) => {
    const bundle = loadFixture(id);
    expect(bundle.meta.kind).toMatch(
      /^(real-anonymized|synthetic|benchmark|stress)$/,
    );
  });

  it.each(materialized)(
    "[%s] mission-row 与 expected-view 的 mission.id 一致",
    (id) => {
      const bundle = loadFixture(id);
      expect(bundle.expectedView.mission.id).toBe(bundle.missionRow.id);
    },
  );

  it.each(materialized)(
    "[%s] expected-view.mission.status 在 §6.4.1 允许集合内",
    (id) => {
      const bundle = loadFixture(id);
      const allowed: ReadonlySet<MissionStatus> = new Set([
        "starting",
        "running",
        "completed",
        "failed",
        "cancelled",
        "quality-failed",
      ]);
      expect(allowed.has(bundle.expectedView.mission.status)).toBe(true);
    },
  );

  it.each(materialized)(
    "[%s] terminal status 必伴随 resumable=false（除非 reopened/resumable 类显式覆盖）",
    (id) => {
      const bundle = loadFixture(id);
      const isTerminal = TERMINAL_MISSION_STATUSES.has(
        bundle.expectedView.mission.status,
      );
      if (isTerminal && id !== "playground-resumable" && id !== "playground-reopened") {
        expect(bundle.expectedView.mission.resumable).toBe(false);
      }
    },
  );

  it.each(materialized)("[%s] events seq 严格单调递增", (id) => {
    const bundle = loadFixture(id);
    for (let i = 1; i < bundle.events.length; i++) {
      expect(bundle.events[i].seq).toBeGreaterThan(bundle.events[i - 1].seq);
    }
  });

  it.each(materialized)(
    "[%s] events 数 ≤ 50 除非 meta 标 benchmark/stress（§6.8.4.b limit）",
    (id) => {
      const bundle = loadFixture(id);
      const isBenchmark =
        bundle.meta.kind === "benchmark" || bundle.meta.kind === "stress";
      if (!isBenchmark) {
        expect(bundle.events.length).toBeLessThanOrEqual(50);
      }
    },
  );
});

describe("§B2-4 projector replay (placeholder, B2 接入)", () => {
  it.todo(
    "MissionViewProjectorService.project(bundle.missionRow, bundle.events, bundle.checkpoint) === bundle.expectedView for each materialized fixture",
  );

  it.todo("500-event benchmark fixture 投影时间在 projector benchmark 上限内");
});
