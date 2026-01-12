// Custom enums not in Prisma
export enum RefreshType {
  FULL = "FULL",
  INCREMENTAL = "INCREMENTAL",
  DIMENSION = "DIMENSION",
}

export enum RefreshPriority {
  LOW = "LOW",
  NORMAL = "NORMAL",
  HIGH = "HIGH",
}

export enum SourceType {
  WEB = "web",
  ACADEMIC = "academic",
  NEWS = "news",
  GITHUB = "github",
  RSS = "rss",
  LOCAL = "local",
}

// Re-export Prisma enums
export {
  ResearchTopicType,
  ResearchTopicStatus,
  RefreshFrequency,
  DimensionStatus,
} from "@prisma/client";
