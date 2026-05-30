import { NotFoundException } from "@nestjs/common";
import { ContentVisibility } from "@prisma/client";

/**
 * 资源访问收口（IDOR 修复）—— 统一 ownership / visibility 判定的纯逻辑助手。
 *
 * 与 `common/visibility/visibleWhere`（列表过滤）互补：本助手做**单资源读访问**
 * 的逐条判定，覆盖 controller 拿到具体资源后的 200/404 决策。
 *
 * 放行条件（任一满足）：
 *  1. own —— `resource.userId === requester.userId`
 *  2. SHARED + 同 Topic 成员 —— `visibility === SHARED` 且 `topicId` 非空且
 *     requester 是该 Topic 的 TopicMember（通过注入的 `isTopicMember` 回调查询）
 *  3. PUBLIC —— `visibility === PUBLIC`
 *
 * 无权时抛 `NotFoundException`（404，不泄露资源存在性），而非 403。
 *
 * 纯逻辑 + 强类型：TopicMember 查询通过 `deps.isTopicMember` 回调注入，本助手
 * 不直连 DB，保持可单测。
 */

export interface ResourceAccessSubject {
  /** 资源所有者 userId。 */
  readonly userId: string;
  /** 资源可见性档位。缺省按 PRIVATE 处理（仅所有者）。 */
  readonly visibility?: ContentVisibility | null;
  /** 关联 Topic（SHARED 协作判定用）。无则 SHARED 不放行非所有者。 */
  readonly topicId?: string | null;
}

export interface ResourceAccessRequester {
  readonly userId: string;
}

export interface ResourceAccessDeps {
  /** SHARED + topicId 场景下查 requester 是否为该 Topic 成员。 */
  readonly isTopicMember?: (
    topicId: string,
    userId: string,
  ) => Promise<boolean>;
}

/**
 * 判定 requester 能否读访问 resource，无权抛 404。
 *
 * @throws NotFoundException 当 requester 既非所有者、又非 SHARED 成员、且非 PUBLIC。
 */
export async function assertResourceAccess(
  resource: ResourceAccessSubject,
  requester: ResourceAccessRequester,
  deps: ResourceAccessDeps = {},
): Promise<void> {
  // 1. own
  if (resource.userId === requester.userId) return;

  const visibility = resource.visibility ?? ContentVisibility.PRIVATE;

  // 3. PUBLIC（先判：无需 Topic 查询）
  if (visibility === ContentVisibility.PUBLIC) return;

  // 2. SHARED + 同 Topic 成员
  if (
    visibility === ContentVisibility.SHARED &&
    resource.topicId &&
    deps.isTopicMember &&
    (await deps.isTopicMember(resource.topicId, requester.userId))
  ) {
    return;
  }

  // 无权 → 404（不泄露存在性）
  throw new NotFoundException("Resource not found");
}
