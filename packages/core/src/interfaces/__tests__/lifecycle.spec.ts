import {
  hasOnInit,
  hasOnDestroy,
  hasLifecycle,
  LifecycleState,
} from "../lifecycle.interface";

describe("hasOnInit", () => {
  it("should return true for object with onInit function", () => {
    const obj = { onInit: () => {} };
    expect(hasOnInit(obj)).toBe(true);
  });

  it("should return true for object with async onInit function", () => {
    const obj = { onInit: async () => {} };
    expect(hasOnInit(obj)).toBe(true);
  });

  it("should return false for object without onInit", () => {
    const obj = { name: "test" };
    expect(hasOnInit(obj)).toBe(false);
  });

  it("should return false for object with onInit as non-function (string)", () => {
    const obj = { onInit: "not-a-function" };
    expect(hasOnInit(obj)).toBe(false);
  });

  it("should return false for object with onInit as non-function (number)", () => {
    const obj = { onInit: 42 };
    expect(hasOnInit(obj)).toBe(false);
  });

  it("should return false for object with onInit as non-function (null)", () => {
    const obj = { onInit: null };
    expect(hasOnInit(obj)).toBe(false);
  });

  it("should return false for null", () => {
    expect(hasOnInit(null)).toBe(false);
  });

  it("should return false for undefined", () => {
    expect(hasOnInit(undefined)).toBe(false);
  });

  it("should return false for a string", () => {
    expect(hasOnInit("some string")).toBe(false);
  });

  it("should return false for a number", () => {
    expect(hasOnInit(123)).toBe(false);
  });

  it("should return false for a boolean", () => {
    expect(hasOnInit(true)).toBe(false);
  });
});

describe("hasOnDestroy", () => {
  it("should return true for object with onDestroy function", () => {
    const obj = { onDestroy: () => {} };
    expect(hasOnDestroy(obj)).toBe(true);
  });

  it("should return true for object with async onDestroy function", () => {
    const obj = { onDestroy: async () => {} };
    expect(hasOnDestroy(obj)).toBe(true);
  });

  it("should return false for object without onDestroy", () => {
    const obj = { name: "test" };
    expect(hasOnDestroy(obj)).toBe(false);
  });

  it("should return false for object with onDestroy as non-function (string)", () => {
    const obj = { onDestroy: "not-a-function" };
    expect(hasOnDestroy(obj)).toBe(false);
  });

  it("should return false for object with onDestroy as non-function (number)", () => {
    const obj = { onDestroy: 99 };
    expect(hasOnDestroy(obj)).toBe(false);
  });

  it("should return false for object with onDestroy as non-function (null)", () => {
    const obj = { onDestroy: null };
    expect(hasOnDestroy(obj)).toBe(false);
  });

  it("should return false for null", () => {
    expect(hasOnDestroy(null)).toBe(false);
  });

  it("should return false for undefined", () => {
    expect(hasOnDestroy(undefined)).toBe(false);
  });

  it("should return false for a string", () => {
    expect(hasOnDestroy("some string")).toBe(false);
  });

  it("should return false for a number", () => {
    expect(hasOnDestroy(456)).toBe(false);
  });

  it("should return false for a boolean", () => {
    expect(hasOnDestroy(false)).toBe(false);
  });
});

describe("hasLifecycle", () => {
  it("should return true for object with both onInit and onDestroy functions", () => {
    const obj = { onInit: () => {}, onDestroy: () => {} };
    expect(hasLifecycle(obj)).toBe(true);
  });

  it("should return true for object with async versions of both methods", () => {
    const obj = { onInit: async () => {}, onDestroy: async () => {} };
    expect(hasLifecycle(obj)).toBe(true);
  });

  it("should return false for object with only onInit", () => {
    const obj = { onInit: () => {} };
    expect(hasLifecycle(obj)).toBe(false);
  });

  it("should return false for object with only onDestroy", () => {
    const obj = { onDestroy: () => {} };
    expect(hasLifecycle(obj)).toBe(false);
  });

  it("should return false for object with neither onInit nor onDestroy", () => {
    const obj = { name: "test" };
    expect(hasLifecycle(obj)).toBe(false);
  });

  it("should return false for null", () => {
    expect(hasLifecycle(null)).toBe(false);
  });

  it("should return false for undefined", () => {
    expect(hasLifecycle(undefined)).toBe(false);
  });
});

describe("LifecycleState", () => {
  it("should have UNINITIALIZED value", () => {
    expect(LifecycleState.UNINITIALIZED).toBe("uninitialized");
  });

  it("should have INITIALIZING value", () => {
    expect(LifecycleState.INITIALIZING).toBe("initializing");
  });

  it("should have INITIALIZED value", () => {
    expect(LifecycleState.INITIALIZED).toBe("initialized");
  });

  it("should have STARTING value", () => {
    expect(LifecycleState.STARTING).toBe("starting");
  });

  it("should have RUNNING value", () => {
    expect(LifecycleState.RUNNING).toBe("running");
  });

  it("should have STOPPING value", () => {
    expect(LifecycleState.STOPPING).toBe("stopping");
  });

  it("should have STOPPED value", () => {
    expect(LifecycleState.STOPPED).toBe("stopped");
  });

  it("should have DESTROYING value", () => {
    expect(LifecycleState.DESTROYING).toBe("destroying");
  });

  it("should have DESTROYED value", () => {
    expect(LifecycleState.DESTROYED).toBe("destroyed");
  });

  it("should have ERROR value", () => {
    expect(LifecycleState.ERROR).toBe("error");
  });

  it("should expose all 10 states", () => {
    const states = Object.keys(LifecycleState);
    expect(states).toHaveLength(10);
  });
});
