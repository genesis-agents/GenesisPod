import { Test, TestingModule } from "@nestjs/testing";
import { UserSecretsController } from "../user-secrets.controller";
import { UserSecretsService } from "../../../ai-infra/credentials/user-secrets/user-secrets.service";
import { JwtAuthGuard } from "../../../../common/guards/jwt-auth.guard";

const mockGuard = { canActivate: () => true };

describe("UserSecretsController — testKey endpoint (C8)", () => {
  let controller: UserSecretsController;
  let service: { testKey: jest.Mock };

  const req = { user: { id: "user-1", email: "u@x.com" } } as never;

  beforeEach(async () => {
    service = { testKey: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserSecretsController],
      providers: [{ provide: UserSecretsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockGuard)
      .compile();

    controller = module.get(UserSecretsController);
  });

  it("delegates to service.testKey with owner userId", async () => {
    service.testKey.mockResolvedValue({
      success: true,
      message: "Key 存在，格式校验通过",
      testedAt: "2026-05-28T00:00:00.000Z",
    });

    const result = await controller.testKey(req, "llm", "uak-1");

    expect(service.testKey).toHaveBeenCalledWith("user-1", "llm", "uak-1");
    expect(result.success).toBe(true);
    expect(result).not.toHaveProperty("key");
    expect(result).not.toHaveProperty("plaintext");
  });

  it("propagates failure result from service", async () => {
    service.testKey.mockResolvedValue({
      success: false,
      message: "Key 未找到或无权限",
      testedAt: "2026-05-28T00:00:00.000Z",
    });

    const result = await controller.testKey(req, "secret", "sec-other");

    expect(result.success).toBe(false);
    expect(result.message).toContain("未找到");
  });
});
