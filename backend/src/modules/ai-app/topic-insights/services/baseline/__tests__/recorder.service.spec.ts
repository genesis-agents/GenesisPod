import { BaselineRecorderService } from "../recorder.service";
import {
  ResearchEventEmitterService,
  ResearchEventType,
} from "../../research/event-emitter.service";
import type {
  AiChatService,
  ChatObserver,
  ChatObserverEvent,
  ChatResult,
} from "@/modules/ai-engine/facade";
import { KernelContext } from "@/modules/ai-engine/facade";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

/**
 * BaselineRecorderService 行为单测
 *
 * 覆盖：
 * - 环境变量关闭时完全旁路（不注册 observer、不 mkdir）
 * - 环境变量开启时捕获 chat 调用并写 ndjson
 * - 非 mission 上下文（无 KernelContext.missionId）skip
 * - Mission COMPLETED 事件触发 DB snapshot + metrics.json + final-report.md
 * - Observer 抛错不影响主流程（此测由 AiChatService 自己的 dispatch 保证）
 */
describe("BaselineRecorderService", () => {
  let tmpDir: string;
  let originalCwd: string;
  let originalFlag: string | undefined;

  let chatObserver: ChatObserver | undefined;
  let emitObserver: ((e: unknown) => void) | undefined;

  const mockAiChatService: Partial<AiChatService> = {
    addChatObserver: jest.fn((fn: ChatObserver) => {
      chatObserver = fn;
      return () => {
        chatObserver = undefined;
      };
    }),
  };

  const mockResearchEventEmitter: Partial<ResearchEventEmitterService> = {
    addEmitObserver: jest.fn((fn: (e: unknown) => void) => {
      emitObserver = fn;
      return () => {
        emitObserver = undefined;
      };
    }),
  };

  const mockPrisma = {
    researchMission: { findUnique: jest.fn().mockResolvedValue(null) },
    topicReport: {
      findFirst: jest.fn().mockResolvedValue({
        id: "report-1",
        topicId: "topic-1",
        fullReport: "# 测试报告",
        generatedAt: new Date("2026-04-22"),
      }),
    },
    dimensionAnalysis: { findMany: jest.fn().mockResolvedValue([]) },
    topicEvidence: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: "ev-1",
          sourceType: "web",
          url: "https://x",
          credibilityScore: 80,
        },
      ]),
    },
  };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "baseline-rec-"));
    originalCwd = process.cwd();
    process.chdir(tmpDir);
    fs.mkdirSync(path.join(tmpDir, "backend"), { recursive: true });

    originalFlag = process.env.TOPIC_INSIGHTS_RECORD_BASELINE;

    chatObserver = undefined;
    emitObserver = undefined;
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (originalFlag === undefined) {
      delete process.env.TOPIC_INSIGHTS_RECORD_BASELINE;
    } else {
      process.env.TOPIC_INSIGHTS_RECORD_BASELINE = originalFlag;
    }
  });

  function makeService(): BaselineRecorderService {
    return new BaselineRecorderService(
      mockAiChatService as AiChatService,
      mockResearchEventEmitter as ResearchEventEmitterService,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockPrisma as any,
    );
  }

  it("flag 未开启时不注册 observer、不创建 fixtures 目录", () => {
    delete process.env.TOPIC_INSIGHTS_RECORD_BASELINE;

    const svc = makeService();
    svc.onModuleInit();

    expect(mockAiChatService.addChatObserver).not.toHaveBeenCalled();
    expect(mockResearchEventEmitter.addEmitObserver).not.toHaveBeenCalled();
    expect(
      fs.existsSync(path.join(tmpDir, "backend", "fixtures", "golden")),
    ).toBe(false);
  });

  it("flag 开启时注册 observer 并创建 fixtures 目录", () => {
    process.env.TOPIC_INSIGHTS_RECORD_BASELINE = "1";

    const svc = makeService();
    svc.onModuleInit();

    expect(mockAiChatService.addChatObserver).toHaveBeenCalledTimes(1);
    expect(mockResearchEventEmitter.addEmitObserver).toHaveBeenCalledTimes(1);
    expect(
      fs.existsSync(path.join(tmpDir, "backend", "fixtures", "golden")),
    ).toBe(true);
  });

  it("chat 调用在 mission 上下文内会写入 llm-calls.ndjson", () => {
    process.env.TOPIC_INSIGHTS_RECORD_BASELINE = "1";
    const svc = makeService();
    svc.onModuleInit();

    const event: ChatObserverEvent = {
      options: {
        messages: [{ role: "user", content: "你好" }],
      },
      result: {
        content: "你好呀",
        model: "gpt-4o",
        usage: { totalTokens: 100, inputTokens: 10, outputTokens: 90 },
      } as ChatResult,
      durationMs: 1234,
      kernelContext: {
        processId: "",
        missionId: "mission-abc",
        baselineTag: "topic-x-standard",
      },
    };

    chatObserver?.(event);

    const file = path.join(
      tmpDir,
      "backend",
      "fixtures",
      "golden",
      "topic-x-standard",
      "llm-calls.ndjson",
    );
    expect(fs.existsSync(file)).toBe(true);
    const line = fs.readFileSync(file, "utf-8").trim();
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(parsed.missionId).toBe("mission-abc");
    expect(parsed.content).toBe("你好呀");
    expect((parsed.messages as unknown[]).length).toBe(1);
  });

  it("chat 调用无 mission 上下文直接 skip", () => {
    process.env.TOPIC_INSIGHTS_RECORD_BASELINE = "1";
    const svc = makeService();
    svc.onModuleInit();

    const event: ChatObserverEvent = {
      options: { messages: [{ role: "user", content: "hi" }] },
      result: { content: "hey", model: "gpt-4o" } as ChatResult,
      durationMs: 100,
      kernelContext: { processId: "" },
    };

    chatObserver?.(event);

    const dir = path.join(tmpDir, "backend", "fixtures", "golden");
    const entries = fs.readdirSync(dir);
    expect(entries).toHaveLength(0);
  });

  it("MISSION_COMPLETED 事件触发 DB snapshot + metrics + final-report", async () => {
    process.env.TOPIC_INSIGHTS_RECORD_BASELINE = "1";
    const svc = makeService();
    svc.onModuleInit();

    // 先模拟一次 chat 调用以建立 metrics 聚合
    chatObserver?.({
      options: { messages: [{ role: "user", content: "q" }] },
      result: {
        content: "a",
        model: "gpt-4o",
        usage: { totalTokens: 50, inputTokens: 20, outputTokens: 30 },
      } as ChatResult,
      durationMs: 500,
      kernelContext: {
        processId: "",
        missionId: "m-1",
        baselineTag: "tag-1",
      },
    });

    // 在 KernelContext 下发射 MISSION_COMPLETED
    await KernelContext.run(
      {
        processId: "",
        missionId: "m-1",
        baselineTag: "tag-1",
      },
      async () => {
        emitObserver?.({
          topicId: "topic-1",
          event: ResearchEventType.MISSION_COMPLETED,
          data: { missionId: "m-1" },
          timestamp: new Date().toISOString(),
        });
        // onMissionTerminal 是 void async — 等一个 microtask
        await new Promise((r) => setImmediate(r));
      },
    );

    const dir = path.join(tmpDir, "backend", "fixtures", "golden", "tag-1");
    expect(fs.existsSync(path.join(dir, "events.ndjson"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "db-snapshot.json"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "final-report.md"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "metrics.json"))).toBe(true);

    const metrics = JSON.parse(
      fs.readFileSync(path.join(dir, "metrics.json"), "utf-8"),
    ) as Record<string, number | string>;
    expect(metrics.llmCallCount).toBe(1);
    expect(metrics.totalInputTokens).toBe(20);
    expect(metrics.totalOutputTokens).toBe(30);
    expect(metrics.missionId).toBe("m-1");
  });

  it("onModuleDestroy 解绑 observer", () => {
    process.env.TOPIC_INSIGHTS_RECORD_BASELINE = "1";
    const svc = makeService();
    svc.onModuleInit();
    expect(chatObserver).toBeDefined();
    expect(emitObserver).toBeDefined();

    svc.onModuleDestroy();
    expect(chatObserver).toBeUndefined();
    expect(emitObserver).toBeUndefined();
  });
});
