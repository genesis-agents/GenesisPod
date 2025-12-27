import { Module, forwardRef } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { AiCoreController } from "./ai-core.controller";
import { AiCoreService } from "./ai-core.service";
import { AiChatService } from "./ai-chat.service";
import { SearchService } from "./search.service";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { RAGModule } from "../rag/rag.module";

@Module({
  imports: [HttpModule, PrismaModule, forwardRef(() => RAGModule)],
  controllers: [AiCoreController],
  providers: [AiCoreService, AiChatService, SearchService],
  exports: [AiCoreService, AiChatService, SearchService],
})
export class AiCoreModule {}
