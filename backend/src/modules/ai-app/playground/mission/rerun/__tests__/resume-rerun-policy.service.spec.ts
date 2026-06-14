/**
 * ResumeRerunPolicyService — unit tests
 *
 * Covers:
 *   - ORDERED_STAGE_IDS: all 14 stages present, correct order
 *   - STAGE_RESUME_MATRIX: s1/s11/s12 have allowedIfCheckpoint=false
 *   - STAGE_RESUME_MATRIX: s2-s10 have allowedIfCheckpoint=true
 *   - loadCheckpointAvailability: no configSnapshot → {false, false}
 *   - loadCheckpointAvailability: configSnapshot but no checkpoint → {true, false}
 *   - loadCheckpointAvailability: configSnapshot + checkpoint → {true, true}
 *   - computeRerunnableStages: type-narrowing cast (returns array)
 */

import { Logger } from "@nestjs/common";

// Mock the checkpoint store that has complex prisma deps
jest.mock("../../lifecycle/prisma-mission-checkpoint.store", () => ({
  PrismaMissionCheckpointStore: jest.fn(),
}));

import {
  ResumeRerunPolicyService,
  ORDERED_STAGE_IDS,
} from "../resume-rerun-policy.service";

// Silence logger
beforeAll(() => {
  jest.spyOn(Logger.prototype, "log").mockImplementation(() => {});
  jest.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
  jest.spyOn(Logger.prototype, "error").mockImplementation(() => {});
});

// ── Mock the harness framework ────────────────────────────────────────────────

jest.mock("@/modules/ai-harness/facade", () => {
  class BusinessTeamResumeRerunPolicyFramework {
    protected _opts: Record<string, unknown>;

    constructor(opts: Record<string, unknown>) {
      this._opts = opts;
    }

    computeRerunnableStages(_input: unknown): unknown[] {
      // Simple mock: return empty array
      return [];
    }
  }

  return { BusinessTeamResumeRerunPolicyFramework };
});

// ── Mock checkpoint store ─────────────────────────────────────────────────────

function makeCheckpointStore(snapshot: unknown = null) {
  return { load: jest.fn().mockResolvedValue(snapshot) } as any;
}

// ── ORDERED_STAGE_IDS ─────────────────────────────────────────────────────────

describe("ORDERED_STAGE_IDS", () => {
  it("has 14 stages", () => {
    expect(ORDERED_STAGE_IDS).toHaveLength(14);
  });

  it("starts with s1-budget", () => {
    expect(ORDERED_STAGE_IDS[0]).toBe("s1-budget");
  });

  it("ends with s12-self-evolution", () => {
    expect(ORDERED_STAGE_IDS[ORDERED_STAGE_IDS.length - 1]).toBe(
      "s12-self-evolution",
    );
  });

  it("contains all expected stages", () => {
    const expected = [
      "s1-budget",
      "s2-leader-plan",
      "s3-researchers",
      "s4-leader-assess",
      "s5-reconciler",
      "s6-analyst",
      "s7-writer-outline",
      "s8-writer-draft",
      "s8b-quality-enhancement",
      "s9-critic-l4",
      "s9b-objective-evaluation",
      "s10-leader-signoff",
      "s11-persist",
      "s12-self-evolution",
    ];
    expect([...ORDERED_STAGE_IDS]).toEqual(expected);
  });

  it("is readonly (array)", () => {
    expect(Array.isArray(ORDERED_STAGE_IDS)).toBe(true);
  });
});

// ── loadCheckpointAvailability ────────────────────────────────────────────────

describe("ResumeRerunPolicyService.loadCheckpointAvailability", () => {
  it("no configSnapshot → returns {hasConfigSnapshot:false, hasCheckpoint:false}", async () => {
    const svc = new ResumeRerunPolicyService(makeCheckpointStore());
    const result = await svc.loadCheckpointAvailability({
      id: "m-1",
      configSnapshot: null,
    } as any);
    expect(result).toEqual({ hasConfigSnapshot: false, hasCheckpoint: false });
  });

  it("undefined configSnapshot → returns {hasConfigSnapshot:false, hasCheckpoint:false}", async () => {
    const svc = new ResumeRerunPolicyService(makeCheckpointStore());
    const result = await svc.loadCheckpointAvailability({
      id: "m-1",
      configSnapshot: undefined,
    } as any);
    expect(result).toEqual({ hasConfigSnapshot: false, hasCheckpoint: false });
  });

  it("no configSnapshot → checkpointStore.load NOT called", async () => {
    const store = makeCheckpointStore();
    const svc = new ResumeRerunPolicyService(store);
    await svc.loadCheckpointAvailability({
      id: "m-1",
      configSnapshot: null,
    } as any);
    expect(store.load).not.toHaveBeenCalled();
  });

  it("configSnapshot present but load returns null → {hasConfigSnapshot:true, hasCheckpoint:false}", async () => {
    const store = makeCheckpointStore(null);
    const svc = new ResumeRerunPolicyService(store);
    const result = await svc.loadCheckpointAvailability({
      id: "m-2",
      configSnapshot: { someData: true },
    } as any);
    expect(result).toEqual({ hasConfigSnapshot: true, hasCheckpoint: false });
    expect(store.load).toHaveBeenCalledWith("m-2");
  });

  it("configSnapshot present and load returns checkpoint → {hasConfigSnapshot:true, hasCheckpoint:true}", async () => {
    const store = makeCheckpointStore({ stage: "s5-reconciler", data: {} });
    const svc = new ResumeRerunPolicyService(store);
    const result = await svc.loadCheckpointAvailability({
      id: "m-3",
      configSnapshot: { version: 2 },
    } as any);
    expect(result).toEqual({ hasConfigSnapshot: true, hasCheckpoint: true });
  });

  it("checkpointStore.load called with mission.id", async () => {
    const store = makeCheckpointStore({ stage: "s3" });
    const svc = new ResumeRerunPolicyService(store);
    await svc.loadCheckpointAvailability({
      id: "mission-xyz",
      configSnapshot: { data: 1 },
    } as any);
    expect(store.load).toHaveBeenCalledWith("mission-xyz");
  });
});

// ── computeRerunnableStages ───────────────────────────────────────────────────

describe("ResumeRerunPolicyService.computeRerunnableStages", () => {
  it("returns an array (type-narrowing cast)", () => {
    const svc = new ResumeRerunPolicyService(makeCheckpointStore());
    const result = svc.computeRerunnableStages({
      completedStageIds: ["s1-budget"],
      hasCheckpoint: false,
      currentStageId: "s2-leader-plan",
    } as any);
    expect(Array.isArray(result)).toBe(true);
  });

  it("delegates to super (framework mock returns empty array)", () => {
    const svc = new ResumeRerunPolicyService(makeCheckpointStore());
    const result = svc.computeRerunnableStages({
      completedStageIds: [],
      hasCheckpoint: false,
    } as any);
    expect(result).toEqual([]);
  });
});

// ── Service constructor ───────────────────────────────────────────────────────

describe("ResumeRerunPolicyService constructor", () => {
  it("instantiates without error", () => {
    expect(
      () => new ResumeRerunPolicyService(makeCheckpointStore()),
    ).not.toThrow();
  });

  it("passes orderedStageIds and stageMatrix to framework", () => {
    const svc = new ResumeRerunPolicyService(makeCheckpointStore());
    const opts = (svc as any)._opts;
    expect(opts.orderedStageIds).toBeDefined();
    expect(opts.stageMatrix).toBeDefined();
    expect(opts.loggerNamespace).toBe("ResumeRerunPolicyService");
  });

  it("framework receives 14 orderedStageIds", () => {
    const svc = new ResumeRerunPolicyService(makeCheckpointStore());
    const opts = (svc as any)._opts;
    expect(opts.orderedStageIds).toHaveLength(14);
  });

  it("s1-budget in stageMatrix has allowedIfCheckpoint=false", () => {
    const svc = new ResumeRerunPolicyService(makeCheckpointStore());
    const matrix = (svc as any)._opts.stageMatrix as Record<
      string,
      { allowedIfCheckpoint: boolean }
    >;
    expect(matrix["s1-budget"].allowedIfCheckpoint).toBe(false);
  });

  it("s11-persist in stageMatrix has allowedIfCheckpoint=false", () => {
    const svc = new ResumeRerunPolicyService(makeCheckpointStore());
    const matrix = (svc as any)._opts.stageMatrix as Record<
      string,
      { allowedIfCheckpoint: boolean }
    >;
    expect(matrix["s11-persist"].allowedIfCheckpoint).toBe(false);
  });

  it("s12-self-evolution in stageMatrix has allowedIfCheckpoint=false", () => {
    const svc = new ResumeRerunPolicyService(makeCheckpointStore());
    const matrix = (svc as any)._opts.stageMatrix as Record<
      string,
      { allowedIfCheckpoint: boolean }
    >;
    expect(matrix["s12-self-evolution"].allowedIfCheckpoint).toBe(false);
  });

  it("s2-leader-plan in stageMatrix has allowedIfCheckpoint=true", () => {
    const svc = new ResumeRerunPolicyService(makeCheckpointStore());
    const matrix = (svc as any)._opts.stageMatrix as Record<
      string,
      { allowedIfCheckpoint: boolean }
    >;
    expect(matrix["s2-leader-plan"].allowedIfCheckpoint).toBe(true);
  });

  it("s3-s10 all have allowedIfCheckpoint=true", () => {
    const svc = new ResumeRerunPolicyService(makeCheckpointStore());
    const matrix = (svc as any)._opts.stageMatrix as Record<
      string,
      { allowedIfCheckpoint: boolean }
    >;
    const middleStages = [
      "s2-leader-plan",
      "s3-researchers",
      "s4-leader-assess",
      "s5-reconciler",
      "s6-analyst",
      "s7-writer-outline",
      "s8-writer-draft",
      "s8b-quality-enhancement",
      "s9-critic-l4",
      "s9b-objective-evaluation",
      "s10-leader-signoff",
    ];
    for (const stageId of middleStages) {
      expect(matrix[stageId].allowedIfCheckpoint).toBe(true);
    }
  });

  it("s1-budget reasonDenied is defined", () => {
    const svc = new ResumeRerunPolicyService(makeCheckpointStore());
    const matrix = (svc as any)._opts.stageMatrix as Record<
      string,
      { reasonDenied?: string }
    >;
    expect(matrix["s1-budget"].reasonDenied).toBeDefined();
    expect(matrix["s1-budget"].reasonDenied).toContain("cheap");
  });

  it("s11-persist reasonDenied mentions rerun or restart boundary", () => {
    const svc = new ResumeRerunPolicyService(makeCheckpointStore());
    const matrix = (svc as any)._opts.stageMatrix as Record<
      string,
      { reasonDenied?: string }
    >;
    expect(matrix["s11-persist"].reasonDenied).toContain("rerun");
  });

  it("s12-self-evolution reasonDenied mentions postlude", () => {
    const svc = new ResumeRerunPolicyService(makeCheckpointStore());
    const matrix = (svc as any)._opts.stageMatrix as Record<
      string,
      { reasonDenied?: string }
    >;
    expect(matrix["s12-self-evolution"].reasonDenied).toContain("postlude");
  });
});
