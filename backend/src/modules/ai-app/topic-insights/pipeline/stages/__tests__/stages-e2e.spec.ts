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
  QualityGateStage,
  PersistStage,
  CleanupStage,
  CogLoopStage,
  EvalStage,
  FactCheckStage,
  LatexStage,
} from "../../stages";
import { StageRegistry } from "../../stage-registry";
import { PipelineOrchestratorService, buildIdentityContext } from "../..";
import {
  DimensionPlannerAgent,
  FactCheckerAgent,
  FactExtractorAgent,
  GapSearcherAgent,
  HarnessAgentRegistry,
  HypothesisVerifierAgent,
  LeaderPlannerAgent,
  MetaExtractorAgent,
  QualityReviewerAgent,
  SectionReviewerAgent,
  SectionWriterAgent,
  SynthesizerAgent,
} from "../../../harness/agents";

describe("Stages · end-to-end (stub mode)", () => {
  const origFlag = process.env.HARNESS_AGENTS_STUB;

  beforeAll(() => {
    process.env.HARNESS_AGENTS_STUB = "1";
  });

  afterAll(() => {
    if (origFlag === undefined) delete process.env.HARNESS_AGENTS_STUB;
    else process.env.HARNESS_AGENTS_STUB = origFlag;
  });

  it("11 stages 全部跑完（Core 8 + QGATE/PERSIST/CLEANUP），产出最终输出", async () => {
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
    stageRegistry.register(new QualityGateStage());
    stageRegistry.register(new AssemblyStage());
    stageRegistry.register(new PersistStage());
    stageRegistry.register(new CleanupStage());

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
      "ST-08-QGATE",
      "ST-11-ASM",
      "ST-13-PERSIST",
      "ST-14-CLEANUP",
    ]);
    expect(result.failed ?? 0).toBe(0);
  });

  it("thorough depth 触发所有 thorough-only stages (COGLOOP / EVAL / FACT)", async () => {
    const stageRegistry = new StageRegistry();
    const agentRegistry = new HarnessAgentRegistry();

    // Core + Enhancement agents
    agentRegistry.register(new LeaderPlannerAgent());
    agentRegistry.register(new SectionWriterAgent());
    agentRegistry.register(new SectionReviewerAgent());
    agentRegistry.register(new MetaExtractorAgent());
    agentRegistry.register(new QualityReviewerAgent());
    agentRegistry.register(new SynthesizerAgent());
    agentRegistry.register(new DimensionPlannerAgent());
    agentRegistry.register(new FactCheckerAgent());
    agentRegistry.register(new GapSearcherAgent());
    agentRegistry.register(new HypothesisVerifierAgent());
    agentRegistry.register(new FactExtractorAgent());

    stageRegistry.register(new InitStage());
    stageRegistry.register(
      new PlanStage(agentRegistry, new StubPlanContextProvider()),
    );
    stageRegistry.register(new ResearchStage());
    stageRegistry.register(new WriteStage(agentRegistry));
    stageRegistry.register(new ReviewStage(agentRegistry));
    stageRegistry.register(new IntegrateStage(agentRegistry));
    stageRegistry.register(new CogLoopStage(agentRegistry));
    stageRegistry.register(new SynthStage(agentRegistry));
    stageRegistry.register(new QualityGateStage());
    stageRegistry.register(new EvalStage());
    stageRegistry.register(new FactCheckStage(agentRegistry));
    stageRegistry.register(new AssemblyStage());
    stageRegistry.register(new LatexStage());
    stageRegistry.register(new PersistStage());
    stageRegistry.register(new CleanupStage());

    const orchestrator = new PipelineOrchestratorService(stageRegistry);
    const identity = buildIdentityContext({
      missionId: "e2e-thorough-1",
      topicId: "t-1",
      reportId: "r-1",
      userId: "u-1",
      depth: "thorough",
      mode: "fresh",
    });

    const result = await orchestrator.run(identity);

    // thorough 下 COGLOOP / EVAL / FACT 都应 run；LATEX 因 hasLatex 默认 false skip
    expect(result.completedStages).toContain("ST-06-COGLOOP");
    expect(result.completedStages).toContain("ST-09-EVAL");
    expect(result.completedStages).toContain("ST-10-FACT");
    expect(result.skippedStages).toContain("ST-12-LATEX");
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
