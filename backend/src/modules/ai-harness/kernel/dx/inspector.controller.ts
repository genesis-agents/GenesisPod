/**
 * HarnessInspectorController — 暴露内部状态给 Inspector UI / 调试
 *
 * 双重防护（建议修：单 NODE_ENV 不安全，运维错配会泄漏）：
 *   1. HarnessModule 仅在 NODE_ENV !== production 注册本 controller
 *   2. 每个 endpoint 运行时再次检查 process.env.HARNESS_INSPECTOR_ENABLED === "1"
 *      生产环境就算 NODE_ENV 被错配，第二道闸默认关闭也能挡住
 *
 * 端点（GET 只读）：
 *   /harness/inspector/agents
 *   /harness/inspector/loops
 *   /harness/inspector/skills
 *   /harness/inspector/checkpoints/:agentId
 *   /harness/inspector/events/:agentId
 *   /harness/inspector/staged-skills
 */

function assertInspectorEnabled(): void {
  if (process.env.NODE_ENV === "production") {
    throw new ForbiddenException("HarnessInspector is disabled in production");
  }
  if (process.env.HARNESS_INSPECTOR_ENABLED !== "1") {
    throw new ForbiddenException(
      "HarnessInspector requires HARNESS_INSPECTOR_ENABLED=1 to be set explicitly",
    );
  }
}

import {
  Controller,
  ForbiddenException,
  Get,
  Optional,
  Param,
  Query,
} from "@nestjs/common";
import { LoopRegistry } from "../../execution/loop/loop-registry";
import { SkillRegistry } from "../../kernel/skills/skill-registry";
import { SpecAgentRegistry } from "../../kernel/core/spec-agent-registry";
import { CheckpointService } from "../../memory/checkpoint/checkpoint.service";
import { AgentEventStore } from "../../memory/checkpoint/agent-event-store";
import { SkillLearningCoordinator } from "../../kernel/learning/skill-learning-coordinator";

@Controller("harness/inspector")
export class HarnessInspectorController {
  constructor(
    private readonly loops: LoopRegistry,
    private readonly skills: SkillRegistry,
    private readonly specs: SpecAgentRegistry,
    @Optional() private readonly checkpoints?: CheckpointService,
    @Optional() private readonly events?: AgentEventStore,
    @Optional() private readonly learning?: SkillLearningCoordinator,
  ) {}

  @Get("agents")
  listAgents(): { id: string }[] {
    assertInspectorEnabled();
    return this.specs.getAllIds().map((id) => ({ id }));
  }

  @Get("loops")
  listLoops(): { kinds: string[] } {
    assertInspectorEnabled();
    return { kinds: this.loops.list() };
  }

  @Get("skills")
  listSkills(): { skills: { name: string; description: string }[] } {
    assertInspectorEnabled();
    return {
      skills: this.skills.all().map((s) => ({
        name: s.frontmatter.name,
        description: s.frontmatter.description,
      })),
    };
  }

  @Get("staged-skills")
  listStagedSkills(): { staged: { name: string; score: number }[] } {
    assertInspectorEnabled();
    if (!this.learning) return { staged: [] };
    return {
      staged: this.learning
        .listStaged()
        .map((s) => ({ name: s.frontmatter.name, score: s.score })),
    };
  }

  @Get("checkpoints/:agentId")
  async listCheckpoints(@Param("agentId") agentId: string): Promise<{
    checkpoints: unknown[];
  }> {
    assertInspectorEnabled();
    if (!this.checkpoints) return { checkpoints: [] };
    return { checkpoints: [...(await this.checkpoints.listForAgent(agentId))] };
  }

  @Get("events/:agentId")
  async listEvents(
    @Param("agentId") agentId: string,
    @Query("fromSeq") fromSeq?: string,
    @Query("limit") limit?: string,
  ): Promise<{ events: unknown[] }> {
    assertInspectorEnabled();
    if (!this.events) return { events: [] };
    const stream = await this.events.readStream(agentId, {
      fromSeq: fromSeq ? Number(fromSeq) : undefined,
      limit: limit ? Number(limit) : 200,
    });
    return { events: [...stream] };
  }
}
