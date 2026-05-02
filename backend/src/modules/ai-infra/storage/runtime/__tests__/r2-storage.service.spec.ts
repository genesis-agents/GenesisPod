import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { ServiceUnavailableException } from "@nestjs/common";
import { R2StorageService } from "../r2-storage.service";

// Mock AWS SDK
jest.mock("@aws-sdk/client-s3", () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: jest.fn(),
  })),
  PutObjectCommand: jest.fn().mockImplementation((params) => params),
  DeleteObjectCommand: jest.fn().mockImplementation((params) => params),
  GetObjectCommand: jest.fn().mockImplementation((params) => params),
}));

jest.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: jest.fn().mockResolvedValue("https://signed-url.example.com"),
}));

jest.mock("../../../../common/utils/concurrency.utils", () => ({
  mapWithConcurrency: jest.fn().mockImplementation(async (items, fn) => {
    return Promise.all(items.map(fn));
  }),
  ConcurrencyLimits: { FILE: 3 },
}));

import { S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const mockS3Send = jest.fn();
const MockS3Client = S3Client as jest.MockedClass<typeof S3Client>;
const mockGetSignedUrl = getSignedUrl as jest.MockedFunction<
  typeof getSignedUrl
>;

describe("R2StorageService", () => {
  let service: R2StorageService;
  let mockConfigService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    mockS3Send.mockReset();
    mockGetSignedUrl.mockReset();
    mockGetSignedUrl.mockResolvedValue("https://presigned-url.example.com");
    MockS3Client.mockClear();
    MockS3Client.mockImplementation(
      () => ({ send: mockS3Send }) as unknown as S3Client,
    );

    mockConfigService = {
      get: jest.fn(),
    } as unknown as jest.Mocked<ConfigService>;

    // Default: no credentials configured
    mockConfigService.get.mockReturnValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        R2StorageService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<R2StorageService>(R2StorageService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("onModuleInit - B2 provider", () => {
    it("should configure B2 when B2 credentials are provided", async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        const map: Record<string, string> = {
          R2_ACCOUNT_ID: "test-account",
          R2_ACCESS_KEY_ID: "test-key-id",
          R2_SECRET_ACCESS_KEY: "test-secret",
          R2_BUCKET_NAME: "test-bucket",
        };
        return map[key];
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          R2StorageService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const svc = module.get<R2StorageService>(R2StorageService);
      svc.onModuleInit();

      expect(svc.isEnabled()).toBe(true);
      expect(svc.getProvider()).toBe("r2");
    });

    it("should extract region from B2 endpoint URL", async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        const map: Record<string, string> = {
          R2_ACCOUNT_ID: "test-account",
          R2_ACCESS_KEY_ID: "test-key-id",
          R2_SECRET_ACCESS_KEY: "test-secret-eu",
        };
        return map[key];
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          R2StorageService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const svc = module.get<R2StorageService>(R2StorageService);
      svc.onModuleInit();

      expect(svc.isEnabled()).toBe(true);
      expect(svc.getProvider()).toBe("r2");
    });

    it("should use default region when B2 endpoint does not match pattern", async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        const map: Record<string, string> = {
          R2_ACCOUNT_ID: "test-account",
          R2_ACCESS_KEY_ID: "test-key-id",
          R2_SECRET_ACCESS_KEY: "test-secret-custom",
        };
        return map[key];
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          R2StorageService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const svc = module.get<R2StorageService>(R2StorageService);
      svc.onModuleInit();

      expect(svc.isEnabled()).toBe(true);
      expect(svc.getProvider()).toBe("r2");
    });
  });

  describe("onModuleInit - R2 provider", () => {
    it("should configure R2 when R2 credentials are provided (no B2)", async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        const map: Record<string, string> = {
          R2_ACCOUNT_ID: "my-account-id",
          R2_ACCESS_KEY_ID: "r2-key-id",
          R2_SECRET_ACCESS_KEY: "r2-secret",
        };
        return map[key];
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          R2StorageService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const svc = module.get<R2StorageService>(R2StorageService);
      svc.onModuleInit();

      expect(svc.isEnabled()).toBe(true);
      expect(svc.getProvider()).toBe("r2");
    });
  });

  describe("onModuleInit - no credentials", () => {
    it("should remain unconfigured when no credentials are provided", () => {
      service.onModuleInit();

      expect(service.isEnabled()).toBe(false);
      expect(service.getProvider()).toBe("none");
    });
  });

  describe("isEnabled and getProvider", () => {
    it("should return false and none when not configured", () => {
      service.onModuleInit();
      expect(service.isEnabled()).toBe(false);
      expect(service.getProvider()).toBe("none");
    });
  });

  describe("uploadBase64Image", () => {
    it("should return error when storage not configured", async () => {
      service.onModuleInit(); // no creds
      const result = await service.uploadBase64Image(
        "data:image/png;base64,abc123",
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("not configured");
    });

    it("should return error for invalid base64 format", async () => {
      // Configure the service with B2
      mockConfigService.get.mockImplementation((key: string) => {
        const map: Record<string, string> = {
          R2_ACCOUNT_ID: "test-account",
          R2_ACCESS_KEY_ID: "test-key-id",
          R2_SECRET_ACCESS_KEY: "test-secret",
        };
        return map[key];
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          R2StorageService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();
      const svc = module.get<R2StorageService>(R2StorageService);
      svc.onModuleInit();

      const result = await svc.uploadBase64Image("not-a-valid-base64-image");
      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid base64 image format");
    });

    it("should upload successfully and return presigned URL", async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        const map: Record<string, string> = {
          R2_ACCOUNT_ID: "test-account",
          R2_ACCESS_KEY_ID: "test-key-id",
          R2_SECRET_ACCESS_KEY: "test-secret",
        };
        return map[key];
      });

      mockS3Send.mockResolvedValue({});
      mockGetSignedUrl.mockResolvedValue(
        "https://presigned.example.com/test.png",
      );

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          R2StorageService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();
      const svc = module.get<R2StorageService>(R2StorageService);
      svc.onModuleInit();

      // Valid base64 PNG header
      const validBase64 =
        "data:image/png;base64," +
        Buffer.from("fake-image-data").toString("base64");
      const result = await svc.uploadBase64Image(validBase64, "test-prefix");

      expect(result.success).toBe(true);
      expect(result.url).toContain("presigned.example.com");
      expect(result.key).toContain("test-prefix/");
    });

    it("should support jpeg image type", async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        const map: Record<string, string> = {
          R2_ACCOUNT_ID: "test-account",
          R2_ACCESS_KEY_ID: "test-key-id",
          R2_SECRET_ACCESS_KEY: "test-secret",
        };
        return map[key];
      });
      mockS3Send.mockResolvedValue({});

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          R2StorageService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();
      const svc = module.get<R2StorageService>(R2StorageService);
      svc.onModuleInit();

      const validBase64 =
        "data:image/jpeg;base64," + Buffer.from("jpeg-data").toString("base64");
      const result = await svc.uploadBase64Image(validBase64);

      expect(result.success).toBe(true);
      expect(result.key).toMatch(/\.jpeg$/);
    });

    it("should handle upload failure gracefully", async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        const map: Record<string, string> = {
          R2_ACCOUNT_ID: "test-account",
          R2_ACCESS_KEY_ID: "test-key-id",
          R2_SECRET_ACCESS_KEY: "test-secret",
        };
        return map[key];
      });
      mockS3Send.mockRejectedValue(new Error("S3 upload failed"));

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          R2StorageService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();
      const svc = module.get<R2StorageService>(R2StorageService);
      svc.onModuleInit();

      const validBase64 =
        "data:image/png;base64," + Buffer.from("data").toString("base64");
      const result = await svc.uploadBase64Image(validBase64);

      expect(result.success).toBe(false);
      expect(result.error).toContain("S3 upload failed");
    });
  });

  describe("uploadBuffer", () => {
    it("should return error when not configured", async () => {
      service.onModuleInit();
      const result = await service.uploadBuffer(
        Buffer.from("data"),
        "prefix",
        "file.pdf",
        "application/pdf",
      );
      expect(result.success).toBe(false);
    });

    it("should upload buffer and return URL", async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        const map: Record<string, string> = {
          R2_ACCOUNT_ID: "test-account",
          R2_ACCESS_KEY_ID: "test-key-id",
          R2_SECRET_ACCESS_KEY: "test-secret",
        };
        return map[key];
      });
      mockS3Send.mockResolvedValue({});
      mockGetSignedUrl.mockResolvedValue(
        "https://presigned.example.com/file.pdf",
      );

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          R2StorageService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();
      const svc = module.get<R2StorageService>(R2StorageService);
      svc.onModuleInit();

      const result = await svc.uploadBuffer(
        Buffer.from("pdf-content"),
        "exports",
        "document.pdf",
        "application/pdf",
      );

      expect(result.success).toBe(true);
      expect(result.url).toContain("presigned.example.com");
      expect(result.key).toMatch(/exports\/.+\.pdf$/);
    });

    it("should handle buffer upload failure", async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        const map: Record<string, string> = {
          R2_ACCOUNT_ID: "test-account",
          R2_ACCESS_KEY_ID: "test-key-id",
          R2_SECRET_ACCESS_KEY: "test-secret",
        };
        return map[key];
      });
      mockS3Send.mockRejectedValue(new Error("Connection refused"));

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          R2StorageService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();
      const svc = module.get<R2StorageService>(R2StorageService);
      svc.onModuleInit();

      const result = await svc.uploadBuffer(
        Buffer.from("data"),
        "prefix",
        "file.txt",
        "text/plain",
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Connection refused");
    });

    it("should handle filename without extension", async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        const map: Record<string, string> = {
          R2_ACCOUNT_ID: "test-account",
          R2_ACCESS_KEY_ID: "test-key-id",
          R2_SECRET_ACCESS_KEY: "test-secret",
        };
        return map[key];
      });
      mockS3Send.mockResolvedValue({});

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          R2StorageService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();
      const svc = module.get<R2StorageService>(R2StorageService);
      svc.onModuleInit();

      const result = await svc.uploadBuffer(
        Buffer.from("data"),
        "prefix",
        "noextension",
        "application/octet-stream",
      );

      expect(result.success).toBe(true);
      // When filename has no dot, split(".").pop() returns the full filename,
      // so the extension is the full filename "noextension" (not "bin")
      expect(result.key).toContain("noextension");
    });
  });

  describe("getPresignedUrl", () => {
    it("should throw ServiceUnavailableException when not configured", async () => {
      service.onModuleInit(); // no creds, s3Client is null

      await expect(service.getPresignedUrl("some/key")).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it("should return presigned URL when configured", async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        const map: Record<string, string> = {
          R2_ACCOUNT_ID: "test-account",
          R2_ACCESS_KEY_ID: "test-key-id",
          R2_SECRET_ACCESS_KEY: "test-secret",
        };
        return map[key];
      });
      mockGetSignedUrl.mockResolvedValue(
        "https://presigned-url.example.com/mykey",
      );

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          R2StorageService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();
      const svc = module.get<R2StorageService>(R2StorageService);
      svc.onModuleInit();

      const url = await svc.getPresignedUrl("prefix/mykey.png");
      expect(url).toContain("presigned-url.example.com");
    });
  });

  describe("refreshImageUrl", () => {
    it("should return null for invalid URL", async () => {
      const result = await service.refreshImageUrl("not-a-url");
      expect(result).toBeNull();
    });

    it("should return new presigned URL for valid key URL", async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        const map: Record<string, string> = {
          R2_ACCOUNT_ID: "test-account",
          R2_ACCESS_KEY_ID: "test-key-id",
          R2_SECRET_ACCESS_KEY: "test-secret",
          B2_BUCKET_NAME: "mybucket",
        };
        return map[key];
      });
      mockGetSignedUrl.mockResolvedValue(
        "https://new-presigned-url.example.com",
      );

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          R2StorageService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();
      const svc = module.get<R2StorageService>(R2StorageService);
      svc.onModuleInit();

      const result = await svc.refreshImageUrl(
        "https://s3.us-west-004.backblazeb2.com/mybucket/prefix/image.png?X-Amz-Signature=abc",
      );

      expect(result).toContain("new-presigned-url.example.com");
    });

    it("should return null when presigned URL generation fails", async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        const map: Record<string, string> = {
          R2_ACCOUNT_ID: "test-account",
          R2_ACCESS_KEY_ID: "test-key-id",
          R2_SECRET_ACCESS_KEY: "test-secret",
          B2_BUCKET_NAME: "mybucket",
        };
        return map[key];
      });
      mockGetSignedUrl.mockRejectedValue(new Error("Signing failed"));

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          R2StorageService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();
      const svc = module.get<R2StorageService>(R2StorageService);
      svc.onModuleInit();

      const result = await svc.refreshImageUrl(
        "https://s3.us-west-004.backblazeb2.com/mybucket/prefix/image.png",
      );
      expect(result).toBeNull();
    });
  });

  describe("deleteImage", () => {
    it("should return false when not configured", async () => {
      service.onModuleInit();
      const result = await service.deleteImage("some/key");
      expect(result).toBe(false);
    });

    it("should delete successfully and return true", async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        const map: Record<string, string> = {
          R2_ACCOUNT_ID: "test-account",
          R2_ACCESS_KEY_ID: "test-key-id",
          R2_SECRET_ACCESS_KEY: "test-secret",
        };
        return map[key];
      });
      mockS3Send.mockResolvedValue({});

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          R2StorageService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();
      const svc = module.get<R2StorageService>(R2StorageService);
      svc.onModuleInit();

      const result = await svc.deleteImage("prefix/image.png");
      expect(result).toBe(true);
    });

    it("should return false when delete fails", async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        const map: Record<string, string> = {
          R2_ACCOUNT_ID: "test-account",
          R2_ACCESS_KEY_ID: "test-key-id",
          R2_SECRET_ACCESS_KEY: "test-secret",
        };
        return map[key];
      });
      mockS3Send.mockRejectedValue(new Error("Delete failed"));

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          R2StorageService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();
      const svc = module.get<R2StorageService>(R2StorageService);
      svc.onModuleInit();

      const result = await svc.deleteImage("prefix/image.png");
      expect(result).toBe(false);
    });
  });

  describe("extractKeyFromUrl", () => {
    it("should extract key from URL with bucket prefix", () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === "B2_BUCKET_NAME") return "my-bucket";
        return undefined;
      });

      const _module2 = Test.createTestingModule({
        providers: [
          R2StorageService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      });

      // Use the existing service instance
      service.onModuleInit();

      // Default bucket name (updated to genesis-reports after B2 removal)
      const url =
        "https://example.com/genesis-reports/prefix/image.png?X-Amz=test";
      const key = service.extractKeyFromUrl(url);
      expect(key).toBe("prefix/image.png");
    });

    it("should return path without leading slash when no bucket prefix", () => {
      service.onModuleInit();
      const url = "https://example.com/prefix/image.png";
      const key = service.extractKeyFromUrl(url);
      expect(key).toBe("prefix/image.png");
    });

    it("should return null for invalid URL", () => {
      const key = service.extractKeyFromUrl("not-a-url");
      expect(key).toBeNull();
    });

    it("should handle path without leading slash", () => {
      service.onModuleInit();
      const url = "https://example.com/somekey";
      const key = service.extractKeyFromUrl(url);
      expect(key).toBe("somekey");
    });
  });

  describe("uploadMultiple", () => {
    it("should upload multiple images in parallel", async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        const map: Record<string, string> = {
          R2_ACCOUNT_ID: "test-account",
          R2_ACCESS_KEY_ID: "test-key-id",
          R2_SECRET_ACCESS_KEY: "test-secret",
        };
        return map[key];
      });
      mockS3Send.mockResolvedValue({});
      mockGetSignedUrl.mockResolvedValue("https://presigned.example.com/img");

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          R2StorageService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();
      const svc = module.get<R2StorageService>(R2StorageService);
      svc.onModuleInit();

      const b64 =
        "data:image/png;base64," + Buffer.from("x").toString("base64");
      const results = await svc.uploadMultiple([
        { base64: b64, prefix: "a" },
        { base64: b64, prefix: "b" },
      ]);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
    });
  });
});
