import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { NotificationController } from "./notification.controller";
import { NotificationService } from "./notification.service";
import { NotificationPresetsService } from "./presets/notification-presets.service";
import { NotificationGateway } from "./notification.gateway";
import { PrismaModule } from "../../../common/prisma/prisma.module";

@Module({
  imports: [
    PrismaModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>("JWT_SECRET"),
        signOptions: { expiresIn: "7d" },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    NotificationPresetsService,
    NotificationGateway,
  ],
  exports: [NotificationService, NotificationPresetsService],
})
export class NotificationModule {}
