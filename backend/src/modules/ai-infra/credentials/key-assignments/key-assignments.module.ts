import { Module } from "@nestjs/common";
import { PrismaModule } from "../../../../common/prisma/prisma.module";
import { SecretsModule } from "../../secrets/secrets.module";
import { KeyAssignmentsService } from "./key-assignments.service";

@Module({
  imports: [PrismaModule, SecretsModule],
  controllers: [],
  providers: [KeyAssignmentsService],
  exports: [KeyAssignmentsService],
})
export class KeyAssignmentsModule {}
