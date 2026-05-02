import { Module } from "@nestjs/common";
import { PrismaModule } from "../../../../common/prisma/prisma.module";
import { DistributableKeysModule } from "../distributable-keys/distributable-keys.module";
import { KeyAssignmentsModule } from "../key-assignments/key-assignments.module";
import { ByokMaintenanceScheduler } from "../scheduling/byok-maintenance.scheduler";
import { SecretsModule } from "../../../ai-infra/secrets/secrets.module";
import { UserApiKeysModule } from "../user-api-keys/user-api-keys.module";
import { KeyResolverService } from "./key-resolver.service";

@Module({
  imports: [
    PrismaModule,
    UserApiKeysModule,
    KeyAssignmentsModule,
    DistributableKeysModule,
    SecretsModule,
  ],
  // PR-X17: HTTP Controllers moved to open-api/byok-admin or ai-app/byok
  controllers: [],
  providers: [KeyResolverService, ByokMaintenanceScheduler],
  exports: [KeyResolverService],
})
export class KeyResolverModule {}
