'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { List, ChevronLeft, X } from 'lucide-react';

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
    const text = match[3]
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
 * - Floating/absolute positioned, doesn't affect layout
 * - Extracts headings from HTML content
 * - Highlights current section based on scroll position
 * - Smooth scroll to section on click
 * - Collapsible panel
 */
export default function TableOfContents({
  content,
  containerRef,
  className = '',
  theme = 'light',
  defaultCollapsed = true,
}: TableOfContentsProps) {
  const [headings, setHeadings] = useState<TOCHeading[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const tocRef = useRef<HTMLDivElement>(null);

  // Extract headings from content
  useEffect(() => {
    const extracted = extractHeadings(content);
    setHeadings(extracted);

    // Add IDs to actual heading elements in the DOM after a small delay
    // to ensure the DOM has been rendered
    const timeoutId = setTimeout(() => {
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
    }, 100);

    return () => clearTimeout(timeoutId);
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
    if (element) {
      // Try scrollIntoView first as a reliable fallback
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
      setActiveId(id);
    } else {
      // Element not found - try to find by index in DOM
      const index = parseInt(id.replace('toc-heading-', ''), 10);
      if (!isNaN(index) && containerRef.current) {
        const headingElements =
          containerRef.current.querySelectorAll('h1, h2, h3, h4');
        const validHeadings = Array.from(headingElements).filter(
          (el) => (el.textContent?.trim() || '').length > 0
        );
        if (validHeadings[index]) {
          validHeadings[index].scrollIntoView({
            behavior: 'smooth',
            block: 'start',
          });
          // Also add the ID for future reference
          validHeadings[index].id = id;
          setActiveId(id);
        }
      }
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
      shadow: 'shadow-lg',
      buttonBg: 'bg-white hover:bg-gray-50',
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
      shadow: 'shadow-lg',
      buttonBg: 'bg-[#FBF7F0] hover:bg-[#F5EFE6]',
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
      shadow: 'shadow-2xl',
      buttonBg: 'bg-gray-800 hover:bg-gray-700',
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
      className={`absolute -left-2 top-8 z-40 -translate-x-full ${className}`}
    >
      {/* Collapsed state - floating button */}
      {isCollapsed && (
        <button
          onClick={() => setIsCollapsed(false)}
          className={`flex h-10 w-10 items-center justify-center rounded-full border ${styles.border} ${styles.buttonBg} ${styles.shadow} transition-all duration-200 hover:scale-105`}
          title="展开目录"
        >
          <List className={`h-5 w-5 ${styles.text}`} />
        </button>
      )}

      {/* Expanded state - floating panel */}
      {!isCollapsed && (
        <div
          className={`w-64 rounded-xl border ${styles.border} ${styles.bg} ${styles.shadow} overflow-hidden`}
        >
          {/* Header */}
          <div
            className={`flex items-center justify-between px-4 py-3 ${styles.headerBg} border-b ${styles.border}`}
          >
            <span className={`text-sm font-medium ${styles.header}`}>
              本页目录
            </span>
            <button
              onClick={() => setIsCollapsed(true)}
              className={`flex h-6 w-6 items-center justify-center rounded-full transition-colors ${styles.textHover}`}
              title="收起目录"
            >
              <X className={`h-4 w-4 ${styles.text}`} />
            </button>
          </div>

          {/* TOC List */}
          <nav className="max-h-80 overflow-y-auto p-3">
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
                      className={`relative flex w-full items-start rounded-md px-2 py-1.5 text-left text-sm leading-snug transition-all ${indentClass} ${
                        isActive
                          ? `font-medium ${styles.textActive} bg-red-50`
                          : `${styles.text} ${styles.textHover} hover:bg-gray-50`
                      }`}
                    >
                      {isActive && (
                        <span
                          className={`absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full ${styles.activeIndicator}`}
                        />
                      )}
                      <span className="line-clamp-2">{heading.text}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      )}
    </div>
  );
}
