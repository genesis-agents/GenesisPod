import { Module } from "@nestjs/common";
import { PrismaModule } from "../../../../common/prisma/prisma.module";
import { UserCredentialsService } from "./user-credentials.service";

/**
 * 2026-05-28 BYOK 加固 PR-3：用户私有工具/其它类 Key 的 CRUD + 运行时取值模块。
 * EncryptionService 来自全局 EncryptionModule，无需在此 import。
 */
@Module({
  imports: [PrismaModule],
  providers: [UserCredentialsService],
  exports: [UserCredentialsService],
})
export class UserCredentialsModule {}
