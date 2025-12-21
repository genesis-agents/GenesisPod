'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { BlockNoteView } from '@blocknote/mantine';
import { BlockNoteEditor, PartialBlock, Block } from '@blocknote/core';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';

import {
  notionBlocksToBlockNote,
  blockNoteToNotionBlocks,
} from '@/lib/notion/block-converter';

interface NotionBlockEditorProps {
  initialBlocks?: any[];
  onChange?: (blocks: any[]) => void;
  onSave?: (blocks: any[]) => Promise<void>;
  readOnly?: boolean;
  className?: string;
}

export default function NotionBlockEditor({
  initialBlocks = [],
  onChange,
  onSave,
  readOnly = false,
  className = '',
}: NotionBlockEditorProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);

  // Convert Notion blocks to BlockNote format
  const initialContent = useMemo(() => {
    try {
      return notionBlocksToBlockNote(initialBlocks);
    } catch (error) {
      console.error('Failed to convert Notion blocks:', error);
      return [{ type: 'paragraph' as const, content: [] }];
    }
  }, [initialBlocks]);

  // Create editor instance
  const editor = useMemo(() => {
    if (typeof window === 'undefined') return null;

    return BlockNoteEditor.create({
      initialContent: initialContent as PartialBlock[],
    });
  }, [initialContent]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Handle editor changes
  const handleChange = useCallback(() => {
    if (!editor || readOnly) return;

    setHasChanges(true);

    if (onChange) {
      try {
        const blocks = editor.document;
        const notionBlocks = blockNoteToNotionBlocks(blocks as Block[]);
        onChange(notionBlocks);
      } catch (error) {
        console.error('Failed to convert blocks:', error);
      }
    }
  }, [editor, onChange, readOnly]);

  // Handle save
  const handleSave = useCallback(async () => {
    if (!editor || !onSave || saving) return;

    setSaving(true);
    try {
      const blocks = editor.document;
      const notionBlocks = blockNoteToNotionBlocks(blocks as Block[]);
      await onSave(notionBlocks);
      setHasChanges(false);
    } catch (error) {
      console.error('Failed to save:', error);
    } finally {
      setSaving(false);
    }
  }, [editor, onSave, saving]);

  // Keyboard shortcut for save (Ctrl/Cmd + S)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (hasChanges && onSave) {
          handleSave();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [hasChanges, onSave, handleSave]);

  if (!isMounted || !editor) {
    return (
      <div className={`animate-pulse ${className}`}>
        <div className="h-8 w-3/4 rounded bg-gray-200" />
        <div className="mt-4 h-4 w-full rounded bg-gray-200" />
        <div className="mt-2 h-4 w-5/6 rounded bg-gray-200" />
        <div className="mt-2 h-4 w-4/6 rounded bg-gray-200" />
      </div>
    );
  }

  return (
    <div className={`notion-block-editor ${className}`}>
      {/* Save indicator */}
      {!readOnly && (
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            {hasChanges ? (
              <>
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                <span>Unsaved changes</span>
              </>
            ) : (
              <>
                <span className="h-2 w-2 rounded-full bg-green-500" />
                <span>All changes saved</span>
              </>
            )}
          </div>
          {onSave && (
            <button
              onClick={handleSave}
              disabled={!hasChanges || saving}
              className="flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? (
                <>
                  <svg
                    className="h-4 w-4 animate-spin"
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
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Saving...
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
                      d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
                    />
                  </svg>
                  Save
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* BlockNote Editor */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <BlockNoteView
          editor={editor}
          editable={!readOnly}
          onChange={handleChange}
          theme="light"
          data-theming-css-variables-demo
        />
      </div>

      {/* Editor tips */}
      {!readOnly && (
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-gray-400">
          <span>
            <kbd className="rounded bg-gray-100 px-1.5 py-0.5">/</kbd> Commands
          </span>
          <span>
            <kbd className="rounded bg-gray-100 px-1.5 py-0.5">Ctrl+S</kbd> Save
          </span>
          <span>
            <kbd className="rounded bg-gray-100 px-1.5 py-0.5">Ctrl+B</kbd> Bold
          </span>
          <span>
            <kbd className="rounded bg-gray-100 px-1.5 py-0.5">Ctrl+I</kbd>{' '}
            Italic
          </span>
        </div>
      )}

      {/* Custom styles for BlockNote */}
      <style jsx global>{`
        .notion-block-editor .bn-container {
          font-family:
            ui-sans-serif,
            -apple-system,
            BlinkMacSystemFont,
            'Segoe UI',
            Helvetica,
            'Apple Color Emoji',
            Arial,
            sans-serif,
            'Segoe UI Emoji',
            'Segoe UI Symbol';
        }

        .notion-block-editor .bn-editor {
          padding: 1rem;
          min-height: 400px;
        }

        .notion-block-editor .bn-block-outer {
          margin: 0.25rem 0;
        }

        .notion-block-editor [data-content-type='heading'] {
          margin-top: 1.5rem;
        }

        .notion-block-editor [data-content-type='heading'][data-level='1'] {
          font-size: 1.875rem;
          font-weight: 700;
        }

        .notion-block-editor [data-content-type='heading'][data-level='2'] {
          font-size: 1.5rem;
          font-weight: 600;
        }

        .notion-block-editor [data-content-type='heading'][data-level='3'] {
          font-size: 1.25rem;
          font-weight: 600;
        }

        .notion-block-editor [data-content-type='codeBlock'] {
          background-color: #1e1e1e;
          border-radius: 0.5rem;
          padding: 1rem;
        }

        .notion-block-editor [data-content-type='codeBlock'] code {
          color: #d4d4d4;
          font-family: 'Fira Code', 'Monaco', monospace;
        }

        /* Placeholder styling */
        .notion-block-editor .bn-inline-content[data-placeholder]::before {
          color: #9ca3af;
        }

        /* Selection styling */
        .notion-block-editor .bn-editor ::selection {
          background-color: rgba(59, 130, 246, 0.2);
        }

        /* Slash menu styling */
        .notion-block-editor .bn-slash-menu {
          border-radius: 0.5rem;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);
        }

        /* Toolbar styling */
        .notion-block-editor .bn-toolbar {
          border-radius: 0.5rem;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }
      `}</style>
    </div>
  );
}
