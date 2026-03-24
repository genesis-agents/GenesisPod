'use client';

import { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '@/lib/i18n';
import { triggerCitationClick } from '@/components/common/citations/citationNavigation';

export interface CitationBadgeProps {
  index: number;
  evidence: {
    id: string;
    title?: string | null;
    url?: string | null;
    snippet?: string | null;
    domain?: string | null;
  };
}

export function CitationBadge({ index, evidence }: CitationBadgeProps) {
  const { t } = useI18n();
  const [isHovered, setIsHovered] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [tooltipPos, setTooltipPos] = useState<{
    top: number;
    left: number;
    below?: boolean;
  } | null>(null);
  const triggerRef = useRef<HTMLElement>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelHideTimeout = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

  const handleMouseEnter = useCallback(() => {
    cancelHideTimeout();
    setIsHovered(true);
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceAbove = rect.top;
      const showBelow = spaceAbove < 200;
      setTooltipPos({
        top: showBelow ? rect.bottom + 8 : rect.top - 8,
        left: Math.min(
          Math.max(rect.left + rect.width / 2, 200),
          window.innerWidth - 200
        ),
        below: showBelow,
      });
    }
  }, [cancelHideTimeout]);

  const handleMouseLeave = useCallback(() => {
    hideTimeoutRef.current = setTimeout(() => {
      setIsHovered(false);
    }, 150);
  }, []);

  // Scroll to in-page reference entry [N]
  // Uses querySelectorAll to find the closest match when multiple chapters
  // have the same ref-N id (chapter view renders refs per chapter).
  const scrollToRef = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsHovered(false);
    const candidates = document.querySelectorAll(`[id="ref-${index}"]`);
    if (candidates.length === 0) return;
    // Pick the one closest to the clicked badge
    const badge = triggerRef.current;
    let refEl: HTMLElement = candidates[0] as HTMLElement;
    if (badge && candidates.length > 1) {
      const badgeY = badge.getBoundingClientRect().top;
      let minDist = Infinity;
      for (const el of candidates) {
        const dist = Math.abs(
          (el as HTMLElement).getBoundingClientRect().top - badgeY
        );
        if (dist < minDist) {
          minDist = dist;
          refEl = el as HTMLElement;
        }
      }
    }
    let container: HTMLElement | null = refEl.parentElement;
    while (container) {
      const style = getComputedStyle(container);
      if (
        (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
        container.scrollHeight > container.clientHeight
      ) {
        break;
      }
      container = container.parentElement;
    }
    if (container) {
      const cRect = container.getBoundingClientRect();
      const tRect = refEl.getBoundingClientRect();
      container.scrollTo({
        top: container.scrollTop + tRect.top - cRect.top,
        behavior: 'smooth',
      });
    } else {
      refEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    refEl.style.backgroundColor = '#fef3c7';
    setTimeout(() => {
      refEl.style.backgroundColor = '';
    }, 2000);
  };

  // Switch to references TAB
  const goToReferencesTab = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsHovered(false);
    if (evidence.id) {
      triggerCitationClick(evidence.id);
    }
  };

  // Default click: scroll to page ref, fallback to TAB
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const refEl = document.getElementById(`ref-${index}`);
    if (refEl) {
      scrollToRef(e);
    } else if (evidence.id) {
      triggerCitationClick(evidence.id);
    }
  };

  return (
    <span
      className="relative inline-block"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <sup
        ref={triggerRef}
        onClick={handleClick}
        className="cursor-pointer rounded bg-purple-100 px-1 py-0.5 text-[10px] font-medium text-purple-700 transition-colors hover:bg-purple-200"
        title={t('topicResearch.citation.jumpToReference')}
      >
        [{index}]
      </sup>

      {isHovered &&
        tooltipPos &&
        typeof window !== 'undefined' &&
        createPortal(
          <div
            className="fixed z-[9999] w-96 rounded-lg border border-gray-200 bg-white shadow-xl"
            style={{
              top: tooltipPos.top,
              left: tooltipPos.left,
              transform: tooltipPos.below
                ? 'translate(-50%, 0)'
                : 'translate(-50%, -100%)',
            }}
            onMouseEnter={() => {
              cancelHideTimeout();
              setIsHovered(true);
            }}
            onMouseLeave={handleMouseLeave}
          >
            <div className="flex items-start gap-2 border-b border-gray-100 p-3">
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-purple-600 text-xs font-bold text-white">
                {index}
              </span>
              <div className="min-w-0 flex-1">
                <h4 className="line-clamp-2 text-sm font-medium text-gray-900">
                  {evidence.title || t('topicResearch.citation.unknownSource')}
                </h4>
                {evidence.domain && (
                  <span className="mt-0.5 inline-block text-xs text-gray-400">
                    {evidence.domain}
                  </span>
                )}
              </div>
            </div>

            {evidence.snippet && (
              <div className="max-h-48 overflow-y-auto p-3">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
                  {evidence.snippet}
                </p>
              </div>
            )}

            <div className="flex items-center gap-3 border-t border-gray-100 bg-gray-50 px-3 py-2">
              <button
                onClick={scrollToRef}
                className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-800"
              >
                <svg
                  className="h-3 w-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 14l-7 7m0 0l-7-7m7 7V3"
                  />
                </svg>
                {t('topicResearch.citation.scrollToRef') || '跳转到页内'}
              </button>
              <button
                onClick={goToReferencesTab}
                className="flex items-center gap-1 text-xs font-medium text-purple-600 hover:text-purple-800"
              >
                {t('topicResearch.citation.viewFullSource')}
              </button>
              {evidence.url && (
                <a
                  href={evidence.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                  onClick={(e) => e.stopPropagation()}
                >
                  {t('topicResearch.citation.openOriginal')}
                </a>
              )}
            </div>
          </div>,
          document.body
        )}
    </span>
  );
}
