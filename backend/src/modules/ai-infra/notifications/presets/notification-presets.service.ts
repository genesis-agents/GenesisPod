import { Injectable } from "@nestjs/common";
import { NotificationService } from "../notification.service";
import { NotificationTypeDto } from "../dto/notification.dto";

@Injectable()
export class NotificationPresetsService {
  constructor(private readonly notificationService: NotificationService) {}

  async notifyJoinRequest(params: {
    topicId: string;
    topicName: string;
    applicantId: string;
    applicantName: string;
    adminUserIds: string[];
  }) {
    const { topicId, topicName, applicantId, applicantName, adminUserIds } =
      params;

    await this.notificationService.batchCreateNotifications({
      userIds: adminUserIds,
      type: NotificationTypeDto.JOIN_REQUEST,
      title: "新的加入申请",
      message: `${applicantName} 申请加入「${topicName}」`,
      actionUrl: `/topics/${topicId}/settings/members`,
      actionLabel: "查看申请",
      metadata: { topicId, applicantId, applicantName },
    });
  }

  async notifyJoinRequestResult(params: {
    userId: string;
    topicId: string;
    topicName: string;
    approved: boolean;
    reason?: string;
  }) {
    const { userId, topicId, topicName, approved, reason } = params;

    await this.notificationService.createNotification({
      userId,
      type: approved
        ? NotificationTypeDto.JOIN_APPROVED
        : NotificationTypeDto.JOIN_REJECTED,
      title: approved ? "申请已通过" : "申请未通过",
      message: approved
        ? `你加入「${topicName}」的申请已通过`
        : `你加入「${topicName}」的申请未通过${reason ? `：${reason}` : ""}`,
      actionUrl: approved ? `/topics/${topicId}` : undefined,
      actionLabel: approved ? "进入团队" : undefined,
      relatedType: "topic",
      relatedId: topicId,
      metadata: { topicId, approved, reason },
    });
  }

  async notifyInvitation(params: {
    userId: string;
    topicId: string;
    topicName: string;
    inviterName: string;
    inviteCode?: string;
  }) {
    const { userId, topicId, topicName, inviterName, inviteCode } = params;

    await this.notificationService.createNotification({
      userId,
      type: NotificationTypeDto.INVITATION,
      title: "邀请加入团队",
      message: `${inviterName} 邀请你加入「${topicName}」`,
      actionUrl: inviteCode
        ? `/invitations/${inviteCode}`
        : `/topics/${topicId}`,
      actionLabel: "查看邀请",
      relatedType: "topic",
      relatedId: topicId,
      metadata: { topicId, inviterName, inviteCode },
    });
  }

  async notifyResearchCompleted(params: {
    userId: string;
    researchId: string;
    researchTitle: string;
  }) {
    const { userId, researchId, researchTitle } = params;

    await this.notificationService.createNotification({
      userId,
      type: NotificationTypeDto.RESEARCH_COMPLETED,
      title: "研究任务完成",
      message: `研究「${researchTitle}」已完成`,
      actionUrl: `/research/${researchId}`,
      actionLabel: "查看报告",
      relatedType: "research",
      relatedId: researchId,
    });
  }

  /**
   * 长任务 mission 完成通知（上层消费方按业务侧含义传 missionTitle）。
   * W4 (2026-05-05): 切到独立 MISSION_COMPLETED 枚举（schema 已迁移）；
   * appBasePath / relatedType 由消费方传入，ai-infra 不感知具体业务路由。
   */
  async notifyMissionCompleted(params: {
    userId: string;
    missionId: string;
    missionTitle: string;
    /** 业务侧应用根路径（如 "/<app>/missions"），由上层消费方传入；ai-infra 不感知具体业务路由 */
    appBasePath: string;
    /** relatedType 由上层消费方提供（数据字段不参与命名校验）*/
    relatedType: string;
    reviewScore?: number;
  }) {
    const {
      userId,
      missionId,
      missionTitle,
      appBasePath,
      relatedType,
      reviewScore,
    } = params;
    const scoreSuffix =
      typeof reviewScore === "number" ? `（评分 ${reviewScore}）` : "";

    await this.notificationService.createNotification({
      userId,
      type: NotificationTypeDto.MISSION_COMPLETED,
      title: "Mission 已完成",
      message: `「${missionTitle}」已完成${scoreSuffix}`,
      // ★ 2026-05-06: 路由段 "/team/" 由消费方约定（前端真实 mission 详情路由）
      //   旧值 "/missions/" 与前端不一致导致 404；ai-infra 不感知具体业务名
      actionUrl: `${appBasePath}/team/${missionId}`,
      actionLabel: "查看报告",
      relatedType,
      relatedId: missionId,
      metadata: { reviewScore },
    });
  }

  /**
   * 长篇写作任务完成通知（章节 / 全文）。
   * appBasePath / relatedType 由消费方传入（ai-infra 不感知 ai-writing/* 路由命名）。
   */
  async notifyWritingTaskCompleted(params: {
    userId: string;
    projectId: string;
    missionId: string;
    projectName: string;
    missionType: string;
    /** 业务侧应用根路径（如 "/<app>/projects"），由上层消费方传入 */
    appBasePath: string;
    /** relatedType 由上层消费方提供（数据字段不参与命名校验） */
    relatedType: string;
    totalWords?: number;
  }) {
    const {
      userId,
      projectId,
      missionId,
      projectName,
      missionType,
      appBasePath,
      relatedType,
      totalWords,
    } = params;
    const wordsSuffix =
      typeof totalWords === "number" ? `（${totalWords} 字）` : "";

    await this.notificationService.createNotification({
      userId,
      type: NotificationTypeDto.WRITING_COMPLETED,
      title: "写作任务已完成",
      message: `「${projectName}」的 ${missionType} 已生成完毕${wordsSuffix}`,
      actionUrl: `${appBasePath}/${projectId}`,
      actionLabel: "查看作品",
      relatedType,
      relatedId: missionId,
      metadata: { projectId, missionType, totalWords },
    });
  }

  /**
   * Slides 生成完成通知。
   * appBasePath / relatedType 由消费方传入（ai-infra 不感知 ai-office/* 路由命名）。
   */
  async notifyOfficeSlidesCompleted(params: {
    userId: string;
    missionId: string;
    title: string;
    /** 业务侧应用根路径（如 "/<app>/slides"），由上层消费方传入 */
    appBasePath: string;
    /** relatedType 由上层消费方提供 */
    relatedType: string;
    pageCount?: number;
  }) {
    const { userId, missionId, title, appBasePath, relatedType, pageCount } =
      params;
    const pagesSuffix =
      typeof pageCount === "number" ? `（共 ${pageCount} 页）` : "";

    await this.notificationService.createNotification({
      userId,
      type: NotificationTypeDto.OFFICE_COMPLETED,
      title: "Slides 生成完成",
      message: `「${title}」已生成完毕${pagesSuffix}`,
      actionUrl: `${appBasePath}/${missionId}`,
      actionLabel: "查看演示",
      relatedType,
      relatedId: missionId,
      metadata: { pageCount },
    });
  }

  async notifyCreditsLow(params: {
    userId: string;
    balance: number;
    threshold: number;
  }) {
    const { userId, balance, threshold } = params;

    await this.notificationService.createNotification({
      userId,
      type: NotificationTypeDto.CREDITS_LOW,
      title: "积分余额不足",
      message: `你的积分余额仅剩 ${balance}，低于 ${threshold}`,
      actionUrl: "/credits",
      actionLabel: "查看积分",
      metadata: { balance, threshold },
    });
  }
}
