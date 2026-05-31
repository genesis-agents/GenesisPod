/**
 * MetricsService + observability 端点测试
 *
 * 覆盖零空转铁律：触发真实事件后断言对应 prom 计数器值确实 inc（非空转）。
 * - (a) /healthz 返回 ok（liveness 不查依赖）
 * - (b) /readyz 反映依赖（全 healthy 200，否则 503）
 * - (c) 真实事件触发后 prom 计数器 inc（用 getSingleMetric().get() 断言）
 */

import { Test, TestingModule } from "@nestjs/testing";
import { HttpException } from "@nestjs/common";
import type { Counter } from "prom-client";
import { MetricsService } from "../metrics.service";
import { AppController } from "../../../../../app.controller";
import { AppService } from "../../../../../app.service";
import { PrismaService } from "../../../../../common/prisma/prisma.service";
import { CacheService } from "../../../../../common/cache/cache.service";

/**
 * 从 registry 取某计数器在指定 label 下的值（非空转断言用）。
 */
async function counterValue(
  service: MetricsService,
  name: string,
  labels?: Record<string, string>,
): Promise<number> {
  const metric = service.getRegistry().getSingleMetric(name) as
    | Counter<string>
    | undefined;
  if (!metric) return 0;
  const data = await metric.get();
  const match = data.values.find((v) => {
    if (!labels) return true;
    return Object.entries(labels).every(([k, val]) => v.labels[k] === val);
  });
  return match?.value ?? 0;
}

describe("MetricsService", () => {
  let service: MetricsService;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [MetricsService],
    }).compile();
    service = moduleRef.get(MetricsService);
  });

  describe("metrics output", () => {
    it("exposes prometheus content-type 0.0.4", () => {
      expect(service.contentType()).toContain("text/plain");
      expect(service.contentType()).toContain("version=0.0.4");
    });

    it("includes default process metrics", async () => {
      const text = await service.metrics();
      expect(text).toContain("genesis_process_cpu");
    });
  });

  describe("(c) counters inc on real events (non-zero-spinning)", () => {
    it("llm.metrics.record increments calls + tokens", async () => {
      expect(
        await counterValue(service, "genesis_llm_calls_total", {
          status: "success",
        }),
      ).toBe(0);

      // 真实事件 payload 形状（ai-chat.service.ts emitMetrics）
      service.onLlmMetricsRecord({
        success: true,
        inputTokens: 120,
        outputTokens: 30,
      });

      expect(
        await counterValue(service, "genesis_llm_calls_total", {
          status: "success",
        }),
      ).toBe(1);
      expect(
        await counterValue(service, "genesis_llm_tokens_total", {
          type: "prompt",
        }),
      ).toBe(120);
      expect(
        await counterValue(service, "genesis_llm_tokens_total", {
          type: "completion",
        }),
      ).toBe(30);
    });

    it("llm.metrics.record with success=false increments error status", async () => {
      service.onLlmMetricsRecord({ success: false });
      expect(
        await counterValue(service, "genesis_llm_calls_total", {
          status: "error",
        }),
      ).toBe(1);
    });

    it("llm.cost.record increments cost in USD", async () => {
      // 真实事件 payload 形状（ai-chat.service.ts emitCostRecord）
      service.onLlmCostRecord({ estimatedCost: 0.0042 });
      service.onLlmCostRecord({ estimatedCost: 0.0008 });
      expect(
        await counterValue(service, "genesis_llm_cost_usd_total"),
      ).toBeCloseTo(0.005, 6);
    });

    it("llm.span.end with guardrail error increments blocks per stage", async () => {
      // 真实事件形状（ai-chat.service.ts emitSpanEnd at guardrail block points）
      service.onLlmSpanEnd({
        status: "error",
        error: "Blocked by guardrail: pii-redactor",
      });
      service.onLlmSpanEnd({
        status: "error",
        error: "Output blocked by guardrail: content-safety",
      });
      // 非 guardrail 的 span end 不计入
      service.onLlmSpanEnd({ status: "ok" });
      service.onLlmSpanEnd({ status: "error", error: "model timeout" });

      expect(
        await counterValue(service, "genesis_guardrail_blocks_total", {
          stage: "input",
        }),
      ).toBe(1);
      expect(
        await counterValue(service, "genesis_guardrail_blocks_total", {
          stage: "output",
        }),
      ).toBe(1);
    });
  });
});

describe("AppController observability probes", () => {
  let controller: AppController;
  let mockPrisma: { healthCheck: jest.Mock };
  let mockCache: { set: jest.Mock; get: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      healthCheck: jest.fn().mockResolvedValue({ status: "healthy" }),
    };
    mockCache = {
      set: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue("ok"),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        { provide: AppService, useValue: { getHello: () => "ok" } },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CacheService, useValue: mockCache },
      ],
    }).compile();
    controller = moduleRef.get(AppController);
  });

  it("(a) /healthz returns ok without touching dependencies", () => {
    const result = controller.getLiveness();
    expect(result).toEqual({ status: "ok" });
    expect(mockPrisma.healthCheck).not.toHaveBeenCalled();
    expect(mockCache.set).not.toHaveBeenCalled();
  });

  it("(b) /readyz returns ok when all dependencies healthy", async () => {
    const result = await controller.getReadiness();
    expect(result.status).toBe("ok");
    expect(mockPrisma.healthCheck).toHaveBeenCalled();
    expect(result.checks.database.status).toBe("healthy");
    expect(result.checks.cache.status).toBe("healthy");
  });

  it("(b) /readyz throws 503 when a dependency is unhealthy", async () => {
    mockPrisma.healthCheck.mockResolvedValue({ status: "unhealthy" });
    await expect(controller.getReadiness()).rejects.toBeInstanceOf(
      HttpException,
    );
    try {
      await controller.getReadiness();
    } catch (e) {
      expect((e as HttpException).getStatus()).toBe(503);
    }
  });
});
