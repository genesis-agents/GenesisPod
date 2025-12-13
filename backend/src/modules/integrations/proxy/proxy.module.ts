import { Module } from "@nestjs/common";
import { ProxyController } from "./proxy.controller";
import { AdvancedExtractorService } from "./advanced-extractor.service";
import { NewsExtractorService } from "./news-extractor.service";

@Module({
  controllers: [ProxyController],
  providers: [AdvancedExtractorService, NewsExtractorService],
})
export class ProxyModule {}
