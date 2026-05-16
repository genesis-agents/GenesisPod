/**
 * W4 PR-1 verification: 9 agent SKILL.md skeleton parses correctly.
 *
 * Each role's SKILL.md must:
 *   - Have valid YAML frontmatter (id / name / domain / version / allowedTools / allowedModels / duties)
 *   - id starts with "social."
 *   - domain === "social"
 *   - allowedModels is empty array (no hardcoded model names — CLAUDE.md red line)
 *   - soul block exists
 *   - all duties listed in frontmatter have matching duty:NAME:start/end blocks
 *
 * leader has full duties (plan/assess-transform/foreword/signoff); other 8 are
 * placeholders with empty duties array (PR-2 will fill them).
 */
import { loadSkill, clearSkillCache } from "../utils/skill-md-loader";

const ROLES = [
  "leader",
  "steward",
  "platform-probe",
  "content-transformer",
  "cover-artist",
  "composer",
  "polish-reviewer",
  "publish-executor",
  "publish-verifier",
] as const;

describe("W4 PR-1 — social agent SKILL.md skeleton", () => {
  beforeEach(() => {
    clearSkillCache();
  });

  describe.each(ROLES)("%s SKILL.md", (role) => {
    it("parses without error", () => {
      expect(() => loadSkill(role)).not.toThrow();
    });

    it("has frontmatter.id starting with 'social.'", () => {
      const skill = loadSkill(role);
      expect(skill.frontmatter.id).toMatch(/^social\./);
    });

    it("has domain='social'", () => {
      const skill = loadSkill(role);
      expect(skill.frontmatter.domain).toBe("social");
    });

    it("allowedModels is empty (no hardcoded model names)", () => {
      const skill = loadSkill(role);
      expect(skill.frontmatter.allowedModels).toEqual([]);
    });

    it("has a non-empty soul block", () => {
      const skill = loadSkill(role);
      expect(skill.soul).toBeTruthy();
      expect((skill.soul ?? "").trim().length).toBeGreaterThan(20);
    });

    it("all frontmatter.duties have matching duty blocks", () => {
      const skill = loadSkill(role);
      for (const dutyName of skill.frontmatter.duties) {
        expect(skill.duties[dutyName]).toBeDefined();
        expect(skill.duties[dutyName].length).toBeGreaterThan(0);
      }
    });
  });

  it("leader has 4 duties (plan / assess-transform / foreword / signoff)", () => {
    const leader = loadSkill("leader");
    expect([...leader.frontmatter.duties].sort()).toEqual(
      ["assess-transform", "foreword", "plan", "signoff"].sort(),
    );
  });

  it("8 non-leader roles have empty duties (PR-2 will fill)", () => {
    for (const role of ROLES.filter((r) => r !== "leader")) {
      const skill = loadSkill(role);
      expect(skill.frontmatter.duties).toEqual([]);
    }
  });
});
