/**
 * Ontology Context Mapper
 *
 * Maps a SubgraphResult (knowledge ontology subgraph) to a MissionContextPackage
 * so that existing ontology knowledge can pre-populate the mission context before
 * Leader planning output is merged in.
 *
 * Design constraints:
 * - Zero agent/mission state: pure static mapping, no DI required.
 * - All pre-filled items carry provenance="ontology" in extensions so the
 *   write-back step can skip re-ingesting them and avoid ingestion loops.
 * - Only high-confidence nodes (confidence >= 0.6) are mapped to CoreEntity.
 * - Only high-confidence OntologyLinks (confidence >= 0.7) contribute to
 *   CoreEntity.relations.
 * - aliases are mapped to glossary (term → first alias or label).
 */

import type {
  SubgraphResult,
  OntologyObjectView,
  OntologyLinkView,
} from "@/modules/ai-engine/facade";
import type {
  MissionContextPackage,
  CoreEntity,
  EstablishedFact,
} from "@/modules/ai-harness/facade";

/** Minimum confidence to include a node as CoreEntity */
const MIN_NODE_CONFIDENCE = 0.6;
/** Minimum confidence to include a link as entity relation */
const MIN_LINK_CONFIDENCE = 0.7;

/**
 * Map a knowledge ontology subgraph to a MissionContextPackage.
 *
 * The returned package carries `extensions.provenance = "ontology"` so
 * callers can distinguish ontology-sourced items from Leader-extracted items.
 *
 * When mergeContextPackages(leaderPackage, ontologyPackage) is called the
 * Leader's entities take priority (they are added first and then ontology
 * entities only fill gaps — mergeContextPackages deduplicates by name).
 */
export function mapSubgraphToContextPackage(
  subgraph: SubgraphResult,
  generatedBy = "ontology",
): MissionContextPackage {
  // Build a lookup: id → node
  const nodeById = new Map<string, OntologyObjectView>(
    subgraph.nodes.map((n) => [n.id, n]),
  );

  // Build relation map: fromId → list of (linkTypeKey, toId)
  const relsByFrom = new Map<string, OntologyLinkView[]>();
  for (const link of subgraph.links) {
    if (link.confidence < MIN_LINK_CONFIDENCE) continue;
    const existing = relsByFrom.get(link.fromId) ?? [];
    existing.push(link);
    relsByFrom.set(link.fromId, existing);
  }

  const entities: CoreEntity[] = [];
  const glossary: Record<string, string> = {};
  const establishedFacts: EstablishedFact[] = [];

  for (const node of subgraph.nodes) {
    if (node.confidence < MIN_NODE_CONFIDENCE) continue;

    // Map aliases → glossary (first alias as the definition hint)
    if (node.aliases.length > 0) {
      glossary[node.label] = node.aliases.join(", ");
    }

    // Map relations for this node
    const rawLinks = relsByFrom.get(node.id) ?? [];
    const relations = rawLinks
      .map((link) => {
        const targetNode = nodeById.get(link.toId);
        if (!targetNode) return null;
        return {
          target: targetNode.label,
          relation: link.linkTypeKey,
        };
      })
      .filter((r): r is { target: string; relation: string } => r !== null);

    // Build properties from node.properties (string keys only)
    const attributes: Record<string, string> = {};
    for (const [k, v] of Object.entries(node.properties)) {
      if (
        typeof v === "string" ||
        typeof v === "number" ||
        typeof v === "boolean"
      ) {
        attributes[k] = String(v);
      }
    }

    const entity: CoreEntity = {
      name: node.label,
      type: node.typeKey,
      definition: `Knowledge graph node (${node.typeKey})${node.aliases.length > 0 ? `, also known as: ${node.aliases.join(", ")}` : ""}`,
      ...(Object.keys(attributes).length > 0 ? { attributes } : {}),
      ...(relations.length > 0 ? { relations } : {}),
    };

    entities.push(entity);

    // High-confidence nodes also contribute an EstablishedFact for cross-task consistency
    if (node.confidence >= 0.85) {
      establishedFacts.push({
        id: `onto-${node.id.slice(0, 8)}`,
        sourceTaskId: "ontology",
        sourceTaskTitle: "Knowledge Ontology",
        establishedAt: node.createdAt.toISOString(),
        statement: `${node.label} is a ${node.typeKey}${node.aliases.length > 0 ? ` (aliases: ${node.aliases.join(", ")})` : ""}`,
        category: "definition",
        relatedEntities: [node.label, ...node.aliases].slice(0, 5),
        importance: "medium",
      });
    }
  }

  return {
    version: "1.0",
    generatedAt: new Date().toISOString(),
    generatedBy,
    understanding: {
      summary: "",
      scope: "",
      expectedOutput: "",
    },
    hardConstraints: [],
    entities,
    prohibitions: [],
    qualityStandards: [],
    glossary,
    establishedFacts,
    extensions: {
      provenance: "ontology",
    },
  };
}

/**
 * Returns true if the given MissionContextPackage was sourced from the
 * ontology pre-load (not from Leader extraction or agent output).
 * Used by write-back logic to skip re-ingesting ontology-originated items.
 */
export function isOntologyProvenance(pkg: MissionContextPackage): boolean {
  return pkg.extensions?.["provenance"] === "ontology";
}
