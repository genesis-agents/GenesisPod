/**
 * H4 — emitDecision should funnel through emitToTopic with ResearchEventType.DECISION
 * and include a generated timestamp. Thin test — the richer paths (observers, db
 * persistence, realtime adapter) are covered by the existing event-emitter spec.
 */
import { EventEmitter2 } from "@nestjs/event-emitter";
import {
  ResearchEventEmitterService,
  ResearchEventType,
} from "../event-emitter.service";

describe("ResearchEventEmitterService.emitDecision", () => {
  it("emits DECISION event with provided payload + timestamp", async () => {
    const nestEmitter = new EventEmitter2();
    const svc = new ResearchEventEmitterService(
      nestEmitter,
      {} as never, // prisma not exercised in this path
    );
    const spy = jest
      .spyOn(svc, "emitToTopic")
      .mockResolvedValue(undefined as never);

    await svc.emitDecision("topic-1", {
      missionId: "m-1",
      source: "ST-01-PLAN",
      kind: "plan_ready",
      summary: "Leader selected 4 research dimension(s)",
      details: { dimensionCount: 4 },
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const [topicId, event, data] = spy.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(topicId).toBe("topic-1");
    expect(event).toBe(ResearchEventType.DECISION);
    expect(data.missionId).toBe("m-1");
    expect(data.source).toBe("ST-01-PLAN");
    expect(data.kind).toBe("plan_ready");
    expect(typeof data.at).toBe("string");
  });
});
