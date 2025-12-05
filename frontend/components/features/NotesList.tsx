'use client';

import { useState, useEffect } from 'react';
import { config } from '@/lib/config';
import { getAuthHeader } from '@/lib/auth';
import ReactMarkdown from 'react-markdown';

interface Note {
  id: string;
  resourceId: string;
  content: string;
  highlights: any[];
  tags: string[];
  isPublic: boolean;
  isBookmarked: boolean;
  createdAt: string;
  updatedAt: string;
  resource: {
    id: string;
    type: string;
    title: string;
    thumbnailUrl?: string;
  };
}

interface NotesListProps {
  resourceId?: string;
  source?: string; // Add source prop
  searchQuery?: string;
  refreshKey?: number; // Trigger reload when changed
  onNoteClick?: (note: Note) => void;
  onEditNote?: (note: Note) => void;
  onDeleteNote?: (noteId: string) => void;
  showActions?: boolean; // Always show edit/delete buttons
}

export default function NotesList({
  resourceId,
  source,
  searchQuery = '',
  refreshKey,
  onNoteClick,
  onEditNote,
  onDeleteNote,
  showActions = false,
}: NotesListProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [editContent, setEditContent] = useState('');

  useEffect(() => {
    loadNotes();
  }, [resourceId, source, refreshKey]);

  const loadNotes = async () => {
    try {
      setLoading(true);
      setError(null);

      let url;
      if (resourceId) {
        url = `${config.apiBaseUrl}/api/v1/notes/resource/${resourceId}`;
      } else if (source) {
        url = `${config.apiBaseUrl}/api/v1/notes?source=${encodeURIComponent(source)}`;
      } else {
        url = `${config.apiBaseUrl}/api/v1/notes`;
      }

      console.log('Loading notes from:', url);

      const response = await fetch(url, {
        headers: getAuthHeader(),
      });

      if (response.ok) {
        const data = await response.json();
        console.log('Notes loaded:', data);
        setNotes(resourceId ? data : data.notes);
      } else {
        setError('Failed to load notes');
      }
    } catch (err) {
      setError('Error loading notes');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (noteId: string) => {
    if (!confirm('Are you sure you want to delete this note?')) return;

    try {
      const response = await fetch(
        `${config.apiBaseUrl}/api/v1/notes/${noteId}`,
        {
          method: 'DELETE',
          headers: getAuthHeader(),
        }
      );

      if (response.ok) {
        setNotes(notes.filter((n) => n.id !== noteId));
        onDeleteNote?.(noteId);
      } else {
        alert('Failed to delete note');
      }
    } catch (err) {
      alert('Error deleting note');
      console.error(err);
    }
  };

  const handleStartEdit = (note: Note) => {
    setEditingNote(note);
    setEditContent(note.content);
  };

  const handleSaveEdit = async () => {
    if (!editingNote) return;

    try {
      const response = await fetch(
        `${config.apiBaseUrl}/api/v1/notes/${editingNote.id}`,
        {
          method: 'PATCH',
          headers: {
            ...getAuthHeader(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            content: editContent,
          }),
        }
      );

      if (response.ok) {
        const updatedNote = await response.json();
        setNotes(
          notes.map((n) =>
            n.id === editingNote.id ? { ...n, content: editContent } : n
          )
        );
        setEditingNote(null);
        setEditContent('');
        onEditNote?.({ ...editingNote, content: editContent });
      } else {
        alert('Failed to save note');
      }
    } catch (err) {
      alert('Error saving note');
      console.error(err);
    }
  };

  const handleCancelEdit = () => {
    setEditingNote(null);
    setEditContent('');
  };

  const handleToggleBookmark = async (noteId: string) => {
    try {
      const response = await fetch(
        `${config.apiBaseUrl}/api/v1/notes/${noteId}/bookmark`,
        {
          method: 'POST',
          headers: getAuthHeader(),
        }
      );

      if (response.ok) {
        const updatedNote = await response.json();
        setNotes(
          notes.map((n) =>
            n.id === noteId
              ? { ...n, isBookmarked: updatedNote.isBookmarked }
              : n
          )
        );
      } else {
        alert('Failed to update bookmark');
      }
    } catch (err) {
      alert('Error updating bookmark');
      console.error(err);
    }
  };

  // Get all unique tags
  const allTags = Array.from(
    new Set(notes.flatMap((note) => note.tags))
  ).sort();

  // Filter and search notes
  const filteredNotes = notes.filter((note) => {
    const matchesTag = !selectedTag || note.tags.includes(selectedTag);
    const matchesSearch =
      !searchQuery ||
      note.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      note.resource?.title.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTag && matchesSearch;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded border border-red-400 bg-red-100 px-4 py-3 text-red-700">
        {error}
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <div className="py-12 text-center">
        <svg
          className="mx-auto h-12 w-12 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <h3 className="mt-2 text-sm font-semibold text-gray-900">
          No notes yet
        </h3>
        <p className="mt-1 text-xs text-gray-600">
          Start creating notes to save your thoughts
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tag filter chips - Only show in Notes tab */}
      {allTags.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase text-gray-600">
            Tags:
          </span>
          <button
            onClick={() => setSelectedTag(null)}
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-all ${
              selectedTag === null
                ? 'bg-blue-600 text-white'
                : 'border border-gray-300 bg-white text-gray-700 hover:border-blue-300'
            }`}
          >
            All
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setSelectedTag(tag)}
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-all ${
                selectedTag === tag
                  ? 'bg-blue-600 text-white'
                  : 'border border-gray-300 bg-white text-gray-700 hover:border-blue-300'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* Notes List - Single column for sidebar */}
      <div className="space-y-3">
        {filteredNotes.map((note) => {
          const isExpanded = expandedNoteId === note.id;
          return (
            <div
              key={note.id}
              className="cursor-pointer rounded-lg border border-gray-200 bg-white p-3 transition-all hover:border-blue-300 hover:shadow-md"
              onClick={() => setExpandedNoteId(isExpanded ? null : note.id)}
            >
              {/* Resource info header */}
              {!resourceId && note.resource && (
                <div className="mb-2 truncate text-xs text-gray-500">
                  <span className="font-medium">{note.resource.type}:</span>{' '}
                  {note.resource.title}
                </div>
              )}

              {/* Content preview - Markdown rendered */}
              <div
                className={`prose prose-sm mb-2 max-w-none text-sm leading-relaxed text-gray-700 ${isExpanded ? '' : 'line-clamp-4'}`}
              >
                <ReactMarkdown
                  components={{
                    // 简化标题显示
                    h1: ({ children }) => (
                      <span className="font-bold">{children}</span>
                    ),
                    h2: ({ children }) => (
                      <span className="font-bold">{children}</span>
                    ),
                    h3: ({ children }) => (
                      <span className="font-semibold">{children}</span>
                    ),
                    h4: ({ children }) => (
                      <span className="font-semibold">{children}</span>
                    ),
                    // 列表项紧凑显示
                    ul: ({ children }) => (
                      <ul className="my-1 list-disc pl-4">{children}</ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="my-1 list-decimal pl-4">{children}</ol>
                    ),
                    li: ({ children }) => <li className="my-0">{children}</li>,
                    // 段落紧凑
                    p: ({ children }) => <p className="my-1">{children}</p>,
                  }}
                >
                  {note.content}
                </ReactMarkdown>
              </div>

              {/* Footer: Tags + Date + Actions + Expand indicator */}
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  {/* Tags */}
                  {note.tags && note.tags.length > 0 && (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 font-medium text-blue-700">
                      {note.tags[0]}
                      {note.tags.length > 1 && ` +${note.tags.length - 1}`}
                    </span>
                  )}
                  {/* Date */}
                  <span className="text-gray-400">
                    {new Date(note.createdAt).toLocaleDateString('zh-CN', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </div>

                {/* Actions + Expand indicator */}
                <div className="flex items-center gap-2">
                  {showActions && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleBookmark(note.id);
                      }}
                      className={`transition-colors ${
                        note.isBookmarked
                          ? 'text-yellow-500 hover:text-yellow-600'
                          : 'text-gray-400 hover:text-yellow-500'
                      }`}
                      title={note.isBookmarked ? 'Remove bookmark' : 'Bookmark'}
                    >
                      <svg
                        className="h-4 w-4"
                        fill={note.isBookmarked ? 'currentColor' : 'none'}
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                        />
                      </svg>
                    </button>
                  )}
                  {(showActions || onEditNote) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onEditNote) {
                          onEditNote(note);
                        } else {
                          handleStartEdit(note);
                        }
                      }}
                      className="text-blue-600 hover:text-blue-800"
                      title="Edit note"
                    >
                      Edit
                    </button>
                  )}
                  {(showActions || onDeleteNote) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(note.id);
                      }}
                      className="text-red-500 hover:text-red-700"
                      title="Delete note"
                    >
                      Delete
                    </button>
                  )}
                  <svg
                    className={`h-4 w-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
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
            </div>
          );
        })}
      </div>

      {/* Edit Modal */}
      {editingNote && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={handleCancelEdit}
        >
          <div
            className="mx-4 w-full max-w-2xl rounded-lg bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-4 text-lg font-semibold text-gray-900">
              Edit Note
            </h3>
            {editingNote.resource && (
              <div className="mb-3 text-sm text-gray-500">
                <span className="font-medium">
                  {editingNote.resource.type}:
                </span>{' '}
                {editingNote.resource.title}
              </div>
            )}
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="mb-4 h-64 w-full rounded-lg border border-gray-300 p-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Enter note content..."
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={handleCancelEdit}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
