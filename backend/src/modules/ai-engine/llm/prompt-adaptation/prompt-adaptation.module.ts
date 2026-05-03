import { Module } from "@nestjs/common";

import { PromptTierAdaptationService } from "./prompt-tier-adaptation.service";

@Module({
  providers: [PromptTierAdaptationService],
  exports: [PromptTierAdaptationService],
})
export class PromptAdaptationModule {}
