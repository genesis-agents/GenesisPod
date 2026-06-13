/**
 * Ontology sub-module barrel
 * Exports OntologyService + all public types.
 */

export { OntologyService } from "./ontology.service";
export type {
  AuditContext,
  UpsertObjectInput,
  AddLinkInput,
  ListObjectsFilter,
  SubgraphOptions,
  OntologyObjectView,
  OntologyLinkView,
  SubgraphResult,
  OntologyObjectTypeView,
  OntologyLinkTypeView,
  UpsertObjectTypeInput,
  UpsertLinkTypeInput,
  ListTypesFilter,
  SetConfidenceInput,
  EditPropertyInput,
  MergeObjectsInput,
  ListEditsFilter,
  OntologyEditView,
} from "./ontology.types";
