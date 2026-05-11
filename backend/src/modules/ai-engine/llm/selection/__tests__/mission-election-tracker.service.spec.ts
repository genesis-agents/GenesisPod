import { MissionElectionTracker } from "../mission-election-tracker.service";

describe("MissionElectionTracker", () => {
  let tracker: MissionElectionTracker;

  beforeEach(() => {
    tracker = new MissionElectionTracker();
  });

  it("records elections and returns them in order", () => {
    tracker.recordElection("mission-1", "grok-4-1-fast-reasoning");
    tracker.recordElection("mission-1", "deepseek-v4-pro");

    expect(tracker.getElected("mission-1")).toEqual([
      "grok-4-1-fast-reasoning",
      "deepseek-v4-pro",
    ]);
  });

  it("serializes concurrent elections within the same mission", async () => {
    const seenHistories: string[][] = [];

    await Promise.all([
      tracker.runSerializedElection("mission-1", async (previouslyElected) => {
        seenHistories.push([...previouslyElected]);
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { result: "first", electedModelId: "model-a" };
      }),
      tracker.runSerializedElection("mission-1", async (previouslyElected) => {
        seenHistories.push([...previouslyElected]);
        return { result: "second", electedModelId: "model-b" };
      }),
      tracker.runSerializedElection("mission-1", async (previouslyElected) => {
        seenHistories.push([...previouslyElected]);
        return { result: "third", electedModelId: "model-c" };
      }),
    ]);

    expect(seenHistories).toEqual([[], ["model-a"], ["model-a", "model-b"]]);
    expect(tracker.getElected("mission-1")).toEqual([
      "model-a",
      "model-b",
      "model-c",
    ]);
  });

  it("does not serialize across different missions", async () => {
    const results = await Promise.all([
      tracker.runSerializedElection("mission-1", async (previouslyElected) => ({
        result: previouslyElected.length,
        electedModelId: "model-a",
      })),
      tracker.runSerializedElection("mission-2", async (previouslyElected) => ({
        result: previouslyElected.length,
        electedModelId: "model-b",
      })),
    ]);

    expect(results).toEqual([0, 0]);
  });
});
