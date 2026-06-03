import { Module } from "@nestjs/common";
import { PrismaModule } from "../../../../common/prisma/prisma.module";
import { KeyHealthModule } from "@/modules/platform/credentials/key-health/key-health.module";
import { KeyAssignmentsModule } from "../key-assignments/key-assignments.module";
import { ByokMaintenanceScheduler } from "../scheduling/byok-maintenance.scheduler";
import { SecretsModule } from "../../../platform/credentials/secrets/secrets.module";
import { UserApiKeysModule } from "../user-api-keys/user-api-keys.module";
import { KeyResolverService } from "./key-resolver.service";

@Module({
  imports: [
    PrismaModule,
    UserApiKeysModule,
    KeyAssignmentsModule,
    SecretsModule,
    KeyHealthModule,
  ],
  controllers: [],
  providers: [KeyResolverService, ByokMaintenanceScheduler],
  exports: [KeyResolverService],
})
export class KeyResolverModule {}
