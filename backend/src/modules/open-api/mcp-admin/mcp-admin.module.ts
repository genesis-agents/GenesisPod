import { Module } from "@nestjs/common";
import { MCPExternalAdminController } from "./mcp-external-admin.controller";
import { AiEngineModule } from "../../ai-engine/ai-engine.module";
import { HarnessModule } from "../../ai-harness/harness.module";

@Module({
  imports: [AiEngineModule, HarnessModule],
  controllers: [MCPExternalAdminController],
})
export class McpAdminModule {}
