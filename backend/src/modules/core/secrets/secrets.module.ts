import { Module } from "@nestjs/common";
import { SecretsController } from "./secrets.controller";
import { SecretsService } from "./secrets.service";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { ConfigModule } from "@nestjs/config";

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [SecretsController],
  providers: [SecretsService],
  exports: [SecretsService],
})
export class SecretsModule {}
