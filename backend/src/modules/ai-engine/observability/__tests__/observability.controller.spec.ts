/**
 * Unit tests for ObservabilityController
 */

import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException, CanActivate, ExecutionContext } from "@nestjs/common";
import { ObservabilityController } from "../observability.controller";
import { TraceCollectorService } from "../trace-collector.service";
import { JwtAuthGuard } from "../../../../common/guards/jwt-auth.guard";
import { AdminGuard } from "../../../../common/guards/admin.guard";
import type { TraceData, TraceSummary } from "../trace.interface";

// Override both guards to always allow access in tests
class AllowAllGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    return true;
  }
}

const mockTraceCollector = {
  listTraces: jest.fn(),
  getStats: jest.fn(),
  getTrace: jest.fn(),
};

function makeTraceSummary(overrides: Partial<TraceSummary> = {}): TraceSummary {
  return {
    id: "trace-1",
    name: "Research task",
    type: "research",
    status: "success",
    startTime: new Date("2024-01-01T00:00:00Z"),
    duration: 5000,
    spanCount: 3,
    ...overrides,
  };
}

function makeTraceData(overrides: Partial<TraceData> = {}): TraceData {
  return {
    id: "trace-1",
    name: "Research task",
    type: "research",
    status: "success",
    startTime: new Date("2024-01-01T00:00:00Z"),
    duration: 5000,
    metadata: { userId: "user-1" },
    spans: [],
    ...overrides,
  };
}

describe("ObservabilityController", () => {
  let controller: ObservabilityController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ObservabilityController],
      providers: [
        { provide: TraceCollectorService, useValue: mockTraceCollector },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(AllowAllGuard)
      .overrideGuard(AdminGuard)
      .useClass(AllowAllGuard)
      .compile();

    controller = module.get<ObservabilityController>(ObservabilityController);
  });

  describe("listTraces", () => {
    it("returns wrapped traces list with default limit", async () => {
      const traces = [makeTraceSummary()];
      mockTraceCollector.listTraces.mockResolvedValue(traces);

      const result = await controller.listTraces();

      expect(result).toEqual({ data: traces });
      expect(mockTraceCollector.listTraces).toHaveBeenCalledWith({
        type: undefined,
        limit: 50,
      });
    });

    it("passes type filter to trace collector", async () => {
      mockTraceCollector.listTraces.mockResolvedValue([]);

      await controller.listTraces("research");

      expect(mockTraceCollector.listTraces).toHaveBeenCalledWith({
        type: "research",
        limit: 50,
      });
    });

    it("parses custom limit from string query parameter", async () => {
      mockTraceCollector.listTraces.mockResolvedValue([]);

      await controller.listTraces(undefined, "20");

      expect(mockTraceCollector.listTraces).toHaveBeenCalledWith({
        type: undefined,
        limit: 20,
      });
    });

    it("falls back to default limit of 50 when limit is NaN", async () => {
      mockTraceCollector.listTraces.mockResolvedValue([]);

      await controller.listTraces(undefined, "invalid");

      expect(mockTraceCollector.listTraces).toHaveBeenCalledWith({
        type: undefined,
        limit: 50,
      });
    });

    it("returns empty data array when no traces found", async () => {
      mockTraceCollector.listTraces.mockResolvedValue([]);

      const result = await controller.listTraces();

      expect(result).toEqual({ data: [] });
    });

    it("passes both type and limit when both are provided", async () => {
      const traces = [
        makeTraceSummary({ type: "a2a_task" }),
        makeTraceSummary({ id: "trace-2", type: "a2a_task" }),
      ];
      mockTraceCollector.listTraces.mockResolvedValue(traces);

      const result = await controller.listTraces("a2a_task", "10");

      expect(mockTraceCollector.listTraces).toHaveBeenCalledWith({
        type: "a2a_task",
        limit: 10,
      });
      expect(result.data).toHaveLength(2);
    });
  });

  describe("getStats", () => {
    it("returns wrapped stats from trace collector", () => {
      const stats = {
        totalTraces: 100,
        runningTraces: 5,
        totalSpans: 320,
        byType: { research: 50, a2a_task: 30, team_execution: 20 },
        byStatus: { running: 5, success: 80, error: 15 },
      };
      mockTraceCollector.getStats.mockReturnValue(stats);

      const result = controller.getStats();

      expect(result).toEqual({ data: stats });
      expect(mockTraceCollector.getStats).toHaveBeenCalledTimes(1);
    });

    it("returns empty stats when no traces exist", () => {
      const emptyStats = {
        totalTraces: 0,
        runningTraces: 0,
        totalSpans: 0,
        byType: {},
        byStatus: { running: 0, success: 0, error: 0 },
      };
      mockTraceCollector.getStats.mockReturnValue(emptyStats);

      const result = controller.getStats();

      expect(result.data.totalTraces).toBe(0);
      expect(result.data.runningTraces).toBe(0);
    });
  });

  describe("getTrace", () => {
    it("returns wrapped trace data when trace is found", () => {
      const traceData = makeTraceData();
      mockTraceCollector.getTrace.mockReturnValue(traceData);

      const result = controller.getTrace("trace-1");

      expect(result).toEqual({ data: traceData });
      expect(mockTraceCollector.getTrace).toHaveBeenCalledWith("trace-1");
    });

    it("throws NotFoundException when trace is not found", () => {
      mockTraceCollector.getTrace.mockReturnValue(null);

      expect(() => controller.getTrace("nonexistent-trace")).toThrow(
        NotFoundException,
      );
    });

    it("throws NotFoundException with 'Trace not found' message", () => {
      mockTraceCollector.getTrace.mockReturnValue(null);

      expect(() => controller.getTrace("missing-id")).toThrow("Trace not found");
    });

    it("returns trace with spans when trace has span data", () => {
      const traceData = makeTraceData({
        spans: [
          {
            id: "span-1",
            traceId: "trace-1",
            name: "LLM Call",
            type: "llm_call",
            status: "success",
            startTime: new Date(),
            duration: 1200,
            metadata: {},
          },
        ],
      });
      mockTraceCollector.getTrace.mockReturnValue(traceData);

      const result = controller.getTrace("trace-1");

      expect(result.data.spans).toHaveLength(1);
      expect(result.data.spans[0].name).toBe("LLM Call");
    });

    it("calls getTrace with the exact ID from the URL param", () => {
      const traceData = makeTraceData({ id: "abc-def-123" });
      mockTraceCollector.getTrace.mockReturnValue(traceData);

      controller.getTrace("abc-def-123");

      expect(mockTraceCollector.getTrace).toHaveBeenCalledWith("abc-def-123");
    });
  });
});
