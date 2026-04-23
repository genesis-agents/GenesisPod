/**
 * Tier Core Group D · 8 Stage 集成端到端测试
 *
 * 验证：8 个 stage 串起来，stub 模式下能跑到 ASM，产物结构合理。
 */

import {
  AssemblyStage,
  InitStage,
  IntegrateStage,
  PlanStage,
  ResearchStage,
  ReviewStage,
  StubPlanContextProvider,
  SynthStage,
  WriteStage,
} from "../../stages";
import { StageRegistry } from "../../pipeline/stage-registry";
import {
  PipelineOrchestratorService,
  buildIdentityContext,
} from "../../pipeline";
import {
  HarnessAgentRegistry,
  LeaderPlannerAgent,
  MetaExtractorAgent,
  QualityReviewerAgent,
  SectionReviewerAgent,
  SectionWriterAgent,
  SynthesizerAgent,
} from "../../agents";

describe("Stages · end-to-end (stub mode)", () => {
  const origFlag = process.env.HARNESS_AGENTS_STUB;

  beforeAll(() => {
    process.env.HARNESS_AGENTS_STUB = "1";
  });

  afterAll(() => {
    if (origFlag === undefined) delete process.env.HARNESS_AGENTS_STUB;
    else process.env.HARNESS_AGENTS_STUB = origFlag;
  });

  it("8 stages 全部跑完，产出 AssemblyStage 输出", async () => {
    const stageRegistry = new StageRegistry();
    const agentRegistry = new HarnessAgentRegistry();

    agentRegistry.register(new LeaderPlannerAgent());
    agentRegistry.register(new SectionWriterAgent());
    agentRegistry.register(new SectionReviewerAgent());
    agentRegistry.register(new MetaExtractorAgent());
    agentRegistry.register(new QualityReviewerAgent());
    agentRegistry.register(new SynthesizerAgent());

    stageRegistry.register(new InitStage());
    stageRegistry.register(
      new PlanStage(agentRegistry, new StubPlanContextProvider()),
    );
    stageRegistry.register(new ResearchStage());
    stageRegistry.register(new WriteStage(agentRegistry));
    stageRegistry.register(new ReviewStage(agentRegistry));
    stageRegistry.register(new IntegrateStage(agentRegistry));
    stageRegistry.register(new SynthStage(agentRegistry));
    stageRegistry.register(new AssemblyStage());

    const orchestrator = new PipelineOrchestratorService(stageRegistry);
    const identity = buildIdentityContext({
      missionId: "e2e-m-1",
      topicId: "e2e-t-1",
      reportId: "e2e-r-1",
      userId: "u-1",
      depth: "standard",
      mode: "fresh",
    });

    const result = await orchestrator.run(identity);

    expect(result.completedStages).toEqual([
      "ST-00-INIT",
      "ST-01-PLAN",
      "ST-02-RESEARCH",
      "ST-03-WRITE",
      "ST-04-REVIEW",
      "ST-05-INTEGRATE",
      "ST-07-SYNTH",
      "ST-11-ASM",
    ]);
    expect(result.failed ?? 0).toBe(0);
  });

  it("AbortSignal 在 pipeline 运行中生效", async () => {
    const stageRegistry = new StageRegistry();
    const agentRegistry = new HarnessAgentRegistry();

    agentRegistry.register(new LeaderPlannerAgent());
    stageRegistry.register(new InitStage());
    stageRegistry.register(
      new PlanStage(agentRegistry, new StubPlanContextProvider()),
    );

    const orchestrator = new PipelineOrchestratorService(stageRegistry);
    const identity = buildIdentityContext({
      missionId: "m-abort",
      topicId: "t",
      reportId: "r",
      userId: "u",
      depth: "standard",
      mode: "fresh",
    });
    identity.abortController.abort();

    await expect(orchestrator.run(identity)).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});
