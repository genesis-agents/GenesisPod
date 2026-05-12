/**
 * PreparseModule (W1 v2.0 rebuild)
 *
 * 给 RAGModule / WikiModule 提供 PreparseService。
 * 依赖 ContentFetchModule（来自 AiEngineModule 提供 ContentFetchService）。
 */

import { Module } from "@nestjs/common";
import { PrismaModule } from "../../../../../common/prisma/prisma.module";
import { AiEngineModule } from "../../../../ai-engine/ai-engine.module";
import { PreparseService } from "./preparse.service";

@Module({
  imports: [PrismaModule, AiEngineModule],
  providers: [PreparseService],
  exports: [PreparseService],
})
export class PreparseModule {}
