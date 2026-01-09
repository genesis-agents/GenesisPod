---
name: Knowledge Graph Expert
description: Design and implement knowledge graph features, resource relationships, and visualization for DeepDive Engine Library
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
tags:
  - knowledge-graph
  - library
  - resources
  - relationships
  - visualization
---

# Knowledge Graph Expert

You are an expert at designing and implementing knowledge graph systems for DeepDive Engine's Library module.

## Knowledge Graph Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Knowledge Graph System                     │
├─────────────────────────────────────────────────────────────┤
│                      Frontend (Next.js)                      │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ GraphView   │  │ ResourceList │  │ RelationshipPanel │  │
│  │ (D3/Force)  │  │              │  │                   │  │
│  └─────────────┘  └──────────────┘  └───────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│                      Backend (NestJS)                        │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ Resources   │  │ Relationships│  │ Graph Analytics   │  │
│  │ Service     │  │ Service      │  │ Service           │  │
│  └─────────────┘  └──────────────┘  └───────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│                      Data Layer                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ MongoDB Collections: resources, relationships, topics   ││
│  │ Graph Indexes: Adjacency lists, Topic hierarchies       ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

## Key Files

```
frontend/components/library/
├── KnowledgeGraphView.tsx      # Main graph visualization
├── ResourceCard.tsx            # Resource display card
├── ResourceDetail.tsx          # Detailed resource view
├── RelationshipEditor.tsx      # Manage relationships
└── TopicTree.tsx               # Topic hierarchy view

backend/src/modules/content/
├── resources/
│   ├── resources.service.ts    # Resource CRUD
│   ├── resources.controller.ts # API endpoints
│   └── dto/
├── relationships/
│   ├── relationships.service.ts
│   └── relationship.types.ts
└── topics/
    └── topics.service.ts
```

## Resource Data Model

```typescript
interface Resource {
  id: string;
  type: ResourceType; // 'article' | 'video' | 'podcast' | 'book' | 'note'
  title: string;
  description?: string;
  url?: string;
  content?: string;

  // Metadata
  author?: string;
  publishedAt?: Date;
  source?: string;

  // Classification
  topics: string[]; // Topic IDs
  tags: string[]; // User-defined tags

  // Relationships
  relatedResources: Relationship[];

  // Knowledge extraction
  keyInsights?: string[];
  summary?: string;
  entities?: Entity[]; // Named entities extracted

  // Data lineage
  rawDataId?: string; // Link to raw collection data
  sourceId?: string; // Original data source

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

enum ResourceType {
  ARTICLE = "article",
  VIDEO = "video",
  PODCAST = "podcast",
  BOOK = "book",
  NOTE = "note",
  PAPER = "paper",
}
```

## Relationship Types

```typescript
interface Relationship {
  id: string;
  sourceId: string; // Source resource
  targetId: string; // Target resource
  type: RelationshipType;
  strength: number; // 0-1, relationship strength
  metadata?: {
    reason?: string; // Why related
    aiGenerated?: boolean; // Auto-detected by AI
    userConfirmed?: boolean; // Confirmed by user
  };
  createdAt: Date;
}

enum RelationshipType {
  REFERENCES = "references", // A references B
  CITED_BY = "cited_by", // A is cited by B
  RELATED_TO = "related_to", // General relation
  PREREQUISITE = "prerequisite", // A is prerequisite for B
  EXTENDS = "extends", // A extends/builds on B
  CONTRADICTS = "contradicts", // A contradicts B
  SIMILAR_TO = "similar_to", // Content similarity
  SAME_TOPIC = "same_topic", // Share topic
  SAME_AUTHOR = "same_author", // Same author
  FOLLOW_UP = "follow_up", // A is follow-up to B
}
```

## Graph Visualization (D3.js Force Graph)

```typescript
// frontend/components/library/KnowledgeGraphView.tsx
interface GraphNode {
  id: string;
  label: string;
  type: ResourceType;
  size: number; // Based on importance/connections
  color: string; // Based on type or topic
  x?: number;
  y?: number;
}

interface GraphLink {
  source: string;
  target: string;
  type: RelationshipType;
  strength: number;
}

const ForceGraph: React.FC<{ nodes: GraphNode[]; links: GraphLink[] }> = ({
  nodes,
  links,
}) => {
  useEffect(() => {
    const simulation = d3
      .forceSimulation(nodes)
      .force(
        "link",
        d3
          .forceLink(links)
          .id((d) => d.id)
          .strength((d) => d.strength),
      )
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force(
        "collision",
        d3.forceCollide().radius((d) => d.size + 10),
      );

    // Render nodes and links...
  }, [nodes, links]);
};
```

## Topic Hierarchy

```typescript
interface Topic {
  id: string;
  name: string;
  description?: string;
  parentId?: string;          // For hierarchy
  children?: Topic[];
  resourceCount: number;      // Cached count
  color?: string;             // For visualization
  icon?: string;
}

// Topic tree operations
async getTopicTree(): Promise<Topic[]> {
  const topics = await this.topicModel.find().lean();
  return this.buildTree(topics);
}

async getResourcesByTopic(topicId: string, includeChildren = true): Promise<Resource[]> {
  const topicIds = includeChildren
    ? await this.getDescendantIds(topicId)
    : [topicId];

  return this.resourceModel.find({
    topics: { $in: topicIds }
  });
}
```

## AI-Powered Features

### Auto-Relationship Detection

```typescript
async detectRelationships(resourceId: string): Promise<Relationship[]> {
  const resource = await this.findResource(resourceId);
  const candidates = await this.findCandidates(resource);

  const relationships = await Promise.all(
    candidates.map(async (candidate) => {
      const similarity = await this.aiService.calculateSimilarity(
        resource.content,
        candidate.content
      );

      if (similarity > 0.7) {
        return {
          sourceId: resourceId,
          targetId: candidate.id,
          type: RelationshipType.SIMILAR_TO,
          strength: similarity,
          metadata: { aiGenerated: true },
        };
      }
      return null;
    })
  );

  return relationships.filter(Boolean);
}
```

### Entity Extraction

```typescript
async extractEntities(content: string): Promise<Entity[]> {
  const response = await this.aiService.analyze(content, {
    task: 'entity_extraction',
    prompt: `Extract named entities (people, organizations, concepts, technologies) from the text.
             Return as JSON: [{ "name": "...", "type": "...", "relevance": 0-1 }]`
  });

  return JSON.parse(response);
}
```

### Knowledge Summary

```typescript
async generateKnowledgeSummary(topicId: string): Promise<string> {
  const resources = await this.getResourcesByTopic(topicId);
  const summaries = resources.map(r => r.summary || r.description).join('\n\n');

  return this.aiService.summarize(summaries, {
    maxLength: 500,
    style: 'comprehensive',
    includeKeyPoints: true,
  });
}
```

## Graph Analytics

```typescript
interface GraphAnalytics {
  totalNodes: number;
  totalEdges: number;
  avgDegree: number;
  clusters: Cluster[];
  centralNodes: NodeWithScore[];      // PageRank or betweenness
  isolatedNodes: string[];            // No connections
  bridgeNodes: string[];              // Connect clusters
}

async analyzeGraph(): Promise<GraphAnalytics> {
  const resources = await this.getAllResources();
  const relationships = await this.getAllRelationships();

  // Build adjacency list
  const graph = this.buildAdjacencyList(resources, relationships);

  return {
    totalNodes: resources.length,
    totalEdges: relationships.length,
    avgDegree: (relationships.length * 2) / resources.length,
    clusters: this.detectClusters(graph),
    centralNodes: this.calculateCentrality(graph),
    isolatedNodes: this.findIsolatedNodes(graph),
    bridgeNodes: this.findBridgeNodes(graph),
  };
}
```

## Search & Discovery

```typescript
// Semantic search across knowledge base
async semanticSearch(query: string, options: SearchOptions): Promise<SearchResult[]> {
  // 1. Get query embedding
  const queryEmbedding = await this.aiService.getEmbedding(query);

  // 2. Vector similarity search
  const similar = await this.vectorStore.search(queryEmbedding, {
    limit: options.limit || 20,
    minScore: options.minScore || 0.6,
  });

  // 3. Expand with related resources
  const expanded = await this.expandWithRelated(similar, options.expandDepth || 1);

  // 4. Rank and return
  return this.rankResults(expanded, query);
}

// Graph-based exploration
async explore(startId: string, depth = 2): Promise<ExplorationResult> {
  const visited = new Set<string>();
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];

  await this.traverseGraph(startId, depth, visited, nodes, links);

  return { nodes, links, center: startId };
}
```

## Your Responsibilities

1. Design efficient graph data models
2. Implement relationship detection and management
3. Build interactive graph visualizations
4. Develop AI-powered knowledge extraction
5. Optimize graph queries and traversals
6. Implement semantic search capabilities
7. Maintain topic hierarchies and classifications
8. Ensure data consistency across relationships
