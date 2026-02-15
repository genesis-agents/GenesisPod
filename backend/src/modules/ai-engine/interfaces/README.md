# AI Engine Interfaces - 依赖反转实现

## 概述

本目录包含 AI Engine 对上层 AI Apps 模块的抽象接口定义，实现了依赖反转原则 (Dependency Inversion Principle)。

## 架构原则

```
AI Engine (核心层)
    ↓ 依赖接口
[Interface Layer]
    ↑ 实现接口
AI Apps (应用层)
```

**核心思想**: AI Engine 定义接口，AI Apps 实现接口，通过 NestJS 的依赖注入连接。

## 接口列表

### 1. IResearchService

**位置**: `research.interface.ts`
**Token**: `RESEARCH_SERVICE_TOKEN`
**使用者**: `ResearcherAgent`
**实现者**: `backend/src/modules/ai-app/research/project/`

**方法**:

- `createProject(userId, title, description)` - 创建研究项目
- `saveResearchOutput(userId, projectId, content, metadata)` - 保存研究输出
- `searchProjectSources(projectId, query)` - 搜索项目资源 (可选)

### 2. ISimulationService

**位置**: `simulation.interface.ts`
**Token**: `SIMULATION_SERVICE_TOKEN`
**使用者**: `SimulatorAgent`
**实现者**: `backend/src/modules/ai-app/simulation/`

**方法**:

- `createScenario(userId, name, description, config)` - 创建推演场景
- `executeSimulationRound(scenarioId, roundNumber, actions)` - 执行推演轮次 (可选)
- `getSimulationResults(scenarioId)` - 获取推演结果 (可选)

### 3. IImageGenerationService

**位置**: `image.interface.ts`
**Token**: `IMAGE_GENERATION_SERVICE_TOKEN`
**使用者**: `ImageDesignerAgent`
**实现者**: `backend/src/modules/ai-app/image/`

**方法**:

- `generateImage(params)` - 生成图像
- `enhancePrompt(prompt, style)` - 增强 Prompt (可选)
- `generateInfographic(params)` - 生成信息图表 (可选)

### 4. IRAGPipelineService

**位置**: `rag.interface.ts`
**Token**: `RAG_PIPELINE_SERVICE_TOKEN`
**使用者**: `AiCoreController`
**实现者**: `backend/src/modules/ai-app/rag/`

**方法**:

- `query(request)` - 执行 RAG 查询

## 如何在 AI Apps 中注册实现

### 方式 1: 在具体模块中提供 (推荐)

```typescript
// backend/src/modules/ai-app/research/project/research-project.module.ts
import { Module } from "@nestjs/common";
import { RESEARCH_SERVICE_TOKEN } from "../../../ai-engine/interfaces";
import { ResearchProjectService } from "./research-project.service";

@Module({
  providers: [
    ResearchProjectService,
    {
      provide: RESEARCH_SERVICE_TOKEN,
      useExisting: ResearchProjectService,
    },
  ],
  exports: [RESEARCH_SERVICE_TOKEN],
})
export class ResearchProjectModule {}
```

### 方式 2: 创建适配器类

```typescript
// backend/src/modules/ai-app/research/adapters/research-service.adapter.ts
import { Injectable } from "@nestjs/common";
import { IResearchService } from "../../../ai-engine/interfaces";
import { ResearchProjectService } from "../project/research-project.service";
import { ResearchProjectOutputService } from "../project/research-project-output.service";

@Injectable()
export class ResearchServiceAdapter implements IResearchService {
  constructor(
    private readonly projectService: ResearchProjectService,
    private readonly outputService: ResearchProjectOutputService,
  ) {}

  async createProject(userId: string, title: string, description?: string) {
    return this.projectService.createProject({ userId, title, description });
  }

  async saveResearchOutput(
    userId: string,
    projectId: string,
    content: string,
    metadata?: Record<string, any>,
  ) {
    return this.outputService.generateOutput({
      userId,
      projectId,
      content,
      metadata,
    });
  }
}

// 在 module 中注册
@Module({
  providers: [
    ResearchServiceAdapter,
    {
      provide: RESEARCH_SERVICE_TOKEN,
      useExisting: ResearchServiceAdapter,
    },
  ],
  exports: [RESEARCH_SERVICE_TOKEN],
})
export class ResearchProjectModule {}
```

## 验证依赖关系

### 检查是否有循环依赖

```bash
# 使用 madge 检查循环依赖
npx madge --circular --extensions ts backend/src/modules/ai-engine/
npx madge --circular --extensions ts backend/src/modules/ai-app/
```

### 架构层次验证

```
正确: AI Apps -> AI Engine
错误: AI Engine -> AI Apps (直接导入)
正确: AI Engine -> Interfaces <- AI Apps (通过接口)
```

## 注意事项

1. **接口是可选的**: 使用 `@Optional()` 装饰器，Agent 在没有实现时会降级运行
2. **保持接口稳定**: 接口变更会影响所有实现者，应谨慎设计
3. **避免过度抽象**: 只对真正需要解耦的依赖创建接口
4. **文档同步**: 接口变更时同步更新此 README

## 相关文档

- [AI 架构分层规范](../../../../docs/skills/ai/ai-architecture-layering/SKILL.md)
- [依赖注入最佳实践](https://docs.nestjs.com/fundamentals/custom-providers)
