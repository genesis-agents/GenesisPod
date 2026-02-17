import { Module, forwardRef } from "@nestjs/common";
import { ContentProcessingModule } from "../../../common/content-processing/content-processing.module";
import { ExploreModule } from "../../content/explore/explore.module";
import { ContentFetchService } from "./content-fetch.service";

@Module({
  imports: [ContentProcessingModule, forwardRef(() => ExploreModule)],
  providers: [ContentFetchService],
  exports: [ContentFetchService],
})
export class ContentFetchModule {}
