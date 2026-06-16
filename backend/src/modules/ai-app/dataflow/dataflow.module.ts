import { Module } from "@nestjs/common";
import { AiEngineModule } from "../../ai-engine/ai-engine.module";
import { DataFlowController } from "./dataflow.controller";
import { DataFlowService } from "./dataflow.service";

/**
 * DataFlow module —— 系统数据流图（左侧菜单「数据流」）。
 *
 * Imports AiEngineModule 以注入 ToolRegistry / ContentSourceRegistry
 * （均经 ai-engine/facade 导出）。PrismaService 走全局 PrismaModule。
 *
 * 三类真实数据：拓扑(registry 校验) + 流量(AIUsageLog 聚合) + 实时(前端轮询增量)。
 */
@Module({
  imports: [AiEngineModule],
  controllers: [DataFlowController],
  providers: [DataFlowService],
})
export class DataFlowModule {}
