'use client';

/**
 * MarkdownViewer - 通用 Markdown 渲染组件
 *
 * 抽自 Topic Insights 的报告渲染管线，沉淀为跨模块平台能力。
 * 一站式整合：
 * - ReactMarkdown + remark-gfm（GFM 表格 / 列表 / 删除线）
 * - remark-math + rehype-katex（LaTeX 公式，错误不抛、不静默 hydration）
 * - createMarkdownComponents 工厂（标题锚点、链接安全、Mermaid 图、风险矩阵染色）
 * - preprocessLatex / stripProseBullets 预处理（清理 LLM 脏输出）
 * - 可选 processText 槽（注入引用 / 注解高亮等内联变换）
 *
 * 适用场景：
 * - AI Writing 长文档渲染
 * - AI Research 报告渲染
 * - Agent Playground mission 报告
 * - 任何需要展示 LLM 生成 Markdown 的位置
 *
 * 不在平台层做的：
 * - 引用徽章具体业务（CitationBadge 仍在 components/common/citations）
 * - 注解高亮业务（components/common/annotations 提供，由调用方传入 processText）
 * - 编辑（TipTap 等编辑器层是 ReportEditor 的职责，不在 viewer 范围）
 */

import { useMemo, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import { createMarkdownComponents } from '@/lib/markdown/createMarkdownComponents';
import { preprocessLatex } from '@/lib/markdown/preprocessLatex';
import { stripProseBullets } from '@/lib/markdown/stripProseBullets';
import { KATEX_OPTIONS } from '@/lib/markdown/katexOptions';
import { cn } from '@/lib/utils/common';

export interface MarkdownViewerProps {
  /** Markdown 源文本 */
  content: string;
  /**
   * 是否运行 LaTeX 预处理（preprocessLatex）+ 列表清理（stripProseBullets）。
   * 默认 true。仅当调用方已自行预处理时关闭。
   */
  preprocess?: boolean;
  /**
   * 内联文本处理槽。每段文本 / 列表项会经过这个函数。
   * 用于注入引用徽章 `[1][2]`、注解高亮、关键词链接等。
   * 不传则原样输出。
   */
  processText?: (text: string) => ReactNode;
  /** 容器自定义 className */
  className?: string;
  /** 是否启用 GFM 表格/列表/删除线，默认 true */
  enableGfm?: boolean;
  /** 是否启用 LaTeX 数学公式，默认 true */
  enableMath?: boolean;
  /**
   * 是否启用 rehype-raw 允许内联 HTML（默认 false）。
   * 报告含 `<sup>` / `<details>` 等手写 HTML 时需要开启。
   * 注意：开启 = 信任内容来源；用户输入禁用。
   */
  enableRawHtml?: boolean;
}

const IDENTITY: (text: string) => ReactNode = (t) => t;

export function MarkdownViewer({
  content,
  preprocess = true,
  processText,
  className,
  enableGfm = true,
  enableMath = true,
  enableRawHtml = false,
}: MarkdownViewerProps) {
  const finalText = useMemo(() => {
    if (!preprocess) return content;
    let processed = enableMath ? preprocessLatex(content) : content;
    processed = stripProseBullets(processed);
    return processed;
  }, [content, preprocess, enableMath]);

  // 每次 processText 变化重建 components 工厂（slugCounts / lastH2Text 是闭包态）
  const components = useMemo(
    () => createMarkdownComponents(processText ?? IDENTITY),
    [processText]
  );

  const remarkPlugins = useMemo(
    () => [
      ...(enableGfm ? [remarkGfm] : []),
      ...(enableMath ? [remarkMath] : []),
    ],
    [enableGfm, enableMath]
  );

  const rehypePlugins = useMemo(() => {
    // 顺序很关键：rehype-raw 必须在 rehype-katex 之前，否则 raw HTML 会吞掉数学块
    const plugins: unknown[] = [];
    if (enableRawHtml) plugins.push(rehypeRaw);
    if (enableMath) plugins.push([rehypeKatex, KATEX_OPTIONS]);
    return plugins;
  }, [enableMath, enableRawHtml]);

  return (
    <div className={cn('markdown-viewer', className)}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rehypePlugins={rehypePlugins as any}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        components={components as any}
      >
        {finalText}
      </ReactMarkdown>
    </div>
  );
}
