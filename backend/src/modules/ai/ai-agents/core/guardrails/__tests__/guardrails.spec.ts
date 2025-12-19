/**
 * Guardrails 单元测试
 */

import {
  GuardrailService,
  ViolationType,
  RateLimitStrategy,
  SensitiveInfoType,
} from "../guardrails";
import { ToolType } from "../../agent/agent.types";

describe("GuardrailService", () => {
  let service: GuardrailService;

  beforeEach(() => {
    service = new GuardrailService();
  });

  describe("Content Filter", () => {
    it("should pass valid input", async () => {
      const result = await service.checkInput(
        ToolType.WEB_SEARCH,
        { query: "legitimate search query" },
        "user_123",
      );

      expect(result.passed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it("should block input with malicious patterns", async () => {
      service.setDefaultConfig({
        contentFilter: {
          enabled: true,
          blockedPatterns: ["(?i)(hack|exploit)"],
        },
      });

      const result = await service.checkInput(
        ToolType.WEB_SEARCH,
        { query: "how to hack a system" },
        "user_123",
      );

      expect(result.passed).toBe(false);
      expect(result.violationType).toBe(ViolationType.CONTENT_VIOLATION);
      expect(result.reason).toContain("blocked pattern");
    });

    it("should block input exceeding max length", async () => {
      service.setDefaultConfig({
        contentFilter: {
          enabled: true,
          maxInputLength: 100,
        },
      });

      const longInput = "a".repeat(150);
      const result = await service.checkInput(
        ToolType.WEB_SEARCH,
        { query: longInput },
        "user_123",
      );

      expect(result.passed).toBe(false);
      expect(result.violationType).toBe(ViolationType.CONTENT_VIOLATION);
      expect(result.reason).toContain("exceeds maximum length");
    });
  });

  describe("Rate Limiting", () => {
    it("should allow requests within rate limit", async () => {
      service.setDefaultConfig({
        rateLimit: {
          enabled: true,
          maxCalls: 3,
          windowMs: 60000,
          strategy: RateLimitStrategy.FIXED_WINDOW,
          perUser: true,
        },
      });

      // 第1次请求
      let result = await service.checkInput(
        ToolType.WEB_SEARCH,
        {},
        "user_123",
      );
      expect(result.passed).toBe(true);

      // 第2次请求
      result = await service.checkInput(ToolType.WEB_SEARCH, {}, "user_123");
      expect(result.passed).toBe(true);

      // 第3次请求
      result = await service.checkInput(ToolType.WEB_SEARCH, {}, "user_123");
      expect(result.passed).toBe(true);
    });

    it("should block requests exceeding rate limit", async () => {
      service.setDefaultConfig({
        rateLimit: {
          enabled: true,
          maxCalls: 2,
          windowMs: 60000,
          strategy: RateLimitStrategy.FIXED_WINDOW,
          perUser: true,
        },
      });

      // 前2次请求应该成功
      await service.checkInput(ToolType.WEB_SEARCH, {}, "user_123");
      await service.checkInput(ToolType.WEB_SEARCH, {}, "user_123");

      // 第3次请求应该失败
      const result = await service.checkInput(
        ToolType.WEB_SEARCH,
        {},
        "user_123",
      );

      expect(result.passed).toBe(false);
      expect(result.violationType).toBe(ViolationType.RATE_LIMIT_EXCEEDED);
      expect(result.details).toHaveProperty("maxCalls", 2);
    });

    it("should allow different users independently", async () => {
      service.setDefaultConfig({
        rateLimit: {
          enabled: true,
          maxCalls: 1,
          windowMs: 60000,
          perUser: true,
        },
      });

      // User 1 的请求
      let result = await service.checkInput(ToolType.WEB_SEARCH, {}, "user_1");
      expect(result.passed).toBe(true);

      // User 1 的第2次请求应该失败
      result = await service.checkInput(ToolType.WEB_SEARCH, {}, "user_1");
      expect(result.passed).toBe(false);

      // User 2 的请求应该成功
      result = await service.checkInput(ToolType.WEB_SEARCH, {}, "user_2");
      expect(result.passed).toBe(true);
    });

    it("should reset rate limit", async () => {
      service.setDefaultConfig({
        rateLimit: {
          enabled: true,
          maxCalls: 1,
          windowMs: 60000,
        },
      });

      // 第1次请求成功
      let result = await service.checkInput(
        ToolType.WEB_SEARCH,
        {},
        "user_123",
      );
      expect(result.passed).toBe(true);

      // 第2次请求失败
      result = await service.checkInput(ToolType.WEB_SEARCH, {}, "user_123");
      expect(result.passed).toBe(false);

      // 重置限制
      service.resetRateLimit("user_123");

      // 第3次请求应该成功
      result = await service.checkInput(ToolType.WEB_SEARCH, {}, "user_123");
      expect(result.passed).toBe(true);
    });
  });

  describe("Privacy Protection", () => {
    it("should detect email addresses", async () => {
      service.setDefaultConfig({
        privacy: {
          enabled: true,
          detectPII: true,
          sensitiveTypes: [SensitiveInfoType.EMAIL],
        },
      });

      const result = await service.checkInput(
        ToolType.WEB_SEARCH,
        { query: "Contact me at test@example.com" },
        "user_123",
      );

      expect(result.passed).toBe(false);
      expect(result.violationType).toBe(ViolationType.PRIVACY_VIOLATION);
      expect(result.details?.detected).toContain(SensitiveInfoType.EMAIL);
    });

    it("should detect phone numbers", async () => {
      service.setDefaultConfig({
        privacy: {
          enabled: true,
          detectPII: true,
          sensitiveTypes: [SensitiveInfoType.PHONE],
        },
      });

      const result = await service.checkInput(
        ToolType.WEB_SEARCH,
        { query: "Call me at 123-456-7890" },
        "user_123",
      );

      expect(result.passed).toBe(false);
      expect(result.violationType).toBe(ViolationType.PRIVACY_VIOLATION);
      expect(result.details?.detected).toContain(SensitiveInfoType.PHONE);
    });

    it("should detect credit card numbers", async () => {
      service.setDefaultConfig({
        privacy: {
          enabled: true,
          detectPII: true,
          sensitiveTypes: [SensitiveInfoType.CREDIT_CARD],
        },
      });

      const result = await service.checkInput(
        ToolType.WEB_SEARCH,
        { query: "My card is 1234 5678 9012 3456" },
        "user_123",
      );

      expect(result.passed).toBe(false);
      expect(result.violationType).toBe(ViolationType.PRIVACY_VIOLATION);
      expect(result.details?.detected).toContain(SensitiveInfoType.CREDIT_CARD);
    });

    it("should pass input without PII", async () => {
      service.setDefaultConfig({
        privacy: {
          enabled: true,
          detectPII: true,
          sensitiveTypes: [
            SensitiveInfoType.EMAIL,
            SensitiveInfoType.PHONE,
            SensitiveInfoType.CREDIT_CARD,
          ],
        },
      });

      const result = await service.checkInput(
        ToolType.WEB_SEARCH,
        { query: "What is the weather today?" },
        "user_123",
      );

      expect(result.passed).toBe(true);
    });
  });

  describe("Output Validation", () => {
    it("should validate output against schema", async () => {
      service.setToolConfig(ToolType.WEB_SEARCH, {
        outputValidation: {
          enabled: true,
          schema: {
            type: "object",
            properties: {
              results: { type: "array" },
            },
            required: ["results"],
          },
        },
      });

      // 有效输出
      let result = await service.checkOutput(ToolType.WEB_SEARCH, {
        results: ["result1", "result2"],
      });
      expect(result.passed).toBe(true);

      // 无效输出（缺少 results 字段）
      result = await service.checkOutput(ToolType.WEB_SEARCH, {
        data: "some data",
      });
      expect(result.passed).toBe(false);
      expect(result.violationType).toBe(ViolationType.SCHEMA_VIOLATION);
    });

    it("should enforce max output length", async () => {
      service.setDefaultConfig({
        outputValidation: {
          enabled: true,
          maxOutputLength: 100,
        },
      });

      const longOutput = "a".repeat(150);

      const result = await service.checkOutput(ToolType.WEB_SEARCH, {
        data: longOutput,
      });

      expect(result.passed).toBe(false);
      expect(result.violationType).toBe(ViolationType.SCHEMA_VIOLATION);
      expect(result.reason).toContain("exceeds maximum length");
    });

    it("should use custom validator", async () => {
      service.setToolConfig(ToolType.WEB_SEARCH, {
        outputValidation: {
          enabled: true,
          customValidator: (output: any) => {
            if (!output.results || output.results.length === 0) {
              return {
                valid: false,
                errors: ["Results array is empty"],
              };
            }
            return { valid: true };
          },
        },
      });

      // 有效输出
      let result = await service.checkOutput(ToolType.WEB_SEARCH, {
        results: ["result1"],
      });
      expect(result.passed).toBe(true);

      // 无效输出
      result = await service.checkOutput(ToolType.WEB_SEARCH, {
        results: [],
      });
      expect(result.passed).toBe(false);
      expect(result.details?.errors).toContain("Results array is empty");
    });
  });

  describe("Cost Control", () => {
    it("should track daily cost", () => {
      service.recordCost(1.5);
      service.recordCost(2.0);

      const stats = service.getStats();
      expect(stats.dailyCost).toBe(3.5);
    });

    it("should block when daily cost limit exceeded", async () => {
      service.setDefaultConfig({
        costControl: {
          enabled: true,
          maxDailyCost: 5.0,
        },
      });

      // 记录高成本
      service.recordCost(6.0);

      const result = await service.checkInput(
        ToolType.TEXT_GENERATION,
        { prompt: "test" },
        "user_123",
      );

      expect(result.passed).toBe(false);
      expect(result.violationType).toBe(ViolationType.COST_LIMIT_EXCEEDED);
    });

    it("should use cost estimator", async () => {
      service.setDefaultConfig({
        costControl: {
          enabled: true,
          maxDailyCost: 10.0,
          costEstimator: (toolType, _input) => {
            if (toolType === ToolType.IMAGE_GENERATION) {
              return 0.02;
            }
            return 0.001;
          },
        },
      });

      // 记录已有成本
      service.recordCost(9.99);

      // 这个请求应该被阻止，因为会超过限制
      const result = await service.checkInput(
        ToolType.IMAGE_GENERATION,
        {},
        "user_123",
      );

      expect(result.passed).toBe(false);
      expect(result.violationType).toBe(ViolationType.COST_LIMIT_EXCEEDED);
    });
  });

  describe("Tool-Specific Configuration", () => {
    it("should use tool-specific config over default", async () => {
      // 设置默认配置
      service.setDefaultConfig({
        rateLimit: {
          enabled: true,
          maxCalls: 100,
          windowMs: 60000,
        },
      });

      // 设置特定工具的严格配置
      service.setToolConfig(ToolType.PYTHON_EXECUTOR, {
        rateLimit: {
          enabled: true,
          maxCalls: 5,
          windowMs: 60000,
        },
      });

      // Python 执行器应该使用严格限制
      for (let i = 0; i < 5; i++) {
        const result = await service.checkInput(
          ToolType.PYTHON_EXECUTOR,
          {},
          "user_123",
        );
        expect(result.passed).toBe(true);
      }

      const result = await service.checkInput(
        ToolType.PYTHON_EXECUTOR,
        {},
        "user_123",
      );
      expect(result.passed).toBe(false);

      // Web 搜索应该使用宽松限制
      const searchResult = await service.checkInput(
        ToolType.WEB_SEARCH,
        {},
        "user_123",
      );
      expect(searchResult.passed).toBe(true);
    });
  });

  describe("Multiple Checks", () => {
    it("should perform all enabled checks", async () => {
      service.setDefaultConfig({
        contentFilter: {
          enabled: true,
          blockedPatterns: ["(?i)hack"],
        },
        rateLimit: {
          enabled: true,
          maxCalls: 10,
          windowMs: 60000,
        },
        privacy: {
          enabled: true,
          detectPII: true,
          sensitiveTypes: [SensitiveInfoType.EMAIL],
        },
      });

      // 应该通过所有检查
      const result1 = await service.checkInput(
        ToolType.WEB_SEARCH,
        { query: "normal query" },
        "user_123",
      );
      expect(result1.passed).toBe(true);

      // 应该被内容过滤阻止
      const result2 = await service.checkInput(
        ToolType.WEB_SEARCH,
        { query: "how to hack" },
        "user_123",
      );
      expect(result2.passed).toBe(false);
      expect(result2.violationType).toBe(ViolationType.CONTENT_VIOLATION);

      // 应该被隐私保护阻止
      const result3 = await service.checkInput(
        ToolType.WEB_SEARCH,
        { query: "contact test@example.com" },
        "user_456",
      );
      expect(result3.passed).toBe(false);
      expect(result3.violationType).toBe(ViolationType.PRIVACY_VIOLATION);
    });
  });

  describe("Statistics", () => {
    it("should return correct statistics", () => {
      service.setToolConfig(ToolType.WEB_SEARCH, {
        rateLimit: { enabled: true, maxCalls: 10, windowMs: 60000 },
      });
      service.setToolConfig(ToolType.PYTHON_EXECUTOR, {
        rateLimit: { enabled: true, maxCalls: 5, windowMs: 60000 },
      });

      service.recordCost(1.5);

      const stats = service.getStats();

      expect(stats.dailyCost).toBe(1.5);
      expect(stats.lastResetDate).toBeDefined();
      expect(stats.configuredTools).toBe(2);
    });
  });
});
