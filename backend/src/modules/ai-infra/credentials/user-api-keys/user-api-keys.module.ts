import { Module } from "@nestjs/common";
import { PrismaModule } from "../../../../common/prisma/prisma.module";
import { ConfigModule } from "@nestjs/config";
import { SecretsModule } from "../../../ai-infra/secrets/secrets.module";
import { CreditsModule } from "../../../ai-infra/credits/credits.module";
import { KeyHealthModule } from "../health/key-health.module";
import { UserApiKeysService } from "./user-api-keys.service";

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    SecretsModule,
    CreditsModule,
    KeyHealthModule,
  ],
  // PR-X17: HTTP Controllers moved to open-api/byok-admin or ai-app/byok
  controllers: [],
  providers: [UserApiKeysService],
  exports: [UserApiKeysService],
})
export class UserApiKeysModule {}
