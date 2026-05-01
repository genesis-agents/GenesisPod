import { Module, forwardRef } from "@nestjs/common";
import { PrismaModule } from "../../../../common/prisma/prisma.module";
import { KeyAssignmentsModule } from "../key-assignments/key-assignments.module";
import { DistributableKeysService } from "./distributable-keys.service";

@Module({
  imports: [PrismaModule, forwardRef(() => KeyAssignmentsModule)],
  // PR-X17: HTTP Controllers moved to open-api/byok-admin or ai-app/byok
  controllers: [],
  providers: [DistributableKeysService],
  exports: [DistributableKeysService],
})
export class DistributableKeysModule {}
