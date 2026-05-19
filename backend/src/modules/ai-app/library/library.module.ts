import { Module } from "@nestjs/common";
import { PrismaModule } from "../../../common/prisma/prisma.module";
import { LibrarySocialSourceProvider } from "./social-data-source/library-social-source.provider";

/**
 * LibraryModule
 *
 * Aggregates Library-wide cross-cutting providers. Sub-modules
 * (NotesModule, RAGModule, CollectionsModule, etc.) are registered
 * separately in app.module.ts and import their own dependencies.
 *
 * This module's sole current responsibility is to register
 * LibrarySocialSourceProvider so that user-authored Library content
 * (notes + kb-documents) is exposed as a source for AI Social content
 * generation. The provider is auto-discovered via DiscoveryService at
 * runtime (no multi-provider tokens involved).
 */
@Module({
  imports: [PrismaModule],
  providers: [
    // Social data source — auto-discovered via DiscoveryService
    LibrarySocialSourceProvider,
  ],
  exports: [LibrarySocialSourceProvider],
})
export class LibraryModule {}
