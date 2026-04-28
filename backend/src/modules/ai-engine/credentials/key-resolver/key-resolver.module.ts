import { Module } from "@nestjs/common";
import { PrismaModule } from "../../../../common/prisma/prisma.module";
import { DistributableKeysModule } from "../distributable-keys/distributable-keys.module";
import { KeyAssignmentsModule } from "../key-assignments/key-assignments.module";
import { SecretsModule } from "../../../ai-infra/secrets/secrets.module";
import { UserApiKeysModule } from "../user-api-keys/user-api-keys.module";
import { AdminByokDashboardController } from "./admin-byok-dashboard.controller";
import { UserByokController } from "./user-byok.controller";
import { ByokSchedulerService } from "./byok-scheduler.service";
import { KeyResolverService } from "./key-resolver.service";

@Module({
  imports: [
    PrismaModule,
    UserApiKeysModule,
    KeyAssignmentsModule,
    DistributableKeysModule,
    SecretsModule,
  ],
  controllers: [UserByokController, AdminByokDashboardController],
  providers: [KeyResolverService, ByokSchedulerService],
  exports: [KeyResolverService],
})
export class KeyResolverModule {}
