import { Module, forwardRef } from "@nestjs/common";
import { PrismaModule } from "../../../../common/prisma/prisma.module";
import { DistributableKeysModule } from "../distributable-keys/distributable-keys.module";
import { AdminKeyAssignmentsController } from "./admin-key-assignments.controller";
import { UserKeyAssignmentsController } from "./key-assignments.controller";
import { KeyAssignmentsService } from "./key-assignments.service";

@Module({
  imports: [PrismaModule, forwardRef(() => DistributableKeysModule)],
  controllers: [UserKeyAssignmentsController, AdminKeyAssignmentsController],
  providers: [KeyAssignmentsService],
  exports: [KeyAssignmentsService],
})
export class KeyAssignmentsModule {}
