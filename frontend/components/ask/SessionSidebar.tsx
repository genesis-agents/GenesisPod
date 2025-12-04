'use client';

import { useState, useEffect, useCallback } from 'react';
import { config } from '@/lib/config';
import { useAuth } from '@/contexts/AuthContext';

interface Session {
  id: string;
  title: string;
  summary?: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

interface GroupedSessions {
  today: Session[];
  yesterday: Session[];
  lastWeek: Session[];
  older: Session[];
}

interface SessionSidebarProps {
  currentSessionId?: string;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
  isOpen: boolean;
  onToggle: () => void;
}

export default function SessionSidebar({
  currentSessionId,
  onSelectSession,
  onNewSession,
  isOpen,
  onToggle,
}: SessionSidebarProps) {
  const { accessToken: token } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [contextMenu, setContextMenu] = useState<{
    sessionId: string;
    x: number;
    y: number;
  } | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  // Fetch sessions
  const fetchSessions = useCallback(async () => {
    if (!token) return;

    try {
      setLoading(true);
      const response = await fetch(`${config.apiUrl}/ask/sessions?limit=100`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setSessions(data.sessions || []);
      }
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Group sessions by date
  const groupSessions = (sessions: Session[]): GroupedSessions => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);

    const groups: GroupedSessions = {
      today: [],
      yesterday: [],
      lastWeek: [],
      older: [],
    };

    sessions.forEach((session) => {
      const updatedAt = new Date(session.updatedAt);
      if (updatedAt >= today) {
        groups.today.push(session);
      } else if (updatedAt >= yesterday) {
        groups.yesterday.push(session);
      } else if (updatedAt >= lastWeek) {
        groups.lastWeek.push(session);
      } else {
        groups.older.push(session);
      }
    });

    return groups;
  };

  // Filter sessions by search query
  const filteredSessions = searchQuery
    ? sessions.filter(
        (s) =>
          s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.summary?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : sessions;

  const groupedSessions = groupSessions(filteredSessions);

  // Handle context menu
  const handleContextMenu = (e: React.MouseEvent, sessionId: string) => {
    e.preventDefault();
    setContextMenu({ sessionId, x: e.clientX, y: e.clientY });
  };

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  // Delete session
  const handleDeleteSession = async (sessionId: string) => {
    if (!token) return;

    try {
      const response = await fetch(
        `${config.apiUrl}/ask/sessions/${sessionId}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        if (currentSessionId === sessionId) {
          onNewSession();
        }
      }
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
    setContextMenu(null);
  };

  // Rename session
  const handleStartRename = (session: Session) => {
    setEditingSessionId(session.id);
    setEditTitle(session.title);
    setContextMenu(null);
  };

  const handleSaveRename = async () => {
    if (!token || !editingSessionId || !editTitle.trim()) return;

    try {
      const response = await fetch(
        `${config.apiUrl}/ask/sessions/${editingSessionId}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ title: editTitle.trim() }),
        }
      );

      if (response.ok) {
        setSessions((prev) =>
          prev.map((s) =>
            s.id === editingSessionId ? { ...s, title: editTitle.trim() } : s
          )
        );
      }
    } catch (error) {
      console.error('Failed to rename session:', error);
    }
    setEditingSessionId(null);
  };

  // Render session item
  const renderSessionItem = (session: Session) => {
    const isEditing = editingSessionId === session.id;
    const isSelected = currentSessionId === session.id;

    return (
      <div
        key={session.id}
        className={`group relative flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 transition-colors ${
          isSelected
            ? 'bg-purple-100 text-purple-700'
            : 'text-gray-700 hover:bg-gray-100'
        }`}
        onClick={() => !isEditing && onSelectSession(session.id)}
        onContextMenu={(e) => handleContextMenu(e, session.id)}
      >
        <svg
          className="h-4 w-4 shrink-0 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
        {isEditing ? (
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={handleSaveRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveRename();
              if (e.key === 'Escape') setEditingSessionId(null);
            }}
            className="flex-1 truncate rounded bg-white px-1 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="flex-1 truncate text-sm">{session.title}</span>
        )}
        {!isEditing && (
          <button
            className="invisible rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600 group-hover:visible"
            onClick={(e) => {
              e.stopPropagation();
              handleContextMenu(e, session.id);
            }}
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
            </svg>
          </button>
        )}
      </div>
    );
  };

  // Render session group
  const renderGroup = (title: string, sessions: Session[]) => {
    if (sessions.length === 0) return null;

    return (
      <div className="mb-4">
        <div className="mb-1 px-3 text-xs font-medium text-gray-400">
          {title}
        </div>
        <div className="space-y-0.5">{sessions.map(renderSessionItem)}</div>
      </div>
    );
  };

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="fixed left-4 top-20 z-30 rounded-lg bg-white p-2 shadow-md hover:bg-gray-50"
        title="Show chat history"
      >
        <svg
          className="h-5 w-5 text-gray-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 6h16M4 12h16M4 18h16"
          />
        </svg>
      </button>
    );
  }

  return (
    <>
      {/* Sidebar */}
      <div className="flex h-full w-64 flex-col border-r border-gray-200 bg-white">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h2 className="font-medium text-gray-800">Chat History</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={onNewSession}
              className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
              title="New chat"
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
                  d="M12 4v16m8-8H4"
                />
              </svg>
            </button>
            <button
              onClick={onToggle}
              className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
              title="Hide sidebar"
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
                  d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-3 py-2">
          <div className="relative">
            <svg
              className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              placeholder="Search chats..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 py-1.5 pl-8 pr-3 text-sm focus:border-purple-300 focus:outline-none focus:ring-1 focus:ring-purple-300"
            />
          </div>
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-purple-500 border-t-transparent"></div>
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400">
              {searchQuery ? 'No matching chats' : 'No chat history yet'}
            </div>
          ) : (
            <>
              {renderGroup('Today', groupedSessions.today)}
              {renderGroup('Yesterday', groupedSessions.yesterday)}
              {renderGroup('Last 7 Days', groupedSessions.lastWeek)}
              {renderGroup('Older', groupedSessions.older)}
            </>
          )}
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 w-40 rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100"
            onClick={() => {
              const session = sessions.find(
                (s) => s.id === contextMenu.sessionId
              );
              if (session) handleStartRename(session);
            }}
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
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
            Rename
          </button>
          <button
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50"
            onClick={() => handleDeleteSession(contextMenu.sessionId)}
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
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
            Delete
          </button>
        </div>
      )}
    </>
  );
}
