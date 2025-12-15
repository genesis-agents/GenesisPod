'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { List, ChevronRight } from 'lucide-react';

interface TOCHeading {
  id: string;
  text: string;
  level: number;
}

interface TableOfContentsProps {
  /** HTML content to extract headings from */
  content: string;
  /** Ref to the scrollable content container */
  containerRef: React.RefObject<HTMLElement>;
  /** Optional className for the TOC container */
  className?: string;
  /** Theme mode for styling */
  theme?: 'light' | 'sepia' | 'dark';
  /** Whether TOC is initially collapsed */
  defaultCollapsed?: boolean;
}

// Extract headings from HTML content
function extractHeadings(html: string): TOCHeading[] {
  const headings: TOCHeading[] = [];

  // Match h1, h2, h3, h4 tags
  const headingRegex =
    /<h([1-4])([^>]*)>([^<]*(?:<[^/][^>]*>[^<]*<\/[^>]+>[^<]*)*)<\/h[1-4]>/gi;

  let match;
  let index = 0;
  while ((match = headingRegex.exec(html)) !== null) {
    const level = parseInt(match[1], 10);
    // Extract text content, removing any nested tags
    let text = match[3]
      .replace(/<[^>]+>/g, '') // Remove HTML tags
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();

    if (text.length > 0 && text.length < 150) {
      // Generate a unique ID
      const id = `toc-heading-${index}`;
      headings.push({ id, text, level });
      index++;
    }
  }

  // If no HTML headings found, try to detect markdown-style or plain text headings
  if (headings.length === 0) {
    const lines = html.split(/\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].replace(/<[^>]+>/g, '').trim();

      // Check for markdown-style headings
      const mdMatch = line.match(/^(#{1,4})\s+(.+)$/);
      if (mdMatch) {
        const level = mdMatch[1].length;
        const text = mdMatch[2].trim();
        if (text.length > 0 && text.length < 150) {
          headings.push({ id: `toc-heading-${headings.length}`, text, level });
        }
        continue;
      }

      // Check for section headers (all caps, short text)
      if (
        line.length > 3 &&
        line.length < 80 &&
        line === line.toUpperCase() &&
        /^[A-Z\s\d]+$/.test(line)
      ) {
        headings.push({
          id: `toc-heading-${headings.length}`,
          text: line,
          level: 2,
        });
        continue;
      }

      // Check for numbered sections like "1. Introduction"
      const numberedMatch = line.match(/^(\d+\.)\s+([A-Z][^.]*?)$/);
      if (numberedMatch && line.length < 100) {
        headings.push({
          id: `toc-heading-${headings.length}`,
          text: numberedMatch[2].trim(),
          level: 2,
        });
      }
    }
  }

  return headings;
}

/**
 * Table of Contents component for document navigation
 *
 * Features:
 * - Extracts headings from HTML content
 * - Highlights current section based on scroll position
 * - Smooth scroll to section on click
 * - Collapsible sidebar
 */
export default function TableOfContents({
  content,
  containerRef,
  className = '',
  theme = 'light',
  defaultCollapsed = false,
}: TableOfContentsProps) {
  const [headings, setHeadings] = useState<TOCHeading[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const tocRef = useRef<HTMLDivElement>(null);

  // Extract headings from content
  useEffect(() => {
    const extracted = extractHeadings(content);
    setHeadings(extracted);

    // Also add IDs to actual heading elements in the DOM
    if (containerRef.current) {
      const headingElements =
        containerRef.current.querySelectorAll('h1, h2, h3, h4');
      let idx = 0;
      headingElements.forEach((el) => {
        const text = el.textContent?.trim() || '';
        if (text.length > 0 && text.length < 150) {
          el.id = `toc-heading-${idx}`;
          idx++;
        }
      });
    }
  }, [content, containerRef]);

  // Track active section based on scroll position
  const handleScroll = useCallback(() => {
    if (!containerRef.current || headings.length === 0) return;

    const container = containerRef.current;
    const scrollTop = container.scrollTop;
    const scrollHeight = container.scrollHeight;
    const clientHeight = container.clientHeight;

    // Find the heading that is currently in view
    let currentActiveId = '';

    for (const heading of headings) {
      const element = document.getElementById(heading.id);
      if (element) {
        const rect = element.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const relativeTop = rect.top - containerRect.top;

        // If the heading is in the top half of the viewport, it's active
        if (relativeTop <= clientHeight / 3) {
          currentActiveId = heading.id;
        }
      }
    }

    // If we're at the bottom, activate the last heading
    if (scrollTop + clientHeight >= scrollHeight - 50) {
      currentActiveId = headings[headings.length - 1]?.id || '';
    }

    // If we're at the top, activate the first heading
    if (scrollTop < 100 && headings.length > 0) {
      currentActiveId = headings[0].id;
    }

    if (currentActiveId !== activeId) {
      setActiveId(currentActiveId);
    }
  }, [headings, activeId, containerRef]);

  // Add scroll listener
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll);
    handleScroll(); // Initial check

    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll, containerRef]);

  // Scroll to heading on click
  const scrollToHeading = (id: string) => {
    const element = document.getElementById(id);
    if (element && containerRef.current) {
      const container = containerRef.current;
      const containerRect = container.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      const scrollTop =
        container.scrollTop + elementRect.top - containerRect.top - 80;

      container.scrollTo({
        top: scrollTop,
        behavior: 'smooth',
      });

      setActiveId(id);
    }
  };

  // Theme styles
  const themeStyles = {
    light: {
      bg: 'bg-white',
      border: 'border-gray-200',
      text: 'text-gray-600',
      textActive: 'text-red-600',
      textHover: 'hover:text-gray-900',
      activeIndicator: 'bg-red-500',
      header: 'text-gray-900',
      headerBg: 'bg-gray-50',
    },
    sepia: {
      bg: 'bg-[#FBF7F0]',
      border: 'border-[#E8DFD0]',
      text: 'text-[#8B7355]',
      textActive: 'text-[#8B4513]',
      textHover: 'hover:text-[#5C4B37]',
      activeIndicator: 'bg-[#8B4513]',
      header: 'text-[#3D2E1C]',
      headerBg: 'bg-[#F5EFE6]',
    },
    dark: {
      bg: 'bg-[#1A1A1A]',
      border: 'border-gray-700',
      text: 'text-gray-400',
      textActive: 'text-red-400',
      textHover: 'hover:text-gray-200',
      activeIndicator: 'bg-red-500',
      header: 'text-gray-200',
      headerBg: 'bg-gray-800',
    },
  };

  const styles = themeStyles[theme];

  // Don't render if no headings
  if (headings.length === 0) {
    return null;
  }

  return (
    <div
      ref={tocRef}
      className={`flex-shrink-0 transition-all duration-300 ${className} ${
        isCollapsed ? 'w-10' : 'w-56'
      }`}
    >
      <div
        className={`sticky top-0 h-full overflow-hidden border-r ${styles.bg} ${styles.border}`}
      >
        {/* Header with toggle */}
        <div
          className={`flex items-center justify-between p-3 ${styles.headerBg} border-b ${styles.border}`}
        >
          {!isCollapsed && (
            <span className={`text-sm font-medium ${styles.header}`}>本页</span>
          )}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${styles.textHover}`}
            title={isCollapsed ? '展开目录' : '收起目录'}
          >
            {isCollapsed ? (
              <List className={`h-4 w-4 ${styles.text}`} />
            ) : (
              <ChevronRight
                className={`h-4 w-4 ${styles.text} transition-transform ${
                  isCollapsed ? '' : 'rotate-180'
                }`}
              />
            )}
          </button>
        </div>

        {/* TOC List */}
        {!isCollapsed && (
          <nav className="max-h-[calc(100vh-200px)] overflow-y-auto p-3">
            <ul className="space-y-1">
              {headings.map((heading) => {
                const isActive = activeId === heading.id;
                const indentClass =
                  heading.level === 1
                    ? 'pl-0'
                    : heading.level === 2
                      ? 'pl-0'
                      : heading.level === 3
                        ? 'pl-3'
                        : 'pl-5';

                return (
                  <li key={heading.id}>
                    <button
                      onClick={() => scrollToHeading(heading.id)}
                      className={`relative flex w-full items-start text-left text-sm leading-snug transition-colors ${indentClass} ${
                        isActive
                          ? `font-medium ${styles.textActive}`
                          : `${styles.text} ${styles.textHover}`
                      }`}
                    >
                      {isActive && (
                        <span
                          className={`absolute -left-3 top-1 h-3 w-0.5 rounded-full ${styles.activeIndicator}`}
                        />
                      )}
                      <span className="line-clamp-2">{heading.text}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}

        {/* Collapsed state - just show icon */}
        {isCollapsed && (
          <div className="flex flex-col items-center p-2">
            <div
              className={`h-4 w-0.5 rounded-full ${styles.activeIndicator} mb-2`}
            />
            <span
              className={`text-xs ${styles.text} writing-mode-vertical`}
              style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
            >
              目录
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
