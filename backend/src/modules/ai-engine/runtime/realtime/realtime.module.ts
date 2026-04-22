/**
 * AI Engine - Realtime Module
 * 实时推送模块
 */

import { Module } from "@nestjs/common";
import { EventBusService as EngineEventEmitterService } from "../../../ai-engine/facade";
import { ProgressTrackerService } from "../../../ai-engine/facade";

@Module({
  imports: [
    // Note: EventEmitterModule 应在 AppModule 中 forRoot()，此处不再重复导入
  ],
  providers: [EngineEventEmitterService, ProgressTrackerService],
  exports: [EngineEventEmitterService, ProgressTrackerService],
})
export class RealtimeModule {}
