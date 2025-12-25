import { Global, Module } from "@nestjs/common";
import { CapabilityRegistryService } from "./capability-registry.service";
import { CapabilityOrchestratorService } from "./capability-orchestrator.service";

@Global()
@Module({
  providers: [CapabilityRegistryService, CapabilityOrchestratorService],
  exports: [CapabilityRegistryService, CapabilityOrchestratorService],
})
export class CapabilitiesModule {}
