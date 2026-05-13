import { Module } from "@nestjs/common";
import { SeedSyncService } from "./seed-sync.service";
import { SimulationProvidersSeeder } from "./seeders/simulation-providers.seeder";
import { YouTubeSourcesSeeder } from "./seeders/youtube-sources.seeder";

@Module({
  providers: [SeedSyncService, SimulationProvidersSeeder, YouTubeSourcesSeeder],
})
export class SeedModule {}
