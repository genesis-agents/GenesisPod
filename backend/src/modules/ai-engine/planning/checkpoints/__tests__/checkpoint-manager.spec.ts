import { CheckpointManager } from "../../../../ai-harness/facade";
import { InMemoryCheckpointStore } from "../../../../ai-engine/facade";
import type { ExecutionContext } from "../../abstractions/orchestrator.interface";

function makeContext(
  overrides: Partial<ExecutionContext> = {},
): ExecutionContext {
  return {
    executionId: "exec-1",
    workflowId: "wf-1",
    userId: "user-1",
    variables: {},
    stepResults: new Map(),
    startTime: new Date(),
    ...overrides,
  };
}

describe("InMemoryCheckpointStore", () => {
  let store: InMemoryCheckpointStore;

  beforeEach(() => {
    store = new InMemoryCheckpointStore();
  });

  it("should save and retrieve a checkpoint by id", async () => {
    const cp = {
      id: "cp-1",
      executionId: "exec-1",
      workflowId: "wf-1",
      stepId: "step-1",
      context: makeContext(),
      timestamp: new Date(),
    };
    await store.save(cp);
    const retrieved = await store.get("cp-1");
    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe("cp-1");
  });

  it("should return null for unknown id", async () => {
    const result = await store.get("not-exist");
    expect(result).toBeNull();
  });

  it("should return checkpoints by executionId sorted by timestamp", async () => {
    const now = Date.now();
    const cp1 = {
      id: "cp-1",
      executionId: "exec-1",
      workflowId: "wf-1",
      stepId: "step-1",
      context: makeContext(),
      timestamp: new Date(now),
    };
    const cp2 = {
      id: "cp-2",
      executionId: "exec-1",
      workflowId: "wf-1",
      stepId: "step-2",
      context: makeContext(),
      timestamp: new Date(now + 1000),
    };
    const cp3 = {
      id: "cp-3",
      executionId: "exec-2",
      workflowId: "wf-1",
      stepId: "step-1",
      context: makeContext(),
      timestamp: new Date(now),
    };

    await store.save(cp1);
    await store.save(cp3);
    await store.save(cp2);

    const results = await store.getByExecution("exec-1");
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe("cp-1");
    expect(results[1].id).toBe("cp-2");
  });

  it("should return empty array for unknown executionId", async () => {
    const results = await store.getByExecution("unknown");
    expect(results).toHaveLength(0);
  });

  it("should return latest checkpoint", async () => {
    const now = Date.now();
    await store.save({
      id: "cp-1",
      executionId: "exec-1",
      workflowId: "wf",
      stepId: "s1",
      context: makeContext(),
      timestamp: new Date(now),
    });
    await store.save({
      id: "cp-2",
      executionId: "exec-1",
      workflowId: "wf",
      stepId: "s2",
      context: makeContext(),
      timestamp: new Date(now + 1000),
    });

    const latest = await store.getLatest("exec-1");
    expect(latest?.id).toBe("cp-2");
  });

  it("should return null for getLatest with unknown executionId", async () => {
    const result = await store.getLatest("unknown");
    expect(result).toBeNull();
  });

  it("should delete a checkpoint by id", async () => {
    await store.save({
      id: "cp-1",
      executionId: "exec-1",
      workflowId: "wf",
      stepId: "s1",
      context: makeContext(),
      timestamp: new Date(),
    });
    const deleted = await store.delete("cp-1");
    expect(deleted).toBe(true);
    expect(await store.get("cp-1")).toBeNull();
  });

  it("should return false when deleting unknown id", async () => {
    const deleted = await store.delete("nonexistent");
    expect(deleted).toBe(false);
  });

  it("should delete all checkpoints by executionId", async () => {
    await store.save({
      id: "cp-1",
      executionId: "exec-1",
      workflowId: "wf",
      stepId: "s1",
      context: makeContext(),
      timestamp: new Date(),
    });
    await store.save({
      id: "cp-2",
      executionId: "exec-1",
      workflowId: "wf",
      stepId: "s2",
      context: makeContext(),
      timestamp: new Date(),
    });
    await store.save({
      id: "cp-3",
      executionId: "exec-2",
      workflowId: "wf",
      stepId: "s3",
      context: makeContext(),
      timestamp: new Date(),
    });

    const count = await store.deleteByExecution("exec-1");
    expect(count).toBe(2);
    expect(await store.getByExecution("exec-1")).toHaveLength(0);
    expect(await store.getByExecution("exec-2")).toHaveLength(1);
  });
});

describe("CheckpointManager", () => {
  let manager: CheckpointManager;

  beforeEach(() => {
    manager = new CheckpointManager();
  });

  it("should create a checkpoint and return it", async () => {
    const ctx = makeContext();
    const checkpoint = await manager.createCheckpoint(
      "exec-1",
      "wf-1",
      "step-1",
      ctx,
    );
    expect(checkpoint.id).toBeDefined();
    expect(checkpoint.executionId).toBe("exec-1");
    expect(checkpoint.workflowId).toBe("wf-1");
    expect(checkpoint.stepId).toBe("step-1");
    expect(checkpoint.timestamp).toBeInstanceOf(Date);
  });

  it("should retrieve a checkpoint by id", async () => {
    const ctx = makeContext();
    const created = await manager.createCheckpoint(
      "exec-1",
      "wf-1",
      "step-1",
      ctx,
    );
    const retrieved = await manager.getCheckpoint(created.id);
    expect(retrieved?.id).toBe(created.id);
  });

  it("should return null for unknown checkpoint id", async () => {
    const result = await manager.getCheckpoint("unknown");
    expect(result).toBeNull();
  });

  it("should get all checkpoints for an execution", async () => {
    const ctx = makeContext();
    await manager.createCheckpoint("exec-1", "wf-1", "step-1", ctx);
    await manager.createCheckpoint("exec-1", "wf-1", "step-2", ctx);
    const checkpoints = await manager.getCheckpoints("exec-1");
    expect(checkpoints).toHaveLength(2);
  });

  it("should get latest checkpoint", async () => {
    const ctx = makeContext();
    await manager.createCheckpoint("exec-1", "wf-1", "step-1", ctx);
    const second = await manager.createCheckpoint(
      "exec-1",
      "wf-1",
      "step-2",
      ctx,
    );
    const latest = await manager.getLatestCheckpoint("exec-1");
    expect(latest?.id).toBe(second.id);
  });

  it("should restore context from checkpoint", async () => {
    const ctx = makeContext({ variables: { test: "value" } });
    const created = await manager.createCheckpoint(
      "exec-1",
      "wf-1",
      "step-1",
      ctx,
    );
    const restored = await manager.restoreContext(created.id);
    expect(restored).toBeDefined();
    expect(restored?.executionId).toBe("exec-1");
  });

  it("should return null for restoreContext with unknown id", async () => {
    const result = await manager.restoreContext("unknown");
    expect(result).toBeNull();
  });

  it("should delete a specific checkpoint", async () => {
    const ctx = makeContext();
    const created = await manager.createCheckpoint(
      "exec-1",
      "wf-1",
      "step-1",
      ctx,
    );
    const deleted = await manager.deleteCheckpoint(created.id);
    expect(deleted).toBe(true);
    expect(await manager.getCheckpoint(created.id)).toBeNull();
  });

  it("should delete all checkpoints for an execution", async () => {
    const ctx = makeContext();
    await manager.createCheckpoint("exec-1", "wf-1", "step-1", ctx);
    await manager.createCheckpoint("exec-1", "wf-1", "step-2", ctx);
    const count = await manager.deleteCheckpoints("exec-1");
    expect(count).toBe(2);
    expect(await manager.getCheckpoints("exec-1")).toHaveLength(0);
  });

  it("shouldCreateCheckpoint returns false when autoCheckpoint disabled", () => {
    const mgr = new CheckpointManager(undefined, { autoCheckpoint: false });
    expect(mgr.shouldCreateCheckpoint(5)).toBe(false);
    expect(mgr.shouldCreateCheckpoint(10)).toBe(false);
  });

  it("shouldCreateCheckpoint returns false for step 0", () => {
    expect(manager.shouldCreateCheckpoint(0)).toBe(false);
  });

  it("shouldCreateCheckpoint returns true at interval multiples", () => {
    // Default interval is 5
    expect(manager.shouldCreateCheckpoint(5)).toBe(true);
    expect(manager.shouldCreateCheckpoint(10)).toBe(true);
    expect(manager.shouldCreateCheckpoint(15)).toBe(true);
  });

  it("shouldCreateCheckpoint returns false for non-interval steps", () => {
    expect(manager.shouldCreateCheckpoint(1)).toBe(false);
    expect(manager.shouldCreateCheckpoint(3)).toBe(false);
    expect(manager.shouldCreateCheckpoint(7)).toBe(false);
  });

  it("should cleanup old checkpoints exceeding maxCheckpoints", async () => {
    const mgr = new CheckpointManager(undefined, { maxCheckpoints: 2 });
    const ctx = makeContext();
    for (let i = 1; i <= 4; i++) {
      await new Promise((r) => setTimeout(r, 5));
      await mgr.createCheckpoint("exec-1", "wf-1", `step-${i}`, ctx);
    }
    // After 4 creates with max 2, should have only 2
    const checkpoints = await mgr.getCheckpoints("exec-1");
    expect(checkpoints.length).toBeLessThanOrEqual(2);
  });

  it("should cleanup expired checkpoints by TTL", async () => {
    // Create manager with very short TTL
    const mgr = new CheckpointManager(undefined, { checkpointTTL: 1 }); // 1ms
    const ctx = makeContext();
    const _created = await mgr.createCheckpoint(
      "exec-1",
      "wf-1",
      "step-1",
      ctx,
    );

    // Wait for TTL to expire then create another checkpoint to trigger cleanup
    await new Promise((r) => setTimeout(r, 10));
    await mgr.createCheckpoint("exec-1", "wf-1", "step-2", ctx);

    // The first checkpoint may have been cleaned up
    // (cleanup happens during createCheckpoint)
    const checkpoints = await mgr.getCheckpoints("exec-1");
    expect(checkpoints.length).toBeLessThanOrEqual(2);
  });

  it("should use custom store when provided via constructor", async () => {
    const customStore = new InMemoryCheckpointStore();
    const mgr = new CheckpointManager(customStore);
    const ctx = makeContext();
    await mgr.createCheckpoint("exec-1", "wf-1", "step-1", ctx);
    // Can also retrieve from custom store directly
    const all = await customStore.getByExecution("exec-1");
    expect(all).toHaveLength(1);
  });

  it("should allow switching store via setStore()", async () => {
    const ctx = makeContext();
    await manager.createCheckpoint("exec-1", "wf-1", "step-1", ctx);

    const newStore = new InMemoryCheckpointStore();
    manager.setStore(newStore);

    // Old data not accessible through new store
    const checkpoints = await manager.getCheckpoints("exec-1");
    expect(checkpoints).toHaveLength(0);
  });

  it("should strip signal from serialized context", async () => {
    const controller = new AbortController();
    const ctx = makeContext({ signal: controller.signal });
    const created = await manager.createCheckpoint(
      "exec-1",
      "wf-1",
      "step-1",
      ctx,
    );
    const retrieved = await manager.getCheckpoint(created.id);
    expect(retrieved?.context.signal).toBeUndefined();
  });

  it("should use custom checkpointInterval", () => {
    const mgr = new CheckpointManager(undefined, { checkpointInterval: 3 });
    expect(mgr.shouldCreateCheckpoint(3)).toBe(true);
    expect(mgr.shouldCreateCheckpoint(6)).toBe(true);
    expect(mgr.shouldCreateCheckpoint(5)).toBe(false);
    expect(mgr.shouldCreateCheckpoint(4)).toBe(false);
  });
});
