import { LruMap } from "../lru-map";

describe("LruMap", () => {
  it("should throw on non-positive maxSize", () => {
    expect(() => new LruMap(0)).toThrow("maxSize must be positive");
    expect(() => new LruMap(-1)).toThrow("maxSize must be positive");
  });

  it("should behave as a normal Map under capacity", () => {
    const map = new LruMap<string, number>(3);
    map.set("a", 1);
    map.set("b", 2);
    expect(map.size).toBe(2);
    expect(map.get("a")).toBe(1);
    expect(map.get("b")).toBe(2);
  });

  it("should evict oldest entry when exceeding maxSize", () => {
    const map = new LruMap<string, number>(2);
    map.set("a", 1);
    map.set("b", 2);
    map.set("c", 3); // should evict "a"

    expect(map.size).toBe(2);
    expect(map.has("a")).toBe(false);
    expect(map.get("b")).toBe(2);
    expect(map.get("c")).toBe(3);
  });

  it("should refresh order on re-insert", () => {
    const map = new LruMap<string, number>(2);
    map.set("a", 1);
    map.set("b", 2);
    map.set("a", 10); // re-insert "a", now "b" is oldest
    map.set("c", 3); // should evict "b"

    expect(map.size).toBe(2);
    expect(map.has("b")).toBe(false);
    expect(map.get("a")).toBe(10);
    expect(map.get("c")).toBe(3);
  });

  it("should handle size of 1", () => {
    const map = new LruMap<string, number>(1);
    map.set("a", 1);
    expect(map.get("a")).toBe(1);

    map.set("b", 2);
    expect(map.size).toBe(1);
    expect(map.has("a")).toBe(false);
    expect(map.get("b")).toBe(2);
  });

  it("should support iteration", () => {
    const map = new LruMap<string, number>(3);
    map.set("a", 1);
    map.set("b", 2);
    map.set("c", 3);

    const keys = Array.from(map.keys());
    expect(keys).toEqual(["a", "b", "c"]);
  });
});
