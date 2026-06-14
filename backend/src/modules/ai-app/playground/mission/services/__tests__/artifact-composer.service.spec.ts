/**
 * ArtifactComposerService unit tests
 * Targets: src/modules/ai-app/playground/mission/services/artifact-composer.service.ts
 */

// Mock the artifact projector before imports so they're replaced in all usages
jest.mock(
  "@/modules/ai-app/playground/mission/projectors/artifact.projector",
  () => ({
    projectArtifact: jest.fn((row: unknown) => ({
      kind: "empty-artifact",
      reason: "not-yet-materialized",
      _row: row,
    })),
    normalizeV1ToV2: jest.fn((v1: unknown) => ({
      kind: "v2-normalized",
      _v1: v1,
    })),
  }),
);

jest.mock(
  "@/modules/ai-app/playground/api/contracts/artifact.contract",
  () => ({
    isReportArtifactV2: jest.fn((obj: unknown) => {
      if (!obj || typeof obj !== "object") return false;
      const r = obj as Record<string, unknown>;
      return !!r.content && !!r.sections;
    }),
  }),
);

import { ArtifactComposerService } from "../artifact-composer.service";
import {
  projectArtifact,
  normalizeV1ToV2,
} from "@/modules/ai-app/playground/mission/projectors/artifact.projector";
import { isReportArtifactV2 } from "@/modules/ai-app/playground/api/contracts/artifact.contract";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePrisma(overrides = {}) {
  return {
    agentPlaygroundMission: {
      findUnique: jest.fn().mockResolvedValue(null),
      ...overrides,
    },
  };
}

function makeR2(overrides = {}) {
  return {
    downloadText: jest.fn().mockResolvedValue(null),
    ...overrides,
  };
}

function makeRow(overrides = {}): any {
  return {
    id: "m1",
    reportFull: null,
    reportTitle: null,
    reportSummary: null,
    verdicts: null,
    reportArtifactVersion: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ArtifactComposerService", () => {
  let prisma: ReturnType<typeof makePrisma>;
  let r2: ReturnType<typeof makeR2>;
  let service: ArtifactComposerService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrisma();
    r2 = makeR2();
    service = new ArtifactComposerService(prisma as never, r2 as never);
  });

  // ── Path 1: inline reportFull ───────────────────────────────────────────────

  describe("Path 1: inline reportFull", () => {
    it("calls projectArtifact and returns result when row.reportFull is non-null", async () => {
      const mockArtifact = { kind: "report-v2", content: "text", sections: [] };
      (projectArtifact as jest.Mock).mockReturnValueOnce(mockArtifact);

      const row = makeRow({ reportFull: { sections: [], title: "T" } });
      const result = await service.composeArtifactView(row);

      expect(projectArtifact).toHaveBeenCalledWith(row);
      expect(result).toBe(mockArtifact);
    });

    it("does NOT call lookupReportFullUri when row.reportFull exists", async () => {
      (projectArtifact as jest.Mock).mockReturnValueOnce({
        kind: "empty-artifact",
      });
      const row = makeRow({ reportFull: {} });

      await service.composeArtifactView(row);

      expect(prisma.agentPlaygroundMission.findUnique).not.toHaveBeenCalled();
    });
  });

  // ── Path 2: off-load fetch ──────────────────────────────────────────────────

  describe("Path 2: off-load fetch when reportFull is null", () => {
    it("returns sentinel via projectArtifact when no URI found", async () => {
      prisma.agentPlaygroundMission.findUnique.mockResolvedValueOnce(null);
      const row = makeRow();
      const sentinel = {
        kind: "empty-artifact",
        reason: "not-yet-materialized",
      };
      (projectArtifact as jest.Mock).mockReturnValueOnce(sentinel);

      const result = await service.composeArtifactView(row);

      expect(result).toBe(sentinel);
    });

    it("returns sentinel via projectArtifact when row found but no URI", async () => {
      prisma.agentPlaygroundMission.findUnique.mockResolvedValueOnce({
        reportFullUri: null,
        reportFullSize: null,
      });
      const row = makeRow();
      const sentinel = { kind: "empty-artifact" };
      (projectArtifact as jest.Mock).mockReturnValueOnce(sentinel);

      const result = await service.composeArtifactView(row);

      expect(result).toBe(sentinel);
    });

    it("returns sentinel via projectArtifact when reportFullSize is 0", async () => {
      prisma.agentPlaygroundMission.findUnique.mockResolvedValueOnce({
        reportFullUri: "r2://bucket/key",
        reportFullSize: 0,
      });
      const row = makeRow();
      const sentinel = { kind: "empty-artifact" };
      (projectArtifact as jest.Mock).mockReturnValueOnce(sentinel);

      const result = await service.composeArtifactView(row);

      expect(result).toBe(sentinel);
    });

    it("returns sentinel when URI exists but r2 not wired", async () => {
      prisma.agentPlaygroundMission.findUnique.mockResolvedValueOnce({
        reportFullUri: "r2://bucket/key",
        reportFullSize: 100,
      });
      // Create service without r2
      const noR2Service = new ArtifactComposerService(
        prisma as never,
        undefined,
      );
      const row = makeRow();

      const result = await noR2Service.composeArtifactView(row);

      expect(result).toEqual({
        kind: "empty-artifact",
        reason: "v1-needs-normalization",
      });
    });

    it("strips r2:// prefix from URI before calling downloadText", async () => {
      prisma.agentPlaygroundMission.findUnique.mockResolvedValueOnce({
        reportFullUri: "r2://my-bucket/my/key.json",
        reportFullSize: 500,
      });
      const v2Data = {
        content: "text",
        sections: [{ heading: "H", body: "B" }],
      };
      (isReportArtifactV2 as jest.Mock).mockReturnValueOnce(true);
      r2.downloadText.mockResolvedValueOnce(JSON.stringify(v2Data));

      const row = makeRow();
      const result = await service.composeArtifactView(row);

      expect(r2.downloadText).toHaveBeenCalledWith("my-bucket/my/key.json");
      expect(result).toEqual(v2Data);
    });

    it("passes URI without r2:// prefix directly to downloadText", async () => {
      prisma.agentPlaygroundMission.findUnique.mockResolvedValueOnce({
        reportFullUri: "direct/path/key.json",
        reportFullSize: 100,
      });
      const v2Data = { content: "c", sections: [] };
      (isReportArtifactV2 as jest.Mock).mockReturnValueOnce(true);
      r2.downloadText.mockResolvedValueOnce(JSON.stringify(v2Data));

      const row = makeRow();
      await service.composeArtifactView(row);

      expect(r2.downloadText).toHaveBeenCalledWith("direct/path/key.json");
    });

    it("returns fetched v2 artifact directly when isReportArtifactV2 returns true", async () => {
      prisma.agentPlaygroundMission.findUnique.mockResolvedValueOnce({
        reportFullUri: "r2://bucket/key",
        reportFullSize: 100,
      });
      const v2Data = {
        content: "text",
        sections: [{ heading: "H", body: "B" }],
      };
      (isReportArtifactV2 as jest.Mock).mockReturnValueOnce(true);
      r2.downloadText.mockResolvedValueOnce(JSON.stringify(v2Data));

      const row = makeRow();
      const result = await service.composeArtifactView(row);

      expect(result).toEqual(v2Data);
    });

    it("normalizes v1 report with sections to v2", async () => {
      prisma.agentPlaygroundMission.findUnique.mockResolvedValueOnce({
        reportFullUri: "r2://bucket/key",
        reportFullSize: 100,
      });
      const v1Data = {
        title: "T",
        summary: "S",
        sections: [{ heading: "H", body: "B" }],
      };
      (isReportArtifactV2 as jest.Mock).mockReturnValueOnce(false);
      const v2Result = { kind: "v2-normalized", _v1: v1Data };
      (normalizeV1ToV2 as jest.Mock).mockReturnValueOnce(v2Result);
      r2.downloadText.mockResolvedValueOnce(JSON.stringify(v1Data));

      const row = makeRow();
      const result = await service.composeArtifactView(row);

      expect(normalizeV1ToV2).toHaveBeenCalledWith(v1Data);
      expect(result).toBe(v2Result);
    });

    it("normalizes v1 with summary field to v2", async () => {
      prisma.agentPlaygroundMission.findUnique.mockResolvedValueOnce({
        reportFullUri: "r2://bucket/key",
        reportFullSize: 100,
      });
      const v1Data = { summary: "S only, no sections" };
      (isReportArtifactV2 as jest.Mock).mockReturnValueOnce(false);
      (normalizeV1ToV2 as jest.Mock).mockReturnValueOnce({
        kind: "v2-from-summary",
      });
      r2.downloadText.mockResolvedValueOnce(JSON.stringify(v1Data));

      const row = makeRow();
      const result = await service.composeArtifactView(row);

      expect(normalizeV1ToV2).toHaveBeenCalledWith(v1Data);
      expect((result as any).kind).toBe("v2-from-summary");
    });

    it("normalizes v1 with title field to v2", async () => {
      prisma.agentPlaygroundMission.findUnique.mockResolvedValueOnce({
        reportFullUri: "r2://bucket/key",
        reportFullSize: 100,
      });
      const v1Data = { title: "Just a title" };
      (isReportArtifactV2 as jest.Mock).mockReturnValueOnce(false);
      (normalizeV1ToV2 as jest.Mock).mockReturnValueOnce({
        kind: "v2-from-title",
      });
      r2.downloadText.mockResolvedValueOnce(JSON.stringify(v1Data));

      const row = makeRow();
      const result = await service.composeArtifactView(row);

      expect((result as any).kind).toBe("v2-from-title");
    });

    it("returns sentinel when fetched data has no v1 shape and is not v2", async () => {
      prisma.agentPlaygroundMission.findUnique.mockResolvedValueOnce({
        reportFullUri: "r2://bucket/key",
        reportFullSize: 100,
      });
      const unknownData = { foo: "bar" }; // no sections/summary/title
      (isReportArtifactV2 as jest.Mock).mockReturnValueOnce(false);
      r2.downloadText.mockResolvedValueOnce(JSON.stringify(unknownData));

      const row = makeRow();
      const result = await service.composeArtifactView(row);

      expect(result).toEqual({
        kind: "empty-artifact",
        reason: "v1-needs-normalization",
      });
    });

    it("returns sentinel with reason when fetch returns null", async () => {
      prisma.agentPlaygroundMission.findUnique.mockResolvedValueOnce({
        reportFullUri: "r2://bucket/key",
        reportFullSize: 100,
      });
      r2.downloadText.mockResolvedValueOnce(null); // no content

      const row = makeRow();
      const result = await service.composeArtifactView(row);

      expect(result).toEqual({
        kind: "empty-artifact",
        reason: "v1-needs-normalization",
      });
    });

    it("returns sentinel when r2.downloadText throws", async () => {
      prisma.agentPlaygroundMission.findUnique.mockResolvedValueOnce({
        reportFullUri: "r2://bucket/key",
        reportFullSize: 100,
      });
      r2.downloadText.mockRejectedValueOnce(new Error("R2 network error"));

      const row = makeRow();
      const result = await service.composeArtifactView(row);

      // fetchOffloadedReportFull returns null on error → falls to sentinel
      expect(result).toEqual({
        kind: "empty-artifact",
        reason: "v1-needs-normalization",
      });
    });

    it("returns null and sentinel when lookupReportFullUri throws", async () => {
      prisma.agentPlaygroundMission.findUnique.mockRejectedValueOnce(
        new Error("DB error"),
      );
      const row = makeRow();
      const sentinel = { kind: "empty-artifact" };
      (projectArtifact as jest.Mock).mockReturnValueOnce(sentinel);

      const result = await service.composeArtifactView(row);

      // lookupReportFullUri caught error → returns null → projectArtifact fallback
      expect(result).toBe(sentinel);
    });
  });

  // ── lookupReportFullUri edge cases ──────────────────────────────────────────

  describe("lookupReportFullUri edge cases", () => {
    it("returns null when reportFullUri is empty string", async () => {
      prisma.agentPlaygroundMission.findUnique.mockResolvedValueOnce({
        reportFullUri: "",
        reportFullSize: 100,
      });
      const row = makeRow();
      const sentinel = { kind: "empty-artifact" };
      (projectArtifact as jest.Mock).mockReturnValueOnce(sentinel);

      const result = await service.composeArtifactView(row);

      expect(result).toBe(sentinel);
    });

    it("handles non-Error thrown in lookupReportFullUri (String(err) branch)", async () => {
      // Throw a non-Error string to exercise the String(err) branch
      prisma.agentPlaygroundMission.findUnique.mockRejectedValueOnce("timeout");
      const row = makeRow();
      const sentinel = { kind: "empty-artifact" };
      (projectArtifact as jest.Mock).mockReturnValueOnce(sentinel);

      const result = await service.composeArtifactView(row);

      expect(result).toBe(sentinel);
    });

    it("handles non-Error thrown in fetchOffloadedReportFull (String(err) branch)", async () => {
      prisma.agentPlaygroundMission.findUnique.mockResolvedValueOnce({
        reportFullUri: "r2://bucket/key",
        reportFullSize: 100,
      });
      // Throw a non-Error object to exercise String(err) branch in catch
      r2.downloadText.mockRejectedValueOnce({ code: "NETWORK_ERR" });

      const row = makeRow();
      const result = await service.composeArtifactView(row);

      expect(result).toEqual({
        kind: "empty-artifact",
        reason: "v1-needs-normalization",
      });
    });
  });
});
