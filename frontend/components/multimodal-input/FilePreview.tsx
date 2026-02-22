'use client';

/**
 * FilePreview
 * 单个附件的缩略图 / 标签展示，带移除按钮。
 */

import { X, FileText, FileSpreadsheet, File } from 'lucide-react';
import { AttachedFile } from './useFileUpload';

interface FilePreviewProps {
  file: AttachedFile;
  onRemove: (id: string) => void;
}

function FileIcon({ type }: { type: AttachedFile['type'] }) {
  if (type === 'pdf') return <FileText className="h-5 w-5 text-red-400" />;
  if (type === 'document')
    return <FileSpreadsheet className="h-5 w-5 text-blue-400" />;
  return <File className="h-5 w-5 text-gray-400" />;
}

function truncateName(name: string, maxLen = 20): string {
  if (name.length <= maxLen) return name;
  const ext = name.lastIndexOf('.');
  if (ext > 0) {
    const base = name.slice(0, maxLen - 6 - (name.length - ext));
    return `${base}…${name.slice(ext)}`;
  }
  return `${name.slice(0, maxLen - 1)}…`;
}

export function FilePreview({ file, onRemove }: FilePreviewProps) {
  const isError = file.status === 'error';

  return (
    <div
      className={`group relative flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs transition-colors ${
        isError
          ? 'border-red-500/40 bg-red-500/10 text-red-400'
          : 'border-white/10 bg-white/5 text-gray-300'
      }`}
      title={isError ? file.errorMessage : file.file.name}
    >
      {/* Image thumbnail or file icon */}
      {file.type === 'image' && file.previewUrl ? (
        <img
          src={file.previewUrl}
          alt={file.file.name}
          className="h-8 w-8 rounded object-cover"
        />
      ) : (
        <FileIcon type={file.type} />
      )}

      {/* Name */}
      <span className="max-w-[120px] truncate">
        {truncateName(file.file.name)}
      </span>

      {/* Error badge */}
      {isError && (
        <span className="rounded-full bg-red-500/20 px-1.5 py-0.5 text-[10px] text-red-400">
          {file.errorMessage ?? 'Error'}
        </span>
      )}

      {/* Remove button */}
      <button
        onClick={() => onRemove(file.id)}
        className="ml-1 flex h-4 w-4 items-center justify-center rounded-full text-gray-500 opacity-0 transition-opacity hover:bg-white/20 hover:text-white group-hover:opacity-100"
        aria-label={`Remove ${file.file.name}`}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
