'use client';

import React, { useState, useEffect } from 'react';
import { ExportDialog } from './export-dialog';
import {
  useYoutubeSubtitleExport,
  BilingualSubtitles,
  ExportOptions,
} from '@/hooks/useYoutubeSubtitleExport';

interface SubtitleExportButtonProps {
  videoId: string;
  className?: string;
  variant?: 'primary' | 'secondary' | 'icon';
  position?: 'top-right' | 'inline';
}

export function SubtitleExportButton({
  videoId,
  className = '',
  variant = 'primary',
  position = 'inline',
}: SubtitleExportButtonProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [subtitles, setSubtitles] = useState<BilingualSubtitles | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const { isLoading, error, fetchSubtitles, exportPdf } =
    useYoutubeSubtitleExport();

  // Auto-fetch subtitles when dialog opens
  useEffect(() => {
    if (isDialogOpen && !subtitles && videoId) {
      handleFetchSubtitles();
    }
  }, [isDialogOpen, videoId]);

  const handleFetchSubtitles = async () => {
    setFetchError(null);
    const result = await fetchSubtitles(videoId);
    if (result) {
      setSubtitles(result);
    } else {
      setFetchError('Failed to fetch subtitles. Please try again.');
    }
  };

  const handleExport = async (options: ExportOptions) => {
    if (!subtitles) {
      setFetchError('No subtitles available. Please try again.');
      return;
    }

    try {
      await exportPdf(
        subtitles.videoId,
        subtitles.title,
        subtitles.english,
        subtitles.chinese,
        options
      );
      setIsDialogOpen(false);
    } catch (err) {
      console.error('Export failed:', err);
      // Error is already handled in the hook
    }
  };

  const getButtonClasses = () => {
    const baseClasses =
      'transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2';

    if (variant === 'icon') {
      return `${baseClasses} p-2 rounded-full hover:bg-gray-100 focus:ring-blue-500 ${className}`;
    }

    if (variant === 'secondary') {
      return `${baseClasses} px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:ring-blue-500 ${className}`;
    }

    // primary
    return `${baseClasses} px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:ring-blue-500 ${className}`;
  };

  const positionClasses =
    position === 'top-right' ? 'fixed top-4 right-4 z-40' : '';

  return (
    <>
      <div className={positionClasses}>
        <button
          onClick={() => setIsDialogOpen(true)}
          className={getButtonClasses()}
          title="Export subtitles to PDF"
        >
          {variant === 'icon' ? (
            <svg
              className="h-5 w-5 text-slate-700"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              viewBox="0 0 24 24"
            >
              {/* Minimalist document icon */}
              <path
                d="M7 8a2 2 0 012-2h6V4a2 2 0 012 2v14a2 2 0 01-2 2H9a2 2 0 01-2-2V8z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Download arrow */}
              <path
                d="M12 12v6m0 0l-2-2m2 2l2-2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <div className="flex items-center space-x-2">
              <svg
                className="h-4 w-4 text-slate-700"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                viewBox="0 0 24 24"
              >
                {/* Minimalist document icon */}
                <path
                  d="M7 8a2 2 0 012-2h6V4a2 2 0 012 2v14a2 2 0 01-2 2H9a2 2 0 01-2-2V8z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* Download arrow */}
                <path
                  d="M12 12v6m0 0l-2-2m2 2l2-2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>Export PDF</span>
            </div>
          )}
        </button>
      </div>

      <ExportDialog
        isOpen={isDialogOpen}
        onClose={() => {
          setIsDialogOpen(false);
          setFetchError(null);
        }}
        onExport={handleExport}
        isLoading={isLoading}
      />

      {/* Error Toast */}
      {(error || fetchError) && isDialogOpen && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm">
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 shadow-lg">
            <div className="flex items-start space-x-3">
              <svg
                className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div className="flex-1">
                <h3 className="text-sm font-medium text-red-800">Error</h3>
                <p className="mt-1 text-sm text-red-700">
                  {error || fetchError}
                </p>
              </div>
              <button
                onClick={() => setFetchError(null)}
                className="text-red-400 transition-colors hover:text-red-600"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            {fetchError && (
              <button
                onClick={handleFetchSubtitles}
                className="mt-3 w-full rounded bg-red-100 px-3 py-2 text-xs font-medium text-red-700 transition-colors hover:bg-red-200"
              >
                Retry
              </button>
            )}
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {isLoading && !isDialogOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black bg-opacity-30">
          <div className="flex items-center space-x-4 rounded-lg bg-white p-6 shadow-xl">
            <svg
              className="h-6 w-6 animate-spin text-blue-600"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            <span className="font-medium text-gray-700">
              Loading subtitles...
            </span>
          </div>
        </div>
      )}
    </>
  );
}
