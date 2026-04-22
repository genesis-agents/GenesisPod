/**
 * SkillActivator — 根据 Agent Identity 激活匹配的 Skills
 *
 * 职责：
 *   - 按 identity.skills 从 registry 查出所有激活的 skill
 *   - 把每个 skill 的 instructions 拼成 system reminder（high 优先级）
 *   - 调用 skill.activate(ctx) 让 skill 可额外注入 reminder / 注册临时 hook
 *   - 返回变更后的 envelope + 注销 hook 的清理函数
 *
 * 返回的清理函数应在 agent 执行结束后调用（由 HarnessedAgent 在 finally 里触发）。
 */

import { Injectable, Logger } from "@nestjs/common";
import type {
  IAgentIdentity,
  IContextEnvelope,
  IHookBinding,
  IHookRegistry,
  ISkill,
  ISkillActivationContext,
  HookEvent,
} from "../abstractions";
import { ContextEnvelope } from "../core/context-envelope";
import { SkillRegistry } from "./skill-registry";

export interface SkillActivationResult {
  envelope: IContextEnvelope;
  /** 卸载本次激活期间注册的所有临时 hook */
  cleanup: () => void;
  /** 已激活的 skill 名列表（用于 observability） */
  activatedSkills: readonly string[];
}

@Injectable()
export class SkillActivator {
  private readonly logger = new Logger(SkillActivator.name);

  constructor(
    private readonly registry: SkillRegistry,
    private readonly hooks: IHookRegistry,
  ) {}

  async activate(
    identity: IAgentIdentity,
    envelope: IContextEnvelope,
  ): Promise<SkillActivationResult> {
    const requestedIds = identity.skills ?? [];
    if (requestedIds.length === 0) {
      return { envelope, cleanup: () => {}, activatedSkills: [] };
    }

    const skills = requestedIds
      .map((id) => this.registry.get(id))
      .filter((s): s is ISkill => s !== undefined);

    if (skills.length < requestedIds.length) {
      const missing = requestedIds.filter((id) => !this.registry.has(id));
      this.logger.warn(
        `Skills not found in registry and skipped: ${missing.join(", ")}`,
      );
    }

    let current = envelope;
    const activated: string[] = [];
    const unregisterFns: Array<() => void> = [];

    for (const skill of skills) {
      // 1. Inject instructions as high-priority reminder
      if (current instanceof ContextEnvelope) {
        current = current.withReminder(
          `## Skill: ${skill.frontmatter.name}\n${skill.instructions}`,
          "high",
          `skill:${skill.frontmatter.name}`,
        ).envelope as ContextEnvelope;
      } else {
        current = {
          ...current,
          reminders: [
            ...current.reminders,
            {
              source: `skill:${skill.frontmatter.name}`,
              priority: "high" as const,
              content: `## Skill: ${skill.frontmatter.name}\n${skill.instructions}`,
            },
          ],
        };
      }

      // 2. Call skill.activate() with a scoped activation context
      if (skill.activate) {
        const ctx: ISkillActivationContext = {
          envelope: current,
          addReminder: (content, priority = "medium") => {
            if (current instanceof ContextEnvelope) {
              current = current.withReminder(
                content,
                priority,
                `skill:${skill.frontmatter.name}`,
              ).envelope as ContextEnvelope;
            }
          },
          registerHook: <E extends HookEvent>(binding: IHookBinding<E>) => {
            const unreg = this.hooks.register(binding);
            unregisterFns.push(unreg);
          },
        };
        try {
          await skill.activate(ctx);
        } catch (err) {
          this.logger.warn(
            `Skill '${skill.frontmatter.name}' activate() threw: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      activated.push(skill.frontmatter.name);
    }

    return {
      envelope: current,
      cleanup: () => {
        for (const u of unregisterFns) {
          try {
            u();
          } catch {
            /* ignore */
          }
        }
      },
      activatedSkills: activated,
    };
  }
}
