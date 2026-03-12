import type { ResearchTask, ResearchTopic, TopicDimension } from "@prisma/client";
import type { ResearchDepthConfig } from "../../../types/v5-research.types";

export interface TaskExecutionContext {
  task: ResearchTask;
  topic: ResearchTopic & { dimensions: TopicDimension[] };
  missionId: string;
  reportId: string;
  depthConfig?: ResearchDepthConfig;
  assignedModelId?: string;
  assignedSkills: string[];
  assignedTools: string[];
  agentName: string;
  agentRole: string;
}

export interface TaskExecutionResult {
  summary?: string;
  content?: string;
  reportId?: string;
  chapters?: unknown[];
  status?: string;
  message?: string;
  feedback?: string;
  wordCount?: number;
  sourcesFound?: number;
  reviewedTasks?: number;
  dimensionReviews?: unknown[];
  overallReview?: unknown;
  keyFindings?: Array<
    | string
    | {
        finding: string;
        title?: string;
        significance?: string;
        evidenceIds?: string[];
      }
  >;
  analysisResult?: {
    summary?: string;
    keyFindings?: Array<
      string | { finding: string; title?: string; significance?: string }
    >;
  };
  trends?: unknown;
  challenges?: unknown;
  opportunities?: unknown;
  evidenceUsed?: number;
  confidenceLevel?: string;
  detailedContent?: string;
  figureReferences?: unknown;
  generatedCharts?: unknown;
  actualModelId?: string;
}

export interface ITaskExecutor {
  execute(context: TaskExecutionContext): Promise<TaskExecutionResult>;
}
