'use client';

/**
 * useFileUpload
 *
 * 文件拖拽上传 Hook。
 * 支持图片（jpeg/png/webp/gif）和文档（pdf/docx/txt/csv）。
 * 限制：单文件最大 20MB，总文件数最多 5 个。
 */

import { useState, useCallback, useRef } from 'react';

// ─── Types ───────────────────────────────────────────────

export type AttachedFileType = 'image' | 'pdf' | 'document';

export interface AttachedFile {
  id: string;
  file: File;
  type: AttachedFileType;
  /** Object URL for preview (images only) */
  previewUrl?: string;
  /** Extraction status */
  status: 'pending' | 'ready' | 'error';
  errorMessage?: string;
}

// ─── Constants ────────────────────────────────────────────

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB
const MAX_FILES = 5;

const ACCEPTED_TYPES: Record<string, AttachedFileType> = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
  'image/gif': 'image',
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'document',
  'text/plain': 'document',
  'text/csv': 'document',
};

// ─── Hook ─────────────────────────────────────────────────

export interface UseFileUploadReturn {
  files: AttachedFile[];
  isDragging: boolean;
  addFiles: (fileList: FileList | File[]) => void;
  removeFile: (id: string) => void;
  clearFiles: () => void;
  dragProps: {
    onDragEnter: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };
}

export function useFileUpload(): UseFileUploadReturn {
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  const processFile = useCallback((file: File): AttachedFile | null => {
    const fileType = ACCEPTED_TYPES[file.type];
    if (!fileType) return null;

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return {
        id: crypto.randomUUID(),
        file,
        type: fileType,
        status: 'error',
        errorMessage: `File exceeds 20MB limit`,
      };
    }

    const previewUrl =
      fileType === 'image' ? URL.createObjectURL(file) : undefined;

    return {
      id: crypto.randomUUID(),
      file,
      type: fileType,
      previewUrl,
      status: 'ready',
    };
  }, []);

  const addFiles = useCallback(
    (fileList: FileList | File[]) => {
      const incoming = Array.from(fileList);

      setFiles((prev) => {
        const remaining = MAX_FILES - prev.length;
        if (remaining <= 0) return prev;

        const toAdd = incoming
          .slice(0, remaining)
          .map(processFile)
          .filter((f): f is AttachedFile => f !== null);

        return [...prev, ...toAdd];
      });
    },
    [processFile]
  );

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => {
      const target = prev.find((f) => f.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  const clearFiles = useCallback(() => {
    setFiles((prev) => {
      prev.forEach((f) => {
        if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
      });
      return [];
    });
  }, []);

  // ── Drag handlers ──────────────────────────────────────

  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current += 1;
    if (dragCounter.current === 1) setIsDragging(true);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) setIsDragging(false);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      dragCounter.current = 0;
      setIsDragging(false);
      if (e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles]
  );

  return {
    files,
    isDragging,
    addFiles,
    removeFile,
    clearFiles,
    dragProps: { onDragEnter, onDragOver, onDragLeave, onDrop },
  };
}
