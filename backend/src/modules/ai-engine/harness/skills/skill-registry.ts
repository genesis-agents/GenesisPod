/**
 * SkillRegistry — 内存级 SKILL.md 注册表
 *
 * 支持按 id / tag / activateFor (Role id) 查找。
 * 与 ai-engine/skills/（旧 CRUD 风格）隔离，互不干扰。
 */

import { Injectable, Logger } from "@nestjs/common";
import type { ISkill } from "../abstractions";

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

  clear(): void {
    this.byName.clear();
  }

  size(): number {
    return this.byName.size;
  }
}
