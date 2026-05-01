import { Module, forwardRef } from "@nestjs/common";
import { PrismaModule } from "../../../../common/prisma/prisma.module";
import { DistributableKeysModule } from "../distributable-keys/distributable-keys.module";
import { KeyAssignmentsService } from "./key-assignments.service";

@Module({
  imports: [PrismaModule, forwardRef(() => DistributableKeysModule)],
  // PR-X17: HTTP Controllers moved to open-api/byok-admin or ai-app/byok
  controllers: [],
  providers: [KeyAssignmentsService],
  exports: [KeyAssignmentsService],
})
export class KeyAssignmentsModule {}
