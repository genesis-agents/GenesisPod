/**
 * duty-loader.spec.ts — loadDuty / loadSoul / renderDuty / buildPromptFromDuty
 *
 * 策略：mock fs module so we don't need actual .md files on disk.
 *
 * 2026-05-15 PR-D：buildPromptFromDuty PRIMARY 路径走 loadSkill (SKILL.md)；
 * 旧 spec 用 mockFs.readFileSync 链路测的是 fallback (soul.md + duty.md)。
 * 这里 mock skill-md-loader 让 loadSkill 永远 throw，强制 buildPromptFromDuty
 * 进 fallback 路径，旧 mock 期望仍生效。
 */

import * as fs from "fs";

jest.mock("fs");
jest.mock("../skill-md-loader", () => ({
  loadSkill: jest.fn(() => {
    throw new Error("test: SKILL.md path disabled for fallback test");
  }),
  clearSkillCache: jest.fn(),
}));

const mockFs = fs as jest.Mocked<typeof fs>;

// We need to re-require after mocking; use jest.isolateModules for cache isolation
import {
  loadDuty,
  loadSoul,
  renderDuty,
  buildPromptFromDuty,
  clearDutyCache,
} from "../duty-loader";

describe("renderDuty", () => {
  beforeEach(() => {
    clearDutyCache();
    jest.clearAllMocks();
  });

  it("replaces simple {{var}} tokens", () => {
    const result = renderDuty("Hello {{name}}!", { name: "World" });
    expect(result).toBe("Hello World!");
  });

  it("replaces numeric variable", () => {
    const result = renderDuty("Count: {{count}}", { count: 42 });
    expect(result).toBe("Count: 42");
  });

  it("replaces boolean variable", () => {
    const result = renderDuty("Flag: {{flag}}", { flag: true });
    expect(result).toBe("Flag: true");
  });

  it("leaves {{this}} and {{@index}} untouched outside each", () => {
    const result = renderDuty("{{this}} {{@index}}", { this: "X" });
    // these are reserved for each context, expandVars skips them
    expect(result).toBe("{{this}} {{@index}}");
  });

  it("replaces missing var with empty string", () => {
    const result = renderDuty("Hi {{missing}}", {});
    expect(result).toBe("Hi ");
  });

  it("handles nested dot access {{a.b.c}}", () => {
    const result = renderDuty("{{a.b.c}}", { a: { b: { c: "deep" } } });
    expect(result).toBe("deep");
  });

  it("handles nested dot access missing → empty string", () => {
    const result = renderDuty("{{a.b.c}}", { a: {} });
    expect(result).toBe("");
  });

  it("{{#if truthy}} renders body", () => {
    const result = renderDuty("{{#if show}}YES{{/if}}", { show: true });
    expect(result).toBe("YES");
  });

  it("{{#if falsy}} removes body", () => {
    const result = renderDuty("{{#if show}}YES{{/if}}", { show: false });
    expect(result).toBe("");
  });

  it("{{#if empty string}} removes body", () => {
    const result = renderDuty("{{#if s}}TEXT{{/if}}", { s: "" });
    expect(result).toBe("");
  });

  it("{{#if non-empty string}} renders body", () => {
    const result = renderDuty("{{#if s}}TEXT{{/if}}", { s: "hello" });
    expect(result).toBe("TEXT");
  });

  it("{{#if 0}} removes body", () => {
    const result = renderDuty("{{#if n}}BODY{{/if}}", { n: 0 });
    expect(result).toBe("");
  });

  it("{{#if empty array}} removes body", () => {
    const result = renderDuty("{{#if arr}}ITEMS{{/if}}", { arr: [] });
    expect(result).toBe("");
  });

  it("{{#if non-empty array}} renders body", () => {
    const result = renderDuty("{{#if arr}}ITEMS{{/if}}", { arr: [1] });
    expect(result).toBe("ITEMS");
  });

  it("{{#each}} renders each item — object fields accessible directly", () => {
    // primitive arrays: {{this}} is skipped by expandVars (reserved keyword)
    // but object arrays can use field names directly
    const result = renderDuty("{{#each items}}{{val}},{{/each}}", {
      items: [{ val: "a" }, { val: "b" }, { val: "c" }],
    });
    expect(result).toBe("a,b,c,");
  });

  it("{{#each}} renders object array fields directly", () => {
    const result = renderDuty("{{#each items}}{{name}};{{/each}}", {
      items: [{ name: "Alice" }, { name: "Bob" }],
    });
    expect(result).toBe("Alice;Bob;");
  });

  it("{{#each}} renders @index (note: @index token not captured by \\w regex so stays as-is)", () => {
    // The regex [\w.]+ does not match @, so {{@index}} is not replaced
    const result = renderDuty("{{#each items}}{{name}} {{/each}}", {
      items: [{ name: "X" }, { name: "Y" }],
    });
    expect(result).toBe("X Y ");
  });

  it("{{#each}} empty array → empty string", () => {
    const result = renderDuty("{{#each items}}{{this}}{{/each}}", {
      items: [],
    });
    expect(result).toBe("");
  });

  it("{{#each}} undefined array → empty string", () => {
    const result = renderDuty("{{#each items}}{{this}}{{/each}}", {});
    expect(result).toBe("");
  });

  it("JSON.stringify used for object var", () => {
    const result = renderDuty("{{obj}}", { obj: { x: 1 } });
    expect(result).toBe(JSON.stringify({ x: 1 }));
  });

  it("nested if inside each", () => {
    const result = renderDuty(
      "{{#each items}}{{#if active}}{{name}}{{/if}}{{/each}}",
      {
        items: [
          { name: "A", active: true },
          { name: "B", active: false },
        ],
      },
    );
    expect(result).toBe("A");
  });
});

describe("loadDuty", () => {
  beforeEach(() => {
    clearDutyCache();
    jest.clearAllMocks();
  });

  it("throws when duty file does not exist", () => {
    mockFs.existsSync.mockReturnValue(false);
    expect(() => loadDuty("leader", "nonexistent")).toThrow(
      /Duty file not found/,
    );
  });

  it("reads and returns duty file content", () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue("# Duty Content");
    const content = loadDuty("leader", "plan");
    expect(content).toBe("# Duty Content");
    expect(mockFs.readFileSync).toHaveBeenCalledTimes(1);
  });

  it("caches result — fs.readFileSync called only once", () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue("cached content");
    loadDuty("researcher", "collect");
    loadDuty("researcher", "collect");
    expect(mockFs.readFileSync).toHaveBeenCalledTimes(1);
  });

  it("resolves path including agentDir and dutyName", () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue("content");
    loadDuty("analyst", "synthesize");
    const callArg = (mockFs.existsSync as jest.Mock).mock.calls[0][0] as string;
    expect(callArg).toContain("analyst");
    expect(callArg).toContain("synthesize.md");
  });
});

describe("loadSoul", () => {
  beforeEach(() => {
    clearDutyCache();
    jest.clearAllMocks();
  });

  it("returns null when soul.md does not exist", () => {
    mockFs.existsSync.mockReturnValue(false);
    expect(loadSoul("leader")).toBeNull();
  });

  it("reads soul file when it exists", () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue("# Soul");
    const soul = loadSoul("writer");
    expect(soul).toBe("# Soul");
  });

  it("caches soul — readFileSync called only once", () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue("# Soul");
    loadSoul("writer");
    loadSoul("writer");
    expect(mockFs.readFileSync).toHaveBeenCalledTimes(1);
  });

  it("caches null result for missing soul", () => {
    mockFs.existsSync.mockReturnValue(false);
    const r1 = loadSoul("noagent");
    const r2 = loadSoul("noagent");
    expect(r1).toBeNull();
    expect(r2).toBeNull();
    expect(mockFs.existsSync).toHaveBeenCalledTimes(1);
  });
});

describe("buildPromptFromDuty", () => {
  beforeEach(() => {
    clearDutyCache();
    jest.clearAllMocks();
  });

  it("combines soul + duty with --- separator when soul exists", () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync
      .mockReturnValueOnce("Soul content")
      .mockReturnValueOnce("Duty content with {{topic}}");
    const result = buildPromptFromDuty("leader", "plan", { topic: "AI" });
    expect(result).toContain("Soul content");
    expect(result).toContain("---");
    expect(result).toContain("Duty content with AI");
  });

  it("returns only duty when no soul.md", () => {
    // first call for soul → file not exist; second for duty → exists
    mockFs.existsSync
      .mockReturnValueOnce(false) // soul
      .mockReturnValueOnce(true); // duty
    mockFs.readFileSync.mockReturnValueOnce("Duty only {{x}}");
    const result = buildPromptFromDuty("analyst", "insights", { x: "test" });
    expect(result).toBe("Duty only test");
    expect(result).not.toContain("---");
  });

  it("applies variable rendering to combined prompt", () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync
      .mockReturnValueOnce("Hello {{name}}")
      .mockReturnValueOnce("Task: {{task}}");
    const result = buildPromptFromDuty("researcher", "collect", {
      name: "Bob",
      task: "research",
    });
    expect(result).toContain("Hello Bob");
    expect(result).toContain("Task: research");
  });
});

describe("clearDutyCache", () => {
  it("clears cache so next load re-reads from fs", () => {
    clearDutyCache();
    jest.clearAllMocks();
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue("v1");
    loadDuty("x", "y");
    clearDutyCache();
    jest.clearAllMocks();
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue("v2");
    const result = loadDuty("x", "y");
    expect(result).toBe("v2");
    expect(mockFs.readFileSync).toHaveBeenCalledTimes(1);
  });
});
