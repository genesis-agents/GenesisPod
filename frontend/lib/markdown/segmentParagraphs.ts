/**
 * segmentParagraphs.ts — 2026-06-15
 *
 * 把「超长、句末（。！？）相接、无段落空行」的 run-on 中文散文段切成自然段，
 * 使其与正常分段的章节观感一致（修历史报告里一坨墙文字的呈现问题）。
 *
 * 渲染时预处理（ArtifactMarkdown.cleaned 链），对**历史报告**立即生效（治存量）；
 * 后端 sanitizer 有同款实现（paragraph-segmenter.util.ts），新报告落库即分段（治本）。
 * 两侧算法保持一致。
 *
 * fence-aware + 结构保护：跳过代码块 / 列表 / 表格 / 标题 / 引用 / 图占位 / 数学块。
 */

const RUNON_MIN_CHARS = 240;
const MIN_SENTENCES = 3;
const TARGET_CHARS = 160;
const MIN_TAIL_CHARS = 48;

const CLOSERS = new Set(['"', "'", '’', '”', '）', ')', '】', '」', '』']);

function isStructuralLine(line: string): boolean {
  const t = line.trim();
  if (t === '') return false;
  return (
    /^#{1,6}\s/.test(t) ||
    /^([-*+]|\d+[.)])\s/.test(t) ||
    t.startsWith('>') ||
    t.includes('|') ||
    /^([-*_]\s*){3,}$/.test(t) ||
    t.startsWith('![') ||
    t.includes('](#fig-') ||
    t.includes('$$')
  );
}

function splitSentences(text: string): string[] {
  const res: string[] = [];
  let buf = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    buf += ch;
    if (ch === '。' || ch === '！' || ch === '？') {
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
      buf = '';
      i = j - 1;
    }
  }
  if (buf.trim()) res.push(buf);
  return res;
}

function segmentOne(text: string): string {
  const flat = text.replace(/\n+/g, '').trim();
  if (flat.length <= RUNON_MIN_CHARS) return text;
  const sentences = splitSentences(flat);
  if (sentences.length < MIN_SENTENCES) return text;

  const paras: string[] = [];
  let cur = '';
  for (const s of sentences) {
    cur += s;
    if (cur.length >= TARGET_CHARS) {
      paras.push(cur.trim());
      cur = '';
    }
  }
  if (cur.trim()) {
    if (paras.length > 0 && cur.trim().length < MIN_TAIL_CHARS) {
      paras[paras.length - 1] += cur;
    } else {
      paras.push(cur.trim());
    }
  }
  if (paras.length <= 1) return text;
  return paras.join('\n\n');
}

/** 把 run-on 散文段切成自然段。fence-aware，跳过结构性段落。 */
export function segmentRunOnParagraphs(md: string): string {
  if (typeof md !== 'string' || md.length === 0) return md;
  const lines = md.split('\n');
  const out: string[] = [];
  let inFence = false;
  let para: string[] = [];
  let structural = false;

  const flush = (): void => {
    if (para.length === 0) return;
    const joined = para.join('\n');
    out.push(structural ? joined : segmentOne(joined));
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
    if (t === '') {
      flush();
      out.push(line);
      continue;
    }
    if (isStructuralLine(line)) structural = true;
    para.push(line);
  }
  flush();
  return out.join('\n');
}
