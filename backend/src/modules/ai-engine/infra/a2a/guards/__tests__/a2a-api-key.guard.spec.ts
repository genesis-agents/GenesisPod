/**
 * Unit tests for A2AApiKeyGuard
 */

import { Test, TestingModule } from "@nestjs/testing";
import {
  ExecutionContext,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { A2AApiKeyGuard } from "../../../../../ai-kernel/facade";
import { SecretsService } from "../../../../../ai-infra/secrets/secrets.service";
import * as cryptoUtils from "../../../../../../common/utils/crypto.utils";

jest.mock("../../../../../../common/utils/crypto.utils", () => ({
  safeCompare: jest.fn(),
}));

const mockSecretsService = {
  getSecretNames: jest.fn(),
  getValueInternal: jest.fn(),
};

const mockReflector = {
  getAllAndOverride: jest.fn(),
};

const mockedSafeCompare = cryptoUtils.safeCompare as jest.MockedFunction<
  typeof cryptoUtils.safeCompare
>;

function makeContext(
  headers: Record<string, string | string[] | undefined> = {},
  _isPublic = false,
): ExecutionContext {
  return {
    getHandler: jest.fn().mockReturnValue({}),
    getClass: jest.fn().mockReturnValue({}),
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: jest.fn().mockReturnValue({ headers }),
    }),
  } as unknown as ExecutionContext;
}

describe("A2AApiKeyGuard", () => {
  let guard: A2AApiKeyGuard;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, "log").mockReturnValue(undefined);
    jest.spyOn(Logger.prototype, "error").mockReturnValue(undefined);
    jest.spyOn(Logger.prototype, "warn").mockReturnValue(undefined);
    jest.spyOn(Logger.prototype, "debug").mockReturnValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        A2AApiKeyGuard,
        { provide: SecretsService, useValue: mockSecretsService },
        { provide: Reflector, useValue: mockReflector },
      ],
    }).compile();

    guard = module.get<A2AApiKeyGuard>(A2AApiKeyGuard);

    // Default: not a public route
    mockReflector.getAllAndOverride.mockReturnValue(false);
  });

  describe("public routes", () => {
    it("returns true immediately for public routes without checking API key", async () => {
      mockReflector.getAllAndOverride.mockReturnValue(true);

      const context = makeContext({});
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockSecretsService.getSecretNames).not.toHaveBeenCalled();
    });
  });

  describe("API key extraction - missing key", () => {
    it("throws UnauthorizedException when no API key is provided", async () => {
      const context = makeContext({});

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(guard.canActivate(context)).rejects.toThrow(
        "API key required",
      );
    });
  });

  describe("Bearer token", () => {
    it("extracts API key from Authorization Bearer header", async () => {
      mockSecretsService.getSecretNames.mockResolvedValue(["key-1"]);
      mockSecretsService.getValueInternal.mockResolvedValue("stored-key");
      mockedSafeCompare.mockReturnValue(true);

      const context = makeContext({
        authorization: "Bearer my-api-token",
      });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockedSafeCompare).toHaveBeenCalledWith(
        "stored-key",
        "my-api-token",
      );
    });

    it("sets a2aApiKeyId on the request when key is valid", async () => {
      mockSecretsService.getSecretNames.mockResolvedValue(["my-key-name"]);
      mockSecretsService.getValueInternal.mockResolvedValue("valid-stored-key");
      mockedSafeCompare.mockReturnValue(true);

      const request = { headers: { authorization: "Bearer valid-token" } };
      const context = {
        getHandler: jest.fn().mockReturnValue({}),
        getClass: jest.fn().mockReturnValue({}),
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue(request),
        }),
      } as unknown as ExecutionContext;

      await guard.canActivate(context);

      expect(request).toMatchObject({ a2aApiKeyId: "my-key-name" });
    });

    it("handles array authorization header (uses first value)", async () => {
      mockSecretsService.getSecretNames.mockResolvedValue(["key-1"]);
      mockSecretsService.getValueInternal.mockResolvedValue("stored");
      mockedSafeCompare.mockReturnValue(true);

      const context = makeContext({
        authorization: ["Bearer array-token", "Bearer other"],
      });

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });
  });

  describe("X-API-Key header", () => {
    it("extracts API key from X-API-Key header", async () => {
      mockSecretsService.getSecretNames.mockResolvedValue(["key-1"]);
      mockSecretsService.getValueInternal.mockResolvedValue("stored-key");
      mockedSafeCompare.mockReturnValue(true);

      const context = makeContext({
        "x-api-key": "header-api-key",
      });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockedSafeCompare).toHaveBeenCalledWith(
        "stored-key",
        "header-api-key",
      );
    });

    it("handles array X-API-Key header (uses first value)", async () => {
      mockSecretsService.getSecretNames.mockResolvedValue(["key-1"]);
      mockSecretsService.getValueInternal.mockResolvedValue("stored");
      mockedSafeCompare.mockReturnValue(true);

      const context = makeContext({
        "x-api-key": ["first-key", "second-key"],
      });

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });
  });

  describe("invalid API key", () => {
    it("throws UnauthorizedException when key does not match any stored key", async () => {
      mockSecretsService.getSecretNames.mockResolvedValue(["key-1", "key-2"]);
      mockSecretsService.getValueInternal.mockResolvedValue("stored-value");
      mockedSafeCompare.mockReturnValue(false);

      const context = makeContext({
        "x-api-key": "wrong-key",
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(guard.canActivate(context)).rejects.toThrow(
        "Invalid API key",
      );
    });

    it("throws UnauthorizedException when secrets list is empty", async () => {
      mockSecretsService.getSecretNames.mockResolvedValue([]);

      const context = makeContext({
        "x-api-key": "some-key",
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("skips keys with null stored values", async () => {
      mockSecretsService.getSecretNames.mockResolvedValue([
        "empty-key",
        "valid-key",
      ]);
      mockSecretsService.getValueInternal
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce("actual-value");
      mockedSafeCompare.mockImplementation(
        (stored, provided) => stored === provided,
      );

      const context = makeContext({
        "x-api-key": "actual-value",
      });

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });

    it("validates all stored keys before rejecting", async () => {
      mockSecretsService.getSecretNames.mockResolvedValue([
        "key-1",
        "key-2",
        "key-3",
      ]);
      mockSecretsService.getValueInternal.mockResolvedValue("different-stored");
      mockedSafeCompare.mockReturnValue(false);

      const context = makeContext({ "x-api-key": "my-key" });

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );

      // Should have checked all 3 keys
      expect(mockSecretsService.getValueInternal).toHaveBeenCalledTimes(3);
    });
  });

  describe("error handling", () => {
    it("throws UnauthorizedException wrapping service errors", async () => {
      mockSecretsService.getSecretNames.mockRejectedValue(
        new Error("Database connection failed"),
      );

      const context = makeContext({ "x-api-key": "some-key" });

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(guard.canActivate(context)).rejects.toThrow(
        "API key validation failed",
      );
    });

    it("re-throws UnauthorizedException directly without wrapping", async () => {
      mockSecretsService.getSecretNames.mockResolvedValue(["key-1"]);
      mockSecretsService.getValueInternal.mockResolvedValue("stored");
      mockedSafeCompare.mockReturnValue(false);

      const context = makeContext({ "x-api-key": "bad-key" });

      // The guard throws UnauthorizedException('Invalid API key'), not 'validation failed'
      await expect(guard.canActivate(context)).rejects.toMatchObject({
        message: "Invalid API key",
      });
    });
  });
});
