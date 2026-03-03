import { Test, TestingModule } from "@nestjs/testing";
import { IntentGatewayService } from "../intent-gateway.service";
import { IntentRouterService } from "../../../ai-engine/facade";

describe("IntentGatewayService", () => {
  let service: IntentGatewayService;
  let mockRouter: jest.Mocked<Pick<IntentRouterService, "route">>;

  const mockRouteResult = {
    plan: {
      id: "plan-1",
      originalIntent: "What is AI?",
      steps: [
        {
          id: "step-0",
          module: "ask" as const,
          action: "直接问答",
          input: "What is AI?",
          dependsOn: [],
          priority: 1,
        },
      ],
      mode: "sequential" as const,
      confidence: 0.95,
    },
    requiresConfirmation: false,
    rawAnalysis: '{"capabilities":[{"module":"ask"}],"confidence":0.95}',
  };

  beforeEach(async () => {
    mockRouter = {
      route: jest.fn().mockResolvedValue(mockRouteResult),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntentGatewayService,
        { provide: IntentRouterService, useValue: mockRouter },
      ],
    }).compile();

    service = module.get(IntentGatewayService);
  });

  describe("routeIntent", () => {
    it("should delegate to IntentRouterService.route with built AgentContext", async () => {
      const result = await service.routeIntent("What is AI?", {
        userId: "user-1",
        sessionId: "session-abc",
      });

      expect(result).toEqual(mockRouteResult);
      expect(mockRouter.route).toHaveBeenCalledWith("What is AI?", {
        userId: "user-1",
        sessionId: "session-abc",
        metadata: undefined,
      });
    });

    it("should default userId to anonymous when context is omitted", async () => {
      await service.routeIntent("Hello");

      expect(mockRouter.route).toHaveBeenCalledWith(
        "Hello",
        expect.objectContaining({ userId: "anonymous" }),
      );
    });

    it("should return null when IntentRouterService is not available", async () => {
      const moduleWithoutRouter = await Test.createTestingModule({
        providers: [IntentGatewayService],
      }).compile();

      const svcWithoutRouter = moduleWithoutRouter.get(IntentGatewayService);
      const result = await svcWithoutRouter.routeIntent("test");

      expect(result).toBeNull();
    });

    it("should forward metadata when provided", async () => {
      await service.routeIntent("Analyse AI trends", {
        userId: "user-2",
        metadata: { sourcePage: "/ai-ask" },
      });

      expect(mockRouter.route).toHaveBeenCalledWith(
        "Analyse AI trends",
        expect.objectContaining({
          metadata: { sourcePage: "/ai-ask" },
        }),
      );
    });
  });

  describe("listCapabilities", () => {
    it("should return module names from static MODULE_REGISTRY", () => {
      const caps = service.listCapabilities();

      expect(Array.isArray(caps)).toBe(true);
      expect(caps.length).toBeGreaterThan(0);
      expect(caps).toContain("ask");
      expect(caps).toContain("research");
    });

    it("should return empty array when IntentRouterService is not available", async () => {
      const moduleWithoutRouter = await Test.createTestingModule({
        providers: [IntentGatewayService],
      }).compile();

      const svcWithoutRouter = moduleWithoutRouter.get(IntentGatewayService);

      expect(svcWithoutRouter.listCapabilities()).toEqual([]);
    });
  });
});
