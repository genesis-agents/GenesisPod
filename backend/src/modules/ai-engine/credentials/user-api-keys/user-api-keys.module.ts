import { Module } from "@nestjs/common";
import { PrismaModule } from "../../../../common/prisma/prisma.module";
import { ConfigModule } from "@nestjs/config";
import { SecretsModule } from "../../../ai-infra/secrets/secrets.module";
import { CreditsModule } from "../../../ai-infra/credits/credits.module";
import { UserApiKeysController } from "./user-api-keys.controller";
import { UserApiKeysService } from "./user-api-keys.service";

@Module({
  imports: [PrismaModule, ConfigModule, SecretsModule, CreditsModule],
  controllers: [UserApiKeysController],
  providers: [UserApiKeysService],
  exports: [UserApiKeysService],
})
export class UserApiKeysModule {}
