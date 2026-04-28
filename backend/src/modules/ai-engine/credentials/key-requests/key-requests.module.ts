import { Module } from "@nestjs/common";
import { PrismaModule } from "../../../../common/prisma/prisma.module";
import { KeyAssignmentsModule } from "../key-assignments/key-assignments.module";
import { AdminKeyRequestsController } from "./admin-key-requests.controller";
import { UserKeyRequestsController } from "./key-requests.controller";
import { KeyRequestsService } from "./key-requests.service";

@Module({
  imports: [PrismaModule, KeyAssignmentsModule],
  controllers: [UserKeyRequestsController, AdminKeyRequestsController],
  providers: [KeyRequestsService],
  exports: [KeyRequestsService],
})
export class KeyRequestsModule {}
