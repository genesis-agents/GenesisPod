import { Module } from "@nestjs/common";
import { PrismaModule } from "../../../../common/prisma/prisma.module";
import { KeyAssignmentsModule } from "../key-assignments/key-assignments.module";
import { NotificationModule } from "../../notifications/notification.module";
import { KeyRequestsService } from "./key-requests.service";

@Module({
  imports: [PrismaModule, KeyAssignmentsModule, NotificationModule],
  // PR-X17: HTTP Controllers moved to open-api/byok-admin or ai-app/byok
  controllers: [],
  providers: [KeyRequestsService],
  exports: [KeyRequestsService],
})
export class KeyRequestsModule {}
