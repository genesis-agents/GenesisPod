'use client';

import { useState } from 'react';

export type TranslationMode = 'off' | 'auto' | 'manual' | 'bilingual';
export type TranslationPosition = 'overlay' | 'side' | 'bottom';

interface TranslationControlProps {
  mode: TranslationMode;
  onModeChange: (mode: TranslationMode) => void;
  position: TranslationPosition;
  onPositionChange: (position: TranslationPosition) => void;
  autoHide: boolean;
  onAutoHideChange: (autoHide: boolean) => void;
}

export default function TranslationControl({
  mode,
  onModeChange,
  position,
  onPositionChange,
  autoHide,
  onAutoHideChange,
}: TranslationControlProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="relative">
      {/* 快捷按钮 */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium shadow-sm transition-all ${
          mode !== 'off'
            ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-blue-500/25'
            : 'bg-white text-gray-700 hover:bg-gray-50'
        }`}
      >
        <svg
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"
          />
        </svg>
        <span>
          {mode === 'off' && '翻译'}
          {mode === 'auto' && '自动翻译中'}
          {mode === 'manual' && '点击翻译'}
          {mode === 'bilingual' && '双语字幕'}
        </span>
        <svg
          className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
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
      </button>

      {/* 展开的设置面板 */}
      {isExpanded && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border border-gray-200 bg-white p-4 shadow-2xl">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">翻译设置</h3>
            <button
              onClick={() => setIsExpanded(false)}
              className="rounded-lg p-1 hover:bg-gray-100"
            >
              <svg
                className="h-4 w-4 text-gray-500"
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

          {/* 翻译模式 */}
          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-gray-700">
              翻译模式
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onModeChange('off')}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
                  mode === 'off'
                    ? 'border-gray-400 bg-gray-100 text-gray-900'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
              >
                关闭
              </button>
              <button
                onClick={() => onModeChange('auto')}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
                  mode === 'auto'
                    ? 'border-blue-400 bg-blue-50 text-blue-900'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
              >
                自动翻译
              </button>
              <button
                onClick={() => onModeChange('manual')}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
                  mode === 'manual'
                    ? 'border-green-400 bg-green-50 text-green-900'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
              >
                点击翻译
              </button>
              <button
                onClick={() => onModeChange('bilingual')}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
                  mode === 'bilingual'
                    ? 'border-purple-400 bg-purple-50 text-purple-900'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
              >
                双语对照
              </button>
            </div>
          </div>

          {/* 显示位置 */}
          {mode !== 'off' && (
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-gray-700">
                显示位置
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => onPositionChange('bottom')}
                  className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
                    position === 'bottom'
                      ? 'border-blue-400 bg-blue-50 text-blue-900'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }`}
                >
                  字幕下方
                </button>
                <button
                  onClick={() => onPositionChange('side')}
                  className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
                    position === 'side'
                      ? 'border-blue-400 bg-blue-50 text-blue-900'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }`}
                >
                  侧边栏
                </button>
                <button
                  onClick={() => onPositionChange('overlay')}
                  className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
                    position === 'overlay'
                      ? 'border-blue-400 bg-blue-50 text-blue-900'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }`}
                >
                  悬浮框
                </button>
              </div>
            </div>
          )}

          {/* 其他选项 */}
          {mode !== 'off' && (
            <div className="space-y-2 border-t border-gray-100 pt-4">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={autoHide}
                  onChange={(e) => onAutoHideChange(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">3秒后自动隐藏</span>
              </label>

              <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-800">
                <div className="flex items-start gap-2">
                  <svg
                    className="mt-0.5 h-4 w-4 flex-shrink-0"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <div>
                    <strong>提示：</strong>
                    {mode === 'auto' && '翻译会随视频播放自动显示'}
                    {mode === 'manual' && '点击英文句子即可查看中文翻译'}
                    {mode === 'bilingual' && '英文和中文会同时显示'}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
