/**
 * SkillLoader 集成测试 — 从真实文件系统加载 built-in SKILL.md
 */

import { SkillLoader } from "../skill-loader";
import { SkillRegistry } from "../skill-registry";

describe("SkillLoader (built-in skills)", () => {
  it("loads all built-in SKILL.md files", async () => {
    const registry = new SkillRegistry();
    const loader = new SkillLoader(registry);
    const skills = await loader.loadAll();
    const names = skills.map((s) => s.frontmatter.name).sort();
    expect(names).toContain("web-research");
    expect(names).toContain("critical-review");
  });

  it("loadById returns a known skill", async () => {
    const registry = new SkillRegistry();
    const loader = new SkillLoader(registry);
    const skill = await loader.loadById("web-research");
    expect(skill).not.toBeNull();
    expect(skill?.frontmatter.name).toBe("web-research");
    expect(skill?.frontmatter.tags).toContain("research");
    expect(skill?.instructions).toContain("Discovery");
  });

  it("loadById returns null for unknown skill", async () => {
    const registry = new SkillRegistry();
    const loader = new SkillLoader(registry);
    const skill = await loader.loadById("non-existent-skill-xyz");
    expect(skill).toBeNull();
  });

  it("onModuleInit populates the registry", async () => {
    const registry = new SkillRegistry();
    const loader = new SkillLoader(registry);
    await loader.onModuleInit();
    expect(registry.size()).toBeGreaterThanOrEqual(2);
    expect(registry.has("web-research")).toBe(true);
    expect(registry.has("critical-review")).toBe(true);
  });
});
