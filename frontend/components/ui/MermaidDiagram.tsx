'use client';

import React, { useEffect, useRef, useState } from 'react';

interface MermaidDiagramProps {
  chart: string;
  className?: string;
}

// Track initialization and ID counter
let mermaidInitialized = false;
let mermaidId = 0;

/**
 * Mermaid 图表渲染组件
 *
 * 支持渲染各种 Mermaid 图表类型：
 * - flowchart / graph (流程图)
 * - sequence (时序图)
 * - class (类图)
 * - state (状态图)
 * - er (ER图)
 * - gantt (甘特图)
 * - pie (饼图)
 * - mindmap (思维导图)
 */
export default function MermaidDiagram({
  chart,
  className = '',
}: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    let timeoutId: NodeJS.Timeout | null = null;

    const renderChart = async () => {
      if (!chart) {
        setIsLoading(false);
        return;
      }

      // Note: containerRef is only used for reference, actual rendering uses mermaid.render()
      // which doesn't require a container element

      setIsLoading(true);
      setError(null);

      // Set a timeout to prevent infinite loading
      timeoutId = setTimeout(() => {
        if (isMounted) {
          setError('图表渲染超时，请检查语法是否正确');
          setIsLoading(false);
        }
      }, 10000); // 10 second timeout

      try {
        // Dynamically import mermaid only on client
        const mermaid = (await import('mermaid')).default;

        // Initialize mermaid only once
        if (!mermaidInitialized) {
          mermaid.initialize({
            startOnLoad: false,
            theme: 'default',
            securityLevel: 'loose',
            fontFamily: 'ui-sans-serif, system-ui, sans-serif, "Noto Sans SC"',
            flowchart: {
              htmlLabels: true,
              curve: 'basis',
            },
            sequence: {
              diagramMarginX: 50,
              diagramMarginY: 10,
              actorMargin: 50,
              width: 150,
              height: 65,
              boxMargin: 10,
              boxTextMargin: 5,
              noteMargin: 10,
              messageMargin: 35,
            },
          });
          mermaidInitialized = true;
        }

        // 生成唯一 ID
        const id = `mermaid-${++mermaidId}-${Date.now()}`;

        // 清理图表代码（移除多余的空白）
        const cleanChart = chart.trim();

        // 渲染图表
        const { svg: renderedSvg } = await mermaid.render(id, cleanChart);

        if (isMounted) {
          if (timeoutId) clearTimeout(timeoutId);
          setSvg(renderedSvg);
          setIsLoading(false);
        }
      } catch (err) {
        console.error('Mermaid rendering error:', err);
        if (isMounted) {
          if (timeoutId) clearTimeout(timeoutId);
          setError(err instanceof Error ? err.message : '图表渲染失败');
          setIsLoading(false);
        }
      }
    };

    renderChart();

    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [chart]);

  if (isLoading) {
    return (
      <div
        className={`flex items-center justify-center rounded-lg bg-gray-50 p-4 ${className}`}
      >
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
              fill="none"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          正在渲染图表...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`rounded-lg border border-red-200 bg-red-50 p-4 ${className}`}
      >
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-red-700">
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          图表渲染失败
        </div>
        <pre className="overflow-x-auto rounded bg-red-100 p-2 text-xs text-red-600">
          {error}
        </pre>
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-red-500 hover:text-red-700">
            查看源代码
          </summary>
          <pre className="mt-2 overflow-x-auto rounded bg-gray-800 p-3 text-xs text-gray-100">
            {chart}
          </pre>
        </details>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`mermaid-diagram overflow-x-auto rounded-lg bg-white p-4 ${className}`}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
