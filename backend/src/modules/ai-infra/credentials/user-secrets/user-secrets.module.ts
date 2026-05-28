import { Module } from "@nestjs/common";
import { PrismaModule } from "../../../../common/prisma/prisma.module";
import { UserApiKeysModule } from "../user-api-keys/user-api-keys.module";
import { UserCredentialsModule } from "../user-credentials/user-credentials.module";
import { UserSecretsService } from "./user-secrets.service";

/**
 * 2026-05-27 BYOK 全量化：用户私有 Secret 统一 CRUD 服务模块。
 * EncryptionService 来自全局 EncryptionModule，无需在此 import。
 * 2026-05-28 PR-3：工具/其它类 BYOK 落 user_credentials（UserCredentialsService）。
 */
@Module({
  imports: [PrismaModule, UserApiKeysModule, UserCredentialsModule],
  providers: [UserSecretsService],
  exports: [UserSecretsService],
})
export class UserSecretsModule {}
