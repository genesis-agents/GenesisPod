import { Module, forwardRef } from "@nestjs/common";
import { PrismaModule } from "../../../../common/prisma/prisma.module";
import { KeyAssignmentsModule } from "../key-assignments/key-assignments.module";
import { DistributableKeysController } from "./distributable-keys.controller";
import { DistributableKeysService } from "./distributable-keys.service";

@Module({
  imports: [PrismaModule, forwardRef(() => KeyAssignmentsModule)],
  controllers: [DistributableKeysController],
  providers: [DistributableKeysService],
  exports: [DistributableKeysService],
})
export class DistributableKeysModule {}
