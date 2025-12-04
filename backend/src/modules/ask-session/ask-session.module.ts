import { Module } from "@nestjs/common";
import { AskSessionController } from "./ask-session.controller";
import { AskSessionService } from "./ask-session.service";
import { PrismaModule } from "../../common/prisma/prisma.module";
import { AiModule } from "../ai/ai.module";

@Module({
  imports: [PrismaModule, AiModule],
  controllers: [AskSessionController],
  providers: [AskSessionService],
  exports: [AskSessionService],
})
export class AskSessionModule {}
