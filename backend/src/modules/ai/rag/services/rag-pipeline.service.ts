/**
 * RAG Pipeline Service
 * Implements the 5-stage RAG retrieval pipeline
 *
 * Pipeline Stages:
 * 1. HyDE (Hypothetical Document Embeddings) - Query enhancement
 * 2. Hybrid Search - Vector + Keyword search with RRF
 * 3. Rerank - Cohere cross-encoder reranking
 * 4. Parent Retrieval - Expand child results to parent chunks
 * 5. Context Building - Assemble final context for LLM
 */

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { AdminService } from "../../../core/admin/admin.service";
import {
  AiOrchestrationService,
  AiTaskType,
} from "../../../../common/ai-orchestration";
import { EmbeddingService } from "./embedding.service";
import {
  RAGQuery,
  RAGResponse,
  RAGContext,
  SearchResult,
  ContextSource,
  HybridSearchParams,
} from "../interfaces/rag.interfaces";

const DEFAULT_TOP_K = 10;
const DEFAULT_HYBRID_ALPHA = 0.5; // Balance between vector and keyword
const MAX_CONTEXT_TOKENS = 8000;
const RERANK_MODEL = "rerank-v3.5";

@Injectable()
export class RAGPipelineService {
  private readonly logger = new Logger(RAGPipelineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly adminService: AdminService,
    private readonly embeddingService: EmbeddingService,
    private readonly aiService: AiOrchestrationService,
  ) {}

  /**
   * Execute the full RAG pipeline
   */
  async query(request: RAGQuery): Promise<RAGResponse> {
    const startTime = Date.now();
    const options = {
      topK: request.options?.topK ?? DEFAULT_TOP_K,
      useHyde: request.options?.useHyde ?? true,
      useRerank: request.options?.useRerank ?? true,
      hybridAlpha: request.options?.hybridAlpha ?? DEFAULT_HYBRID_ALPHA,
      minScore: request.options?.minScore ?? 0.3,
      includeMetadata: request.options?.includeMetadata ?? true,
    };

    let hydeQuery: string | undefined;
    let hydeTime: number | undefined;

    // Stage 1: HyDE - Generate hypothetical document
    if (options.useHyde) {
      const hydeStart = Date.now();
      hydeQuery = await this.generateHypotheticalDocument(request.query);
      hydeTime = Date.now() - hydeStart;
      this.logger.debug(`HyDE generated in ${hydeTime}ms`);
    }

    // Stage 2: Hybrid Search
    const searchStart = Date.now();
    const queryForSearch = hydeQuery || request.query;
    const queryEmbedding =
      await this.embeddingService.generateEmbedding(queryForSearch);

    const searchResults = await this.hybridSearch({
      queryEmbedding: queryEmbedding.embedding,
      queryText: request.query, // Use original query for keyword search
      knowledgeBaseIds: request.knowledgeBaseIds,
      topK: options.topK * 3, // Get more results for reranking
      alpha: options.hybridAlpha,
    });
    const searchTime = Date.now() - searchStart;
    this.logger.debug(`Hybrid search completed in ${searchTime}ms`);

    // Stage 3: Rerank
    let rerankTime: number | undefined;
    let rankedResults = searchResults;

    if (options.useRerank && searchResults.length > 0) {
      const rerankStart = Date.now();
      try {
        rankedResults = await this.rerankResults(
          request.query,
          searchResults,
          options.topK,
        );
        rerankTime = Date.now() - rerankStart;
        this.logger.debug(`Reranking completed in ${rerankTime}ms`);
      } catch (error) {
        this.logger.warn(`Reranking failed, using search scores: ${error}`);
        rankedResults = searchResults.slice(0, options.topK);
      }
    } else {
      rankedResults = searchResults.slice(0, options.topK);
    }

    // Stage 4 & 5: Parent Retrieval and Context Building
    const context = await this.buildContext(rankedResults, options.minScore);

    const totalTime = Date.now() - startTime;
    this.logger.log(
      `RAG pipeline completed in ${totalTime}ms (hyde: ${hydeTime || 0}ms, search: ${searchTime}ms, rerank: ${rerankTime || 0}ms)`,
    );

    return {
      context,
      hydeQuery,
      searchResults: rankedResults,
      processingTime: {
        hyde: hydeTime,
        search: searchTime,
        rerank: rerankTime,
        total: totalTime,
      },
    };
  }

  /**
   * Stage 1: Generate hypothetical document using HyDE
   */
  private async generateHypotheticalDocument(query: string): Promise<string> {
    const systemPrompt = `You are a helpful assistant that generates a hypothetical document passage that would perfectly answer the given query.
Generate a detailed, factual-sounding passage (2-3 paragraphs) that would contain the answer to the query.
Do not mention that this is hypothetical. Write as if this is actual content from a document.
Focus on being specific and informative.`;

    const response = await this.aiService.call({
      taskType: AiTaskType.CHAT,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Query: ${query}` },
      ],
      temperature: 0.3,
      maxTokens: 500,
      modelId: "gpt-4o-mini",
    });

    return response.content || query;
  }

  /**
   * Stage 2: Hybrid search combining vector similarity and keyword matching
   */
  private async hybridSearch(
    params: HybridSearchParams,
  ): Promise<SearchResult[]> {
    const { queryEmbedding, queryText, knowledgeBaseIds, topK, alpha } = params;

    // Build the embedding string for pgvector
    const embeddingStr = `[${queryEmbedding.join(",")}]`;

    // Use the hybrid_search function if available, otherwise use vector search
    try {
      const results = await this.prisma.$queryRaw<
        Array<{
          child_chunk_id: string;
          parent_chunk_id: string;
          document_id: string;
          child_content: string;
          parent_content: string;
          rrf_score: number;
          vector_score: number;
          vector_rank: number | null;
          keyword_rank: number | null;
        }>
      >`
        SELECT
          ce.child_chunk_id,
          cc.parent_chunk_id,
          pc.document_id,
          cc.content as child_content,
          pc.content as parent_content,
          (
            COALESCE(${alpha}::float / (60 + (
              SELECT COUNT(*) + 1
              FROM child_embeddings ce2
              WHERE ce2.child_chunk_id IN (
                SELECT c.id FROM child_chunks c
                JOIN parent_chunks p ON c.parent_chunk_id = p.id
                JOIN knowledge_base_documents d ON p.document_id = d.id
                WHERE d.knowledge_base_id = ANY(${knowledgeBaseIds}::uuid[])
              )
              AND (ce2.embedding <=> ${embeddingStr}::vector) < (ce.embedding <=> ${embeddingStr}::vector)
            )), 0) +
            COALESCE((1 - ${alpha}::float) / (60 + (
              SELECT COUNT(*) + 1
              FROM child_chunks c2
              JOIN parent_chunks p2 ON c2.parent_chunk_id = p2.id
              JOIN knowledge_base_documents d2 ON p2.document_id = d2.id
              WHERE d2.knowledge_base_id = ANY(${knowledgeBaseIds}::uuid[])
              AND to_tsvector('english', c2.content) @@ plainto_tsquery('english', ${queryText})
              AND ts_rank(to_tsvector('english', c2.content), plainto_tsquery('english', ${queryText})) >
                  ts_rank(to_tsvector('english', cc.content), plainto_tsquery('english', ${queryText}))
            )), 0)
          ) as rrf_score,
          1 - (ce.embedding <=> ${embeddingStr}::vector) as vector_score
        FROM child_embeddings ce
        JOIN child_chunks cc ON ce.child_chunk_id = cc.id
        JOIN parent_chunks pc ON cc.parent_chunk_id = pc.id
        JOIN knowledge_base_documents d ON pc.document_id = d.id
        WHERE d.knowledge_base_id = ANY(${knowledgeBaseIds}::uuid[])
        ORDER BY ce.embedding <=> ${embeddingStr}::vector
        LIMIT ${topK}
      `;

      return results.map((r) => ({
        childChunkId: r.child_chunk_id,
        parentChunkId: r.parent_chunk_id,
        documentId: r.document_id,
        content: r.child_content,
        parentContent: r.parent_content,
        score: r.rrf_score || r.vector_score || 0,
        vectorScore: r.vector_score || undefined,
      }));
    } catch (error) {
      this.logger.warn(
        `Hybrid search failed, falling back to vector search: ${error}`,
      );
      return this.vectorSearch(queryEmbedding, knowledgeBaseIds, topK);
    }
  }

  /**
   * Fallback: Pure vector search
   */
  private async vectorSearch(
    queryEmbedding: number[],
    knowledgeBaseIds: string[],
    topK: number,
  ): Promise<SearchResult[]> {
    const embeddingStr = `[${queryEmbedding.join(",")}]`;

    const results = await this.prisma.$queryRaw<
      Array<{
        child_chunk_id: string;
        parent_chunk_id: string;
        document_id: string;
        child_content: string;
        parent_content: string;
        distance: number;
      }>
    >`
      SELECT
        ce.child_chunk_id,
        cc.parent_chunk_id,
        pc.document_id,
        cc.content as child_content,
        pc.content as parent_content,
        ce.embedding <=> ${embeddingStr}::vector as distance
      FROM child_embeddings ce
      JOIN child_chunks cc ON ce.child_chunk_id = cc.id
      JOIN parent_chunks pc ON cc.parent_chunk_id = pc.id
      JOIN knowledge_base_documents d ON pc.document_id = d.id
      WHERE d.knowledge_base_id = ANY(${knowledgeBaseIds}::uuid[])
      ORDER BY ce.embedding <=> ${embeddingStr}::vector
      LIMIT ${topK}
    `;

    return results.map((r) => ({
      childChunkId: r.child_chunk_id,
      parentChunkId: r.parent_chunk_id,
      documentId: r.document_id,
      content: r.child_content,
      parentContent: r.parent_content,
      score: 1 - r.distance, // Convert distance to similarity score
      vectorScore: 1 - r.distance,
    }));
  }

  /**
   * Stage 3: Rerank results using Cohere
   */
  private async rerankResults(
    query: string,
    results: SearchResult[],
    topK: number,
  ): Promise<SearchResult[]> {
    const cohereApiKey = await this.adminService.getCohereApiKey();

    if (!cohereApiKey) {
      this.logger.warn("Cohere API key not configured, skipping rerank");
      return results.slice(0, topK);
    }

    // Call Cohere Rerank API
    const response = await fetch("https://api.cohere.com/v2/rerank", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cohereApiKey}`,
      },
      body: JSON.stringify({
        model: RERANK_MODEL,
        query,
        documents: results.map((r) => r.content),
        top_n: topK,
        return_documents: false,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Cohere rerank failed: ${error}`);
    }

    const data = await response.json();

    // Reorder results based on rerank scores
    const rerankedResults: SearchResult[] = data.results.map(
      (r: { index: number; relevance_score: number }) => ({
        ...results[r.index],
        rerankScore: r.relevance_score,
        score: r.relevance_score, // Use rerank score as primary score
      }),
    );

    return rerankedResults;
  }

  /**
   * Stage 4 & 5: Build context from parent chunks
   */
  private async buildContext(
    results: SearchResult[],
    minScore: number,
  ): Promise<RAGContext> {
    // Filter by minimum score
    const filteredResults = results.filter((r) => r.score >= minScore);

    if (filteredResults.length === 0) {
      return {
        text: "",
        sources: [],
        totalTokens: 0,
      };
    }

    // Get unique parent chunks
    const parentChunkIds = [
      ...new Set(filteredResults.map((r) => r.parentChunkId)),
    ];

    // Fetch parent chunks with document info
    const parentChunks = await this.prisma.parentChunk.findMany({
      where: {
        id: { in: parentChunkIds },
      },
      include: {
        document: {
          select: {
            id: true,
            title: true,
            sourceUrl: true,
            metadata: true,
          },
        },
      },
    });

    // Build context text and sources
    const sources: ContextSource[] = [];
    const contextParts: string[] = [];
    let totalTokens = 0;

    // Sort by score and add to context until token limit
    const sortedParents = parentChunks.sort((a, b) => {
      const scoreA =
        filteredResults.find((r) => r.parentChunkId === a.id)?.score || 0;
      const scoreB =
        filteredResults.find((r) => r.parentChunkId === b.id)?.score || 0;
      return scoreB - scoreA;
    });

    for (const parent of sortedParents) {
      const estimatedTokens = parent.tokenCount || parent.content.length / 4;

      if (totalTokens + estimatedTokens > MAX_CONTEXT_TOKENS) {
        break;
      }

      // Build location string for source citation
      const locationParts: string[] = [];
      if (parent.pageStart) {
        locationParts.push(
          parent.pageEnd && parent.pageEnd !== parent.pageStart
            ? `Page ${parent.pageStart}-${parent.pageEnd}`
            : `Page ${parent.pageStart}`,
        );
      }
      if (parent.sectionTitle) {
        locationParts.push(parent.sectionTitle);
      }
      const locationStr =
        locationParts.length > 0 ? ` (${locationParts.join(", ")})` : "";

      contextParts.push(
        `[${sources.length + 1}] ${parent.document.title}${locationStr}\n${parent.content}`,
      );
      totalTokens += estimatedTokens;

      const matchingResult = filteredResults.find(
        (r) => r.parentChunkId === parent.id,
      );

      sources.push({
        documentId: parent.document.id,
        documentTitle: parent.document.title,
        chunkId: parent.id,
        excerpt: parent.content.substring(0, 200) + "...",
        score: matchingResult?.score || 0,
        pageStart: parent.pageStart || undefined,
        pageEnd: parent.pageEnd || undefined,
        sectionTitle: parent.sectionTitle || undefined,
        metadata: parent.document.metadata as Record<string, any>,
      });
    }

    return {
      text: contextParts.join("\n\n---\n\n"),
      sources,
      totalTokens,
    };
  }

  /**
   * Simple query without the full pipeline (for testing)
   */
  async simpleQuery(
    query: string,
    knowledgeBaseIds: string[],
    topK: number = 5,
  ): Promise<SearchResult[]> {
    const embedding = await this.embeddingService.generateEmbedding(query);
    return this.vectorSearch(embedding.embedding, knowledgeBaseIds, topK);
  }
}
