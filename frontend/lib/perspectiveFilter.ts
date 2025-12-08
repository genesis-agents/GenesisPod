import { ViewPerspective } from '@/components/simulation/PerspectiveSelector';

// Submission 类型定义
interface Submission {
  team?: string;
  role?: string;
  publicAction?: string;
  innerMonologue?: string;
  irrational?: boolean;
  chaosInjected?: boolean;
  tools?: unknown;
  agentId?: string;
  companyId?: string;
  visibility?: string;
  timestamp?: string;
}

// 过滤后的 Submission 类型
interface FilteredSubmission extends Partial<Submission> {
  isFiltered?: boolean; // 标记是否被过滤
  hiddenFields?: string[]; // 被隐藏的字段列表
}

/**
 * 根据视角过滤单个 submission 的内容
 *
 * @param submission 原始提交数据
 * @param perspective 当前视角
 * @returns 过滤后的提交数据
 */
export function filterSubmissionByPerspective(
  submission: Submission,
  perspective: ViewPerspective
): FilteredSubmission {
  // 上帝视角：返回全部内容
  if (perspective === 'GOD') {
    return { ...submission, isFiltered: false };
  }

  // 获取提交的阵营
  const submissionTeam = submission.team?.toUpperCase();

  // 同阵营：返回完整信息
  if (submissionTeam === perspective) {
    return { ...submission, isFiltered: false };
  }

  // 不同阵营：只返回公开信息，隐藏敏感字段
  const hiddenFields: string[] = [];

  if (submission.innerMonologue) {
    hiddenFields.push('innerMonologue');
  }
  if (submission.tools) {
    hiddenFields.push('tools');
  }
  if (submission.irrational !== undefined) {
    hiddenFields.push('irrational');
  }

  return {
    team: submission.team,
    role: submission.role,
    publicAction: submission.publicAction,
    agentId: submission.agentId,
    companyId: submission.companyId,
    visibility: submission.visibility,
    timestamp: submission.timestamp,
    // 隐藏敏感信息
    innerMonologue: undefined,
    tools: undefined,
    irrational: undefined,
    chaosInjected: undefined,
    // 标记
    isFiltered: true,
    hiddenFields,
  };
}

/**
 * 批量过滤 submissions
 *
 * @param submissions 原始提交数据数组
 * @param perspective 当前视角
 * @returns 过滤后的提交数据数组
 */
export function filterSubmissionsByPerspective(
  submissions: Submission[],
  perspective: ViewPerspective
): FilteredSubmission[] {
  return submissions.map((s) => filterSubmissionByPerspective(s, perspective));
}

/**
 * 检查特定内容在当前视角下是否可见
 *
 * @param perspective 当前视角
 * @param contentTeam 内容所属阵营
 * @param contentType 内容类型
 * @returns 是否可见
 */
export function isContentVisible(
  perspective: ViewPerspective,
  contentTeam: string,
  contentType: 'innerMonologue' | 'tools' | 'publicAction' | 'irrational'
): boolean {
  // 上帝视角可以看所有
  if (perspective === 'GOD') {
    return true;
  }

  // 公开行动所有视角都能看
  if (contentType === 'publicAction') {
    return true;
  }

  // 其他敏感内容只有同阵营可见
  return perspective === contentTeam?.toUpperCase();
}

/**
 * 根据视角获取可见的阵营列表（用于完整信息）
 *
 * @param perspective 当前视角
 * @returns 可见阵营列表
 */
export function getFullVisibleTeams(perspective: ViewPerspective): string[] {
  if (perspective === 'GOD') {
    return ['BLUE', 'RED', 'GREEN', 'WHITE'];
  }
  // 非上帝视角只能完整看到自己阵营
  return [perspective];
}

/**
 * 获取视角的描述文本
 *
 * @param perspective 当前视角
 * @returns 描述文本
 */
export function getPerspectiveDescription(
  perspective: ViewPerspective
): string {
  const descriptions: Record<ViewPerspective, string> = {
    GOD: '你正在以上帝视角观察，可以看到所有阵营的完整信息。',
    BLUE: '你正在以蓝军视角观察，只能看到蓝军的完整信息，其他阵营仅显示公开行动。',
    RED: '你正在以红军视角观察，只能看到红军的完整信息，其他阵营仅显示公开行动。',
    GREEN:
      '你正在以绿军视角观察，只能看到绿军的完整信息，其他阵营仅显示公开行动。',
    WHITE:
      '你正在以白方视角观察，只能看到白方的完整信息，其他阵营仅显示公开行动。',
  };
  return descriptions[perspective];
}

/**
 * 创建视角过滤上下文
 * 用于在组件中共享视角状态
 */
export interface PerspectiveFilterContext {
  perspective: ViewPerspective;
  canSeeInnerMonologue: (team: string) => boolean;
  canSeeTools: (team: string) => boolean;
  canSeeIrrational: (team: string) => boolean;
  filterSubmission: (submission: Submission) => FilteredSubmission;
  description: string;
}

export function createPerspectiveFilterContext(
  perspective: ViewPerspective
): PerspectiveFilterContext {
  return {
    perspective,
    canSeeInnerMonologue: (team: string) =>
      isContentVisible(perspective, team, 'innerMonologue'),
    canSeeTools: (team: string) => isContentVisible(perspective, team, 'tools'),
    canSeeIrrational: (team: string) =>
      isContentVisible(perspective, team, 'irrational'),
    filterSubmission: (submission: Submission) =>
      filterSubmissionByPerspective(submission, perspective),
    description: getPerspectiveDescription(perspective),
  };
}
