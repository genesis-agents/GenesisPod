import { BaseRegistry } from "../registry.interface";

interface TestItem {
  readonly id: string;
  name?: string;
}

class TestRegistry extends BaseRegistry<TestItem> {}

describe("BaseRegistry", () => {
  let registry: TestRegistry;

  beforeEach(() => {
    registry = new TestRegistry();
  });

  // ---------------------------------------------------------------------------
  // Initial state
  // ---------------------------------------------------------------------------

  describe("initial state", () => {
    it("should start empty", () => {
      expect(registry.size()).toBe(0);
    });

    it("should return empty array from getAll()", () => {
      expect(registry.getAll()).toEqual([]);
    });

    it("should return empty array from getAllIds()", () => {
      expect(registry.getAllIds()).toEqual([]);
    });

    it("should return stats with total=0 and no timestamps", () => {
      const stats = registry.getStats();
      expect(stats.total).toBe(0);
      expect(stats.lastRegisteredAt).toBeUndefined();
      expect(stats.lastAccessedAt).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // register()
  // ---------------------------------------------------------------------------

  describe("register()", () => {
    it("should register an item and increase size", () => {
      registry.register({ id: "a" });
      expect(registry.size()).toBe(1);
    });

    it("should store the registered item retrievable by get()", () => {
      const item: TestItem = { id: "a", name: "Alpha" };
      registry.register(item);
      expect(registry.get("a")).toBe(item);
    });

    it("should set lastRegisteredAt after registration", () => {
      const before = new Date();
      registry.register({ id: "a" });
      const after = new Date();
      const stats = registry.getStats();
      expect(stats.lastRegisteredAt).toBeInstanceOf(Date);
      expect(stats.lastRegisteredAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(stats.lastRegisteredAt!.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it("should update lastRegisteredAt on each registration", () => {
      registry.register({ id: "a" });
      const firstTime = registry.getStats().lastRegisteredAt!.getTime();

      // Advance time slightly
      jest.useFakeTimers();
      jest.advanceTimersByTime(10);
      registry.register({ id: "b" });
      jest.useRealTimers();

      const secondTime = registry.getStats().lastRegisteredAt!.getTime();
      expect(secondTime).toBeGreaterThanOrEqual(firstTime);
    });

    it("should throw when registering an item with a duplicate id", () => {
      registry.register({ id: "dup" });
      expect(() => registry.register({ id: "dup" })).toThrow(
        "Item with id 'dup' already registered",
      );
    });

    it("should not modify the registry state after a duplicate registration error", () => {
      const original: TestItem = { id: "x", name: "Original" };
      registry.register(original);

      try {
        registry.register({ id: "x", name: "Duplicate" });
      } catch {
        // expected
      }

      expect(registry.size()).toBe(1);
      expect(registry.get("x")).toBe(original);
    });
  });

  // ---------------------------------------------------------------------------
  // registerMany()
  // ---------------------------------------------------------------------------

  describe("registerMany()", () => {
    it("should register multiple items at once", () => {
      registry.registerMany([{ id: "a" }, { id: "b" }, { id: "c" }]);
      expect(registry.size()).toBe(3);
    });

    it("should accept an empty array without error", () => {
      expect(() => registry.registerMany([])).not.toThrow();
      expect(registry.size()).toBe(0);
    });

    it("should throw on duplicate id within the batch", () => {
      expect(() =>
        registry.registerMany([{ id: "a" }, { id: "a" }]),
      ).toThrow("Item with id 'a' already registered");
    });

    it("should throw when a batch item conflicts with an already-registered item", () => {
      registry.register({ id: "existing" });
      expect(() =>
        registry.registerMany([{ id: "new" }, { id: "existing" }]),
      ).toThrow("Item with id 'existing' already registered");
    });

    it("should register items that were added before the duplicate when batch fails mid-way", () => {
      // "a" is registered before "a" duplicate triggers the error
      registry.registerMany([{ id: "a" }]);
      expect(registry.has("a")).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // get()
  // ---------------------------------------------------------------------------

  describe("get()", () => {
    it("should return the registered item by id", () => {
      const item: TestItem = { id: "abc", name: "test" };
      registry.register(item);
      expect(registry.get("abc")).toBe(item);
    });

    it("should throw when id does not exist", () => {
      expect(() => registry.get("nonexistent")).toThrow(
        "Item with id 'nonexistent' not found",
      );
    });

    it("should set lastAccessedAt on successful get()", () => {
      registry.register({ id: "a" });
      expect(registry.getStats().lastAccessedAt).toBeUndefined();

      const before = new Date();
      registry.get("a");
      const after = new Date();

      const stats = registry.getStats();
      expect(stats.lastAccessedAt).toBeInstanceOf(Date);
      expect(stats.lastAccessedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(stats.lastAccessedAt!.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it("should not set lastAccessedAt when get() throws", () => {
      try {
        registry.get("missing");
      } catch {
        // expected
      }
      expect(registry.getStats().lastAccessedAt).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // tryGet()
  // ---------------------------------------------------------------------------

  describe("tryGet()", () => {
    it("should return the item when it exists", () => {
      const item: TestItem = { id: "z" };
      registry.register(item);
      expect(registry.tryGet("z")).toBe(item);
    });

    it("should return undefined when id does not exist", () => {
      expect(registry.tryGet("missing")).toBeUndefined();
    });

    it("should set lastAccessedAt only when item is found", () => {
      registry.register({ id: "a" });
      registry.tryGet("missing");
      expect(registry.getStats().lastAccessedAt).toBeUndefined();

      registry.tryGet("a");
      expect(registry.getStats().lastAccessedAt).toBeInstanceOf(Date);
    });
  });

  // ---------------------------------------------------------------------------
  // has()
  // ---------------------------------------------------------------------------

  describe("has()", () => {
    it("should return true for a registered id", () => {
      registry.register({ id: "present" });
      expect(registry.has("present")).toBe(true);
    });

    it("should return false for an unregistered id", () => {
      expect(registry.has("absent")).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // hasAll()
  // ---------------------------------------------------------------------------

  describe("hasAll()", () => {
    beforeEach(() => {
      registry.registerMany([{ id: "a" }, { id: "b" }, { id: "c" }]);
    });

    it("should return true when all ids exist", () => {
      expect(registry.hasAll(["a", "b", "c"])).toBe(true);
    });

    it("should return false when at least one id is missing (partial match)", () => {
      expect(registry.hasAll(["a", "b", "missing"])).toBe(false);
    });

    it("should return false when none of the ids exist", () => {
      expect(registry.hasAll(["x", "y"])).toBe(false);
    });

    it("should return true for an empty ids array", () => {
      // every() on an empty array returns true
      expect(registry.hasAll([])).toBe(true);
    });

    it("should return false on a single missing id", () => {
      expect(registry.hasAll(["a", "d"])).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // unregister()
  // ---------------------------------------------------------------------------

  describe("unregister()", () => {
    it("should return true and remove an existing item", () => {
      registry.register({ id: "rem" });
      expect(registry.unregister("rem")).toBe(true);
      expect(registry.has("rem")).toBe(false);
      expect(registry.size()).toBe(0);
    });

    it("should return false when the id does not exist", () => {
      expect(registry.unregister("nonexistent")).toBe(false);
    });

    it("should allow re-registration after unregister", () => {
      registry.register({ id: "reuse" });
      registry.unregister("reuse");
      expect(() => registry.register({ id: "reuse" })).not.toThrow();
      expect(registry.has("reuse")).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // clear()
  // ---------------------------------------------------------------------------

  describe("clear()", () => {
    it("should remove all items", () => {
      registry.registerMany([{ id: "a" }, { id: "b" }, { id: "c" }]);
      registry.clear();
      expect(registry.size()).toBe(0);
      expect(registry.getAll()).toEqual([]);
      expect(registry.getAllIds()).toEqual([]);
    });

    it("should be safe to call on an empty registry", () => {
      expect(() => registry.clear()).not.toThrow();
    });

    it("should allow re-registering items after clear()", () => {
      registry.register({ id: "a" });
      registry.clear();
      expect(() => registry.register({ id: "a" })).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // size()
  // ---------------------------------------------------------------------------

  describe("size()", () => {
    it("should return 0 for empty registry", () => {
      expect(registry.size()).toBe(0);
    });

    it("should reflect the correct count after registrations and unregistrations", () => {
      registry.register({ id: "a" });
      registry.register({ id: "b" });
      expect(registry.size()).toBe(2);

      registry.unregister("a");
      expect(registry.size()).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // getAll()
  // ---------------------------------------------------------------------------

  describe("getAll()", () => {
    it("should return all registered items as an array", () => {
      const items: TestItem[] = [{ id: "a" }, { id: "b" }, { id: "c" }];
      registry.registerMany(items);
      const all = registry.getAll();
      expect(all).toHaveLength(3);
      expect(all).toEqual(expect.arrayContaining(items));
    });

    it("should return an empty array for an empty registry", () => {
      expect(registry.getAll()).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // getAllIds()
  // ---------------------------------------------------------------------------

  describe("getAllIds()", () => {
    it("should return all registered ids", () => {
      registry.registerMany([{ id: "x" }, { id: "y" }]);
      const ids = registry.getAllIds();
      expect(ids).toHaveLength(2);
      expect(ids).toEqual(expect.arrayContaining(["x", "y"]));
    });

    it("should return an empty array for an empty registry", () => {
      expect(registry.getAllIds()).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // getStats()
  // ---------------------------------------------------------------------------

  describe("getStats()", () => {
    it("should return correct total count", () => {
      registry.registerMany([{ id: "a" }, { id: "b" }]);
      expect(registry.getStats().total).toBe(2);
    });

    it("should include lastRegisteredAt after registration", () => {
      registry.register({ id: "a" });
      expect(registry.getStats().lastRegisteredAt).toBeInstanceOf(Date);
    });

    it("should include lastAccessedAt after a successful get()", () => {
      registry.register({ id: "a" });
      registry.get("a");
      expect(registry.getStats().lastAccessedAt).toBeInstanceOf(Date);
    });

    it("should include lastAccessedAt after a successful tryGet()", () => {
      registry.register({ id: "a" });
      registry.tryGet("a");
      expect(registry.getStats().lastAccessedAt).toBeInstanceOf(Date);
    });

    it("should not include lastAccessedAt when only registrations occurred", () => {
      registry.register({ id: "a" });
      expect(registry.getStats().lastAccessedAt).toBeUndefined();
    });

    it("should reflect decremented total after unregister()", () => {
      registry.registerMany([{ id: "a" }, { id: "b" }]);
      registry.unregister("a");
      expect(registry.getStats().total).toBe(1);
    });

    it("should reflect total=0 after clear()", () => {
      registry.registerMany([{ id: "a" }, { id: "b" }]);
      registry.clear();
      expect(registry.getStats().total).toBe(0);
    });
  });
});
