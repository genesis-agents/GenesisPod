/**
 * 成员名称匹配工具函数
 *
 * 简单原则：只移除 @ 和 AI- 前缀，然后直接和真实名字匹配
 */

/**
 * 清理 AI 输出的名称，只移除 @ 和 AI- 前缀
 * 例如: "@AI-Gemini (Flash) #10" -> "Gemini (Flash) #10"
 */
export function cleanMemberName(name: string): string {
  return name
    .replace(/^@/, "") // 移除 @ 前缀
    .replace(/^AI-/i, "") // 移除 AI- 前缀
    .trim();
}

/**
 * 精确匹配成员名称
 * 直接用清理后的名字和成员真实名字匹配（忽略大小写）
 *
 * @param assigneeName - AI 输出的负责人名称
 * @param teamMembers - 团队成员列表
 * @returns 匹配的成员或 undefined
 */
export function findMemberByName<
  T extends { agentName?: string | null; displayName: string },
>(assigneeName: string, teamMembers: T[]): T | undefined {
  // 清理输入：只移除 @ 和 AI- 前缀
  const cleanedInput = cleanMemberName(assigneeName).toLowerCase();

  // 直接精确匹配（忽略大小写）
  return teamMembers.find((m) => {
    const memberName = m.agentName || m.displayName;
    return memberName.toLowerCase() === cleanedInput;
  });
}

// 保留旧函数名以兼容其他代码
export const normalizeMemberName = cleanMemberName;
