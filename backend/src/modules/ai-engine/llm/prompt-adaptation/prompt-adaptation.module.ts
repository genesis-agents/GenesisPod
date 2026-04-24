import { Module } from "@nestjs/common";

import { PromptTierAdaptationService } from "./service";

@Module({
  providers: [PromptTierAdaptationService],
  exports: [PromptTierAdaptationService],
})
export class PromptAdaptationModule {}
