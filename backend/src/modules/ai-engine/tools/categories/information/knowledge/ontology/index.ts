/**
 * Ontology Action Tools — Knowledge Ontology v1 P2 + W-B
 * Provides write-side tools for the ontology graph.
 */

export { OntologyUpsertObjectTool } from "./upsert-object.tool";
export type {
  OntologyUpsertObjectInput,
  OntologyUpsertObjectOutput,
} from "./upsert-object.tool";

export { OntologyAddLinkTool } from "./add-link.tool";
export type {
  OntologyAddLinkInput,
  OntologyAddLinkOutput,
} from "./add-link.tool";

export { OntologySetConfidenceTool } from "./set-confidence.tool";
export type {
  OntologySetConfidenceInput_Tool as OntologySetConfidenceToolInput,
  OntologySetConfidenceOutput,
} from "./set-confidence.tool";

export { OntologyEditPropertyTool } from "./edit-property.tool";
export type {
  OntologyEditPropertyInput_Tool as OntologyEditPropertyToolInput,
  OntologyEditPropertyOutput,
} from "./edit-property.tool";

export { OntologyMergeObjectsTool } from "./merge-objects.tool";
export type {
  OntologyMergeObjectsInput_Tool as OntologyMergeObjectsToolInput,
  OntologyMergeObjectsOutput,
} from "./merge-objects.tool";
