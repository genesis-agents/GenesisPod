/**
 * AI Engine Memory Module
 * 记忆系统子模块
 *
 * 提供:
 * - Short-term Memory
 * - Long-term Memory
 * - In-memory Store
 * - Conversation Memory
 */

import { Module } from "@nestjs/common";
import { PrismaModule } from "../../common/prisma/prisma.module";

// Memory Stores
import { ShortTermMemoryService } from "./knowledge/memory/stores/short-term-memory.service";
import { LongTermMemoryService } from "./knowledge/memory/stores/long-term-memory.service";
import {
  InMemoryStore,
  ConversationMemory,
} from "./knowledge/memory/stores/in-memory-store";
// Memory Coordinator (支柱三)
import { MemoryCoordinatorService } from "./knowledge/memory/memory-coordinator.service";
// Layer 4: Knowledge Graph
import { KnowledgeGraphTool } from "./tools/categories/information/knowledge/knowledge-graph.tool";

/**
 * In-memory Store Factory
 */
const inMemoryStoreFactory = {
  provide: InMemoryStore,
  useFactory: () => {
    return new InMemoryStore();
  },
};

/**
 * Conversation Memory Factory
 */
const conversationMemoryFactory = {
  provide: ConversationMemory,
  useFactory: () => {
    return new ConversationMemory();
  },
};

@Module({
  imports: [PrismaModule],
  providers: [
    // Stores
    inMemoryStoreFactory,
    conversationMemoryFactory,

    // Services
    ShortTermMemoryService,
    LongTermMemoryService,
    MemoryCoordinatorService,

    // Layer 4: Knowledge Graph Tool (@Optional injection in MemoryCoordinator)
    KnowledgeGraphTool,
  ],
  exports: [
    InMemoryStore,
    ConversationMemory,
    ShortTermMemoryService,
    LongTermMemoryService,
    MemoryCoordinatorService,
  ],
})
export class AiEngineMemoryModule {}
