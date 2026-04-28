/**
 * Unit tests for WorkflowHandlerRegistry
 *
 * Tests registration, retrieval, unregistration, and listing of handlers.
 */

import { Test, TestingModule } from "@nestjs/testing";
import { WorkflowHandlerRegistry } from "../handler-registry";
import type { WorkflowNodeHandler } from "../workflow-node-handler.interface";

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function makeHandler(id: string): WorkflowNodeHandler {
  return {
    handlerId: id,
    execute: jest.fn().mockResolvedValue({}),
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe("WorkflowHandlerRegistry", () => {
  let registry: WorkflowHandlerRegistry;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WorkflowHandlerRegistry],
    }).compile();

    registry = module.get<WorkflowHandlerRegistry>(WorkflowHandlerRegistry);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // register / get
  // ──────────────────────────────────────────────────────────────────────────

  describe("register and get", () => {
    it("registers a handler and retrieves it by id", () => {
      const handler = makeHandler("test:handler");

      registry.register(handler);

      expect(registry.get("test:handler")).toBe(handler);
    });

    it("returns the same instance that was registered", () => {
      const handler = makeHandler("my:module");
      registry.register(handler);

      const retrieved = registry.get("my:module");

      expect(retrieved).toStrictEqual(handler);
    });

    it("returns undefined for an unregistered id", () => {
      expect(registry.get("not:registered")).toBeUndefined();
    });

    it("returns undefined when the registry is empty", () => {
      expect(registry.get("any:id")).toBeUndefined();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // overwrite behaviour
  // ──────────────────────────────────────────────────────────────────────────

  describe("register overwrite", () => {
    it("overwrites an existing handler when the same id is registered again", () => {
      const first = makeHandler("ti:search-phase");
      const second = makeHandler("ti:search-phase");

      registry.register(first);
      registry.register(second);

      expect(registry.get("ti:search-phase")).toBe(second);
    });

    it("emits a warn log when overwriting an existing handler", () => {
      const warnSpy = jest
        .spyOn((registry as any).logger, "warn")
        .mockImplementation(() => undefined);

      registry.register(makeHandler("ti:dup"));
      registry.register(makeHandler("ti:dup"));

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("ti:dup"));
    });

    it("does not warn on the first registration", () => {
      const warnSpy = jest
        .spyOn((registry as any).logger, "warn")
        .mockImplementation(() => undefined);

      registry.register(makeHandler("fresh:handler"));

      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // getOrThrow
  // ──────────────────────────────────────────────────────────────────────────

  describe("getOrThrow", () => {
    it("returns the handler when it is registered", () => {
      const handler = makeHandler("ok:handler");
      registry.register(handler);

      expect(registry.getOrThrow("ok:handler")).toBe(handler);
    });

    it("throws an Error when the handler is not found", () => {
      expect(() => registry.getOrThrow("missing:handler")).toThrow(Error);
    });

    it("includes the missing id in the error message", () => {
      expect(() => registry.getOrThrow("missing:handler")).toThrow(
        "missing:handler",
      );
    });

    it("includes the list of registered ids in the error message", () => {
      registry.register(makeHandler("a:one"));
      registry.register(makeHandler("b:two"));

      let message = "";
      try {
        registry.getOrThrow("c:three");
      } catch (err) {
        message = (err as Error).message;
      }

      expect(message).toContain("a:one");
      expect(message).toContain("b:two");
    });

    it("shows empty registered list when no handlers are registered", () => {
      let message = "";
      try {
        registry.getOrThrow("nothing");
      } catch (err) {
        message = (err as Error).message;
      }
      // The registered list should be present but empty
      expect(message).toContain("Registered:");
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // unregister
  // ──────────────────────────────────────────────────────────────────────────

  describe("unregister", () => {
    it("returns true and removes the handler when it exists", () => {
      registry.register(makeHandler("to:remove"));

      const result = registry.unregister("to:remove");

      expect(result).toBe(true);
      expect(registry.get("to:remove")).toBeUndefined();
    });

    it("returns false when the handler does not exist", () => {
      const result = registry.unregister("not:there");

      expect(result).toBe(false);
    });

    it("reduces the size by 1 after successful unregister", () => {
      registry.register(makeHandler("x:one"));
      registry.register(makeHandler("x:two"));

      registry.unregister("x:one");

      expect(registry.size).toBe(1);
    });

    it("does not affect other handlers when one is removed", () => {
      const kept = makeHandler("keep:this");
      registry.register(kept);
      registry.register(makeHandler("remove:this"));

      registry.unregister("remove:this");

      expect(registry.get("keep:this")).toBe(kept);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // listIds
  // ──────────────────────────────────────────────────────────────────────────

  describe("listIds", () => {
    it("returns an empty array when no handlers are registered", () => {
      expect(registry.listIds()).toEqual([]);
    });

    it("returns all registered handler ids", () => {
      registry.register(makeHandler("a:handler"));
      registry.register(makeHandler("b:handler"));
      registry.register(makeHandler("c:handler"));

      const ids = registry.listIds();

      expect(ids).toHaveLength(3);
      expect(ids).toContain("a:handler");
      expect(ids).toContain("b:handler");
      expect(ids).toContain("c:handler");
    });

    it("does not include ids that were unregistered", () => {
      registry.register(makeHandler("keep:me"));
      registry.register(makeHandler("drop:me"));
      registry.unregister("drop:me");

      expect(registry.listIds()).toEqual(["keep:me"]);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // size
  // ──────────────────────────────────────────────────────────────────────────

  describe("size", () => {
    it("is 0 for an empty registry", () => {
      expect(registry.size).toBe(0);
    });

    it("increments by 1 for each new registration", () => {
      registry.register(makeHandler("s:one"));
      expect(registry.size).toBe(1);

      registry.register(makeHandler("s:two"));
      expect(registry.size).toBe(2);
    });

    it("does not increment when overwriting an existing id", () => {
      registry.register(makeHandler("s:dup"));
      registry.register(makeHandler("s:dup"));

      expect(registry.size).toBe(1);
    });

    it("decrements by 1 after a successful unregister", () => {
      registry.register(makeHandler("s:del"));
      expect(registry.size).toBe(1);

      registry.unregister("s:del");
      expect(registry.size).toBe(0);
    });

    it("stays the same after an unregister of a non-existent id", () => {
      registry.register(makeHandler("s:existing"));
      registry.unregister("s:ghost");

      expect(registry.size).toBe(1);
    });
  });
});
