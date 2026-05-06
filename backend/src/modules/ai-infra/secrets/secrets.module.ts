import { Module } from "@nestjs/common";
import { SecretsController } from "./secrets.controller";
import { SecretsService } from "./secrets.service";
import { SecretKeysController } from "./secret-keys.controller";
import { SecretKeysService } from "./secret-keys.service";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { ConfigModule } from "@nestjs/config";

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [SecretsController, SecretKeysController],
  providers: [SecretsService, SecretKeysService],
  exports: [SecretsService, SecretKeysService],
})
export class SecretsModule {}
