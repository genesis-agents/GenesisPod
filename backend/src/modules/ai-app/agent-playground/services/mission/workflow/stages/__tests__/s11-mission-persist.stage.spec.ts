import { runPersistStage } from "../s11-mission-persist.stage";
import type { MissionDeps } from "../../mission-deps";

function makePool(tokensUsed = 10000, costUsd = 0.5) {
  return {
    snapshot: jest
      .fn()
      .mockReturnValue({ poolTokensUsed: tokensUsed, poolCostUsd: costUsd }),
  };
}

function makeDeps(overrides: Partial<MissionDeps> = {}): MissionDeps {
  return {
    emit: jest.fn().mockResolvedValue(undefined),
    log: {
      warn: jest.fn(),
      log: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
    },
    lifecycle: jest.fn().mockResolvedValue(undefined),
    store: {
      markCompleted: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  } as unknown as MissionDeps;
}

const BASE_RESULT = {
  report: { title: "AI Report", summary: "AI summary" },
  reportArtifact: {
    metadata: { topic: "AI Report" },
    quickView: { executiveSummary: { markdown: "Executive summary" } },
  },
  reviewScore: 82,
  trajectoryStored: 42,
  themeSummary: "AI is changing everything",
  dimensions: [{ id: "d1", name: "Market" }],
  verdicts: [{ score: 82 }],
  userProfile: { tier: "pro" },
  reconciliationReport: null,
  leaderSignOff: {
    leaderOverallScore: 82,
    leaderVerdict: "good" as const,
    signed: true,
  },
};

function makeArgs(overrides: Record<string, unknown> = {}) {
  return {
    missionId: "m11",
    userId: "u1",
    t0: Date.now() - 5000,
    result: BASE_RESULT,
    pool: makePool(),
    ...overrides,
  };
}

describe("runPersistStage (S11)", () => {
  it("signed=true → calls markCompleted", async () => {
    const deps = makeDeps();
    await runPersistStage(makeArgs(), deps);
    expect(deps.store.markCompleted).toHaveBeenCalled();
    expect(deps.store.markFailed).not.toHaveBeenCalled();
  });

  it("signed=false → calls markFailed with leader refusal message", async () => {
    const deps = makeDeps();
    const result = {
      ...BASE_RESULT,
      leaderSignOff: {
        leaderOverallScore: 35,
        leaderVerdict: "failed" as const,
        signed: false,
        refusalReason: "Coverage too low",
      },
    };
    await runPersistStage(makeArgs({ result }), deps);
    expect(deps.store.markFailed).toHaveBeenCalled();
    expect(deps.store.markCompleted).not.toHaveBeenCalled();
    const failArgs = (deps.store.markFailed as jest.Mock).mock.calls[0][1];
    expect(failArgs.errorMessage).toContain("Coverage too low");
  });

  it("no leaderSignOff → calls markFailed to avoid unsigned fake completion", async () => {
    const deps = makeDeps();
    const result = { ...BASE_RESULT, leaderSignOff: undefined };
    await runPersistStage(makeArgs({ result }), deps);
    expect(deps.store.markFailed).toHaveBeenCalled();
    expect(deps.store.markCompleted).not.toHaveBeenCalled();
    const failArgs = (deps.store.markFailed as jest.Mock).mock.calls[0][1];
    expect(failArgs.errorMessage).toContain("leader_signoff_missing");
  });

  it("markCompleted called with finalScore and tokensUsed", async () => {
    const deps = makeDeps();
    await runPersistStage(
      makeArgs({
        pool: makePool(15000, 0.8),
      }),
      deps,
    );
    const args = (deps.store.markCompleted as jest.Mock).mock.calls[0][1];
    expect(args.finalScore).toBe(82);
    expect(args.tokensUsed).toBe(15000);
    expect(args.costUsd).toBe(0.8);
  });

  it("reportArtifact v2 → reportArtifactVersion=2 in markCompleted", async () => {
    const deps = makeDeps();
    await runPersistStage(makeArgs(), deps);
    const args = (deps.store.markCompleted as jest.Mock).mock.calls[0][1];
    expect(args.reportArtifactVersion).toBe(2);
  });

  it("no reportArtifact → reportArtifactVersion=1, uses v1 report", async () => {
    const deps = makeDeps();
    const result = { ...BASE_RESULT, reportArtifact: undefined };
    await runPersistStage(makeArgs({ result }), deps);
    const args = (deps.store.markCompleted as jest.Mock).mock.calls[0][1];
    expect(args.reportArtifactVersion).toBe(1);
  });

  it("elapsedWallTimeMs = now - t0 approximately", async () => {
    const deps = makeDeps();
    const t0 = Date.now() - 10000;
    await runPersistStage(makeArgs({ t0 }), deps);
    const args = (deps.store.markCompleted as jest.Mock).mock.calls[0][1];
    expect(args.elapsedWallTimeMs).toBeGreaterThan(9000);
    expect(args.elapsedWallTimeMs).toBeLessThan(20000);
  });

  it("trajectoryStored included in markCompleted payload", async () => {
    const deps = makeDeps();
    await runPersistStage(makeArgs(), deps);
    const args = (deps.store.markCompleted as jest.Mock).mock.calls[0][1];
    expect(args.trajectoryStored).toBe(42);
  });

  it("leaderSignOff data passed to markCompleted", async () => {
    const deps = makeDeps();
    await runPersistStage(makeArgs(), deps);
    const args = (deps.store.markCompleted as jest.Mock).mock.calls[0][1];
    expect(args.leaderOverallScore).toBe(82);
    expect(args.leaderSigned).toBe(true);
    expect(args.leaderVerdict).toBe("good");
  });

  it("markFailed includes leaderOverallScore and leaderVerdict when signed=false", async () => {
    const deps = makeDeps();
    const result = {
      ...BASE_RESULT,
      leaderSignOff: {
        leaderOverallScore: 45,
        leaderVerdict: "failed" as const,
        signed: false,
        refusalReason: "Insufficient coverage",
      },
    };
    await runPersistStage(makeArgs({ result }), deps);
    const args = (deps.store.markFailed as jest.Mock).mock.calls[0][1];
    expect(args.leaderOverallScore).toBe(45);
    expect(args.leaderSigned).toBe(false);
    expect(args.leaderVerdict).toBe("failed");
  });

  it("missionId is passed as first arg to store methods", async () => {
    const deps = makeDeps();
    await runPersistStage(makeArgs({ missionId: "mission-42" }), deps);
    expect((deps.store.markCompleted as jest.Mock).mock.calls[0][0]).toBe(
      "mission-42",
    );
  });

  it("persist failure → logs error, emits persist-failed, rethrows", async () => {
    const deps = makeDeps();
    (deps.store.markCompleted as jest.Mock).mockRejectedValue(
      new Error("DB write failed"),
    );
    await expect(runPersistStage(makeArgs(), deps)).rejects.toThrow(
      "DB write failed",
    );
    expect(deps.log.error as jest.Mock).toHaveBeenCalledWith(
      expect.stringContaining("persist failed"),
    );
    const persistFailedCall = (deps.emit as jest.Mock).mock.calls.find(
      (c) => c[0].type === "agent-playground.mission:persist-failed",
    );
    expect(persistFailedCall).toBeDefined();
  });

  it("persist failure with non-Error thrown → String(err) used in log", async () => {
    const deps = makeDeps();
    (deps.store.markCompleted as jest.Mock).mockRejectedValue("string error");
    await expect(runPersistStage(makeArgs(), deps)).rejects.toBe(
      "string error",
    );
    expect(deps.log.error as jest.Mock).toHaveBeenCalledWith(
      expect.stringContaining("persist failed"),
    );
  });

  describe("chapter content guard", () => {
    function makeArtifactWithSections(
      sectionLengths: number[],
    ): typeof BASE_RESULT.reportArtifact & {
      sections: Array<{
        title?: string;
        startOffset: number;
        endOffset: number;
      }>;
      content: { fullMarkdown: string };
    } {
      const sections: Array<{
        title?: string;
        startOffset: number;
        endOffset: number;
      }> = [];
      const parts: string[] = [];
      let offset = 0;

      for (const [index, len] of sectionLengths.entries()) {
        const title = `Section ${index + 1}`;
        const sectionText = `## ${title}\n\n${"x".repeat(len)}`;
        sections.push({
          title,
          startOffset: offset,
          endOffset: offset + sectionText.length,
        });
        parts.push(sectionText);
        offset += sectionText.length + 2;
      }

      const fullMarkdown = parts.join("\n\n");
      return {
        ...BASE_RESULT.reportArtifact,
        sections,
        content: { fullMarkdown },
      };
    }

    it("all sections >= 500 chars → markCompleted called normally", async () => {
      const deps = makeDeps();
      const reportArtifact = makeArtifactWithSections([600, 600, 600, 600]);
      await runPersistStage(
        makeArgs({
          result: { ...BASE_RESULT, reportArtifact },
        }),
        deps,
      );
      expect(deps.store.markCompleted).toHaveBeenCalled();
      expect(deps.store.markFailed).not.toHaveBeenCalled();
    });

    it("< 50% sections have content → markFailed with chapter_content_below_threshold", async () => {
      const deps = makeDeps();
      const reportArtifact = makeArtifactWithSections([600, 100, 100, 100]);
      await runPersistStage(
        makeArgs({
          result: { ...BASE_RESULT, reportArtifact },
        }),
        deps,
      );
      expect(deps.store.markFailed).toHaveBeenCalled();
      expect(deps.store.markCompleted).not.toHaveBeenCalled();
      const failArgs = (deps.store.markFailed as jest.Mock).mock.calls[0][1];
      expect(failArgs.errorMessage).toContain(
        "chapter_content_below_threshold",
      );
    });

    it("0 sections (no-chapter mode) → skips guard, markCompleted called normally", async () => {
      const deps = makeDeps();
      const reportArtifact = {
        ...BASE_RESULT.reportArtifact,
        sections: [] as Array<{
          title?: string;
          startOffset: number;
          endOffset: number;
        }>,
        content: { fullMarkdown: "" },
      };
      await runPersistStage(
        makeArgs({
          result: { ...BASE_RESULT, reportArtifact },
        }),
        deps,
      );
      expect(deps.store.markCompleted).toHaveBeenCalled();
      expect(deps.store.markFailed).not.toHaveBeenCalled();
    });

    it("coverage exactly 50% → markCompleted (boundary: >= MIN_COVERAGE passes)", async () => {
      const deps = makeDeps();
      const reportArtifact = makeArtifactWithSections([600, 100]);
      await runPersistStage(
        makeArgs({
          result: { ...BASE_RESULT, reportArtifact },
        }),
        deps,
      );
      expect(deps.store.markCompleted).toHaveBeenCalled();
      expect(deps.store.markFailed).not.toHaveBeenCalled();
    });

    it("heading-only chapters fail even if the raw span is long", async () => {
      const deps = makeDeps();
      const fullMarkdown =
        "## Section 1\n\n" +
        "x".repeat(700) +
        "\n\n## Section 2\n\n### Outline only\n\n- bullet a\n- bullet b\n";
      const secondSectionStart = fullMarkdown.indexOf("## Section 2");
      const reportArtifact = {
        ...BASE_RESULT.reportArtifact,
        sections: [
          {
            title: "Section 1",
            startOffset: 0,
            endOffset: secondSectionStart,
          },
          {
            title: "Section 2",
            startOffset: secondSectionStart,
            endOffset: fullMarkdown.length,
          },
        ],
        content: { fullMarkdown },
      };
      await runPersistStage(
        makeArgs({
          result: { ...BASE_RESULT, reportArtifact },
        }),
        deps,
      );
      expect(deps.store.markFailed).toHaveBeenCalled();
      const failArgs = (deps.store.markFailed as jest.Mock).mock.calls[0][1];
      expect(failArgs.errorMessage).toContain("chapter_content_incomplete");
    });
  });
});
