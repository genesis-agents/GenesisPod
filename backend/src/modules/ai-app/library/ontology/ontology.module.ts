import { Module } from "@nestjs/common";
import { AiEngineModule } from "../../../ai-engine/ai-engine.module";
import { OntologyReadController } from "./ontology-read.controller";

/**
 * Ontology read module — Knowledge Ontology v1.1 REST API.
 *
 * Imports AiEngineModule to obtain OntologyService (exported via ai-engine/facade).
 * Exposes read-only endpoints under the "ontology" route prefix.
 */
@Module({
  imports: [AiEngineModule],
  controllers: [OntologyReadController],
})
export class OntologyModule {}
