'use client';

import type { Editor } from '@tiptap/react';

interface TipTapToolbarProps {
  editor: Editor;
}

export function TipTapToolbar({ editor }: TipTapToolbarProps) {
  return (
    <div className="flex items-center gap-1 border-b border-gray-100 bg-gray-50 px-4 py-1.5">
      <button
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={`rounded p-1.5 ${
          editor.isActive('bold')
            ? 'bg-blue-100 text-blue-700'
            : 'text-gray-600 hover:bg-gray-200'
        }`}
        title="粗体 (Ctrl+B)"
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
            d="M6 4h8a4 4 0 014 4 4 4 0 01-4 4H6V4zm0 8h9a4 4 0 014 4 4 4 0 01-4 4H6v-8z"
          />
        </svg>
      </button>
      <button
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={`rounded p-1.5 ${
          editor.isActive('italic')
            ? 'bg-blue-100 text-blue-700'
            : 'text-gray-600 hover:bg-gray-200'
        }`}
        title="斜体 (Ctrl+I)"
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
            d="M10 4h4m-2 0v16m-4 0h8"
          />
        </svg>
      </button>
      <div className="mx-1 h-4 w-px bg-gray-300" />
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        className={`rounded p-1.5 ${
          editor.isActive('heading', { level: 2 })
            ? 'bg-blue-100 text-blue-700'
            : 'text-gray-600 hover:bg-gray-200'
        }`}
        title="标题"
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
            d="M4 6h16M4 12h16M4 18h7"
          />
        </svg>
      </button>
      <button
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={`rounded p-1.5 ${
          editor.isActive('bulletList')
            ? 'bg-blue-100 text-blue-700'
            : 'text-gray-600 hover:bg-gray-200'
        }`}
        title="列表"
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
            d="M4 6h16M4 10h16M4 14h16M4 18h16"
          />
        </svg>
      </button>
      <div className="mx-1 h-4 w-px bg-gray-300" />
      <button
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        className={`rounded px-2 py-1 text-xs ${
          editor.isActive('blockquote')
            ? 'bg-blue-100 text-blue-700'
            : 'text-gray-600 hover:bg-gray-200'
        }`}
        title="引用"
      >
        引用
      </button>
      <button
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        className={`rounded px-2 py-1 text-xs ${
          editor.isActive('codeBlock')
            ? 'bg-blue-100 text-blue-700'
            : 'text-gray-600 hover:bg-gray-200'
        }`}
        title="代码块"
      >
        代码
      </button>
      <div className="mx-1 h-4 w-px bg-gray-300" />
      <button
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-200 disabled:opacity-50"
        title="撤销"
      >
        撤销
      </button>
      <button
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-200 disabled:opacity-50"
        title="重做"
      >
        重做
      </button>
    </div>
  );
}
