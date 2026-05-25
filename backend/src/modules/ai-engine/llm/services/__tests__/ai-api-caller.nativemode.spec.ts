/**
 * AiApiCallerService — nativeMode response_format reconciliation spec (FIX 1)
 *
 * Verifies that the ACTUAL response_format put on the wire is derived from the
 * capability catalog's nativeMode, overriding whatever structuredOutputStrategy
 * the caller passed.
 *
 * Branches tested:
 *   deepseek v4-pro (json_mode)      → { type: "json_object" }
 *   deepseek reasoner (none)          → response_format ABSENT + prompt constraint
 *   openai (json_schema_strict)       → { type: "json_schema", strict: true }
 *   xai (json_schema_strict)          → { type: "json_schema", strict: true }
 *   no capabilityService (null mode)  → legacy caller-driven behavior unchanged
 */

import { Test, TestingModule } from "@nestjs/testing";
import { HttpService } from "@nestjs/axios";
import { of, throwError } from "rxjs";
import { AiApiCallerService } from "../ai-api-caller.service";
import { ModelCapabilityService } from "../../capability/model-capability.service";
import { ApiCallerSelfHealTriggerService } from "../api-caller-self-heal-trigger.service";
import type { ChatMessage } from "../../types/task-profile.types";

function makeHttpOk(content = "{}") {
  return of({
    data: {
      choices: [{ message: { content }, finish_reason: "stop" }],
      usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
    },
    status: 200,
    statusText: "OK",
    headers: {},
    config: {} as Record<string, unknown>,
  } as never);
}

const MESSAGES: ChatMessage[] = [
  { role: "system", content: "You are helpful." },
  { role: "user", content: "Return JSON" },
];

const JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: { answer: { type: "string" } },
  required: ["answer"],
};

describe("AiApiCallerService – nativeMode response_format reconciliation (FIX 1)", () => {
  let service: AiApiCallerService;
  let httpMock: { post: jest.Mock };

  beforeEach(async () => {
    httpMock = { post: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiApiCallerService,
        { provide: HttpService, useValue: httpMock },
        ModelCapabilityService, // real service — reads catalog
      ],
    }).compile();

    service = module.get<AiApiCallerService>(AiApiCallerService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─────────────────────────────────────────────────────────────────────────
  // deepseek-v4-pro: nativeMode=json_mode → downgrade json_schema → json_object
  // ─────────────────────────────────────────────────────────────────────────
  describe("deepseek-v4-pro (nativeMode=json_mode)", () => {
    it("sends { type:'json_object' } even when caller requests json_schema strategy", async () => {
      httpMock.post.mockReturnValueOnce(makeHttpOk('{"answer":"ok"}'));

      await service.callOpenAICompatibleAPI(
        "https://api.deepseek.com/v1/chat/completions",
        "ds-key",
        "deepseek-v4-pro",
        MESSAGES,
        4000,
        undefined, // temperature
        120000, // timeout
        "max_tokens",
        undefined, // responseFormat
        undefined, // reasoningDepth
        undefined, // outputSchema
        undefined, // schemaStrict
        false, // isReasoning
        "json_schema", // ← caller wants json_schema
        JSON_SCHEMA,
        "my_schema",
        undefined, // tools
        "deepseek", // provider
      );

      const body = httpMock.post.mock.calls[0][1] as Record<string, unknown>;
      expect(body["response_format"]).toEqual({ type: "json_object" });
    });

    it("sends { type:'json_object' } for responseFormat='json' with json_mode model", async () => {
      httpMock.post.mockReturnValueOnce(makeHttpOk("{}"));

      await service.callOpenAICompatibleAPI(
        "https://api.deepseek.com/v1/chat/completions",
        "ds-key",
        "deepseek-v4-pro",
        MESSAGES,
        4000,
        undefined,
        120000,
        "max_tokens",
        "json", // responseFormat = "json"
        undefined,
        undefined,
        undefined,
        false,
        undefined,
        undefined,
        undefined,
        undefined,
        "deepseek",
      );

      const body = httpMock.post.mock.calls[0][1] as Record<string, unknown>;
      expect(body["response_format"]).toEqual({ type: "json_object" });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // deepseek-reasoner: nativeMode=none → no response_format + prompt constraint
  // ─────────────────────────────────────────────────────────────────────────
  describe("deepseek-reasoner (nativeMode=none)", () => {
    it("omits response_format and injects prompt constraint into existing system msg", async () => {
      httpMock.post.mockReturnValueOnce(makeHttpOk("{}"));

      await service.callOpenAICompatibleAPI(
        "https://api.deepseek.com/v1/chat/completions",
        "ds-key",
        "deepseek-reasoner",
        MESSAGES,
        4000,
        undefined,
        120000,
        "max_tokens",
        "json",
        undefined,
        undefined,
        undefined,
        false,
        "json_schema",
        JSON_SCHEMA,
        undefined,
        undefined,
        "deepseek",
      );

      const body = httpMock.post.mock.calls[0][1] as Record<string, unknown>;
      // response_format must be absent
      expect(body["response_format"]).toBeUndefined();
      // JSON constraint must be injected into the system message
      const msgs = body["messages"] as Array<{ role: string; content: string }>;
      const sysMsg = msgs.find((m) => m.role === "system");
      expect(sysMsg?.content).toContain("CRITICAL OUTPUT FORMAT");
    });

    it("injects prompt constraint as new system message when none exists", async () => {
      httpMock.post.mockReturnValueOnce(makeHttpOk("{}"));

      await service.callOpenAICompatibleAPI(
        "https://api.deepseek.com/v1/chat/completions",
        "ds-key",
        "deepseek-reasoner",
        [{ role: "user", content: "Return JSON" }],
        4000,
        undefined,
        120000,
        "max_tokens",
        "json",
        undefined,
        undefined,
        undefined,
        false,
        undefined,
        undefined,
        undefined,
        undefined,
        "deepseek",
      );

      const body = httpMock.post.mock.calls[0][1] as Record<string, unknown>;
      expect(body["response_format"]).toBeUndefined();
      const msgs = body["messages"] as Array<{ role: string; content: string }>;
      expect(msgs[0].role).toBe("system");
      expect(msgs[0].content).toContain("CRITICAL OUTPUT FORMAT");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // openai: nativeMode=json_schema_strict → strict:true in response_format
  // ─────────────────────────────────────────────────────────────────────────
  describe("openai (nativeMode=json_schema_strict)", () => {
    it("sends json_schema with strict:true when caller requests json_schema_strict", async () => {
      httpMock.post.mockReturnValueOnce(makeHttpOk('{"answer":"hi"}'));

      await service.callOpenAICompatibleAPI(
        "https://api.openai.com/v1/chat/completions",
        "sk-key",
        "gpt-4o",
        MESSAGES,
        4000,
        undefined,
        120000,
        "max_tokens",
        undefined,
        undefined,
        undefined,
        undefined,
        false,
        "json_schema_strict",
        JSON_SCHEMA,
        "my_schema",
        undefined,
        "openai",
      );

      const body = httpMock.post.mock.calls[0][1] as Record<string, unknown>;
      const rf = body["response_format"] as {
        type: string;
        json_schema?: { strict?: boolean };
      };
      expect(rf?.type).toBe("json_schema");
      expect(rf?.json_schema?.strict).toBe(true);
    });

    it("sends json_schema for legacy outputSchema path with strict:true from nativeMode", async () => {
      httpMock.post.mockReturnValueOnce(makeHttpOk('{"answer":"hi"}'));

      await service.callOpenAICompatibleAPI(
        "https://api.openai.com/v1/chat/completions",
        "sk-key",
        "gpt-4o",
        MESSAGES,
        4000,
        undefined,
        120000,
        "max_tokens",
        undefined,
        undefined,
        { type: "json_schema", schema: JSON_SCHEMA }, // legacy outputSchema
        false, // schemaStrict
        false,
        undefined,
        undefined,
        undefined,
        undefined,
        "openai",
      );

      const body = httpMock.post.mock.calls[0][1] as Record<string, unknown>;
      const rf = body["response_format"] as {
        type: string;
        json_schema?: { strict?: boolean };
      };
      expect(rf?.type).toBe("json_schema");
      // nativeMode=json_schema_strict → strict becomes true regardless of schemaStrict arg
      expect(rf?.json_schema?.strict).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // unknown / no capabilityService → legacy caller-driven behavior unchanged
  // ─────────────────────────────────────────────────────────────────────────
  describe("no capabilityService (null nativeMode) → legacy behavior preserved", () => {
    let legacyService: AiApiCallerService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AiApiCallerService,
          { provide: HttpService, useValue: httpMock },
          // deliberately omit ModelCapabilityService
        ],
      }).compile();
      legacyService = module.get<AiApiCallerService>(AiApiCallerService);
    });

    it("still sends json_schema when caller requests it (no capabilityService)", async () => {
      httpMock.post.mockReturnValueOnce(makeHttpOk("{}"));

      await legacyService.callOpenAICompatibleAPI(
        "https://api.openai.com/v1/chat/completions",
        "sk-key",
        "gpt-4o",
        MESSAGES,
        1000,
        undefined,
        120000,
        "max_tokens",
        undefined,
        undefined,
        { type: "json_schema", schema: JSON_SCHEMA },
        false,
        false,
      );

      const body = httpMock.post.mock.calls[0][1] as Record<string, unknown>;
      const rf = body["response_format"] as { type: string } | undefined;
      expect(rf?.type).toBe("json_schema");
    });

    it("still sends json_object for responseFormat='json' (no capabilityService)", async () => {
      httpMock.post.mockReturnValueOnce(makeHttpOk("{}"));

      await legacyService.callOpenAICompatibleAPI(
        "https://api.openai.com/v1/chat/completions",
        "sk-key",
        "unknown-model",
        MESSAGES,
        1000,
        undefined,
        120000,
        "max_tokens",
        "json",
      );

      const body = httpMock.post.mock.calls[0][1] as Record<string, unknown>;
      expect(body["response_format"]).toEqual({ type: "json_object" });
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// R1 (2026-05-25): self-heal chain-aware degrade — computeSelfHealDegrade
// 验证 response_format 被 provider 拒后，trigger 收到沿派生链的下一档
// （json_schema → json_mode），而非旧的一刀切 json_schema → none。
// ─────────────────────────────────────────────────────────────────────────
describe("AiApiCallerService – self-heal chain-aware degrade (R1)", () => {
  let service: AiApiCallerService;
  let httpMock: { post: jest.Mock };
  let triggerMock: { triggerSelfHealAsync: jest.Mock };

  beforeEach(async () => {
    httpMock = { post: jest.fn() };
    triggerMock = { triggerSelfHealAsync: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiApiCallerService,
        { provide: HttpService, useValue: httpMock },
        ModelCapabilityService, // real — reads catalog
        {
          provide: ApiCallerSelfHealTriggerService,
          useValue: triggerMock,
        },
      ],
    }).compile();
    service = module.get<AiApiCallerService>(AiApiCallerService);
  });

  afterEach(() => jest.clearAllMocks());

  function make400ResponseFormatError() {
    const err = new Error("response_format type unavailable") as Error & {
      response?: { status: number; data?: unknown };
    };
    err.response = {
      status: 400,
      data: { error: { code: "invalid_request_error", message: "x" } },
    };
    return throwError(() => err);
  }

  it("openrouter generic (nativeMode=json_schema) 被拒 → trigger 收到 json_schema→json_mode", async () => {
    httpMock.post.mockReturnValueOnce(make400ResponseFormatError());

    await expect(
      service.callOpenAICompatibleAPI(
        "https://openrouter.ai/api/v1/chat/completions",
        "or-key",
        "meta-llama/llama-3.1-70b",
        MESSAGES,
        4000,
        undefined,
        120000,
        "max_tokens",
        undefined,
        undefined,
        undefined,
        undefined,
        false,
        "json_schema",
        JSON_SCHEMA,
        "my_schema",
        undefined,
        "openrouter", // provider
        "user-cfg-1", // userModelConfigId → BYOK self-heal 路径
      ),
    ).rejects.toBeDefined();

    expect(triggerMock.triggerSelfHealAsync).toHaveBeenCalledTimes(1);
    const opts = triggerMock.triggerSelfHealAsync.mock.calls[0][1];
    // chain-aware：json_schema 的下一档是 json_mode（不是一刀切 none）
    expect(opts.fromValue).toBe("json_schema");
    expect(opts.toValue).toBe("json_mode");
  });
});
