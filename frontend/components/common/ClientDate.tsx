'use client';

/**
 * ClientDate - Hydration-safe date display component
 *
 * 解决 React hydration 错误：
 * - toLocaleString() 在 SSR 和 CSR 可能产生不同结果
 * - 时区差异导致日期显示不一致
 *
 * 使用方法：
 * <ClientDate date={someDate} format="datetime" />
 * <ClientDate date="2024-01-01" format="date" />
 */

import { useState, useEffect } from 'react';

type DateFormat = 'date' | 'time' | 'datetime' | 'relative';

interface ClientDateProps {
  /** Date string, Date object, or timestamp */
  date: string | Date | number | null | undefined;
  /** Display format */
  format?: DateFormat;
  /** Locale for formatting (default: 'zh-CN') */
  locale?: string;
  /** Fallback text when date is invalid */
  fallback?: string;
  /** Additional className */
  className?: string;
}

/**
 * Format date based on format type
 */
function formatDate(date: Date, format: DateFormat, locale: string): string {
  switch (format) {
    case 'date':
      return date.toLocaleDateString(locale);
    case 'time':
      return date.toLocaleTimeString(locale);
    case 'datetime':
      return date.toLocaleString(locale);
    case 'relative':
      return getRelativeTime(date);
    default:
      return date.toLocaleString(locale);
  }
}

/**
 * Get relative time string (e.g., "3 minutes ago")
 */
function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return '刚刚';
  if (diffMin < 60) return `${diffMin} 分钟前`;
  if (diffHour < 24) return `${diffHour} 小时前`;
  if (diffDay < 7) return `${diffDay} 天前`;
  if (diffDay < 30) return `${Math.floor(diffDay / 7)} 周前`;
  if (diffDay < 365) return `${Math.floor(diffDay / 30)} 个月前`;
  return `${Math.floor(diffDay / 365)} 年前`;
}

/**
 * Parse date from various formats
 */
function parseDate(
  date: string | Date | number | null | undefined
): Date | null {
  if (!date) return null;
  if (date instanceof Date) return date;
  if (typeof date === 'number') return new Date(date);
  if (typeof date === 'string') {
    const parsed = new Date(date);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

export function ClientDate({
  date,
  format = 'datetime',
  locale = 'zh-CN',
  fallback = '-',
  className,
}: ClientDateProps) {
  // 使用 useState 延迟渲染，避免 hydration 不匹配
  const [mounted, setMounted] = useState(false);
  const [formattedDate, setFormattedDate] = useState<string>(fallback);

  useEffect(() => {
    setMounted(true);
    const parsedDate = parseDate(date);
    if (parsedDate) {
      setFormattedDate(formatDate(parsedDate, format, locale));
    }
  }, [date, format, locale]);

  // 在客户端挂载前显示占位符，避免 hydration 错误
  if (!mounted) {
    return <span className={className}>{fallback}</span>;
  }

  return <span className={className}>{formattedDate}</span>;
}

export default ClientDate;
