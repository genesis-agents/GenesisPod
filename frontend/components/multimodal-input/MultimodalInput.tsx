'use client';

/**
 * MultimodalInput
 *
 * 路线图支柱六 6d：多模态输入组件
 *
 * 统一文本 + 文件（图片/PDF/文档）输入区域。
 * 支持拖拽上传、点击选文件、粘贴图片（Ctrl+V）。
 *
 * 使用方式：
 *   <MultimodalInput
 *     value={text}
 *     onChange={setText}
 *     onSubmit={handleSubmit}
 *     files={files}
 *     onFilesChange={...}
 *     placeholder="描述你的任务..."
 *   />
 */

import { useRef, useCallback, KeyboardEvent } from 'react';
import { Paperclip, Send, Image } from 'lucide-react';
import { useFileUpload, AttachedFile } from './useFileUpload';
import { FilePreview } from './FilePreview';

// ─── Types ───────────────────────────────────────────────

export interface MultimodalInputProps {
  /** 当前文本值 */
  value: string;
  /** 文本变化回调 */
  onChange: (value: string) => void;
  /** 提交回调（文本 + 附件） */
  onSubmit: (text: string, files: AttachedFile[]) => void;
  /** 占位符文本 */
  placeholder?: string;
  /** 是否禁用 */
  disabled?: boolean;
  /** 自动焦点 */
  autoFocus?: boolean;
  /** 额外 className */
  className?: string;
  /** 最小行数（textarea） */
  minRows?: number;
  /** 最大行数（textarea） */
  maxRows?: number;
}

// ─── Accepted MIME string for input[accept] ──────────────

const ACCEPT =
  'image/jpeg,image/png,image/webp,image/gif,application/pdf,' +
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document,' +
  'text/plain,text/csv';

// ─── Component ────────────────────────────────────────────

export function MultimodalInput({
  value,
  onChange,
  onSubmit,
  placeholder = '描述你的任务，或拖入文件...',
  disabled = false,
  autoFocus = false,
  className = '',
  minRows = 1,
  maxRows = 8,
}: MultimodalInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { files, isDragging, addFiles, removeFile, clearFiles, dragProps } =
    useFileUpload();

  // ── Auto-grow textarea ────────────────────────────────

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const lineHeight = parseInt(getComputedStyle(el).lineHeight, 10) || 20;
    const min = lineHeight * minRows;
    const max = lineHeight * maxRows;
    el.style.height = `${Math.min(Math.max(el.scrollHeight, min), max)}px`;
  }, [minRows, maxRows]);

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
      adjustHeight();
    },
    [onChange, adjustHeight]
  );

  // ── Paste image support ───────────────────────────────

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageFiles: File[] = [];
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length > 0) {
        e.preventDefault();
        addFiles(imageFiles);
      }
    },
    [addFiles]
  );

  // ── Submit ────────────────────────────────────────────

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed && files.length === 0) return;
    onSubmit(trimmed, files);
    onChange('');
    clearFiles();
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, files, onSubmit, onChange, clearFiles]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  // ── File picker ───────────────────────────────────────

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        addFiles(e.target.files);
        e.target.value = ''; // reset so same file can be re-added
      }
    },
    [addFiles]
  );

  const canSubmit = value.trim().length > 0 || files.length > 0;

  return (
    <div
      className={`relative rounded-xl border transition-colors ${
        isDragging
          ? 'border-blue-500/60 bg-blue-500/5'
          : 'border-white/10 bg-gray-900'
      } ${className}`}
      {...dragProps}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl">
          <div className="flex flex-col items-center gap-2 text-blue-400">
            <Image className="h-8 w-8" />
            <span className="text-sm font-medium">松开以附加文件</span>
          </div>
        </div>
      )}

      {/* File previews */}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 border-b border-white/10 px-3 py-2">
          {files.map((f) => (
            <FilePreview key={f.id} file={f} onRemove={removeFile} />
          ))}
        </div>
      )}

      {/* Text input */}
      <div className="flex items-end gap-2 px-3 py-2.5">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          rows={minRows}
          className="flex-1 resize-none bg-transparent text-sm text-white placeholder-gray-500 outline-none"
          style={{ minHeight: `${minRows * 20}px` }}
        />

        {/* Toolbar */}
        <div className="flex shrink-0 items-center gap-1 pb-0.5">
          {/* Attach file button */}
          <button
            type="button"
            onClick={openFilePicker}
            disabled={disabled || files.length >= 5}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
            title="附加文件（图片/PDF/文档，最多 5 个）"
          >
            <Paperclip className="h-4 w-4" />
          </button>

          {/* Send button */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={disabled || !canSubmit}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white transition-colors hover:bg-blue-500 disabled:opacity-40"
            title="发送（Enter）"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Hint text */}
      <div className="flex items-center justify-between border-t border-white/5 px-3 py-1 text-[11px] text-gray-600">
        <span>拖拽或粘贴图片·PDF·文档</span>
        <span>Enter 发送 · Shift+Enter 换行</span>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={handleFileInputChange}
      />
    </div>
  );
}
