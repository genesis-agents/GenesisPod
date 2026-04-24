import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import type { ResearchTopicType } from "@prisma/client";

import { SkillLoaderService } from "@/modules/ai-engine/facade";

import { FRAMEWORK_SKILL_POLICIES } from "./policy.config";
import type {
  EventSubtype,
  FrameworkSkillPolicyEntry,
  LoadedFramework,
} from "./policy.types";

/**
 * DI token for test-time / CMS-driven policy overrides. When unbound, the
 * repository uses the built-in {@link FRAMEWORK_SKILL_POLICIES}.
 */
export const FRAMEWORK_SKILL_POLICY_SEED = Symbol(
  "FRAMEWORK_SKILL_POLICY_SEED",
);

/**
 * FrameworkSkillPolicyRepository
 *
 * F1 · Single source of truth for "which framework `.skill.md` should the
 * Leader see for this topic".
 *
 * Lookup rules:
 * - Specific (topicType, eventSubtype) match wins.
 * - Otherwise fall back to the base entry for topicType (no eventSubtype).
 * - If nothing matches, returns an empty list (caller still runs).
 */
@Injectable()
export class FrameworkSkillPolicyRepository {
  private readonly logger = new Logger(FrameworkSkillPolicyRepository.name);

  constructor(
    private readonly skillLoader: SkillLoaderService,
    @Optional()
    @Inject(FRAMEWORK_SKILL_POLICY_SEED)
    private readonly seed?: readonly FrameworkSkillPolicyEntry[],
  ) {}

  private get policies(): readonly FrameworkSkillPolicyEntry[] {
    return this.seed ?? FRAMEWORK_SKILL_POLICIES;
  }

  /**
   * Resolve (topicType, eventSubtype?) to the ordered skill ids. Specific
   * match first, then base topicType fallback.
   */
  getSkillIds(
    topicType: ResearchTopicType,
    eventSubtype?: EventSubtype,
  ): readonly string[] {
    if (eventSubtype) {
      const specific = this.policies.find(
        (p) => p.topicType === topicType && p.eventSubtype === eventSubtype,
      );
      if (specific) return specific.skillIds;
    }
    const base = this.policies.find(
      (p) => p.topicType === topicType && p.eventSubtype === undefined,
    );
    return base?.skillIds ?? [];
  }

  /**
   * Load `.skill.md` content via SkillLoader for every resolved skillId.
   * Missing skills are logged at warn level and silently skipped so a single
   * broken skill doesn't take the whole prompt down.
   */
  async loadFrameworks(
    topicType: ResearchTopicType,
    eventSubtype?: EventSubtype,
  ): Promise<readonly LoadedFramework[]> {
    const skillIds = this.getSkillIds(topicType, eventSubtype);
    const loaded: LoadedFramework[] = [];
    for (const skillId of skillIds) {
      const skill = await this.skillLoader.getSkillById(skillId);
      if (!skill) {
        this.logger.warn(
          `[loadFrameworks] skill not found: ${skillId} (topicType=${topicType}, subtype=${eventSubtype ?? "-"})`,
        );
        continue;
      }
      loaded.push({ skillId, content: skill.content });
    }
    return loaded;
  }
}
