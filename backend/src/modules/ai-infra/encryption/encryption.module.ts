import { Global, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { EncryptionService } from "./encryption.service";

/**
 * 全局模块：所有需要存储敏感凭据的模块（Secrets / UserApiKeys / AIModel apiKey ...）
 * 都复用同一个 EncryptionService 实例，保证加密 Key 和算法完全一致。
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [EncryptionService],
  exports: [EncryptionService],
})
export class EncryptionModule {}
