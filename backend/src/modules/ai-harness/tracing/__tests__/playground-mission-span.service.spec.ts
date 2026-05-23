/**
 * playground-mission-span.service.spec.ts — R2-#38
 *
 * Unit tests for PlaygroundMissionSpanService.
 * Verifies that mission and stage spans are correctly started/ended via AgentTracer.
 */

import { PlaygroundMissionSpanService } from "../../../ai-app/agent-playground/services/mission/workflow/playground-mission-span.service";
import { AgentTracer } from "../../tracer/otel-tracer";

function makeSpan() {
  return {
    traceId: "trace-1",
    spanId: "span-1",
    parentSpanId: undefined as string | undefined,
    name: "test",
    attributes: {} as Record<string, unknown>,
    startedAt: Date.now(),
    end: jest.fn(),
    recordException: jest.fn(),
    setAttributes: jest.fn(),
  };
}

function makeTracer() {
  const span = makeSpan();
  const tracer: jest.Mocked<AgentTracer> = {
    startSpan: jest.fn().mockReturnValue(span),
  } as unknown as jest.Mocked<AgentTracer>;
  return { tracer, span };
}

describe("PlaygroundMissionSpanService", () => {
  describe("with tracer", () => {
    it("startMissionSpan starts a span named playground.mission", () => {
      const { tracer, span } = makeTracer();
      const svc = new PlaygroundMissionSpanService(tracer);
      svc.startMissionSpan("m1", "AI testing");
      expect(tracer.startSpan).toHaveBeenCalledWith(
        "playground.mission",
        expect.objectContaining({
          attributes: expect.objectContaining({
            missionId: "m1",
            topic: "AI testing",
          }),
        }),
      );
      // span captured — end not yet called
      expect(span.end).not.toHaveBeenCalled();
    });

    it("endMissionSpan calls span.end with completed status", () => {
      const { tracer, span } = makeTracer();
      const svc = new PlaygroundMissionSpanService(tracer);
      svc.startMissionSpan("m1", "AI testing");
      svc.endMissionSpan("m1", "completed");
      expect(span.end).toHaveBeenCalledWith({ status: "completed" });
    });

    it("endMissionSpan records exception on failed status", () => {
      const { tracer, span } = makeTracer();
      const svc = new PlaygroundMissionSpanService(tracer);
      svc.startMissionSpan("m1", "topic");
      const err = new Error("boom");
      svc.endMissionSpan("m1", "failed", err);
      expect(span.recordException).toHaveBeenCalledWith(err);
      expect(span.end).toHaveBeenCalledWith({ status: "failed" });
    });

    it("startStageSpan starts a child span under the mission span", () => {
      const { tracer } = makeTracer();
      const missionSpan = makeSpan();
      const stageSpan = makeSpan();
      tracer.startSpan
        .mockReturnValueOnce(missionSpan)
        .mockReturnValueOnce(stageSpan);
      const svc = new PlaygroundMissionSpanService(tracer);
      svc.startMissionSpan("m1", "topic");
      svc.startStageSpan("m1", "s3-researcher-collect", "research");
      expect(tracer.startSpan).toHaveBeenNthCalledWith(
        2,
        "playground.stage.s3-researcher-collect",
        expect.objectContaining({ parent: missionSpan }),
      );
    });

    it("endStageSpan ends the stage span with completed status", () => {
      const { tracer } = makeTracer();
      const mSpan = makeSpan();
      const sSpan = makeSpan();
      tracer.startSpan.mockReturnValueOnce(mSpan).mockReturnValueOnce(sSpan);
      const svc = new PlaygroundMissionSpanService(tracer);
      svc.startMissionSpan("m1", "topic");
      svc.startStageSpan("m1", "s2-leader-plan", "plan");
      svc.endStageSpan("m1", "s2-leader-plan", "completed");
      expect(sSpan.end).toHaveBeenCalledWith({ status: "completed" });
    });

    it("endStageSpan records exception when failed", () => {
      const { tracer } = makeTracer();
      const mSpan = makeSpan();
      const sSpan = makeSpan();
      tracer.startSpan.mockReturnValueOnce(mSpan).mockReturnValueOnce(sSpan);
      const svc = new PlaygroundMissionSpanService(tracer);
      svc.startMissionSpan("m1", "topic");
      svc.startStageSpan("m1", "s4-leader-assess", "assess");
      const err = new Error("stage failed");
      svc.endStageSpan("m1", "s4-leader-assess", "failed", err);
      expect(sSpan.recordException).toHaveBeenCalledWith(err);
      expect(sSpan.end).toHaveBeenCalledWith({ status: "failed" });
    });

    it("endStageSpan is a no-op for unknown stepId", () => {
      const { tracer } = makeTracer();
      const svc = new PlaygroundMissionSpanService(tracer);
      // Should not throw
      expect(() =>
        svc.endStageSpan("m1", "s99-nonexistent", "completed"),
      ).not.toThrow();
    });

    it("endMissionSpan is a no-op for unknown missionId", () => {
      const { tracer } = makeTracer();
      const svc = new PlaygroundMissionSpanService(tracer);
      expect(() => svc.endMissionSpan("unknown", "completed")).not.toThrow();
    });
  });

  describe("without tracer (Optional not provided)", () => {
    it("all methods are no-ops when tracer is absent", () => {
      const svc = new PlaygroundMissionSpanService(undefined);
      expect(() => svc.startMissionSpan("m1", "topic")).not.toThrow();
      expect(() =>
        svc.startStageSpan("m1", "s1-budget", "persist"),
      ).not.toThrow();
      expect(() =>
        svc.endStageSpan("m1", "s1-budget", "completed"),
      ).not.toThrow();
      expect(() => svc.endMissionSpan("m1", "completed")).not.toThrow();
    });
  });
});
