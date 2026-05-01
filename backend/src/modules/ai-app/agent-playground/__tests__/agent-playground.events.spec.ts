import { AGENT_PLAYGROUND_EVENTS } from "../agent-playground.events";

describe("AGENT_PLAYGROUND_EVENTS", () => {
  it("registers production events consumed by the playground UI", () => {
    const registered = new Set(AGENT_PLAYGROUND_EVENTS.map((e) => e.type));

    for (const type of [
      "agent-playground.mission:warning",
      "agent-playground.mission:degraded",
      "agent-playground.dimension:retry-failed",
      "agent-playground.chapter:done",
    ]) {
      expect(registered.has(type)).toBe(true);
    }
  });
});
