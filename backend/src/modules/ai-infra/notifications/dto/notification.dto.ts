import {
  IsString,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsObject,
  IsUUID,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * 通知类型枚举
 */
export enum NotificationTypeDto {
  // 系统通知
  SYSTEM = "SYSTEM",
  UPDATE = "UPDATE",
  TIP = "TIP",

  // 团队/协作通知
  JOIN_REQUEST = "JOIN_REQUEST",
  JOIN_APPROVED = "JOIN_APPROVED",
  JOIN_REJECTED = "JOIN_REJECTED",
  INVITATION = "INVITATION",
  INVITATION_EXPIRED = "INVITATION_EXPIRED",

  // 研究/任务通知
  RESEARCH_COMPLETED = "RESEARCH_COMPLETED",
  MISSION_COMPLETED = "MISSION_COMPLETED",
  WRITING_COMPLETED = "WRITING_COMPLETED",
  OFFICE_COMPLETED = "OFFICE_COMPLETED",
  TASK_ASSIGNED = "TASK_ASSIGNED",
  MENTION = "MENTION",

  // 积分通知
  CREDITS_LOW = "CREDITS_LOW",
  CREDITS_RECEIVED = "CREDITS_RECEIVED",

  // 反馈通知
  FEEDBACK_REPLIED = "FEEDBACK_REPLIED",
  FEEDBACK_STATUS_CHANGED = "FEEDBACK_STATUS_CHANGED",

  // AI Social 通知
  SESSION_EXPIRED = "SESSION_EXPIRED",
}

/**
 * 创建通知 DTO
 */
export class CreateNotificationDto {
  @ApiProperty({ description: "接收通知的用户ID" })
  @IsUUID()
  userId!: string;

  @ApiProperty({ enum: NotificationTypeDto, description: "通知类型" })
  @IsEnum(NotificationTypeDto)
  type!: NotificationTypeDto;

  @ApiProperty({ description: "通知标题" })
  @IsString()
  title!: string;

  @ApiProperty({ description: "通知内容" })
  @IsString()
  message!: string;

  @ApiPropertyOptional({ description: "通知图标URL" })
  @IsOptional()
  @IsString()
  iconUrl?: string;

  @ApiPropertyOptional({ description: "操作链接" })
  @IsOptional()
  @IsString()
  actionUrl?: string;

  @ApiPropertyOptional({ description: "操作按钮文字" })
  @IsOptional()
  @IsString()
  actionLabel?: string;

  @ApiPropertyOptional({ description: "关联实体类型" })
  @IsOptional()
  @IsString()
  relatedType?: string;

  @ApiPropertyOptional({ description: "关联实体ID" })
  @IsOptional()
  @IsString()
  relatedId?: string;

  @ApiPropertyOptional({ description: "元数据" })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

/**
 * 批量创建通知 DTO
 */
export class BatchCreateNotificationDto {
  @ApiProperty({ description: "接收通知的用户ID列表" })
  @IsUUID("4", { each: true })
  userIds!: string[];

  @ApiProperty({ enum: NotificationTypeDto, description: "通知类型" })
  @IsEnum(NotificationTypeDto)
  type!: NotificationTypeDto;

  @ApiProperty({ description: "通知标题" })
  @IsString()
  title!: string;

  @ApiProperty({ description: "通知内容" })
  @IsString()
  message!: string;

  @ApiPropertyOptional({ description: "操作链接" })
  @IsOptional()
  @IsString()
  actionUrl?: string;

  @ApiPropertyOptional({ description: "操作按钮文字" })
  @IsOptional()
  @IsString()
  actionLabel?: string;

  @ApiPropertyOptional({ description: "元数据" })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

/**
 * 更新通知偏好 DTO
 */
export class UpdateNotificationPreferenceDto {
  @ApiPropertyOptional({ description: "是否启用邮件通知" })
  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;

  @ApiPropertyOptional({ description: "是否启用推送通知" })
  @IsOptional()
  @IsBoolean()
  pushEnabled?: boolean;

  @ApiPropertyOptional({ description: "是否启用通知声音" })
  @IsOptional()
  @IsBoolean()
  soundEnabled?: boolean;

  @ApiPropertyOptional({ description: "各类型通知开关" })
  @IsOptional()
  @IsObject()
  typeSettings?: Record<string, boolean>;

  @ApiPropertyOptional({ description: "免打扰开始时间 HH:mm" })
  @IsOptional()
  @IsString()
  quietHoursStart?: string;

  @ApiPropertyOptional({ description: "免打扰结束时间 HH:mm" })
  @IsOptional()
  @IsString()
  quietHoursEnd?: string;
}

/**
 * 查询通知列表参数
 */
export class GetNotificationsQueryDto {
  @ApiPropertyOptional({ description: "页码", default: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ description: "每页数量", default: 20 })
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({
    enum: NotificationTypeDto,
    description: "通知类型过滤",
  })
  @IsOptional()
  @IsEnum(NotificationTypeDto)
  type?: NotificationTypeDto;

  @ApiPropertyOptional({ description: "是否已读" })
  @IsOptional()
  @IsBoolean()
  read?: boolean;
}
