/**
 * radar-discovery.stage 单元测试
 *
 * 2026-05-17 R3 评审：21 端点 / 多 stage 全 0 spec 覆盖，confidence 400 事故
 * 直接根因就是 LLM 输出契约无 spec 守护。本 spec 锁 discovery stage 关键 invariant：
 *   - confidence clamp 到 [0, 1]
 *   - 非法 type 被剔除
 *   - identifier 空 / 非 string 被剔除
 *   - LLM 返回非 JSON / 缺 candidates 字段 → 空数组，不 throw
 *   - ctx.signal.aborted → 立即 throw 不发请求
 */

import { Test } from "@nestjs/testing";
import { AiChatService } from "@/modules/ai-engine/facade";
import { RadarDiscoveryStage } from "../radar-discovery.stage";
import type {
  RadarMissionContext,
  RadarStageHookArgs,
} from "../radar-stage-types";

describe("RadarDiscoveryStage", () => {
  let stage: RadarDiscoveryStage;
  let chatMock: { chat: jest.Mock };

  beforeEach(async () => {
    chatMock = { chat: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        RadarDiscoveryStage,
        { provide: AiChatService, useValue: chatMock },
      ],
    }).compile();
    stage = moduleRef.get(RadarDiscoveryStage);
  });

  function makeCtx(
    overrides: Partial<RadarMissionContext> = {},
  ): RadarMissionContext {
    return {
      missionId: "m-1",
      userId: "u-1",
      input: {
        topicName: "GPT-5 发布动态",
        keywords: ["gpt-5"],
        existingSources: [],
      },
      signal: { aborted: false } as AbortSignal,
      state: { metrics: {} },
      ...overrides,
    } as unknown as RadarMissionContext;
  }

  const args: RadarStageHookArgs = {
    systemPrompt: "test",
  } as unknown as RadarStageHookArgs;

  async function chatReturns(content: string) {
    chatMock.chat.mockResolvedValueOnce({ content });
  }

  it("clamps confidence > 1 to 1", async () => {
    await chatReturns(
      JSON.stringify({
        candidates: [{ type: "X", identifier: "openai", confidence: 1.5 }],
      }),
    );
    const ctx = makeCtx();
    await stage.run(args, ctx);
    const out = (
      ctx.state as unknown as {
        discoveryCandidates: Array<{ confidence?: number }>;
      }
    ).discoveryCandidates;
    expect(out[0]?.confidence).toBe(1);
  });

  it("clamps confidence < 0 to 0", async () => {
    await chatReturns(
      JSON.stringify({
        candidates: [{ type: "X", identifier: "openai", confidence: -0.3 }],
      }),
    );
    const ctx = makeCtx();
    await stage.run(args, ctx);
    const out = (
      ctx.state as unknown as {
        discoveryCandidates: Array<{ confidence?: number }>;
      }
    ).discoveryCandidates;
    expect(out[0]?.confidence).toBe(0);
  });

  it("keeps valid confidence 0-1 float unchanged", async () => {
    await chatReturns(
      JSON.stringify({
        candidates: [{ type: "X", identifier: "openai", confidence: 0.85 }],
      }),
    );
    const ctx = makeCtx();
    await stage.run(args, ctx);
    const out = (
      ctx.state as unknown as {
        discoveryCandidates: Array<{ confidence?: number }>;
      }
    ).discoveryCandidates;
    expect(out[0]?.confidence).toBe(0.85);
  });

  it("returns undefined confidence when LLM omits or sends non-number", async () => {
    await chatReturns(
      JSON.stringify({
        candidates: [
          { type: "X", identifier: "a" },
          { type: "X", identifier: "b", confidence: "not-a-number" },
          { type: "X", identifier: "c", confidence: NaN },
        ],
      }),
    );
    const ctx = makeCtx();
    await stage.run(args, ctx);
    const out = (
      ctx.state as unknown as {
        discoveryCandidates: Array<{ confidence?: number }>;
      }
    ).discoveryCandidates;
    expect(out).toHaveLength(3);
    out.forEach((c) => expect(c.confidence).toBeUndefined());
  });

  it("filters out candidates with empty identifier", async () => {
    await chatReturns(
      JSON.stringify({
        candidates: [
          { type: "X", identifier: "" },
          { type: "X", identifier: "   " },
          { type: "X", identifier: "valid" },
        ],
      }),
    );
    const ctx = makeCtx();
    await stage.run(args, ctx);
    const out = (
      ctx.state as unknown as {
        discoveryCandidates: Array<{ identifier: string }>;
      }
    ).discoveryCandidates;
    expect(out).toHaveLength(1);
    expect(out[0]?.identifier).toBe("valid");
  });

  it("returns empty list when LLM returns non-JSON", async () => {
    await chatReturns("this is not json at all");
    const ctx = makeCtx();
    await stage.run(args, ctx);
    const out = (
      ctx.state as unknown as {
        discoveryCandidates: unknown[];
      }
    ).discoveryCandidates;
    expect(out).toEqual([]);
  });

  it("returns empty list when JSON missing candidates field", async () => {
    await chatReturns(JSON.stringify({ wrong: "key" }));
    const ctx = makeCtx();
    await stage.run(args, ctx);
    const out = (
      ctx.state as unknown as {
        discoveryCandidates: unknown[];
      }
    ).discoveryCandidates;
    expect(out).toEqual([]);
  });

  it("returns empty list when LLM throws", async () => {
    chatMock.chat.mockRejectedValueOnce(new Error("LLM down"));
    const ctx = makeCtx();
    await stage.run(args, ctx);
    const out = (
      ctx.state as unknown as {
        discoveryCandidates: unknown[];
      }
    ).discoveryCandidates;
    expect(out).toEqual([]);
  });

  it("throws immediately when ctx.signal.aborted", async () => {
    const ctx = makeCtx({
      signal: { aborted: true } as AbortSignal,
    });
    await expect(stage.run(args, ctx)).rejects.toThrow(
      /aborted_during_discovery/,
    );
    expect(chatMock.chat).not.toHaveBeenCalled();
  });

  it("throws when topicName missing", async () => {
    const ctx = makeCtx({
      input: {
        topicName: "",
        keywords: [],
        existingSources: [],
      },
    } as unknown as RadarMissionContext);
    await expect(stage.run(args, ctx)).rejects.toThrow(/topicName/);
    expect(chatMock.chat).not.toHaveBeenCalled();
  });
});
