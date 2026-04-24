import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";

import { PrismaService } from "@/common/prisma/prisma.service";
import { SpecAgentRegistry } from "@/modules/ai-engine/facade";
import { ResearchEventEmitterService } from "@/modules/ai-app/topic-insights/mission/realtime/event-emitter.service";

import { LeaderChatService } from "../leader-chat.service";

type IntentDecision = {
  decisionType: "DIRECT_ANSWER" | "CREATE_TODO" | "CLARIFY" | "ACKNOWLEDGE";
  understanding: string;
  response: string | null;
  todoCandidate: {
    title: string;
    description: string;
    priority: "low" | "medium" | "high";
  } | null;
  clarifyQuestion: string | null;
  clarifyOptions: string[] | null;
};

function build() {
  const prisma = {
    researchTopic: { findUnique: jest.fn() },
    researchMission: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    topicReport: { count: jest.fn().mockResolvedValue(0) },
    researchTeamMessage: { findMany: jest.fn().mockResolvedValue([]) },
    researchTodo: { create: jest.fn() },
  };

  const events = {
    saveUserMessage: jest.fn().mockResolvedValue(undefined),
    emitLeaderThinking: jest.fn().mockResolvedValue(undefined),
    emitLeaderResponse: jest.fn().mockResolvedValue(undefined),
  };

  const executeSpec = jest.fn<Promise<{ output: IntentDecision }>, unknown[]>();
  const specAgent = { executeSpec };
  const specRegistry = { get: jest.fn().mockReturnValue(specAgent) };

  return { prisma, events, specRegistry, executeSpec };
}

async function makeService(deps: ReturnType<typeof build>) {
  const mod: TestingModule = await Test.createTestingModule({
    providers: [
      LeaderChatService,
      { provide: PrismaService, useValue: deps.prisma },
      { provide: SpecAgentRegistry, useValue: deps.specRegistry },
      { provide: ResearchEventEmitterService, useValue: deps.events },
    ],
  }).compile();
  return mod.get(LeaderChatService);
}

const topic = {
  id: "topic-1",
  name: "AI 研究",
  type: "TECHNOLOGY",
  userId: "user-1",
};
const mission = { id: "mission-1", status: "EXECUTING", topicId: "topic-1" };

describe("LeaderChatService", () => {
  it("throws NotFoundException when topic does not exist", async () => {
    const deps = build();
    deps.prisma.researchTopic.findUnique.mockResolvedValue(null);
    const svc = await makeService(deps);

    await expect(
      svc.handle({ userId: "u", topicId: "nope", message: "hi" }),
    ).rejects.toThrow(NotFoundException);
  });

  it("persists user message + fires LEADER_THINKING + emits LEADER_RESPONSE for DIRECT_ANSWER", async () => {
    const deps = build();
    deps.prisma.researchTopic.findUnique.mockResolvedValue(topic);
    deps.prisma.researchMission.findFirst.mockResolvedValue(mission);
    deps.executeSpec.mockResolvedValue({
      output: {
        decisionType: "DIRECT_ANSWER",
        understanding: "u asks a question",
        response: "你好，AI 研究...",
        todoCandidate: null,
        clarifyQuestion: null,
        clarifyOptions: null,
      },
    });
    const svc = await makeService(deps);

    const result = await svc.handle({
      userId: "user-1",
      topicId: "topic-1",
      message: "什么是 AI?",
    });

    expect(result.missionId).toBe("mission-1");
    expect(result.decisionType).toBe("DIRECT_ANSWER");
    expect(result.response).toContain("AI 研究");
    expect(deps.events.saveUserMessage).toHaveBeenCalledWith(
      "topic-1",
      "mission-1",
      "什么是 AI?",
      undefined,
    );
    expect(deps.events.emitLeaderThinking).toHaveBeenCalled();
    expect(deps.events.emitLeaderResponse).toHaveBeenCalledWith(
      "topic-1",
      "mission-1",
      "你好，AI 研究...",
    );
  });

  it("creates a ResearchTodo with USER_REQUEST type on CREATE_TODO", async () => {
    const deps = build();
    deps.prisma.researchTopic.findUnique.mockResolvedValue(topic);
    deps.prisma.researchMission.findFirst.mockResolvedValue(mission);
    deps.executeSpec.mockResolvedValue({
      output: {
        decisionType: "CREATE_TODO",
        understanding: "用户希望补充 xxx",
        response: "已帮你创建一个研究任务",
        todoCandidate: {
          title: "深挖市场竞争",
          description: "补充 3 个代表性竞品对比",
          priority: "high",
        },
        clarifyQuestion: null,
        clarifyOptions: null,
      },
    });
    deps.prisma.researchTodo.create.mockResolvedValue({
      id: "todo-9",
      title: "深挖市场竞争",
    });
    const svc = await makeService(deps);

    const result = await svc.handle({
      userId: "user-1",
      topicId: "topic-1",
      message: "补充一下竞品对比",
    });

    expect(result.decisionType).toBe("CREATE_TODO");
    expect(result.todo).toEqual({ id: "todo-9", title: "深挖市场竞争" });
    expect(deps.prisma.researchTodo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          topicId: "topic-1",
          missionId: "mission-1",
          type: "USER_REQUEST",
          title: "深挖市场竞争",
          priority: 8,
        }),
      }),
    );
  });

  it("emits a CLARIFY question to the timeline when CLARIFY", async () => {
    const deps = build();
    deps.prisma.researchTopic.findUnique.mockResolvedValue(topic);
    deps.prisma.researchMission.findFirst.mockResolvedValue(mission);
    deps.executeSpec.mockResolvedValue({
      output: {
        decisionType: "CLARIFY",
        understanding: "消息语义模糊",
        response: null,
        todoCandidate: null,
        clarifyQuestion: "你想扩展哪个角度？",
        clarifyOptions: ["市场", "技术", "政策"],
      },
    });
    const svc = await makeService(deps);

    const result = await svc.handle({
      userId: "user-1",
      topicId: "topic-1",
      message: "再补充点",
    });

    expect(result.decisionType).toBe("CLARIFY");
    expect(result.clarifyQuestion).toBe("你想扩展哪个角度？");
    expect(result.clarifyOptions).toEqual(["市场", "技术", "政策"]);
    expect(deps.events.emitLeaderResponse).toHaveBeenCalledWith(
      "topic-1",
      "mission-1",
      expect.stringContaining("候选"),
    );
  });

  it("degrades gracefully when the intent spec throws", async () => {
    const deps = build();
    deps.prisma.researchTopic.findUnique.mockResolvedValue(topic);
    deps.prisma.researchMission.findFirst.mockResolvedValue(mission);
    deps.executeSpec.mockRejectedValue(new Error("llm down"));
    const svc = await makeService(deps);

    const result = await svc.handle({
      userId: "user-1",
      topicId: "topic-1",
      message: "hi",
    });

    expect(result.decisionType).toBe("ACKNOWLEDGE");
    expect(result.response).toContain("暂时无法解析");
  });

  it("handles topics without any prior mission", async () => {
    const deps = build();
    deps.prisma.researchTopic.findUnique.mockResolvedValue(topic);
    deps.prisma.researchMission.findFirst.mockResolvedValue(null);
    deps.executeSpec.mockResolvedValue({
      output: {
        decisionType: "ACKNOWLEDGE",
        understanding: "greet",
        response: "收到。",
        todoCandidate: null,
        clarifyQuestion: null,
        clarifyOptions: null,
      },
    });
    const svc = await makeService(deps);

    const result = await svc.handle({
      userId: "user-1",
      topicId: "topic-1",
      message: "你好",
    });

    expect(result.missionId).toBeNull();
    // No mission -> user message not persisted (no missionId to attach)
    expect(deps.events.saveUserMessage).not.toHaveBeenCalled();
    expect(deps.events.emitLeaderResponse).not.toHaveBeenCalled();
  });
});
