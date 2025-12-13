import { Module } from "@nestjs/common";
import { CrawlerController } from "./crawler.controller";
import { ArxivService } from "./arxiv.service";
import { GithubService } from "./github.service";
import { HackernewsService } from "./hackernews.service";
import { HackernewsCommentsService } from "./hackernews-comments.service";
import { RssService } from "./rss.service";
import { WebScraperService } from "./web-scraper.service";
import { DeduplicationService } from "./deduplication.service";
import { ResourcesModule } from "../../content/resources/resources.module";

/**
 * 数据采集器模块
 */
@Module({
  imports: [ResourcesModule],
  controllers: [CrawlerController],
  providers: [
    ArxivService,
    GithubService,
    HackernewsService,
    HackernewsCommentsService,
    RssService,
    WebScraperService,
    DeduplicationService,
  ],
  exports: [
    ArxivService,
    GithubService,
    HackernewsService,
    HackernewsCommentsService,
    RssService,
    WebScraperService,
    DeduplicationService,
  ],
})
export class CrawlerModule {}
