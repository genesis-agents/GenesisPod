/**
 * 成员名称匹配工具函数
 * 用于解决 AI Leader 输出的成员名称与实际系统成员不匹配的问题
 *
 * 问题背景：
 * - AI Leader 可能输出 "@AI-Gemini (Flash) #10" 这样的名称
 * - 实际系统成员名称是 "Gemini (Flash)"
 * - 旧的 includes() 匹配会导致所有带 #N 后缀的任务都匹配到同一个成员
 */

/**
 * 标准化成员名称，移除常见的前缀后缀
 * 例如: "@AI-Gemini (Flash) #10" -> "gemini (flash)"
 */
export function normalizeMemberName(name: string): string {
  return name
    .replace(/^@/, "") // 移除 @ 前缀
    .replace(/^AI-/i, "") // 移除 AI- 前缀
    .replace(/#\d+$/, "") // 移除 #N 后缀
    .replace(/\s+#\d+$/, "") // 移除空格+#N 后缀
    .trim()
    .toLowerCase();
}

/**
 * 精确匹配成员名称
 * 优先级: 精确匹配 > 标准化后匹配 > 核心名称匹配
 *
 * @param assigneeName - AI 输出的负责人名称
 * @param teamMembers - 团队成员列表
 * @returns 匹配的成员或 undefined
 */
export function findMemberByName<
  T extends { agentName?: string | null; displayName: string },
>(assigneeName: string, teamMembers: T[]): T | undefined {
  const normalizedInput = normalizeMemberName(assigneeName);

  // 1. 精确匹配（标准化后）
  const exactMatch = teamMembers.find((m) => {
    const memberName = m.agentName || m.displayName;
    return normalizeMemberName(memberName) === normalizedInput;
  });

  if (exactMatch) {
    return exactMatch;
  }

  // 2. 如果标准化后完全匹配失败，尝试核心名称匹配
  // 提取核心名称（去除括号内容），例如 "Gemini (Flash)" -> "gemini"
  const coreInput = normalizedInput.replace(/\s*\([^)]*\)/g, "").trim();

  if (coreInput.length > 0) {
    const coreMatch = teamMembers.find((m) => {
      const memberName = m.agentName || m.displayName;
      const coreMember = normalizeMemberName(memberName)
        .replace(/\s*\([^)]*\)/g, "")
        .trim();
      return coreMember === coreInput;
    });

    if (coreMatch) {
      return coreMatch;
    }
  }

  // 3. 不再使用模糊的 includes 匹配，返回 undefined
  // 这将导致任务无法分配，但不会错误分配
  return undefined;
}
