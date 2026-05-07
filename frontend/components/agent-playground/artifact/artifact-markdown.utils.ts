/**
 * artifact-markdown.utils.ts — PR-A6 (2026-05-07)
 *
 * 上游：docs/architecture/ai-harness/evaluation/report-assembly-invariant-redesign.md
 *      v1.4 §6.6 katexAwareSchema + §5 PR-A6 NB-3
 *
 * 职责：把 hast (rehype) defaultSchema 扩展，允许 KaTeX 渲染所需的
 * MathML / SVG / 类名白名单，同时仍然剥掉用户内容里的危险 attrs（onerror /
 * onclick / javascript: 等）。前端 ArtifactMarkdown 把本 schema 喂给
 * rehype-sanitize 即可。
 *
 * 不做：
 *   - 不运行任何 LLM
 *   - 不依赖 backend
 *   - 不依赖 katex 包本体（仅引用元素名）
 */

import { defaultSchema } from 'rehype-sanitize';

/**
 * KaTeX 渲染产物 attrs/elements 白名单
 *
 * 来源：KaTeX 输出的 HTML/MathML 元素与 attrs（katex.render() 文档）。
 * 与 defaultSchema 合并后允许：
 *   - <span class="katex"> ... </span>
 *   - <math xmlns="..."> ... </math>
 *   - <semantics><mrow><mi>...</mi></mrow><annotation>...</annotation></semantics>
 *   - SVG 路径数据（KaTeX 用来画分数线 / 根号）
 */
const KATEX_TAG_NAMES = [
  'math',
  'annotation',
  'semantics',
  'mtext',
  'mn',
  'mo',
  'mi',
  'mspace',
  'mover',
  'munder',
  'munderover',
  'msup',
  'msub',
  'msubsup',
  'mfrac',
  'mroot',
  'msqrt',
  'mtable',
  'mtr',
  'mtd',
  'mlabeledtr',
  'mrow',
  'menclose',
  'mstyle',
  'mpadded',
  'mphantom',
  'mglyph',
];

const KATEX_ATTR_NAMES = [
  'accent',
  'accentunder',
  'align',
  'bevelled',
  'close',
  'columnsalign',
  'columnlines',
  'columnspan',
  'denomalign',
  'depth',
  'display',
  'displaystyle',
  'encoding',
  'fence',
  'frame',
  'height',
  'href',
  'id',
  'largeop',
  'length',
  'linethickness',
  'lspace',
  'lquote',
  'mathbackground',
  'mathcolor',
  'mathsize',
  'mathvariant',
  'maxsize',
  'minsize',
  'movablelimits',
  'notation',
  'numalign',
  'open',
  'rowalign',
  'rowlines',
  'rowspacing',
  'rowspan',
  'rspace',
  'rquote',
  'scriptlevel',
  'scriptminsize',
  'scriptsizemultiplier',
  'selection',
  'separator',
  'separators',
  'stretchy',
  'subscriptshift',
  'supscriptshift',
  'symmetric',
  'voffset',
  'width',
  'xmlns',
];

/**
 * 自定义 katexAwareSchema —— defaultSchema + KaTeX 元素 / attrs。
 *
 * **安全收紧 (R2 共识 P1)**：
 *   - **不**把 `style` 放进 `'*'` 全局白名单（CSS 注入面：
 *     `<span style="background:url(//evil.com/track)">` SSRF 追踪 /
 *     `<div style="position:fixed;...">` 视觉劫持）
 *   - `style` 仅在 KaTeX 元素 + svg/path 上放行（KaTeX 渲染期需要 inline style 排版）
 *   - 普通 markdown 元素继承 defaultSchema 默认 attrs（不放 style）
 *
 * 用法（注意顺序，**rehypeSanitize 必须在 rehypeKatex 之后**）：
 *   <ReactMarkdown rehypePlugins={[rehypeKatex, [rehypeSanitize, katexAwareSchema]]} />
 */
const KATEX_TAG_ATTRS_WITH_STYLE = [
  ...KATEX_ATTR_NAMES,
  'style',
  'class',
  'className',
];

export const katexAwareSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), ...KATEX_TAG_NAMES],
  attributes: {
    ...(defaultSchema.attributes ?? {}),
    // 普通元素：继承 defaultSchema 的 '*'，再加 className 与 KaTeX 用的 aria-hidden；
    // **不**放 style（CSS 注入向量）
    '*': [
      ...((defaultSchema.attributes ?? {})['*'] ?? []),
      'className',
      'class',
      'ariaHidden',
      'aria-hidden',
    ],
    // KaTeX 元素：全套 attrs 白名单 + style（KaTeX inline style 必须）
    ...Object.fromEntries(
      KATEX_TAG_NAMES.map((tag) => [tag, KATEX_TAG_ATTRS_WITH_STYLE] as const)
    ),
    // svg / path 节点 KaTeX 用来画分数线 / 根号 — 同样允许 style
    svg: [
      ...((defaultSchema.attributes ?? {}).svg ?? []),
      'xmlns',
      'viewBox',
      'preserveAspectRatio',
      'fill',
      'stroke',
      'width',
      'height',
      'style',
    ],
    path: [
      ...((defaultSchema.attributes ?? {}).path ?? []),
      'd',
      'fill',
      'stroke',
      'style',
    ],
  },
} as const;
