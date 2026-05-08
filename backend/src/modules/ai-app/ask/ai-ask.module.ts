import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { AiAskController } from "./ai-ask.controller";
import { AiAskService } from "./ai-ask.service";
import { PrismaModule } from "../../../common/prisma/prisma.module";
// 直接从文件导入，避免 barrel export 循环依赖
import { AiEngineModule } from "../../ai-engine/ai-engine.module";
import { CreditsModule } from "../../ai-infra/credits/credits.module";
// Teams 模式（W2 PR3）
import { AskRoomController } from "./ai-ask-room.controller";
import { AskRoomService } from "./ai-ask-room.service";
import { AskRoomRuntimeService } from "./ai-ask-room-runtime.service";
import { AskRoomGateway } from "./ai-ask-room.gateway";
import { FreechatAdapter } from "./adapters/freechat.adapter";

@Module({
  imports: [
    PrismaModule,
    AiEngineModule,
    CreditsModule,
    // Gateway JWT 校验（与 NotificationGateway / TopicResearchGateway 同模式）
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>("JWT_SECRET"),
        signOptions: { expiresIn: "7d" },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AiAskController, AskRoomController],
  providers: [
    AiAskService,
    AskRoomService,
    AskRoomRuntimeService,
    AskRoomGateway,
    FreechatAdapter,
  ],
  exports: [AiAskService, AskRoomService],
})
export class AiAskModule {}
