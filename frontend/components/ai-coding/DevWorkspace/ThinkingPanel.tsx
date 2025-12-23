'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface ThinkingStep {
  step: string;
  thought: string;
  keyPoints?: string[];
  progress?: number;
}

interface ThinkingPanelProps {
  agentName: string;
  agentIcon: string;
  isActive: boolean;
  thinkingData?: ThinkingStep;
  streamingContent?: string;
}

export function ThinkingPanel({
  agentName,
  agentIcon,
  isActive,
  thinkingData,
  streamingContent,
}: ThinkingPanelProps) {
  const [displayedText, setDisplayedText] = useState('');
  const [isExpanded, setIsExpanded] = useState(true);
  const textRef = useRef<string>('');
  const indexRef = useRef<number>(0);

  // Typewriter effect for streaming content
  useEffect(() => {
    if (!streamingContent) {
      setDisplayedText('');
      indexRef.current = 0;
      textRef.current = '';
      return;
    }

    textRef.current = streamingContent;

    const typeNextChar = () => {
      if (indexRef.current < textRef.current.length) {
        setDisplayedText(textRef.current.slice(0, indexRef.current + 1));
        indexRef.current++;
      }
    };

    const interval = setInterval(typeNextChar, 20);
    return () => clearInterval(interval);
  }, [streamingContent]);

  // Reset when content changes completely
  useEffect(() => {
    if (streamingContent && streamingContent !== textRef.current) {
      if (streamingContent.length < textRef.current.length) {
        indexRef.current = 0;
      }
    }
  }, [streamingContent]);

  if (!isActive && !thinkingData && !streamingContent) {
    return null;
  }

  return (
    <div className="overflow-hidden rounded-xl border-2 border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 shadow-sm transition-all duration-300">
      {/* Header */}
      <div
        className="flex cursor-pointer items-center gap-3 border-b border-blue-100 bg-white/50 px-4 py-3"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="relative">
          <span className="text-2xl">{agentIcon}</span>
          {isActive && (
            <span className="absolute -bottom-1 -right-1 flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex h-3 w-3 rounded-full bg-blue-500"></span>
            </span>
          )}
        </div>
        <div className="flex-1">
          <div className="font-medium text-gray-900">{agentName} 正在思考</div>
          {thinkingData?.step && (
            <div className="text-xs text-gray-500">{thinkingData.step}</div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {thinkingData?.progress !== undefined && (
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-blue-100">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${thinkingData.progress}%` }}
                />
              </div>
              <span className="text-xs text-blue-600">
                {thinkingData.progress}%
              </span>
            </div>
          )}
          <svg
            className={`h-5 w-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="px-4 py-3">
          {/* Key Points */}
          {thinkingData?.keyPoints && thinkingData.keyPoints.length > 0 && (
            <div className="mb-3">
              <div className="mb-2 text-xs font-medium text-gray-500">
                识别到的关键点:
              </div>
              <ul className="space-y-1">
                {thinkingData.keyPoints.map((point, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2 text-sm text-gray-700"
                  >
                    <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-400" />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Thinking Content with Typewriter Effect */}
          {(displayedText || thinkingData?.thought) && (
            <div className="rounded-lg bg-white/60 p-3">
              <div className="mb-1 text-xs font-medium text-gray-500">
                当前思考:
              </div>
              <div className="text-sm leading-relaxed text-gray-700">
                {displayedText || thinkingData?.thought}
                {isActive && (
                  <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-blue-500" />
                )}
              </div>
            </div>
          )}

          {/* Loading Animation when no content yet */}
          {isActive && !displayedText && !thinkingData?.thought && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span>正在分析</span>
              <span className="inline-flex gap-1">
                <span
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-500"
                  style={{ animationDelay: '0ms' }}
                />
                <span
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-500"
                  style={{ animationDelay: '150ms' }}
                />
                <span
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-500"
                  style={{ animationDelay: '300ms' }}
                />
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ThinkingPanel;
