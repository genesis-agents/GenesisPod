/**
 * sanitize-output.utils.ts
 *
 * 铁墙函数：基于白名单清理 LLM 输出中的所有非正文内容。
 *
 * 设计原则：不枚举 LLM 的错误模式（无穷），而是定义什么是合格内容（有限）。
 * 不在白名单中的行一律删除。
 *
 * 在三个位置调用：
 * 1. Section Writer 输出后（第一道铁墙）
 * 2. assembleFullReport 维度拼入前（第二道铁墙）
 * 3. postProcessFinalReport 最后（第三道铁墙）
 */

/**
 * 清理 LLM 输出，只保留合格的 markdown 内容行。
 *
 * 白名单规则：
 * - 空行
 * - 标题行（# ## ### ####）
 * - chart 占位符（<!-- chart:... -->）
 * - 表格行（以 | 开头）
 * - 引用块（以 > 开头）
 * - 参考文献条目（以 [N] 开头）
 * - 分隔线（---）
 * - 中文段落（含中文字符，长度 >= 10）
 * - 中文 bullet/编号列表项
 * - 代码块内容（不处理）
 */
export function sanitizeSectionOutput(content: string): string {
  if (!content) return "";

  const lines = content.split("\n");
  const cleaned: string[] = [];
  let inCodeBlock = false;

  for (const line of lines) {
    const t = line.trim();

    // 代码块内容不处理
    if (/^```/.test(t)) {
      inCodeBlock = !inCodeBlock;
      cleaned.push(line);
      continue;
    }
    if (inCodeBlock) {
      cleaned.push(line);
      continue;
    }

    // === 白名单判断 ===

    // 空行 — 保留
    if (t === "") {
      cleaned.push(line);
      continue;
    }

    // 标题 — 保留
    if (/^#{1,4}\s/.test(t)) {
      cleaned.push(line);
      continue;
    }

    // chart 占位符 — 保留
    if (/^<!--/.test(t)) {
      cleaned.push(line);
      continue;
    }

    // 表格行 — 保留
    if (/^\|/.test(t) && /\|$/.test(t)) {
      cleaned.push(line);
      continue;
    }
    // 表格分隔行
    if (/^\|[-:\s|]+\|$/.test(t)) {
      cleaned.push(line);
      continue;
    }

    // 引用块 — 保留
    if (/^>\s/.test(t)) {
      cleaned.push(line);
      continue;
    }

    // 参考文献条目 — 保留
    if (/^\[\d+\]\s/.test(t)) {
      cleaned.push(line);
      continue;
    }

    // 分隔线 — 保留
    if (/^---+$/.test(t)) {
      cleaned.push(line);
      continue;
    }

    // === 黑名单判断（明确的垃圾行）===

    // JSON 属性行："key": value
    if (/"[a-zA-Z_][\w-]*"\s*:/.test(t) && !/[\u4e00-\u9fa5]{5,}/.test(t)) {
      continue;
    }

    // 孤立 JSON 符号
    if (/^[\]}{,]+$/.test(t)) {
      continue;
    }

    // 方括号元注释：[字数约N字] [图表引用待定] [待补充] 等
    if (/^\[(?:字数|约\d|图表|待[补定完]|TODO|NOTE|内部)/.test(t)) {
      continue;
    }

    // 字数统计行
    if (/^字数[统计：:]*[：:]?\s*约?\s*\d+\s*字/.test(t)) {
      continue;
    }

    // 圆括号元注释：（注：...）（不含...）
    if (/^[（(]\s*(?:注[：:]|不含)/.test(t)) {
      continue;
    }

    // 内部配置说明行
    if (/^(?:\*{2})?以下是.*(?:图表|配置|证据|引用)/.test(t)) {
      continue;
    }

    // Figure References 标签行
    if (
      /^(?:\*{2})?(?:Figure\s*References|figureReferences)\s*[：:\[]/i.test(t)
    ) {
      continue;
    }

    // 错误图片格式 !(url)
    if (/^!\(https?:\/\//.test(t)) {
      continue;
    }

    // 裸 URL 行（不在 markdown 链接中）
    if (/^https?:\/\/\S+$/.test(t)) {
      continue;
    }

    // 其他所有内容 → 保留
    cleaned.push(line);
  }

  // 压缩三连空行
  return cleaned.join("\n").replace(/\n{3,}/g, "\n\n");
}

/**
 * 删除任何 heading（## 或 ###）后紧跟的裸 bullet list。
 *
 * 这些 bullets 通常是 LLM 对 keyPoints 的直接回显，
 * 不是正文内容。正文段落在 bullets 之后才开始。
 */
export function stripLeadingBulletLists(content: string): string {
  const lines = content.split("\n");
  const cleaned: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const t = lines[i].trim();

    // 检查是否是 heading（H2 或 H3）
    if (/^#{2,3}\s/.test(t)) {
      cleaned.push(lines[i]);
      i++;

      // 跳过空行
      while (i < lines.length && lines[i].trim() === "") {
        cleaned.push(lines[i]);
        i++;
      }

      // 检查后续是否是 3+ 连续 bullet lines
      let bulletCount = 0;
      let j = i;
      while (j < lines.length) {
        const lt = lines[j].trim();
        if (lt === "") {
          j++;
          continue;
        }
        if (/^[-*•]\s/.test(lt)) {
          bulletCount++;
          j++;
        } else {
          break;
        }
      }

      if (bulletCount >= 3) {
        // 跳过这批 bullets（包括中间的空行）
        i = j;
        // 跳过 bullets 后的空行
        while (i < lines.length && lines[i].trim() === "") {
          i++;
        }
      }
      // bulletCount < 3 的 bullet list 保留（可能是正文中合理的列表）
      continue;
    }

    cleaned.push(lines[i]);
    i++;
  }

  return cleaned.join("\n");
}

/**
 * 引用堆积拆分：单句 3+ 连续引用 → 保留前 2 个
 */
export function stripCitationStacking(content: string): string {
  return content.replace(/(\[\d+\]\s*\[\d+\])(\s*\[\d+\])+/g, "$1");
}

/**
 * 营销话术替换为中性表述
 */
export function replaceMarketingLanguage(content: string): string {
  return content
    .replace(/(?:势必|必将|注定|必然)(?:引发|带来|改写|颠覆|重塑)/g, (m) =>
      m.replace(/势必|必将|注定|必然/, "可能"),
    )
    .replace(
      /(?:不可忽视|不容忽视|值得高度关注)的(?:机遇|趋势|方向|变革)/g,
      (m) => m.replace(/不可忽视|不容忽视|值得高度关注/, "值得关注"),
    );
}
