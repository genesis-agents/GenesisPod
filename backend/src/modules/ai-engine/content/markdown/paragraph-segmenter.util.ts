/**
 * paragraph-segmenter.util.ts — 2026-06-15
 *
 * 背景：部分章节写手输出把整节正文写成「一坨」——句子用 。！？ 连续相接、无段落
 * 空行（`\n\n`），渲染成一面墙文字，与其他正常分段的章节视觉不一致
 * （生产实证 mission c80a3864：252 正文块里 23 块是 >500 字 0 空行的 run-on）。
 *
 * 本工具把这类「超长且无段落空行」的纯散文段，按句末（。！？）切成若干自然段，
 * 使其与正常段落观感一致。**fence-aware + 结构保护**：跳过代码块 / 列表 / 表格 /
 * 标题 / 引用 / 图占位 / 数学块，只动纯散文。
 *
 * 前端 ArtifactMarkdown 有同款实现（frontend/lib/markdown/segmentParagraphs.ts），
 * 两侧算法保持一致：后端治本（新报告落库即分段），前端治存量（历史报告渲染时分段）。
 */

/** 仅当一段散文超过此长度才考虑切分（短段不动，避免切碎成单句）。 */
const RUNON_MIN_CHARS = 240;
/** 至少这么多句才切（避免把 2 句长段切开）。 */
const MIN_SENTENCES = 3;
/** 累计到此长度就起新段（贴合正常段落 ~150-220 字观感）。 */
const TARGET_CHARS = 160;
/** 末段不足此长度则并入上一段，避免孤句尾巴。 */
const MIN_TAIL_CHARS = 48;

const CLOSERS = new Set(['"', "'", "’", "”", "）", ")", "】", "」", "』"]);

/** 一行是否「结构性」（非纯散文）——命中则整段不切分。 */
function isStructuralLine(line: string): boolean {
  const t = line.trim();
  if (t === "") return false;
  return (
    /^#{1,6}\s/.test(t) || // 标题
    /^([-*+]|\d+[.)])\s/.test(t) || // 列表项
    t.startsWith(">") || // 引用
    t.includes("|") || // 表格行
    /^([-*_]\s*){3,}$/.test(t) || // 分隔线
    t.startsWith("![") || // 图片
    t.includes("](#fig-") || // 图占位符
    t.includes("$$") // 数学块
  );
}

/** 按句末标点（。！？）切句，连带吞掉句末的右括号/引号与紧随的 [n] 引用角标。 */
function splitSentences(text: string): string[] {
  const res: string[] = [];
  let buf = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    buf += ch;
    if (ch === "。" || ch === "！" || ch === "？") {
      let j = i + 1;
      while (j < text.length && CLOSERS.has(text[j])) {
        buf += text[j];
        j++;
      }
      const cite = text.slice(j).match(/^(\s*\[\d+\])+/);
      if (cite) {
        buf += cite[0];
        j += cite[0].length;
      }
      res.push(buf);
      buf = "";
      i = j - 1;
    }
  }
  if (buf.trim()) res.push(buf);
  return res;
}

/** 把一段（可能含软换行）的纯散文重切成多段；不需切分时原样返回。返回 [结果, 是否改动]。 */
function segmentOne(text: string): [string, boolean] {
  // 一段内的软换行（单 \n）合并成连续文本（CJK 段落，句间无空格）
  const flat = text.replace(/\n+/g, "").trim();
  if (flat.length <= RUNON_MIN_CHARS) return [text, false];
  const sentences = splitSentences(flat);
  if (sentences.length < MIN_SENTENCES) return [text, false];

  const paras: string[] = [];
  let cur = "";
  for (const s of sentences) {
    cur += s;
    if (cur.length >= TARGET_CHARS) {
      paras.push(cur.trim());
      cur = "";
    }
  }
  if (cur.trim()) {
    if (paras.length > 0 && cur.trim().length < MIN_TAIL_CHARS) {
      paras[paras.length - 1] += cur;
    } else {
      paras.push(cur.trim());
    }
  }
  if (paras.length <= 1) return [text, false];
  return [paras.join("\n\n"), true];
}

/**
 * 把 run-on 散文段切成自然段。fence-aware，跳过结构性段落。
 * onSegment：每切分一段回调一次（用于 sanitizer metrics 计数）。
 */
export function segmentRunOnParagraphs(
  md: string,
  onSegment?: () => void,
): string {
  if (typeof md !== "string" || md.length === 0) return md;
  const lines = md.split("\n");
  const out: string[] = [];
  let inFence = false;
  let para: string[] = [];
  let structural = false;

  const flush = (): void => {
    if (para.length === 0) return;
    const joined = para.join("\n");
    if (structural) {
      out.push(joined);
    } else {
      const [seg, changed] = segmentOne(joined);
      if (changed && onSegment) onSegment();
      out.push(seg);
    }
    para = [];
    structural = false;
  };

  for (const line of lines) {
    const t = line.trim();
    if (/^(```|~~~)/.test(t)) {
      flush();
      inFence = !inFence;
      out.push(line);
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }
    if (t === "") {
      flush();
      out.push(line);
      continue;
    }
    if (isStructuralLine(line)) structural = true;
    para.push(line);
  }
  flush();
  return out.join("\n");
}
