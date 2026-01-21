/**
 * Notebook Research Module - NotebookLM 风格研究模块
 *
 * 提供基于上传文档的交互式研究能力:
 * - 文档上传和分析
 * - AI 驱动的对话
 * - 研究报告生成
 * - TTS 语音输出
 */
import { Module, forwardRef } from "@nestjs/common";
import { PrismaModule } from "../../../../common/prisma/prisma.module";
// Import directly from source to avoid circular dependency via barrel export
import { AiEngineModule } from "../../../ai-engine/ai-engine.module";
import { StorageModule } from "../../../core/storage/storage.module";
import { CreditsModule } from "../../../credits/credits.module";
// ★ 依赖反转: 导入 token 用于提供 ITTSService 实现
import { TTS_SERVICE } from "../../../ai-engine/tools/abstractions/generation-services.interface";

// 控制器和服务 (保持原名以兼容现有 API 路由)
import { AiStudioController } from "./ai-studio.controller";
import { AiStudioService } from "./ai-studio.service";
import { AiStudioSourceService } from "./ai-studio-source.service";
import { AiStudioChatService } from "./ai-studio-chat.service";
import { AiStudioOutputService } from "./ai-studio-output.service";
import { AiStudioTTSService } from "./ai-studio-tts.service";
import { FileParserService } from "./services/file-parser.service";

@Module({
  // 使用 forwardRef 打破循环依赖: NotebookResearchModule ↔ AiEngineModule (AudioGenerationTool 需要 AiStudioTTSService)
  imports: [
    PrismaModule,
    forwardRef(() => AiEngineModule),
    StorageModule,
    CreditsModule,
  ],
  controllers: [AiStudioController],
  providers: [
    AiStudioService,
    AiStudioSourceService,
    AiStudioChatService,
    AiStudioOutputService,
    AiStudioTTSService,
    FileParserService,
    // ★ 依赖反转: 提供 ITTSService 接口实现
    {
      provide: TTS_SERVICE,
      useExisting: AiStudioTTSService,
    },
  ],
  exports: [
    AiStudioService,
    AiStudioSourceService,
    AiStudioChatService,
    AiStudioOutputService,
    AiStudioTTSService,
    // ★ 依赖反转: 导出接口实现供 AiEngineModule 使用
    TTS_SERVICE,
  ],
})
export class NotebookResearchModule {}

// 为了向后兼容，保留 AiStudioModule 别名
export { NotebookResearchModule as AiStudioModule };
