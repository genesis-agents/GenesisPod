/**
 * Unit tests for PolicyDataService
 */

import { Test, TestingModule } from "@nestjs/testing";
import { HttpService } from "@nestjs/axios";
import { of, throwError } from "rxjs";
import { AxiosResponse } from "axios";
import { PolicyDataService } from "../policy-data.service";
import { PrismaService } from "@/common/prisma/prisma.service";
import { SecretsService } from "@/modules/ai-infra/secrets/secrets.service";

// ==================== Mocks ====================

const mockHttpService = {
  get: jest.fn(),
  post: jest.fn(),
};

const mockPrisma = {
  toolConfig: {
    findUnique: jest.fn(),
  },
};

const mockSecrets = {
  getValue: jest.fn(),
};

function makeAxiosResponse<T>(data: T): AxiosResponse<T> {
  return {
    data,
    status: 200,
    statusText: "OK",
    headers: {},
    config: { headers: {} } as AxiosResponse["config"],
  };
}

// ==================== Test setup ====================

describe("PolicyDataService", () => {
  let service: PolicyDataService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PolicyDataService,
        { provide: HttpService, useValue: mockHttpService },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SecretsService, useValue: mockSecrets },
      ],
    }).compile();

    service = module.get<PolicyDataService>(PolicyDataService);
  });

  // ==================== getApiKey ====================

  describe("getApiKey", () => {
    it("returns the secret value when secretKey is configured and secret exists", async () => {
      mockPrisma.toolConfig.findUnique.mockResolvedValue({
        toolId: "my-tool",
        secretKey: "MY_API_KEY_SECRET",
        config: {},
      });
      mockSecrets.getValue.mockResolvedValue("secret-api-key-value");

      const result = await service.getApiKey("my-tool");
      expect(result).toBe("secret-api-key-value");
      expect(mockSecrets.getValue).toHaveBeenCalledWith("MY_API_KEY_SECRET");
    });

    it("falls back to config.apiKey when secretKey is missing but config.apiKey exists", async () => {
      mockPrisma.toolConfig.findUnique.mockResolvedValue({
        toolId: "my-tool",
        secretKey: null,
        config: { apiKey: "config-direct-api-key" },
      });

      const result = await service.getApiKey("my-tool");
      expect(result).toBe("config-direct-api-key");
    });

    it("falls back to config.apiKey when secretValue is null/empty", async () => {
      mockPrisma.toolConfig.findUnique.mockResolvedValue({
        toolId: "my-tool",
        secretKey: "SECRET_KEY_NAME",
        config: { apiKey: "fallback-config-key" },
      });
      mockSecrets.getValue.mockResolvedValue(null);

      const result = await service.getApiKey("my-tool");
      expect(result).toBe("fallback-config-key");
    });

    it("returns null when toolConfig is not found", async () => {
      mockPrisma.toolConfig.findUnique.mockResolvedValue(null);

      const result = await service.getApiKey("unknown-tool");
      expect(result).toBeNull();
    });

    it("returns null when toolConfig has no secretKey and config has no apiKey", async () => {
      mockPrisma.toolConfig.findUnique.mockResolvedValue({
        toolId: "my-tool",
        secretKey: null,
        config: {},
      });

      const result = await service.getApiKey("my-tool");
      expect(result).toBeNull();
    });

    it("returns null and does not throw on prisma error", async () => {
      mockPrisma.toolConfig.findUnique.mockRejectedValue(
        new Error("DB connection failed"),
      );

      const result = await service.getApiKey("error-tool");
      expect(result).toBeNull();
    });

    it("returns null when secretsService throws", async () => {
      mockPrisma.toolConfig.findUnique.mockResolvedValue({
        toolId: "my-tool",
        secretKey: "BAD_SECRET",
        config: {},
      });
      mockSecrets.getValue.mockRejectedValue(
        new Error("Secrets service unavailable"),
      );

      const result = await service.getApiKey("my-tool");
      expect(result).toBeNull();
    });
  });

  // ==================== httpGet ====================

  describe("httpGet", () => {
    it("returns response data on success", async () => {
      const responseData = { items: [{ id: 1 }] };
      mockHttpService.get.mockReturnValue(of(makeAxiosResponse(responseData)));

      const result = await service.httpGet<typeof responseData>(
        "https://api.example.com/data",
      );
      expect(result).toEqual(responseData);
    });

    it("passes params to HttpService", async () => {
      mockHttpService.get.mockReturnValue(of(makeAxiosResponse({})));

      await service.httpGet("https://api.example.com/search", {
        q: "test query",
        limit: 10,
        active: true,
      });

      expect(mockHttpService.get).toHaveBeenCalledWith(
        "https://api.example.com/search",
        expect.objectContaining({
          params: { q: "test query", limit: "10", active: "true" },
        }),
      );
    });

    it("filters out undefined param values", async () => {
      mockHttpService.get.mockReturnValue(of(makeAxiosResponse({})));

      await service.httpGet("https://api.example.com/search", {
        q: "test",
        page: undefined,
        size: 20,
      });

      const callArgs = mockHttpService.get.mock.calls[0][1] as {
        params: Record<string, string>;
      };
      expect(callArgs.params).not.toHaveProperty("page");
      expect(callArgs.params).toHaveProperty("q", "test");
      expect(callArgs.params).toHaveProperty("size", "20");
    });

    it("passes custom headers merged with User-Agent", async () => {
      mockHttpService.get.mockReturnValue(of(makeAxiosResponse({})));

      await service.httpGet("https://api.example.com/data", undefined, {
        Authorization: "Bearer my-token",
      });

      const callArgs = mockHttpService.get.mock.calls[0][1] as {
        headers: Record<string, string>;
      };
      expect(callArgs.headers).toHaveProperty(
        "Authorization",
        "Bearer my-token",
      );
      expect(callArgs.headers).toHaveProperty("User-Agent");
    });

    it("throws an Error with descriptive message on HTTP failure", async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => new Error("Network unreachable")),
      );

      await expect(
        service.httpGet("https://api.example.com/fail"),
      ).rejects.toThrow("HTTP GET request failed: Network unreachable");
    });

    it("sets timeout to 30000 ms", async () => {
      mockHttpService.get.mockReturnValue(of(makeAxiosResponse({})));

      await service.httpGet("https://api.example.com/data");

      const callArgs = mockHttpService.get.mock.calls[0][1] as {
        timeout: number;
      };
      expect(callArgs.timeout).toBe(30000);
    });
  });

  // ==================== httpPost ====================

  describe("httpPost", () => {
    it("returns response data on success", async () => {
      const responseData = { created: true, id: "abc123" };
      mockHttpService.post.mockReturnValue(of(makeAxiosResponse(responseData)));

      const result = await service.httpPost<typeof responseData>(
        "https://api.example.com/create",
        { name: "test" },
      );
      expect(result).toEqual(responseData);
    });

    it("passes body data to HttpService", async () => {
      mockHttpService.post.mockReturnValue(of(makeAxiosResponse({})));
      const body = { key: "value", count: 42 };

      await service.httpPost("https://api.example.com/submit", body);

      expect(mockHttpService.post).toHaveBeenCalledWith(
        "https://api.example.com/submit",
        body,
        expect.anything(),
      );
    });

    it("passes custom headers merged with defaults", async () => {
      mockHttpService.post.mockReturnValue(of(makeAxiosResponse({})));

      await service.httpPost(
        "https://api.example.com/submit",
        {},
        {
          "X-Custom-Header": "custom-value",
        },
      );

      const callArgs = mockHttpService.post.mock.calls[0][2] as {
        headers: Record<string, string>;
      };
      expect(callArgs.headers).toHaveProperty(
        "X-Custom-Header",
        "custom-value",
      );
      expect(callArgs.headers).toHaveProperty(
        "Content-Type",
        "application/json",
      );
    });

    it("throws an Error with descriptive message on HTTP failure", async () => {
      mockHttpService.post.mockReturnValue(
        throwError(() => new Error("Connection refused")),
      );

      await expect(
        service.httpPost("https://api.example.com/fail", {}),
      ).rejects.toThrow("HTTP POST request failed: Connection refused");
    });

    it("sets timeout to 30000 ms", async () => {
      mockHttpService.post.mockReturnValue(of(makeAxiosResponse({})));

      await service.httpPost("https://api.example.com/data", {});

      const callArgs = mockHttpService.post.mock.calls[0][2] as {
        timeout: number;
      };
      expect(callArgs.timeout).toBe(30000);
    });
  });

  // ==================== formatDate ====================

  describe("formatDate", () => {
    it("formats a Date object to YYYY-MM-DD", () => {
      const date = new Date("2026-02-15T12:00:00.000Z");
      expect(service.formatDate(date)).toBe("2026-02-15");
    });

    it("formats an ISO string to YYYY-MM-DD", () => {
      expect(service.formatDate("2025-12-31T00:00:00.000Z")).toBe("2025-12-31");
    });

    it("formats a date-only string to YYYY-MM-DD", () => {
      expect(service.formatDate("2024-01-01")).toBe("2024-01-01");
    });

    it("strips the time component from a Date with a non-midnight time", () => {
      const date = new Date("2026-06-15T23:59:59.999Z");
      expect(service.formatDate(date)).toBe("2026-06-15");
    });
  });

  // ==================== getDateDaysAgo ====================

  describe("getDateDaysAgo", () => {
    it("returns today's date for 0 days ago", () => {
      const today = new Date().toISOString().split("T")[0];
      expect(service.getDateDaysAgo(0)).toBe(today);
    });

    it("returns yesterday for 1 day ago", () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const expected = yesterday.toISOString().split("T")[0];
      expect(service.getDateDaysAgo(1)).toBe(expected);
    });

    it("returns the correct date for 30 days ago", () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const expected = thirtyDaysAgo.toISOString().split("T")[0];
      expect(service.getDateDaysAgo(30)).toBe(expected);
    });

    it("returns a string in YYYY-MM-DD format", () => {
      const result = service.getDateDaysAgo(7);
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});
