import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { WechatWorkController } from "./wechat-work.controller";
import { WechatDataSourceController } from "./wechat-data-source.controller";
import { WechatWorkService } from "./wechat-work.service";
import { WechatWorkCryptoService } from "./wechat-work-crypto.service";
import { WechatDataSourceService } from "./wechat-data-source.service";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { AiCoreModule } from "../../ai/ai-core/ai-core.module";
import { RAGModule } from "../../ai/rag/rag.module";

@Module({
  imports: [HttpModule, PrismaModule, AiCoreModule, RAGModule],
  controllers: [WechatWorkController, WechatDataSourceController],
  providers: [
    WechatWorkService,
    WechatWorkCryptoService,
    WechatDataSourceService,
  ],
  exports: [WechatWorkService, WechatDataSourceService],
})
export class WechatWorkModule {}
