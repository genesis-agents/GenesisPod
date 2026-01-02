/**
 * AI Engine - Skill Registry
 * 技能注册表实现
 */

import { Injectable } from '@nestjs/common';
import { BaseRegistry, IRegistry, RegistryStats } from '../../core/interfaces';
import { ISkill, SkillLayer, SkillDefinition } from '../abstractions/skill.interface';

/**
 * 技能注册表
 */
@Injectable()
export class SkillRegistry extends BaseRegistry<ISkill> implements IRegistry<ISkill> {
  private readonly byLayer = new Map<string, Set<string>>();
  private readonly byDomain = new Map<string, Set<string>>();
  private readonly byTag = new Map<string, Set<string>>();
  private readonly factories = new Map<string, () => ISkill>();

  /**
   * 注册技能
   */
  override register(skill: ISkill): void {
    super.register(skill);

    // 索引层次
    if (!this.byLayer.has(skill.layer)) {
      this.byLayer.set(skill.layer, new Set());
    }
    this.byLayer.get(skill.layer)!.add(skill.id);

    // 索引领域
    if (!this.byDomain.has(skill.domain)) {
      this.byDomain.set(skill.domain, new Set());
    }
    this.byDomain.get(skill.domain)!.add(skill.id);

    // 索引标签
    if (skill.tags) {
      for (const tag of skill.tags) {
        if (!this.byTag.has(tag)) {
          this.byTag.set(tag, new Set());
        }
        this.byTag.get(tag)!.add(skill.id);
      }
    }
  }

  /**
   * 注册技能定义
   */
  registerDefinition<TInput, TOutput>(
    definition: SkillDefinition<TInput, TOutput>,
  ): void {
    if (definition.factory) {
      this.factories.set(definition.id, definition.factory);
    }
  }

  /**
   * 注销技能
   */
  override unregister(id: string): boolean {
    const skill = this.tryGet(id);
    if (!skill) {
      return false;
    }

    this.byLayer.get(skill.layer)?.delete(id);
    this.byDomain.get(skill.domain)?.delete(id);

    if (skill.tags) {
      for (const tag of skill.tags) {
        this.byTag.get(tag)?.delete(id);
      }
    }

    return super.unregister(id);
  }

  /**
   * 按层次获取技能
   */
  getByLayer(layer: SkillLayer): ISkill[] {
    const ids = this.byLayer.get(layer);
    if (!ids) return [];
    return Array.from(ids)
      .map((id) => this.tryGet(id))
      .filter((s): s is ISkill => s !== undefined);
  }

  /**
   * 按领域获取技能
   */
  getByDomain(domain: string): ISkill[] {
    const ids = this.byDomain.get(domain);
    if (!ids) return [];
    return Array.from(ids)
      .map((id) => this.tryGet(id))
      .filter((s): s is ISkill => s !== undefined);
  }

  /**
   * 按标签获取技能
   */
  getByTag(tag: string): ISkill[] {
    const ids = this.byTag.get(tag);
    if (!ids) return [];
    return Array.from(ids)
      .map((id) => this.tryGet(id))
      .filter((s): s is ISkill => s !== undefined);
  }

  /**
   * 获取所有层次
   */
  getLayers(): SkillLayer[] {
    return Array.from(this.byLayer.keys());
  }

  /**
   * 获取所有领域
   */
  getDomains(): string[] {
    return Array.from(this.byDomain.keys());
  }

  /**
   * 获取所有标签
   */
  getTags(): string[] {
    return Array.from(this.byTag.keys());
  }

  /**
   * 获取统计信息
   */
  override getStats(): SkillRegistryStats {
    const baseStats = super.getStats();
    const byLayer: Record<string, number> = {};
    const byDomain: Record<string, number> = {};

    for (const [layer, ids] of this.byLayer.entries()) {
      byLayer[layer] = ids.size;
    }
    for (const [domain, ids] of this.byDomain.entries()) {
      byDomain[domain] = ids.size;
    }

    return {
      ...baseStats,
      byLayer,
      byDomain,
    };
  }

  /**
   * 搜索技能
   */
  search(query: SkillSearchQuery): ISkill[] {
    let results = this.getAll();

    if (query.keyword) {
      const keyword = query.keyword.toLowerCase();
      results = results.filter(
        (skill) =>
          skill.id.toLowerCase().includes(keyword) ||
          skill.name.toLowerCase().includes(keyword) ||
          skill.description.toLowerCase().includes(keyword),
      );
    }

    if (query.layer) {
      results = results.filter((skill) => skill.layer === query.layer);
    }

    if (query.domain) {
      results = results.filter((skill) => skill.domain === query.domain);
    }

    if (query.tags && query.tags.length > 0) {
      results = results.filter(
        (skill) =>
          skill.tags && query.tags!.some((tag) => skill.tags!.includes(tag)),
      );
    }

    return results;
  }
}

/**
 * 技能注册表统计
 */
export interface SkillRegistryStats extends RegistryStats {
  byLayer: Record<string, number>;
  byDomain: Record<string, number>;
}

/**
 * 技能搜索查询
 */
export interface SkillSearchQuery {
  keyword?: string;
  layer?: SkillLayer;
  domain?: string;
  tags?: string[];
}
