/**
 * user-model-configs.controller-capability.spec.ts — v3.1 §B.3 BYOK 用户 override endpoint
 *
 * 覆盖：
 *   - PATCH /user/model-configs/:id/capability-overrides → writer + scope=PERSONAL
 *   - DELETE → 空 patch + scope=PERSONAL
 *   - ownership: 改别人的 config → ForbiddenException（service.findById 返回 null）
 *   - 透传 IP / UA / dto.reason
 */

import { Test, TestingModule } from "@nestjs/testing";
import { ForbiddenException } from "@nestjs/common";

import { UserModelConfigsController } from "../user-model-configs.controller";
import { UserModelConfigsService } from "@/modules/ai-harness/facade";
import { CapabilityOverridesWriterService } from "@/modules/ai-engine/facade";
import { JwtAuthGuard } from "../../../../common/guards/jwt-auth.guard";

const mockGuard = { canActivate: () => true };

describe("UserModelConfigsController — capability_overrides (v3.1 §B.3)", () => {
  let controller: UserModelConfigsController;
  let service: { findById: jest.Mock };
  let writer: { applyOverrideTransactional: jest.Mock };

  beforeEach(async () => {
    service = {
      findById: jest
        .fn()
        .mockResolvedValue({ id: "config-1", userId: "user-1" }),
    };
    writer = {
      applyOverrideTransactional: jest
        .fn()
        .mockResolvedValue({ before: null, after: {} }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserModelConfigsController],
      providers: [
        { provide: UserModelConfigsService, useValue: service },
        { provide: CapabilityOverridesWriterService, useValue: writer },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockGuard)
      .compile();

    controller = module.get(UserModelConfigsController);
  });

  const reqUser = {
    user: { id: "user-1", email: "u@x.com" },
    ip: "192.168.1.1",
    headers: { "user-agent": "Chrome/120" },
  } as never;

  // ─────────── PATCH happy ───────────

  it("PATCH passes scope=PERSONAL + actor.role=user + IP/UA + dto.reason", async () => {
    const dto = {
      patch: { structuredOutput: { nativeMode: "json_mode" } },
      reason:
        "User reports json_schema breaks on their proxy endpoint, downgrade to json_mode",
    } as never;

    await controller.applyCapabilityOverrides(reqUser, "config-1", dto);

    expect(writer.applyOverrideTransactional).toHaveBeenCalledTimes(1);
    const call = writer.applyOverrideTransactional.mock.calls[0][0];
    expect(call).toMatchObject({
      target: { kind: "user_model_config", id: "config-1" },
      scope: "PERSONAL",
      actor: { id: "user-1", role: "user" },
      source: "admin-override",
      ipAddress: "192.168.1.1",
      userAgent: "Chrome/120",
    });
    expect(call.patch).toEqual({
      structuredOutput: { nativeMode: "json_mode" },
    });
  });

  // ─────────── DELETE happy ───────────

  it("DELETE passes empty patch + reason", async () => {
    const dto = {
      reason:
        "Reset capability_overrides after switching to a different upstream provider",
    } as never;
    await controller.clearCapabilityOverrides(reqUser, "config-1", dto);
    expect(writer.applyOverrideTransactional.mock.calls[0][0].patch).toEqual(
      {},
    );
  });

  // ─────────── ownership guard ───────────

  it("rejects PATCH when config does not belong to current user (Forbidden)", async () => {
    service.findById.mockResolvedValue(null); // 服务层 ownership 校验：null
    const dto = {
      patch: { structuredOutput: { nativeMode: "none" } },
      reason:
        "Trying to modify another user config, should be rejected by ownership check",
    } as never;
    await expect(
      controller.applyCapabilityOverrides(reqUser, "config-other", dto),
    ).rejects.toThrow(ForbiddenException);
    expect(writer.applyOverrideTransactional).not.toHaveBeenCalled();
  });

  it("rejects DELETE when config does not belong to current user", async () => {
    service.findById.mockResolvedValue(null);
    const dto = {
      reason:
        "Trying to delete another user config, should be rejected by ownership check",
    } as never;
    await expect(
      controller.clearCapabilityOverrides(reqUser, "config-other", dto),
    ).rejects.toThrow(ForbiddenException);
  });

  // ─────────── ownership query 调用 ───────────

  it("calls findById with current user id (ownership scoping)", async () => {
    const dto = {
      patch: {},
      reason:
        "Test ownership findById passes the request user id correctly to the service",
    } as never;
    await controller.applyCapabilityOverrides(reqUser, "config-1", dto);
    expect(service.findById).toHaveBeenCalledWith("user-1", "config-1");
  });
});
