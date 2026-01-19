/**
 * AI Social 模块类型定义
 *
 * 注意：这些类型与 Prisma schema 中定义的枚举一致
 * 当 Prisma 迁移运行后，应从 @prisma/client 导入
 */

export enum SocialPlatformType {
  WECHAT_MP = "WECHAT_MP",
  XIAOHONGSHU = "XIAOHONGSHU",
}

export enum SocialContentType {
  WECHAT_ARTICLE = "WECHAT_ARTICLE",
  XIAOHONGSHU_POST = "XIAOHONGSHU_POST",
}

export enum SocialContentStatus {
  DRAFT = "DRAFT",
  PENDING = "PENDING",
  SCHEDULED = "SCHEDULED",
  PUBLISHING = "PUBLISHING",
  PUBLISHED = "PUBLISHED",
  FAILED = "FAILED",
}

export enum SocialContentSourceType {
  ORIGINAL = "ORIGINAL",
  EXPLORE_RESOURCE = "EXPLORE_RESOURCE",
  RESEARCH_REPORT = "RESEARCH_REPORT",
  OFFICE_DOCUMENT = "OFFICE_DOCUMENT",
  WRITING_CHAPTER = "WRITING_CHAPTER",
  EXTERNAL_URL = "EXTERNAL_URL",
}

export enum SocialReviewStatus {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
}

export interface SocialPlatformConnection {
  id: string;
  userId: string;
  platformType: SocialPlatformType;
  accountName?: string | null;
  accountId?: string | null;
  avatarUrl?: string | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  sessionData?: unknown;
  isActive: boolean;
  lastCheckAt?: Date | null;
  expiresAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SocialContent {
  id: string;
  userId: string;
  connectionId?: string | null;
  contentType: SocialContentType;
  sourceType: SocialContentSourceType;
  sourceId?: string | null;
  sourceUrl?: string | null;
  title?: string | null;
  content: string;
  author?: string | null;
  digest?: string | null;
  coverImageUrl?: string | null;
  images: string[];
  tags: string[];
  location?: string | null;
  status: SocialContentStatus;
  reviewStatus: SocialReviewStatus;
  reviewedBy?: string | null;
  reviewedAt?: Date | null;
  reviewNote?: string | null;
  complianceCheck?: unknown;
  scheduledAt?: Date | null;
  publishedAt?: Date | null;
  externalId?: string | null;
  externalUrl?: string | null;
  errorMessage?: string | null;
  createdAt: Date;
  updatedAt: Date;
  connection?: SocialPlatformConnection | null;
}
