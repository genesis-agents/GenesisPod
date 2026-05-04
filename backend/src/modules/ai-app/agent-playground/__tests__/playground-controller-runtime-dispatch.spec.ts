/**
 * playground-controller-runtime-dispatch spec（v5.1 R2-A.2）
 *
 * 验证 controller.runTeam 按 PlaygroundRuntimeFlagService 决议结果分流：
 *   - flag=legacy   → TeamMission.runMission 被调，pipelineDispatcher 不被调
 *   - flag=pipeline-v1 → pipelineDispatcher.runMission 被调，TeamMission 不被调
 *   - 返回值含 runtimeVersion 字段供前端 / 监控审计
 *   - 任一路径异常都不会泄露到 caller（fire-and-forget + log）
 */
import { AgentPlaygroundController } from "../agent-playground.controller";

function makeController(flagValue: "legacy" | "pipeline-v1") {
  const ownership = { assign: jest.fn(), getOwner: jest.fn() };
  const orchestrator = {
    runMission: jest.fn().mockResolvedValue({ missionId: "x", report: {} }),
  };
  const pipelineDispatcher = {
    runMission: jest.fn().mockResolvedValue({
      missionId: "x",
      status: "completed",
      stageOutputs: {},
    }),
  };
  const runtimeFlag = {
    resolve: jest.fn().mockReturnValue(flagValue),
    defaultRuntime: jest.fn().mockReturnValue(flagValue),
  };
  const buffer = {} as never;
  const store = {} as never;
  const leaderChat = {} as never;
  const abortRegistry = {} as never;
  const prisma = {} as never;
  const checkpoint = {} as never;
  const localRerun = {} as never;
  const exportService = {} as never;
  const rerunOrchestrator = {} as never;

  const controller = new AgentPlaygroundController(
    orchestrator as never,
    buffer,
    ownership as never,
    store,
    leaderChat,
    abortRegistry,
    prisma,
    checkpoint,
    localRerun,
    exportService,
    rerunOrchestrator,
    pipelineDispatcher as never,
    runtimeFlag as never,
  );
  return {
    controller,
    orchestrator,
    pipelineDispatcher,
    runtimeFlag,
    ownership,
  };
}

const VALID_INPUT = {
  topic: "AI trends 2024",
  depth: "deep" as const,
  language: "zh-CN" as const,
};
const REQ = { user: { id: "u1" } } as never;

describe("AgentPlaygroundController.runTeam runtime dispatch (v5.1 R2-A.2)", () => {
  it("flag=legacy → TeamMission.runMission 被调，pipelineDispatcher 不被调", async () => {
    const { controller, orchestrator, pipelineDispatcher } =
      makeController("legacy");
    const result = controller.runTeam(VALID_INPUT, REQ);
    expect(result.runtimeVersion).toBe("legacy");
    expect(result.streamNamespace).toBe("agent-playground");
    expect(typeof result.missionId).toBe("string");
    // fire-and-forget: 等 microtask flush 让 dispatch 触发
    await new Promise((r) => setTimeout(r, 0));
    expect(orchestrator.runMission).toHaveBeenCalledTimes(1);
    expect(pipelineDispatcher.runMission).not.toHaveBeenCalled();
    expect(orchestrator.runMission.mock.calls[0][1]).toMatchObject({
      topic: "AI trends 2024",
    });
  });

  it("flag=pipeline-v1 → pipelineDispatcher.runMission 被调，TeamMission 不被调", async () => {
    const { controller, orchestrator, pipelineDispatcher } =
      makeController("pipeline-v1");
    const result = controller.runTeam(VALID_INPUT, REQ);
    expect(result.runtimeVersion).toBe("pipeline-v1");
    await new Promise((r) => setTimeout(r, 0));
    expect(pipelineDispatcher.runMission).toHaveBeenCalledTimes(1);
    expect(orchestrator.runMission).not.toHaveBeenCalled();
    expect(pipelineDispatcher.runMission.mock.calls[0][1]).toMatchObject({
      topic: "AI trends 2024",
    });
  });

  it("flag.resolve 收到当前 userId（用于白名单查询）", () => {
    const { controller, runtimeFlag } = makeController("legacy");
    controller.runTeam(VALID_INPUT, REQ);
    expect(runtimeFlag.resolve).toHaveBeenCalledWith({ userId: "u1" });
  });

  it("flag=legacy + TeamMission reject → 不泄露到 caller（fire-and-forget）", async () => {
    const { controller, orchestrator } = makeController("legacy");
    orchestrator.runMission.mockRejectedValueOnce(new Error("boom"));
    const result = controller.runTeam(VALID_INPUT, REQ);
    expect(result.runtimeVersion).toBe("legacy");
    expect(typeof result.missionId).toBe("string");
    await new Promise((r) => setTimeout(r, 5));
    // caller 不抛错，错误进 log（spec 不验证 logger 但确认无 unhandled rejection）
  });

  it("flag=pipeline-v1 + dispatcher reject → 不泄露到 caller", async () => {
    const { controller, pipelineDispatcher } = makeController("pipeline-v1");
    pipelineDispatcher.runMission.mockRejectedValueOnce(new Error("boom"));
    const result = controller.runTeam(VALID_INPUT, REQ);
    expect(result.runtimeVersion).toBe("pipeline-v1");
    await new Promise((r) => setTimeout(r, 5));
  });

  it("ownership.assign 在 dispatch 之前发生（保证 controller GET 立刻能查到）", async () => {
    const { controller, ownership, pipelineDispatcher } =
      makeController("pipeline-v1");
    let assignCalled = false;
    ownership.assign.mockImplementation(() => {
      assignCalled = true;
    });
    pipelineDispatcher.runMission.mockImplementation(async () => {
      expect(assignCalled).toBe(true);
      return { missionId: "x", status: "completed", stageOutputs: {} } as never;
    });
    controller.runTeam(VALID_INPUT, REQ);
    await new Promise((r) => setTimeout(r, 0));
  });
});
