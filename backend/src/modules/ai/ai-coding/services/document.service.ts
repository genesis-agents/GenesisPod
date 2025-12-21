/**
 * Document Service - 文档生成服务
 *
 * 生成 Markdown 格式的 PRD、设计文档、API 文档等
 */

import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { AiChatService } from "../../ai-core/ai-chat.service";
import { AiCodingDocumentType, Prisma } from "@prisma/client";

export interface PRDData {
  overview: string;
  userStories: Array<{ id: string; description: string; priority: string }>;
  functionalRequirements: string[];
  nonFunctionalRequirements: string[];
  acceptanceCriteria: string[];
}

export interface DesignData {
  architecture: string;
  dataModels: Array<{ name: string; fields: string[] }>;
  apiDesign: Array<{ method: string; path: string; description: string }>;
  directoryStructure: string;
}

export interface CodeData {
  files: Array<{ path: string; language: string }>;
  entryPoint: string;
  buildCommand: string;
  runCommand: string;
}

@Injectable()
export class DocumentService {
  private readonly logger = new Logger(DocumentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiChatService: AiChatService,
  ) {}

  /**
   * 生成 PRD Markdown 文档
   */
  async generatePRD(
    projectId: string,
    prdData: PRDData,
    projectInfo: {
      name: string;
      description: string;
      requirement: string;
    },
  ) {
    this.logger.log(`Generating PRD document for project ${projectId}`);

    const systemPrompt = `You are a technical writer. Convert the structured PRD data into a well-formatted Markdown document.

Include these sections:
1. Project Overview
2. User Stories (in a table format)
3. Functional Requirements
4. Non-Functional Requirements
5. Acceptance Criteria
6. Out of Scope (if applicable)

Use proper Markdown formatting with headers, tables, and bullet points.
Write in a professional, clear style.`;

    const result = await this.aiChatService.chat({
      messages: [
        {
          role: "user",
          content: `Project: ${projectInfo.name}
Description: ${projectInfo.description}
Original Requirement: ${projectInfo.requirement}

Structured PRD:
${JSON.stringify(prdData, null, 2)}

Generate a professional PRD Markdown document in Chinese.`,
        },
      ],
      systemPrompt,
      maxTokens: 4096,
      temperature: 0.5,
    });

    // 保存文档
    return this.saveDocument(projectId, AiCodingDocumentType.PRD, {
      title: `${projectInfo.name} - 产品需求文档`,
      content: result.content,
    });
  }

  /**
   * 生成设计文档（含 Mermaid 图表）
   */
  async generateDesignDoc(
    projectId: string,
    designData: DesignData,
    projectInfo: {
      name: string;
      techStack: Record<string, string>;
    },
  ) {
    this.logger.log(`Generating Design document for project ${projectId}`);

    const systemPrompt = `You are a software architect and technical writer.
Convert the structured design data into a comprehensive Markdown design document.

Include these sections with Mermaid diagrams:

1. **System Architecture**
   - Include a Mermaid flowchart diagram
   - Describe the overall system design

2. **Data Models**
   - Include a Mermaid ER diagram
   - Detail each entity and its fields

3. **API Design**
   - Include a Mermaid sequence diagram for key flows
   - API endpoint table with method, path, and description

4. **Directory Structure**
   - Code block with tree structure

5. **Technology Stack**
   - Table of technologies used

For Mermaid diagrams, use proper syntax:
\`\`\`mermaid
graph TD
    A[Client] --> B[API Gateway]
    B --> C[Service]
\`\`\`

Write in Chinese.`;

    const result = await this.aiChatService.chat({
      messages: [
        {
          role: "user",
          content: `Project: ${projectInfo.name}
Tech Stack: ${JSON.stringify(projectInfo.techStack)}

Structured Design:
${JSON.stringify(designData, null, 2)}

Generate a professional Design Document with Mermaid diagrams.`,
        },
      ],
      systemPrompt,
      maxTokens: 6000,
      temperature: 0.5,
    });

    // 提取 Mermaid 图表
    const diagrams: Array<{ type: string; code: string }> = [];
    const mermaidRegex = /```mermaid\n([\s\S]*?)```/g;
    let match;
    while ((match = mermaidRegex.exec(result.content)) !== null) {
      diagrams.push({
        type: "mermaid",
        code: match[1].trim(),
      });
    }

    // 保存文档
    return this.saveDocument(projectId, AiCodingDocumentType.DESIGN, {
      title: `${projectInfo.name} - 技术设计文档`,
      content: result.content,
      diagrams,
    });
  }

  /**
   * 生成 API 文档
   */
  async generateAPIDoc(
    projectId: string,
    apiDesign: Array<{ method: string; path: string; description: string }>,
    dataModels: Array<{ name: string; fields: string[] }>,
    projectInfo: { name: string },
  ) {
    this.logger.log(`Generating API document for project ${projectId}`);

    const systemPrompt = `You are a technical writer specializing in API documentation.
Generate comprehensive API documentation in Markdown format.

Include:
1. Overview
2. Authentication (if applicable)
3. Base URL
4. Endpoints (grouped by resource)
   - Method and Path
   - Description
   - Request parameters/body
   - Response format
   - Example request/response
5. Data Models (schemas)
6. Error Codes

Use proper Markdown formatting with code blocks for examples.
Write in Chinese.`;

    const result = await this.aiChatService.chat({
      messages: [
        {
          role: "user",
          content: `Project: ${projectInfo.name}

API Endpoints:
${JSON.stringify(apiDesign, null, 2)}

Data Models:
${JSON.stringify(dataModels, null, 2)}

Generate comprehensive API documentation.`,
        },
      ],
      systemPrompt,
      maxTokens: 6000,
      temperature: 0.5,
    });

    return this.saveDocument(projectId, AiCodingDocumentType.API, {
      title: `${projectInfo.name} - API 文档`,
      content: result.content,
    });
  }

  /**
   * 生成增强的 README
   */
  async generateREADME(
    projectId: string,
    projectInfo: {
      name: string;
      description: string;
      techStack: Record<string, string>;
    },
    outputs: {
      prd?: PRDData;
      design?: DesignData;
      code?: CodeData;
    },
  ) {
    this.logger.log(`Generating README for project ${projectId}`);

    const systemPrompt = `You are a technical writer.
Generate a professional README.md for a GitHub repository.

Include:
1. Project Title with badges (build status, license, etc. - use placeholder badges)
2. Description
3. Features (from PRD)
4. Tech Stack
5. Getting Started
   - Prerequisites
   - Installation
   - Configuration
6. Usage
7. API Reference (brief, link to docs)
8. Project Structure
9. Contributing
10. License

Write primarily in English with Chinese comments where helpful.`;

    const result = await this.aiChatService.chat({
      messages: [
        {
          role: "user",
          content: `Project: ${projectInfo.name}
Description: ${projectInfo.description}
Tech Stack: ${JSON.stringify(projectInfo.techStack)}

PRD Overview: ${outputs.prd?.overview || "N/A"}
Features: ${JSON.stringify(outputs.prd?.functionalRequirements || [])}
Directory Structure: ${outputs.design?.directoryStructure || "N/A"}
Build Command: ${outputs.code?.buildCommand || "npm run build"}
Run Command: ${outputs.code?.runCommand || "npm start"}

Generate a professional README.md.`,
        },
      ],
      systemPrompt,
      maxTokens: 4096,
      temperature: 0.5,
    });

    return this.saveDocument(projectId, AiCodingDocumentType.README, {
      title: "README",
      content: result.content,
    });
  }

  /**
   * 保存文档
   */
  private async saveDocument(
    projectId: string,
    type: AiCodingDocumentType,
    data: {
      title: string;
      content: string;
      diagrams?: Array<{ type: string; code: string }>;
    },
  ) {
    // 检查是否已存在同类型文档
    const existing = await this.prisma.aiCodingDocument.findFirst({
      where: { projectId, type },
      orderBy: { version: "desc" },
    });

    const version = existing ? existing.version + 1 : 1;

    return this.prisma.aiCodingDocument.create({
      data: {
        projectId,
        type,
        title: data.title,
        content: data.content,
        version,
        diagrams: (data.diagrams || []) as unknown as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * 获取项目的所有文档
   */
  async getProjectDocuments(projectId: string, type?: AiCodingDocumentType) {
    return this.prisma.aiCodingDocument.findMany({
      where: {
        projectId,
        ...(type && { type }),
      },
      orderBy: [{ type: "asc" }, { version: "desc" }],
    });
  }

  /**
   * 获取单个文档
   */
  async getDocumentById(docId: string, userId: string) {
    const doc = await this.prisma.aiCodingDocument.findUnique({
      where: { id: docId },
      include: {
        project: true,
      },
    });

    if (!doc || doc.project.userId !== userId) {
      throw new NotFoundException("Document not found");
    }

    return doc;
  }

  /**
   * 获取最新版本的文档
   */
  async getLatestDocument(projectId: string, type: AiCodingDocumentType) {
    return this.prisma.aiCodingDocument.findFirst({
      where: { projectId, type },
      orderBy: { version: "desc" },
    });
  }

  /**
   * 重新生成文档
   */
  async regenerateDocument(
    projectId: string,
    type: AiCodingDocumentType,
    userId: string,
  ) {
    const project = await this.prisma.aiCodingProject.findFirst({
      where: { id: projectId, userId },
    });

    if (!project) {
      throw new NotFoundException("Project not found");
    }

    const outputs = project.outputs as Record<string, unknown>;
    const techStack = project.techStack as Record<string, string>;

    switch (type) {
      case AiCodingDocumentType.PRD:
        if (outputs.prd) {
          return this.generatePRD(projectId, outputs.prd as PRDData, {
            name: project.name,
            description: project.description,
            requirement: project.requirement,
          });
        }
        break;

      case AiCodingDocumentType.DESIGN:
        if (outputs.design) {
          return this.generateDesignDoc(
            projectId,
            outputs.design as DesignData,
            {
              name: project.name,
              techStack,
            },
          );
        }
        break;

      case AiCodingDocumentType.API:
        if (outputs.design) {
          const design = outputs.design as DesignData;
          return this.generateAPIDoc(
            projectId,
            design.apiDesign || [],
            design.dataModels || [],
            { name: project.name },
          );
        }
        break;

      case AiCodingDocumentType.README:
        return this.generateREADME(
          projectId,
          {
            name: project.name,
            description: project.description,
            techStack,
          },
          {
            prd: outputs.prd as PRDData,
            design: outputs.design as DesignData,
            code: outputs.code as CodeData,
          },
        );
    }

    throw new Error(`Cannot regenerate ${type} document: missing source data`);
  }
}
