/**
 * 成员名称匹配工具函数
 * 用于解决 AI Leader 输出的成员名称与实际系统成员不匹配的问题
 *
 * 问题背景：
 * - AI Leader 可能输出 "@AI-Gemini (Flash) #10" 这样的名称
 * - 实际系统成员可能是 "Gemini (Flash)" 或 "Gemini (Flash) #10"
 * - 需要精确匹配带编号的成员，不能把 #10 的任务分给基础成员
 */

/**
 * 清理成员名称，只移除 @ 和 AI- 前缀，保留 #N 编号
 * 例如: "@AI-Gemini (Flash) #10" -> "Gemini (Flash) #10"
 */
export function cleanMemberName(name: string): string {
  return name
    .replace(/^@/, "") // 移除 @ 前缀
    .replace(/^AI-/i, "") // 移除 AI- 前缀
    .trim();
}

/**
 * 完全标准化成员名称，移除所有前缀和后缀
 * 例如: "@AI-Gemini (Flash) #10" -> "gemini (flash)"
 */
export function normalizeMemberName(name: string): string {
  return cleanMemberName(name)
    .replace(/\s*#\d+$/, "") // 移除 #N 后缀
    .trim()
    .toLowerCase();
}

/**
 * 精确匹配成员名称
 * 优先级:
 * 1. 保留编号的精确匹配 (输入 #10 匹配成员 #10)
 * 2. 去除编号后的精确匹配 (输入 #10 匹配无编号的基础成员)
 * 3. 核心名称匹配 (去除括号内容)
 *
 * @param assigneeName - AI 输出的负责人名称
 * @param teamMembers - 团队成员列表
 * @returns 匹配的成员或 undefined
 */
export function findMemberByName<
  T extends { agentName?: string | null; displayName: string },
>(assigneeName: string, teamMembers: T[]): T | undefined {
  // 清理输入，保留 #N 编号
  const cleanedInput = cleanMemberName(assigneeName).toLowerCase();

  // 1. 首先尝试带编号的精确匹配
  // 这确保 "@AI-Gemini (Flash) #10" 匹配 "Gemini (Flash) #10" 而不是 "Gemini (Flash)"
  const exactMatchWithNumber = teamMembers.find((m) => {
    const memberName = m.agentName || m.displayName;
    const cleanedMember = cleanMemberName(memberName).toLowerCase();
    return cleanedMember === cleanedInput;
  });

  if (exactMatchWithNumber) {
    return exactMatchWithNumber;
  }

  // 2. 如果带编号匹配失败，尝试去除编号后匹配
  // 这处理 Leader 输出 "@AI-Gemini (Flash) #10" 但实际成员是 "Gemini (Flash)" 的情况
  const normalizedInput = normalizeMemberName(assigneeName);
  const exactMatch = teamMembers.find((m) => {
    const memberName = m.agentName || m.displayName;
    return normalizeMemberName(memberName) === normalizedInput;
  });

  if (exactMatch) {
    return exactMatch;
  }

  // 3. 核心名称匹配（去除括号内容）
  // 例如 "Gemini (Flash)" -> "gemini"
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

  // 4. 不使用模糊匹配，返回 undefined
  return undefined;
}
