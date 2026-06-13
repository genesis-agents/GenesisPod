import { Module } from "@nestjs/common";
import { AiEngineModule } from "../../../ai-engine/ai-engine.module";
import { OntologyReadController } from "./ontology-read.controller";
import { OntologyWriteController } from "./ontology-write.controller";

/**
 * Ontology module — Knowledge Ontology v1.1 REST API (read + write).
 *
 * Imports AiEngineModule to obtain OntologyService (exported via ai-engine/facade).
 * Read endpoints: GET /ontology/entities, /entities/:id, /entities/:id/related,
 *   /subgraph, /types, /link-types, /edits
 * Write endpoints (JwtAuthGuard): POST /ontology/objects/:id/confidence,
 *   /objects/:id/property, /merge
 */
@Module({
  imports: [AiEngineModule],
  controllers: [OntologyReadController, OntologyWriteController],
})
export class OntologyModule {}
