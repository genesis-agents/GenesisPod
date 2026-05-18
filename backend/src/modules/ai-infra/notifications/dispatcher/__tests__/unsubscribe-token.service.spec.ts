import { Test, TestingModule } from "@nestjs/testing";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { UnauthorizedException } from "@nestjs/common";
import { UnsubscribeTokenService } from "../preferences/unsubscribe-token.service";
import { PrismaService } from "../../../../../common/prisma/prisma.service";

describe("UnsubscribeTokenService (PR-DR1b)", () => {
  let service: UnsubscribeTokenService;
  let jwt: JwtService;
  let prisma: {
    notificationPreference: {
      upsert: jest.Mock;
      findUnique: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      notificationPreference: {
        upsert: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: "test-secret",
          signOptions: { expiresIn: "7d" },
        }),
      ],
      providers: [
        UnsubscribeTokenService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(UnsubscribeTokenService);
    jwt = module.get(JwtService);
  });

  describe("issue + verifyAndApply 闭环", () => {
    it("global scope → 签发 → 验证 → 关全部 channel", async () => {
      const token = await service.issue("user-1", "global");
      const result = await service.verifyAndApply(token);
      expect(result.scope).toBe("global");
      expect(result.userId).toBe("user-1");
      const args = prisma.notificationPreference.upsert.mock.calls.at(-1)?.[0];
      // global 应同时关 emailEnabled + pushEnabled + 全 RADAR channels
      expect(args.update.emailEnabled).toBe(false);
      expect(args.update.pushEnabled).toBe(false);
      expect(args.update.channelSubscriptions.RADAR_DAILY).toEqual({
        email: false,
        site: false,
        wechat: false,
        webpush: false,
      });
    });

    it("radar_all scope → 关所有 RADAR_* 但保留 emailEnabled", async () => {
      const token = await service.issue("user-1", "radar_all");
      await service.verifyAndApply(token);
      const args = prisma.notificationPreference.upsert.mock.calls.at(-1)?.[0];
      expect(args.update.emailEnabled).toBeUndefined();
      expect(args.update.channelSubscriptions.RADAR_DAILY).toEqual({
        email: false,
        site: false,
        wechat: false,
      });
      expect(args.update.channelSubscriptions.RADAR_WEEKLY).toEqual({
        email: false,
        site: false,
        wechat: false,
      });
    });

    it("weekly scope → 只关 RADAR_WEEKLY", async () => {
      const token = await service.issue("user-1", "weekly");
      await service.verifyAndApply(token);
      const args = prisma.notificationPreference.upsert.mock.calls.at(-1)?.[0];
      expect(args.update.channelSubscriptions.RADAR_WEEKLY).toEqual({
        email: false,
        site: false,
        wechat: false,
      });
      expect(args.update.channelSubscriptions.RADAR_DAILY).toBeUndefined();
    });

    it("topic scope → 需 topicId（payload 写入）", async () => {
      const token = await service.issue("user-1", "topic", {
        topicId: "tpc-1",
      });
      const result = await service.verifyAndApply(token);
      expect(result.ext?.topicId).toBe("tpc-1");
    });
  });

  describe("verifyAndApply 安全异常", () => {
    it("空 token → UnauthorizedException", async () => {
      await expect(service.verifyAndApply("")).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("篡改 token → UnauthorizedException", async () => {
      await expect(service.verifyAndApply("not-a-real-jwt")).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("过期 token → UnauthorizedException", async () => {
      const expired = await jwt.signAsync(
        { sub: "u1", scope: "global" },
        { expiresIn: "-1s" },
      );
      await expect(service.verifyAndApply(expired)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("缺 sub → UnauthorizedException", async () => {
      const bad = await jwt.signAsync({ scope: "global" });
      await expect(service.verifyAndApply(bad)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("topic scope 缺 topicId → UnauthorizedException", async () => {
      // 直接构造 payload 跳过 issue 验证
      const bad = await jwt.signAsync({ sub: "u1", scope: "topic" });
      await expect(service.verifyAndApply(bad)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe("issue 持久化", () => {
    it("签发后写入 NotificationPreference.unsubscribeToken", async () => {
      const token = await service.issue("user-1", "weekly");
      const args = prisma.notificationPreference.upsert.mock.calls.at(-1)?.[0];
      expect(args.where.userId).toBe("user-1");
      expect(args.create.unsubscribeToken).toBe(token);
    });
  });
});
