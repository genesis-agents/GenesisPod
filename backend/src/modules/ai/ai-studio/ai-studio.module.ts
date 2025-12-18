import { Module } from "@nestjs/common";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { AiCoreModule } from "../ai-core/ai-core.module";
import { StorageModule } from "../../core/storage/storage.module";
import { AiStudioController } from "./ai-studio.controller";
import { AiStudioService } from "./ai-studio.service";
import { AiStudioSourceService } from "./ai-studio-source.service";
import { AiStudioChatService } from "./ai-studio-chat.service";
import { AiStudioOutputService } from "./ai-studio-output.service";
import { AiStudioTTSService } from "./ai-studio-tts.service";
import { FileParserService } from "./services/file-parser.service";

@Module({
  imports: [PrismaModule, AiCoreModule, StorageModule],
  controllers: [AiStudioController],
  providers: [
    AiStudioService,
    AiStudioSourceService,
    AiStudioChatService,
    AiStudioOutputService,
    AiStudioTTSService,
    FileParserService,
  ],
  exports: [
    AiStudioService,
    AiStudioSourceService,
    AiStudioChatService,
    AiStudioOutputService,
    AiStudioTTSService,
  ],
})
export class AiStudioModule {}
