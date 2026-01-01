import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { WechatWorkController } from "./wechat-work.controller";
import { WechatWorkService } from "./wechat-work.service";
import { WechatWorkCryptoService } from "./wechat-work-crypto.service";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { AiCoreModule } from "../../ai/ai-core/ai-core.module";
import { RAGModule } from "../../ai/rag/rag.module";

@Module({
  imports: [HttpModule, PrismaModule, AiCoreModule, RAGModule],
  controllers: [WechatWorkController],
  providers: [WechatWorkService, WechatWorkCryptoService],
  exports: [WechatWorkService],
})
export class WechatWorkModule {}
