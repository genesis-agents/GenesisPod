/**
 * SkillRegistry (ai-harness/kernel) — 内存级 SKILL.md 注册表
 *
 * ⚠️ NAME COLLISION — there are TWO classes called `SkillRegistry` in
 * this codebase. The full distinction is documented in
 * `ai-engine/skills/registry/skill-registry.ts`. Quick summary:
 *
 *   - THIS class: SKILL.md frontmatter parsed at boot, indexed by `name`,
 *     drives ReAct/Agent runtime instruction activation. Used via
 *     `@/modules/ai-harness/facade`.
 *
 *   - The ai-engine one: CRUD store of programmatic `ISkill` objects,
 *     DB-backed, drives the skills-api admin UI. Used via
 *     `@/modules/ai-engine/facade`.
 *
 * 支持按 id / tag / activateFor (Role id) 查找。
 * 与 ai-engine/skills/（旧 CRUD 风格）隔离，互不干扰。
 */

import { Injectable, Logger } from "@nestjs/common";
import type { ISkill } from "../../kernel/abstractions";

@Injectable()
export class SkillRegistry {
  private readonly logger = new Logger(SkillRegistry.name);
  private readonly byName = new Map<string, ISkill>();

  register(skill: ISkill): void {
    const name = skill.frontmatter.name;
    if (this.byName.has(name)) {
      this.logger.warn(`Skill '${name}' already registered — overwriting.`);
    }
    this.byName.set(name, skill);
  }

  registerAll(skills: readonly ISkill[]): void {
    for (const s of skills) this.register(s);
  }

  has(name: string): boolean {
    return this.byName.has(name);
  }

  get(name: string): ISkill | undefined {
    return this.byName.get(name);
  }

  all(): readonly ISkill[] {
    return Array.from(this.byName.values());
  }

  /** 按 tag 过滤 */
  listByTag(tag: string): readonly ISkill[] {
    return this.all().filter((s) => s.frontmatter.tags?.includes(tag) ?? false);
  }

  /** 查出 activateFor 包含指定 role 的 skills */
  listForRole(roleId: string): readonly ISkill[] {
    return this.all().filter(
      (s) => s.frontmatter.activateFor?.includes(roleId) ?? false,
    );
  }

  /**
   * PR-I 修复 #10: Skill discovery —— 给 LLM 用的紧凑列表。
   *
   * 在 prompt 里注入"# Available skills"段落，agent 看到列表后可主动声明
   * "use skill: web-research"。比把每个 skill 完整 instructions 都塞进 prompt 节省 90% token。
   */
  describeForLLM(filter?: { roleId?: string; tag?: string }): string {
    let list: readonly ISkill[] = this.all();
    if (filter?.roleId) {
      list = list.filter(
        (s) => s.frontmatter.activateFor?.includes(filter.roleId!) ?? false,
      );
    }
    if (filter?.tag) {
      list = list.filter(
        (s) => s.frontmatter.tags?.includes(filter.tag!) ?? false,
      );
    }
    if (list.length === 0) return "(no skills available)";
    return list
      .map(
        (s) =>
          `- ${s.frontmatter.name}: ${s.frontmatter.description}` +
          (s.frontmatter.tags?.length
            ? ` [${s.frontmatter.tags.join(", ")}]`
            : ""),
      )
      .join("\n");
  }

  /** Skill 选择助手：根据 query 关键词找 top-K 匹配（简单 keyword overlap） */
  recommend(query: string, k = 3): readonly ISkill[] {
    const q = query.toLowerCase();
    const scored = this.all().map((s) => {
      const haystack = (
        s.frontmatter.name +
        " " +
        s.frontmatter.description +
        " " +
        (s.frontmatter.tags ?? []).join(" ")
      ).toLowerCase();
      let score = 0;
      for (const word of q.split(/\s+/).filter((w) => w.length > 2)) {
        if (haystack.includes(word)) score += 1;
      }
      return { skill: s, score };
    });
    return scored
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map((x) => x.skill);
  }

  clear(): void {
    this.byName.clear();
  }

  size(): number {
    return this.byName.size;
  }
}
