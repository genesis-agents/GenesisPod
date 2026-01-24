'use client';

import { useState, useEffect } from 'react';
import { config } from '@/lib/utils/config';
import TextHighlighter from '../../ui/TextHighlighter';
import NoteEditor from './NoteEditor';

import { logger } from '@/lib/utils/logger';
interface Resource {
  id: string;
  type: string;
  title: string;
  abstract?: string;
  content?: string;
  pdfUrl?: string;
}

interface Note {
  id: string;
  resourceId: string;
  content: string;
  highlights: Array<Record<string, unknown>>;
  tags: string[];
  isPublic: boolean;
}

interface ResourceReaderProps {
  resourceId: string;
  onClose?: () => void;
}

/**
 * 资源阅读器组件
 *
 * 功能：
 * - 左侧：资源内容展示 + 文本高亮
 * - 右侧：笔记编辑器
 * - 集成高亮和笔记功能
 */
export default function ResourceReader({
  resourceId,
  onClose,
}: ResourceReaderProps) {
  const [resource, setResource] = useState<Resource | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNoteEditor, setShowNoteEditor] = useState(false);
  const [highlights, setHighlights] = useState<any[]>([]);

  useEffect(() => {
    loadResource();
    loadOrCreateNote();
  }, [resourceId]);

  const loadResource = async () => {
    try {
      const response = await fetch(
        `${config.apiBaseUrl}/api/v1/resources/${resourceId}`
      );
      if (response.ok) {
        const result = await response.json();
        // Handle wrapped response { success: true, data: {...} }
        const data = result?.data ?? result;
        setResource(data);
      }
    } catch (err) {
      logger.error('Failed to load resource:', err);
    }
  };

  const loadOrCreateNote = async () => {
    try {
      setLoading(true);

      // Try to load existing note
      const response = await fetch(
        `${config.apiBaseUrl}/api/v1/notes/resource/${resourceId}`
      );

      if (response.ok) {
        const result = await response.json();
        // Handle wrapped response { success: true, data: [...] }
        const notes = result?.data ?? result;
        const notesArray = Array.isArray(notes) ? notes : [];
        if (notesArray.length > 0) {
          const userNote = notesArray[0]; // Get first note (user's own note)
          setNote(userNote);
          setHighlights(userNote.highlights || []);
        } else {
          // Create a new note if none exists
          await createNewNote();
        }
      }
    } catch (err) {
      logger.error('Failed to load notes:', err);
    } finally {
      setLoading(false);
    }
  };

  const createNewNote = async () => {
    try {
      const response = await fetch(`${config.apiBaseUrl}/api/v1/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resourceId,
          content: '',
          highlights: [],
          tags: [],
          isPublic: false,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        // Handle wrapped response { success: true, data: {...} }
        const newNote = result?.data ?? result;
        setNote(newNote);
        setHighlights([]);
      }
    } catch (err) {
      logger.error('Failed to create note:', err);
    }
  };

  const handleHighlightAdded = (highlight: any) => {
    setHighlights([...highlights, highlight]);
  };

  const handleHighlightRemoved = (highlightId: string) => {
    setHighlights(highlights.filter((h) => h.id !== highlightId));
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!resource || !note) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900">资源未找到</h2>
          <button
            onClick={onClose}
            className="mt-4 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            返回
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-gray-50">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h1 className="mb-1 text-2xl font-bold text-gray-900">
              {resource.title}
            </h1>
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <span className="font-medium uppercase">{resource.type}</span>
              {resource.pdfUrl && (
                <a
                  href={`${config.apiBaseUrl}${resource.pdfUrl}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800"
                >
                  打开PDF
                </a>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowNoteEditor(!showNoteEditor)}
              className={`rounded px-4 py-2 text-sm font-medium transition-colors ${
                showNoteEditor
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              {showNoteEditor ? '隐藏笔记' : '显示笔记'}
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="rounded px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
              >
                关闭
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Resource Content with Highlighting */}
        <div
          className={`${showNoteEditor ? 'w-1/2' : 'w-full'} overflow-auto border-r border-gray-200 bg-white`}
        >
          <div className="mx-auto max-w-4xl px-8 py-8">
            {/* Abstract */}
            {resource.abstract && (
              <div className="mb-8 rounded border-l-4 border-blue-500 bg-blue-50 p-6">
                <h2 className="mb-2 text-lg font-semibold text-gray-900">
                  摘要
                </h2>
                <p className="leading-relaxed text-gray-700">
                  {resource.abstract}
                </p>
              </div>
            )}

            {/* Content with Highlighting */}
            {resource.content && (
              <div className="prose prose-lg max-w-none">
                <TextHighlighter
                  noteId={note.id}
                  content={resource.content}
                  highlights={highlights}
                  onHighlightAdded={handleHighlightAdded}
                  onHighlightRemoved={handleHighlightRemoved}
                  className="leading-relaxed text-gray-800"
                />
              </div>
            )}

            {!resource.content && (
              <div className="py-12 text-center">
                <p className="text-gray-500">内容不可用。请查看PDF文件。</p>
                {resource.pdfUrl && (
                  <a
                    href={`${config.apiBaseUrl}${resource.pdfUrl}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-block rounded bg-blue-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                  >
                    打开PDF
                  </a>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: Note Editor */}
        {showNoteEditor && (
          <div className="w-1/2 overflow-auto bg-gray-50">
            <NoteEditor
              resourceId={resourceId}
              noteId={note.id}
              onSave={(savedNote) => {
                setNote(savedNote);
              }}
            />
          </div>
        )}
      </div>

      {/* Highlights Summary */}
      {highlights.length > 0 && !showNoteEditor && (
        <div className="fixed bottom-6 right-6 max-w-sm rounded-lg border border-gray-200 bg-white p-4 shadow-lg">
          <h3 className="mb-2 text-sm font-semibold text-gray-900">
            高亮总结 ({highlights.length})
          </h3>
          <div className="max-h-48 space-y-2 overflow-auto">
            {highlights.slice(0, 5).map((highlight) => (
              <div
                key={highlight.id}
                className="rounded p-2 text-xs"
                style={{ backgroundColor: highlight.color + '30' }}
              >
                <p className="line-clamp-2 text-gray-900">{highlight.text}</p>
                {highlight.note && (
                  <p className="mt-1 italic text-gray-600">{highlight.note}</p>
                )}
              </div>
            ))}
          </div>
          {highlights.length > 5 && (
            <button
              onClick={() => setShowNoteEditor(true)}
              className="mt-2 text-xs text-blue-600 hover:text-blue-800"
            >
              查看全部 {highlights.length} 个高亮
            </button>
          )}
        </div>
      )}
    </div>
  );
}
