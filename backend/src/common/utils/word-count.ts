// PR-2' v1.6 D2 派生真值 — 全项目唯一字数计算工具
// 触发原因：c195035f mission 全章节 word_count 显示 1428（LLM 输出占位），backend 不重算 → UI 假数据
// 设计原则：
//   1. backend 永远重算 wordCount，禁止信任 LLM 输出
//   2. 全项目唯一 source（feedback_no_dual_sources）；其他模块逐步迁移到此 util
//   3. Unicode code-point 迭代（[...str]）正确处理代理对（emoji 不会被拆 2）
//   4. 空白 + 控制字符（零宽空格 / 格式控制类 \p{Cf}）不计数（防 padding 攻击）

const CONTROL_FORMAT_RE = /[​-‏‪-‮⁦-⁩﻿]/g;

/**
 * 字符级真字数（中文每字 1，英文每字符 1，空白与零宽控制字符不计）。
 *
 * @example
 * countCJKWords("你好世界")            === 4   // 4 CJK
 * countCJKWords("hi world")            === 7   // h-i-w-o-r-l-d 字符级；空格不计
 * countCJKWords("你好 world\n")        === 7   // 2 CJK + 5 拉丁 + 空白被过滤
 * countCJKWords("hi​world")       === 7   // 零宽空格 U+200B 被 strip
 * countCJKWords("👋你好")              === 3   // emoji = 1 unicode code-point + 2 CJK
 */
export function countCJKWords(content: string): number {
  if (!content) return 0;
  // strip 零宽空格 / 格式控制字符（防 padding 攻击）
  const cleaned = content.replace(CONTROL_FORMAT_RE, "");
  // Unicode code-point 迭代（emoji 代理对正确计为 1）；过滤空白
  return [...cleaned].filter((ch) => !/\s/.test(ch)).length;
}
