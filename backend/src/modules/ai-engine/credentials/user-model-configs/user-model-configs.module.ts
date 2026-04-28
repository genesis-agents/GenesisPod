import { Module } from "@nestjs/common";
import { PrismaModule } from "../../../../common/prisma/prisma.module";
import { UserModelConfigsController } from "./user-model-configs.controller";
import { UserModelConfigsService } from "./user-model-configs.service";

@Module({
  imports: [PrismaModule],
  controllers: [UserModelConfigsController],
  providers: [UserModelConfigsService],
  exports: [UserModelConfigsService],
})
export class UserModelConfigsModule {}
