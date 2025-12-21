import { Module } from "@nestjs/common";
import { ProxyController } from "./proxy.controller";
import { AdvancedExtractorService } from "./advanced-extractor.service";
import { NewsExtractorService } from "./news-extractor.service";
import { PuppeteerFetcherService } from "./puppeteer-fetcher.service";

@Module({
  controllers: [ProxyController],
  providers: [
    AdvancedExtractorService,
    NewsExtractorService,
    PuppeteerFetcherService,
  ],
  exports: [PuppeteerFetcherService],
})
export class ProxyModule {}
