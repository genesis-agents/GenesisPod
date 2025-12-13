'use client';

import React, { useState } from 'react';
import { ExportOptions } from '@/hooks/useYoutubeSubtitleExport';

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (options: ExportOptions) => void;
  isLoading?: boolean;
}

export function ExportDialog({
  isOpen,
  onClose,
  onExport,
  isLoading = false,
}: ExportDialogProps) {
  const [options, setOptions] = useState<ExportOptions>({
    format: 'bilingual-side',
    includeTimestamps: true,
    includeVideoUrl: true,
    includeMetadata: true,
  });

  if (!isOpen) return null;

  const handleExport = () => {
    onExport(options);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="mx-4 w-full max-w-md overflow-hidden rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="border-b border-gray-200 bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
          <h2 className="text-xl font-semibold text-white">
            Export Subtitles to PDF
          </h2>
        </div>

        {/* Content */}
        <div className="space-y-6 px-6 py-4">
          {/* Format Selection */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Export Format
            </label>
            <div className="space-y-2">
              <label className="flex cursor-pointer items-center space-x-3 rounded-lg border p-3 transition-colors hover:bg-gray-50">
                <input
                  type="radio"
                  name="format"
                  value="bilingual-side"
                  checked={options.format === 'bilingual-side'}
                  onChange={(e) =>
                    setOptions({
                      ...options,
                      format: e.target.value as ExportOptions['format'],
                    })
                  }
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-900">
                    Bilingual (Side by Side)
                  </div>
                  <div className="text-xs text-gray-500">
                    English and Chinese in parallel columns
                  </div>
                </div>
              </label>

              <label className="flex cursor-pointer items-center space-x-3 rounded-lg border p-3 transition-colors hover:bg-gray-50">
                <input
                  type="radio"
                  name="format"
                  value="bilingual-stack"
                  checked={options.format === 'bilingual-stack'}
                  onChange={(e) =>
                    setOptions({
                      ...options,
                      format: e.target.value as ExportOptions['format'],
                    })
                  }
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-900">
                    Bilingual (Stacked)
                  </div>
                  <div className="text-xs text-gray-500">
                    English and Chinese one after another
                  </div>
                </div>
              </label>

              <label className="flex cursor-pointer items-center space-x-3 rounded-lg border p-3 transition-colors hover:bg-gray-50">
                <input
                  type="radio"
                  name="format"
                  value="english-only"
                  checked={options.format === 'english-only'}
                  onChange={(e) =>
                    setOptions({
                      ...options,
                      format: e.target.value as ExportOptions['format'],
                    })
                  }
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-900">
                    English Only
                  </div>
                  <div className="text-xs text-gray-500">
                    Only English subtitles
                  </div>
                </div>
              </label>

              <label className="flex cursor-pointer items-center space-x-3 rounded-lg border p-3 transition-colors hover:bg-gray-50">
                <input
                  type="radio"
                  name="format"
                  value="chinese-only"
                  checked={options.format === 'chinese-only'}
                  onChange={(e) =>
                    setOptions({
                      ...options,
                      format: e.target.value as ExportOptions['format'],
                    })
                  }
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-900">
                    Chinese Only
                  </div>
                  <div className="text-xs text-gray-500">
                    Only Chinese subtitles
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Options */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">
              Additional Options
            </label>

            <label className="flex cursor-pointer items-center space-x-3 rounded-lg border p-3 transition-colors hover:bg-gray-50">
              <input
                type="checkbox"
                checked={options.includeTimestamps}
                onChange={(e) =>
                  setOptions({
                    ...options,
                    includeTimestamps: e.target.checked,
                  })
                }
                className="h-4 w-4 rounded text-blue-600 focus:ring-blue-500"
              />
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-900">
                  Include Timestamps
                </div>
                <div className="text-xs text-gray-500">
                  Show time markers for each subtitle
                </div>
              </div>
            </label>

            <label className="flex cursor-pointer items-center space-x-3 rounded-lg border p-3 transition-colors hover:bg-gray-50">
              <input
                type="checkbox"
                checked={options.includeVideoUrl}
                onChange={(e) =>
                  setOptions({ ...options, includeVideoUrl: e.target.checked })
                }
                className="h-4 w-4 rounded text-blue-600 focus:ring-blue-500"
              />
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-900">
                  Include Video URL
                </div>
                <div className="text-xs text-gray-500">
                  Add YouTube video link in header
                </div>
              </div>
            </label>

            <label className="flex cursor-pointer items-center space-x-3 rounded-lg border p-3 transition-colors hover:bg-gray-50">
              <input
                type="checkbox"
                checked={options.includeMetadata}
                onChange={(e) =>
                  setOptions({ ...options, includeMetadata: e.target.checked })
                }
                className="h-4 w-4 rounded text-blue-600 focus:ring-blue-500"
              />
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-900">
                  Include Metadata
                </div>
                <div className="text-xs text-gray-500">
                  Show video title and export date
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end space-x-3 border-t border-gray-200 bg-gray-50 px-6 py-4">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={isLoading}
            className="flex items-center space-x-2 rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <svg
                  className="h-4 w-4 animate-spin text-white"
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
                <span>Exporting...</span>
              </>
            ) : (
              <>
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
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <span>Export PDF</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
