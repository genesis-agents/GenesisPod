import { Module } from "@nestjs/common";
import { KeyErrorClassifier } from "./key-error-classifier";
import { KeyHealthStore } from "./key-health.store";

/**
 * KeyHealthModule — 提供 KeyErrorClassifier + KeyHealthStore 作为可注入的 service。
 *
 * CacheModule 是 @Global，KeyHealthStore Optional 注入 CacheService，
 * 因此本模块无需显式 imports CacheModule。
 */
@Module({
  providers: [KeyErrorClassifier, KeyHealthStore],
  exports: [KeyErrorClassifier, KeyHealthStore],
})
export class KeyHealthModule {}
