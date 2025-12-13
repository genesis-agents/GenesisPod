'use client';

/**
 * AI Studio - 研究项目详情页
 * 三栏布局：Sources | Chat | Studio (Notes + Outputs)
 * 对标 NotebookLM 设计
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getAuthTokens } from '@/lib/utils/auth';
import { useAIModels } from '@/hooks/useAIModels';
import MessageRenderer from '@/components/ai-office/chat/MessageRenderer';
import {
  ArrowLeft,
  Plus,
  Search,
  FileText,
  Github,
  Newspaper,
  Play,
  BookOpen,
  Send,
  Loader2,
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Download,
  Database,
  Trash2,
  Pin,
  PinOff,
  Sparkles,
  BookMarked,
  ClipboardList,
  HelpCircle,
  Calendar,
  Mic,
  TrendingUp,
  GitCompare,
  Network,
  X,
  Globe,
  Zap,
  Microscope,
  Eye,
  MoreVertical,
  Copy,
  RefreshCw,
  AlertCircle,
  Settings,
} from 'lucide-react';

// ==================== 类型定义 ====================
interface Source {
  id: string;
  title: string;
  sourceType: string;
  sourceUrl: string | null;
  abstract: string | null;
  content: string | null;
  authors: string[] | null;
  publishedAt: string | null;
  analysisStatus: 'PENDING' | 'ANALYZING' | 'COMPLETED' | 'FAILED';
  aiSummary: string | null;
  resourceId?: string | null;
  metadata: any;
  createdAt: string;
}

interface Note {
  id: string;
  title: string | null;
  content: string;
  sourceType: string | null;
  tags: string[];
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  citations?: string[];
}

interface Chat {
  id: string;
  messages: ChatMessage[];
  title: string | null;
  createdAt: string;
}

interface Output {
  id: string;
  type: string;
  title: string;
  status: 'PENDING' | 'GENERATING' | 'COMPLETED' | 'FAILED';
  content: string | null;
  metadata: any;
  createdAt: string;
}

interface Project {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  sources: Source[];
  notes: Note[];
  chats: Chat[];
  outputs: Output[];
  _count: {
    sources: number;
    notes: number;
    chats: number;
    outputs: number;
  };
}

// ==================== API ====================
const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

function getAuthHeaders(): HeadersInit {
  const tokens = getAuthTokens();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (tokens?.accessToken) {
    (headers as Record<string, string>)['Authorization'] =
      `Bearer ${tokens.accessToken}`;
  }
  return headers;
}

async function fetchProject(id: string): Promise<Project> {
  const res = await fetch(`${API_BASE}/api/v1/ai-studio/projects/${id}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch project');
  return res.json();
}

async function addSource(
  projectId: string,
  source: Partial<Source>
): Promise<Source> {
  const res = await fetch(
    `${API_BASE}/api/v1/ai-studio/projects/${projectId}/sources`,
    {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(source),
    }
  );
  if (!res.ok) throw new Error('Failed to add source');
  return res.json();
}

async function removeSource(
  projectId: string,
  sourceId: string
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/v1/ai-studio/projects/${projectId}/sources/${sourceId}`,
    {
      method: 'DELETE',
      headers: getAuthHeaders(),
    }
  );
  if (!res.ok) throw new Error('Failed to remove source');
}

async function sendChatMessage(
  projectId: string,
  message: string,
  selectedSourceIds?: string[],
  model?: string
): Promise<any> {
  const res = await fetch(
    `${API_BASE}/api/v1/ai-studio/projects/${projectId}/chat/messages`,
    {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ message, selectedSourceIds, model }),
    }
  );
  if (!res.ok) throw new Error('Failed to send message');
  return res.json();
}

async function createNote(
  projectId: string,
  note: Partial<Note>
): Promise<Note> {
  const res = await fetch(
    `${API_BASE}/api/v1/ai-studio/projects/${projectId}/notes`,
    {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(note),
    }
  );
  if (!res.ok) throw new Error('Failed to create note');
  return res.json();
}

async function updateNote(
  projectId: string,
  noteId: string,
  updates: Partial<Note>
): Promise<Note> {
  const res = await fetch(
    `${API_BASE}/api/v1/ai-studio/projects/${projectId}/notes/${noteId}`,
    {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify(updates),
    }
  );
  if (!res.ok) throw new Error('Failed to update note');
  return res.json();
}

async function deleteNote(projectId: string, noteId: string): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/v1/ai-studio/projects/${projectId}/notes/${noteId}`,
    {
      method: 'DELETE',
      headers: getAuthHeaders(),
    }
  );
  if (!res.ok) throw new Error('Failed to delete note');
}

async function generateOutput(
  projectId: string,
  type: string,
  selectedSourceIds?: string[]
): Promise<Output> {
  const res = await fetch(
    `${API_BASE}/api/v1/ai-studio/projects/${projectId}/outputs`,
    {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ type, selectedSourceIds }),
    }
  );
  if (!res.ok) throw new Error('Failed to generate output');
  const data = await res.json();
  return data.output;
}

async function searchSourcesApi(
  query: string,
  mode: 'quick' | 'deep' = 'quick',
  sources: string[] = ['local', 'web', 'arxiv', 'github']
): Promise<any> {
  const res = await fetch(`${API_BASE}/api/v1/ai-studio/search`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ query, mode, sources, includeInternet: true }),
  });
  if (!res.ok) throw new Error('Search failed');
  return res.json();
}

// ==================== Sources Panel ====================
interface SearchStats {
  totalResults: number;
  durationMs: number;
  searchRounds?: number;
  queriesExecuted?: string[];
  errors?: string[];
}

interface SearchResponse {
  results: any[];
  query: string;
  mode: 'quick' | 'deep';
  sourcesSearched: string[];
  stats: SearchStats;
}

function SourcesPanel({
  sources,
  selectedIds,
  onToggleSelect,
  onAddSource,
  onRemoveSource,
  collapsed,
  onToggleCollapse,
}: {
  sources: Source[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onAddSource: (source: Partial<Source>) => void;
  onRemoveSource: (id: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'quick' | 'deep'>('quick');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchStats, setSearchStats] = useState<SearchStats | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchSources, setSearchSources] = useState<string[]>([
    'local',
    'web',
    'arxiv',
    'github',
  ]);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [addingId, setAddingId] = useState<string | null>(null);
  const [viewingSource, setViewingSource] = useState<any | null>(null);

  const getSourceIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'paper':
        return <FileText className="h-4 w-4 text-blue-500" />;
      case 'github':
        return <Github className="h-4 w-4 text-gray-700" />;
      case 'news':
        return <Newspaper className="h-4 w-4 text-orange-500" />;
      case 'video':
        return <Play className="h-4 w-4 text-red-500" />;
      default:
        return <BookOpen className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusIcon = (status: Source['analysisStatus']) => {
    switch (status) {
      case 'COMPLETED':
        return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
      case 'ANALYZING':
        return <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />;
      case 'FAILED':
        return <AlertCircle className="h-3.5 w-3.5 text-red-500" />;
      default:
        return <Circle className="h-3.5 w-3.5 text-gray-300" />;
    }
  };

  const toggleSearchSource = (source: string) => {
    setSearchSources((prev) =>
      prev.includes(source)
        ? prev.filter((s) => s !== source)
        : [...prev, source]
    );
  };

  const handleSearch = async () => {
    if (!searchQuery.trim() || searchSources.length === 0) return;
    setSearching(true);
    setSearchStats(null);
    setSearchResults([]);
    try {
      const result: SearchResponse = await searchSourcesApi(
        searchQuery,
        searchMode,
        searchSources
      );
      setSearchResults(result.results || []);
      setSearchStats(result.stats);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setSearching(false);
    }
  };

  if (collapsed) {
    return (
      <div className="flex w-12 flex-col border-r border-gray-200 bg-gray-50">
        <button
          onClick={onToggleCollapse}
          className="flex h-12 items-center justify-center border-b border-gray-200 hover:bg-gray-100"
        >
          <ChevronRight className="h-4 w-4 text-gray-500" />
        </button>
        <div className="flex flex-1 flex-col items-center gap-2 py-4">
          {sources.slice(0, 5).map((source) => (
            <div
              key={source.id}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-white shadow-sm"
              title={source.title}
            >
              {getSourceIcon(source.sourceType)}
            </div>
          ))}
          {sources.length > 5 && (
            <span className="text-xs text-gray-400">+{sources.length - 5}</span>
          )}
        </div>
      </div>
    );
  }

  // Deduplicate sources by title (case-insensitive)
  const uniqueSources = sources.reduce((acc: Source[], source) => {
    const exists = acc.some(
      (s) => s.title.toLowerCase() === source.title.toLowerCase()
    );
    if (!exists) {
      acc.push(source);
    }
    return acc;
  }, []);

  const allSelected =
    uniqueSources.length > 0 &&
    uniqueSources.every((s) => selectedIds.has(s.id));
  const someSelected = uniqueSources.some((s) => selectedIds.has(s.id));

  const handleSelectAll = () => {
    if (allSelected) {
      // Deselect all
      uniqueSources.forEach((s) => {
        if (selectedIds.has(s.id)) {
          onToggleSelect(s.id);
        }
      });
    } else {
      // Select all
      uniqueSources.forEach((s) => {
        if (!selectedIds.has(s.id)) {
          onToggleSelect(s.id);
        }
      });
    }
  };

  return (
    <div className="flex w-72 flex-col border-r border-gray-200 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-gray-900">Sources</h3>
          <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
            {uniqueSources.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {uniqueSources.length > 0 && (
            <button
              onClick={handleSelectAll}
              className={`rounded-lg px-2 py-1 text-xs font-medium ${
                allSelected
                  ? 'bg-purple-100 text-purple-700'
                  : someSelected
                    ? 'bg-gray-100 text-gray-600'
                    : 'text-gray-500 hover:bg-gray-100'
              }`}
              title={allSelected ? 'Deselect all' : 'Select all'}
            >
              {allSelected ? 'Deselect All' : 'Select All'}
            </button>
          )}
          <button
            onClick={() => setShowAddDialog(true)}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
            title="Add source"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            onClick={onToggleCollapse}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
          >
            <ChevronDown className="h-4 w-4 rotate-90" />
          </button>
        </div>
      </div>

      {/* Source List */}
      <div className="flex-1 overflow-y-auto p-2">
        {uniqueSources.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <BookOpen className="h-8 w-8 text-gray-300" />
            <p className="mt-2 text-sm text-gray-500">No sources yet</p>
            <button
              onClick={() => setShowAddDialog(true)}
              className="mt-3 flex items-center gap-1 text-sm text-purple-600 hover:underline"
            >
              <Plus className="h-4 w-4" />
              Add your first source
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            {uniqueSources.map((source) => (
              <div
                key={source.id}
                className={`group relative rounded-lg border p-2.5 transition-all ${
                  selectedIds.has(source.id)
                    ? 'border-purple-300 bg-purple-50'
                    : 'border-transparent hover:border-gray-200 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-start gap-2">
                  <button
                    onClick={() => onToggleSelect(source.id)}
                    className="mt-0.5 flex-shrink-0"
                  >
                    {selectedIds.has(source.id) ? (
                      <CheckCircle2 className="h-4 w-4 text-purple-600" />
                    ) : (
                      <Circle className="h-4 w-4 text-gray-300 group-hover:text-gray-400" />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {getSourceIcon(source.sourceType)}
                      <span className="truncate text-sm font-medium text-gray-900">
                        {source.title}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                      {getStatusIcon(source.analysisStatus)}
                      <span className="truncate">
                        {source.sourceType}
                        {source.publishedAt &&
                          ` · ${new Date(source.publishedAt).toLocaleDateString()}`}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    {source.sourceUrl && (
                      <a
                        href={source.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded p-1 hover:bg-gray-200"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="h-3.5 w-3.5 text-gray-400" />
                      </a>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveSource(source.id);
                      }}
                      className="rounded p-1 hover:bg-red-100"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-gray-400 hover:text-red-500" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Selected Count */}
      {selectedIds.size > 0 && (
        <div className="border-t border-gray-200 px-4 py-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">
              {selectedIds.size} selected for chat
            </span>
            <button
              onClick={() => {
                uniqueSources.forEach((s) => {
                  if (selectedIds.has(s.id)) onToggleSelect(s.id);
                });
              }}
              className="text-purple-600 hover:underline"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Add Source Dialog */}
      {showAddDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                Add Research Sources
              </h2>
              <button
                onClick={() => setShowAddDialog(false)}
                className="rounded-lg p-1 hover:bg-gray-100"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            {/* Search Mode */}
            <div className="mt-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSearchMode('quick')}
                  className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${
                    searchMode === 'quick'
                      ? 'bg-purple-100 text-purple-700'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <Zap className="h-4 w-4" />
                  Quick Search
                </button>
                <button
                  onClick={() => setSearchMode('deep')}
                  className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${
                    searchMode === 'deep'
                      ? 'bg-purple-100 text-purple-700'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <Microscope className="h-4 w-4" />
                  Deep Research
                </button>
              </div>
              <p className="text-xs text-gray-500">
                {searchMode === 'quick'
                  ? 'Fast parallel search across sources'
                  : 'Multi-round iterative search with AI refinement'}
              </p>
            </div>

            {/* Source Toggles */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-500">Search in:</span>
              {[
                { id: 'local', label: 'Local DB', icon: Database },
                { id: 'web', label: 'Web', icon: Globe },
                { id: 'arxiv', label: 'arXiv', icon: FileText },
                { id: 'github', label: 'GitHub', icon: Github },
                { id: 'news', label: 'News', icon: Newspaper },
                { id: 'scholar', label: 'Scholar', icon: BookOpen },
                { id: 'blogs', label: 'Blogs', icon: FileText },
                { id: 'reports', label: 'Reports', icon: FileText },
                { id: 'policy', label: 'Policy', icon: FileText },
              ].map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => toggleSearchSource(id)}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    searchSources.includes(id)
                      ? 'bg-purple-100 text-purple-700'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  {label}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="mt-4 flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder={`Search ${searchSources.join(', ')}...`}
                  className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>
              <button
                onClick={handleSearch}
                disabled={
                  searching || !searchQuery.trim() || searchSources.length === 0
                }
                className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
              >
                {searching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                {searchMode === 'deep' ? 'Deep Search' : 'Search'}
              </button>
            </div>

            {/* Search Stats */}
            {searchStats && (
              <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2">
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span>
                    Found <strong>{searchStats.totalResults}</strong> results in{' '}
                    <strong>
                      {(searchStats.durationMs / 1000).toFixed(1)}s
                    </strong>
                  </span>
                  {searchStats.searchRounds && (
                    <span className="text-purple-600">
                      {searchStats.searchRounds} search rounds
                    </span>
                  )}
                </div>
                {searchStats.queriesExecuted &&
                  searchStats.queriesExecuted.length > 1 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {searchStats.queriesExecuted.slice(0, 5).map((q, i) => (
                        <span
                          key={i}
                          className="rounded bg-gray-200 px-1.5 py-0.5 text-xs text-gray-600"
                        >
                          {q.length > 30 ? `${q.slice(0, 30)}...` : q}
                        </span>
                      ))}
                      {searchStats.queriesExecuted.length > 5 && (
                        <span className="text-xs text-gray-400">
                          +{searchStats.queriesExecuted.length - 5} more
                        </span>
                      )}
                    </div>
                  )}
              </div>
            )}

            {/* Search Results */}
            <div className="mt-4">
              {searchResults.length > 0 && (
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm text-gray-600">
                    {searchResults.length} results
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={async () => {
                        // Import top 10 results
                        const toImport = searchResults
                          .slice(0, 10)
                          .filter(
                            (r) =>
                              !addedIds.has(
                                r.id || `result-${searchResults.indexOf(r)}`
                              )
                          );
                        for (const result of toImport) {
                          const resultId =
                            result.id ||
                            `result-${searchResults.indexOf(result)}`;
                          try {
                            await onAddSource({
                              title: result.title,
                              sourceType: result.sourceType || result.source,
                              sourceUrl: result.sourceUrl,
                              abstract: result.abstract,
                              authors: result.authors,
                              publishedAt: result.publishedAt,
                              resourceId: result.id,
                              metadata: result.metadata,
                            });
                            setAddedIds((prev) => new Set(prev).add(resultId));
                          } catch (err) {
                            console.error('Failed to import:', err);
                          }
                        }
                      }}
                      className="rounded-lg border border-purple-200 px-3 py-1.5 text-xs font-medium text-purple-600 hover:bg-purple-50"
                    >
                      Import TOP 10
                    </button>
                    <button
                      onClick={async () => {
                        // Import top 20 results
                        const toImport = searchResults
                          .slice(0, 20)
                          .filter(
                            (r) =>
                              !addedIds.has(
                                r.id || `result-${searchResults.indexOf(r)}`
                              )
                          );
                        for (const result of toImport) {
                          const resultId =
                            result.id ||
                            `result-${searchResults.indexOf(result)}`;
                          try {
                            await onAddSource({
                              title: result.title,
                              sourceType: result.sourceType || result.source,
                              sourceUrl: result.sourceUrl,
                              abstract: result.abstract,
                              authors: result.authors,
                              publishedAt: result.publishedAt,
                              resourceId: result.id,
                              metadata: result.metadata,
                            });
                            setAddedIds((prev) => new Set(prev).add(resultId));
                          } catch (err) {
                            console.error('Failed to import:', err);
                          }
                        }
                      }}
                      className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700"
                    >
                      Import TOP 20
                    </button>
                  </div>
                </div>
              )}
              <div className="max-h-72 overflow-y-auto">
                {searchResults.length > 0 ? (
                  <div className="space-y-2">
                    {searchResults.map((result, idx) => (
                      <div
                        key={result.id || `result-${idx}`}
                        className="flex items-start gap-3 rounded-lg border border-gray-200 p-3 hover:border-gray-300"
                      >
                        <div className="mt-0.5 flex-shrink-0">
                          {result.source === 'arxiv' ? (
                            <FileText className="h-4 w-4 text-blue-500" />
                          ) : result.source === 'github' ? (
                            <Github className="h-4 w-4 text-gray-700" />
                          ) : result.source === 'web' ? (
                            <Globe className="h-4 w-4 text-green-500" />
                          ) : (
                            <Database className="h-4 w-4 text-purple-500" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          {result.sourceUrl ? (
                            <a
                              href={result.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="line-clamp-1 font-medium text-gray-900 hover:text-purple-600 hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {result.title}
                            </a>
                          ) : (
                            <h4 className="line-clamp-1 font-medium text-gray-900">
                              {result.title}
                            </h4>
                          )}
                          <p className="mt-1 line-clamp-2 text-xs text-gray-500">
                            {result.abstract}
                          </p>
                          <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
                            <span className="rounded bg-gray-100 px-1.5 py-0.5">
                              {result.source || result.sourceType}
                            </span>
                            {result.authors && result.authors.length > 0 && (
                              <span className="max-w-[150px] truncate">
                                {result.authors.slice(0, 2).join(', ')}
                                {result.authors.length > 2 && ' et al.'}
                              </span>
                            )}
                            {result.publishedAt && (
                              <span>
                                {new Date(
                                  result.publishedAt
                                ).toLocaleDateString()}
                              </span>
                            )}
                            {result.metadata?.stars && (
                              <span className="flex items-center gap-0.5">
                                <Sparkles className="h-3 w-3" />
                                {result.metadata.stars.toLocaleString()}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col gap-1">
                          {addedIds.has(result.id || `result-${idx}`) ? (
                            <div className="flex items-center gap-1 rounded-lg bg-green-100 px-3 py-1.5 text-xs font-medium text-green-700">
                              <CheckCircle2 className="h-3 w-3" />
                              Added
                            </div>
                          ) : (
                            <button
                              onClick={async () => {
                                const resultId = result.id || `result-${idx}`;
                                setAddingId(resultId);
                                try {
                                  await onAddSource({
                                    title: result.title,
                                    sourceType:
                                      result.sourceType || result.source,
                                    sourceUrl: result.sourceUrl,
                                    abstract: result.abstract,
                                    authors: result.authors,
                                    publishedAt: result.publishedAt,
                                    resourceId: result.id,
                                    metadata: result.metadata,
                                  });
                                  setAddedIds((prev) =>
                                    new Set(prev).add(resultId)
                                  );
                                } catch (err) {
                                  console.error('Failed to add source:', err);
                                } finally {
                                  setAddingId(null);
                                }
                              }}
                              disabled={
                                addingId === (result.id || `result-${idx}`)
                              }
                              className="flex items-center gap-1 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                            >
                              {addingId === (result.id || `result-${idx}`) ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Plus className="h-3 w-3" />
                              )}
                              Add
                            </button>
                          )}
                          <button
                            onClick={() => setViewingSource(result)}
                            className="flex items-center justify-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                          >
                            <Eye className="h-3 w-3" />
                            View
                          </button>
                          {result.sourceUrl && (
                            <a
                              href={result.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center justify-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink className="h-3 w-3" />
                              Open
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : searching ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
                    <p className="mt-3 text-sm text-gray-500">
                      {searchMode === 'deep'
                        ? 'Running deep research across multiple rounds...'
                        : 'Searching across sources...'}
                    </p>
                  </div>
                ) : (
                  <div className="py-12 text-center">
                    <Search className="mx-auto h-10 w-10 text-gray-300" />
                    <p className="mt-3 text-sm text-gray-500">
                      Search for papers, code, and articles to add to your
                      research
                    </p>
                    <p className="mt-1 text-xs text-gray-400">
                      Try: "LLM inference optimization", "transformer attention"
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* View Source Detail Dialog */}
            {viewingSource && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
                <div className="max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-xl">
                  <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
                    <div className="flex items-center gap-3">
                      {viewingSource.source === 'arxiv' ? (
                        <FileText className="h-5 w-5 text-blue-500" />
                      ) : viewingSource.source === 'github' ? (
                        <Github className="h-5 w-5 text-gray-700" />
                      ) : viewingSource.source === 'web' ? (
                        <Globe className="h-5 w-5 text-green-500" />
                      ) : (
                        <Database className="h-5 w-5 text-purple-500" />
                      )}
                      <h3 className="font-semibold text-gray-900">
                        Source Details
                      </h3>
                    </div>
                    <button
                      onClick={() => setViewingSource(null)}
                      className="rounded-lg p-1 hover:bg-gray-100"
                    >
                      <X className="h-5 w-5 text-gray-500" />
                    </button>
                  </div>
                  <div className="max-h-[60vh] overflow-y-auto p-6">
                    <h2 className="text-lg font-semibold text-gray-900">
                      {viewingSource.title}
                    </h2>

                    {/* Metadata */}
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-gray-500">
                      <span className="rounded bg-gray-100 px-2 py-0.5">
                        {viewingSource.source || viewingSource.sourceType}
                      </span>
                      {viewingSource.authors &&
                        viewingSource.authors.length > 0 && (
                          <span>
                            {viewingSource.authors.slice(0, 3).join(', ')}
                            {viewingSource.authors.length > 3 && ' et al.'}
                          </span>
                        )}
                      {viewingSource.publishedAt && (
                        <span>
                          {new Date(
                            viewingSource.publishedAt
                          ).toLocaleDateString()}
                        </span>
                      )}
                      {viewingSource.metadata?.stars && (
                        <span className="flex items-center gap-1">
                          <Sparkles className="h-3.5 w-3.5" />
                          {viewingSource.metadata.stars.toLocaleString()} stars
                        </span>
                      )}
                    </div>

                    {/* Abstract / Content */}
                    {viewingSource.abstract && (
                      <div className="mt-4">
                        <h4 className="text-sm font-medium text-gray-700">
                          Abstract
                        </h4>
                        <p className="mt-2 text-sm leading-relaxed text-gray-600">
                          {viewingSource.abstract}
                        </p>
                      </div>
                    )}

                    {viewingSource.content && (
                      <div className="mt-4">
                        <h4 className="text-sm font-medium text-gray-700">
                          Content
                        </h4>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-gray-600">
                          {viewingSource.content.length > 2000
                            ? viewingSource.content.slice(0, 2000) + '...'
                            : viewingSource.content}
                        </p>
                      </div>
                    )}

                    {/* Additional Metadata */}
                    {viewingSource.metadata &&
                      Object.keys(viewingSource.metadata).length > 0 && (
                        <div className="mt-4">
                          <h4 className="text-sm font-medium text-gray-700">
                            Additional Info
                          </h4>
                          <div className="mt-2 rounded-lg bg-gray-50 p-3">
                            <pre className="overflow-x-auto text-xs text-gray-600">
                              {JSON.stringify(viewingSource.metadata, null, 2)}
                            </pre>
                          </div>
                        </div>
                      )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4">
                    {viewingSource.sourceUrl ? (
                      <a
                        href={viewingSource.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm text-purple-600 hover:underline"
                      >
                        <ExternalLink className="h-4 w-4" />
                        Open Original
                      </a>
                    ) : (
                      <span className="text-sm text-gray-400">
                        No source URL
                      </span>
                    )}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setViewingSource(null)}
                        className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
                      >
                        Close
                      </button>
                      {!addedIds.has(viewingSource.id) && (
                        <button
                          onClick={async () => {
                            const resultId = viewingSource.id;
                            setAddingId(resultId);
                            try {
                              await onAddSource({
                                title: viewingSource.title,
                                sourceType:
                                  viewingSource.sourceType ||
                                  viewingSource.source,
                                sourceUrl: viewingSource.sourceUrl,
                                abstract: viewingSource.abstract,
                                authors: viewingSource.authors,
                                publishedAt: viewingSource.publishedAt,
                                resourceId: viewingSource.id,
                                metadata: viewingSource.metadata,
                              });
                              setAddedIds((prev) =>
                                new Set(prev).add(resultId)
                              );
                              setViewingSource(null);
                            } catch (err) {
                              console.error('Failed to add source:', err);
                            } finally {
                              setAddingId(null);
                            }
                          }}
                          disabled={addingId === viewingSource.id}
                          className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                        >
                          {addingId === viewingSource.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Plus className="h-4 w-4" />
                          )}
                          Add to Sources
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== Chat Panel ====================
interface AIModelOption {
  id: string;
  name: string;
  modelName: string;
  icon: string;
  isDefault: boolean;
}

// Helper function to render model icon (emoji or image)
function ModelIcon({
  icon,
  className = 'h-5 w-5',
}: {
  icon: string;
  className?: string;
}) {
  // If icon starts with / or http, it's an image URL
  if (icon?.startsWith('/') || icon?.startsWith('http')) {
    return <img src={icon} alt="" className={className} />;
  }
  // Otherwise it's an emoji
  return <span className="text-lg">{icon || '🤖'}</span>;
}

function ChatPanel({
  chat,
  sources,
  selectedSourceIds,
  onSendMessage,
  onSaveAsNote,
  isLoading,
  models,
  selectedModel,
  onModelChange,
}: {
  chat: Chat | null;
  sources: Source[];
  selectedSourceIds: Set<string>;
  onSendMessage: (message: string) => void;
  onSaveAsNote: (content: string) => void;
  isLoading: boolean;
  models: AIModelOption[];
  selectedModel: string;
  onModelChange: (model: string) => void;
}) {
  const [input, setInput] = useState('');
  const [showModelSelector, setShowModelSelector] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const messages = chat?.messages || [];
  const currentModel =
    models.find((m) => m.modelName === selectedModel) || models[0];

  const scrollToBottom = useCallback(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop =
        messagesContainerRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom();
    }
  }, [messages, scrollToBottom]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  return (
    <div className="flex flex-1 flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-gray-900">Chat</h3>
          {selectedSourceIds.size > 0 && (
            <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700">
              Using {selectedSourceIds.size} sources
            </span>
          )}
        </div>
        {/* Model Selector */}
        <div className="relative">
          <button
            onClick={() => setShowModelSelector(!showModelSelector)}
            className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            <ModelIcon icon={currentModel?.icon || '🤖'} className="h-5 w-5" />
            <span className="max-w-[120px] truncate text-gray-700">
              {currentModel?.name || 'Select Model'}
            </span>
            <ChevronDown className="h-4 w-4 text-gray-400" />
          </button>
          {showModelSelector && (
            <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
              {models.map((model) => (
                <button
                  key={model.id}
                  onClick={() => {
                    onModelChange(model.modelName);
                    setShowModelSelector(false);
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                    selectedModel === model.modelName ? 'bg-purple-50' : ''
                  }`}
                >
                  <ModelIcon icon={model.icon} className="h-5 w-5" />
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">
                      {model.name}
                    </div>
                    {model.isDefault && (
                      <span className="text-xs text-purple-600">默认</span>
                    )}
                  </div>
                  {selectedModel === model.modelName && (
                    <CheckCircle2 className="h-4 w-4 text-purple-600" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Sparkles className="h-12 w-12 text-purple-200" />
            <h3 className="mt-4 font-medium text-gray-900">
              Start your research
            </h3>
            <p className="mt-1 max-w-xs text-sm text-gray-500">
              Ask questions about your sources or get AI-powered insights
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {[
                'Summarize key points',
                'Compare approaches',
                'Identify trends',
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => setInput(suggestion)}
                  className="rounded-full border border-purple-200 px-3 py-1.5 text-xs text-purple-600 hover:bg-purple-50"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`group relative max-w-[85%] rounded-xl px-4 py-3 ${
                    msg.role === 'user'
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-100 text-gray-900'
                  }`}
                >
                  {msg.role === 'assistant' ? (
                    <div className="text-sm">
                      <MessageRenderer
                        content={msg.content}
                        role="assistant"
                        sources={sources.map((s) => ({
                          title: s.title,
                          sourceUrl: s.sourceUrl,
                        }))}
                      />
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap text-sm">
                      {msg.content}
                    </div>
                  )}
                  {msg.citations && msg.citations.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {msg.citations.map((c, i) => {
                        // Try to find matching source by title or index
                        const sourceIndex = parseInt(c) - 1;
                        const matchedSource =
                          !isNaN(sourceIndex) &&
                          sourceIndex >= 0 &&
                          sourceIndex < sources.length
                            ? sources[sourceIndex]
                            : sources.find(
                                (s) =>
                                  s.title
                                    .toLowerCase()
                                    .includes(c.toLowerCase()) ||
                                  c
                                    .toLowerCase()
                                    .includes(s.title.toLowerCase())
                              );
                        const sourceUrl = matchedSource?.sourceUrl;

                        return sourceUrl ? (
                          <a
                            key={i}
                            href={sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700 hover:bg-blue-200 hover:underline"
                            title={matchedSource?.title || c}
                          >
                            [{c}]
                            <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        ) : (
                          <span
                            key={i}
                            className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700"
                          >
                            [{c}]
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {msg.role === 'assistant' && (
                    <div className="absolute -bottom-6 left-0 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={() => onSaveAsNote(msg.content)}
                        className="flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-200"
                      >
                        <BookMarked className="h-3 w-3" />
                        Save as note
                      </button>
                      <button
                        onClick={() =>
                          navigator.clipboard.writeText(msg.content)
                        }
                        className="flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-200"
                      >
                        <Copy className="h-3 w-3" />
                        Copy
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="rounded-xl bg-gray-100 px-4 py-3">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analyzing...
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="border-t border-gray-200 p-4">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              selectedSourceIds.size > 0
                ? `Ask about ${selectedSourceIds.size} selected sources...`
                : 'Ask a question about your research...'
            }
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="rounded-lg bg-purple-600 p-2.5 text-white hover:bg-purple-700 disabled:opacity-50"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      </form>
    </div>
  );
}

// ==================== Studio Panel (Notes + Outputs) ====================
function StudioPanel({
  notes,
  outputs,
  onCreateNote,
  onUpdateNote,
  onDeleteNote,
  onGenerateOutput,
  selectedSourceIds,
}: {
  notes: Note[];
  outputs: Output[];
  onCreateNote: (note: Partial<Note>) => void;
  onUpdateNote: (id: string, updates: Partial<Note>) => void;
  onDeleteNote: (id: string) => void;
  onGenerateOutput: (type: string) => void;
  selectedSourceIds: Set<string>;
}) {
  const [activeTab, setActiveTab] = useState<'notes' | 'outputs'>('outputs');
  const [showNewNote, setShowNewNote] = useState(false);
  const [newNoteContent, setNewNoteContent] = useState('');

  const outputTypes = [
    { type: 'STUDY_GUIDE', icon: BookMarked, label: 'Study Guide' },
    { type: 'BRIEFING_DOC', icon: ClipboardList, label: 'Briefing Doc' },
    { type: 'FAQ', icon: HelpCircle, label: 'FAQ' },
    { type: 'TIMELINE', icon: Calendar, label: 'Timeline' },
    { type: 'AUDIO_OVERVIEW', icon: Mic, label: 'Audio Overview' },
    { type: 'TREND_REPORT', icon: TrendingUp, label: 'Trend Report' },
    { type: 'COMPARISON', icon: GitCompare, label: 'Comparison' },
    { type: 'KNOWLEDGE_GRAPH', icon: Network, label: 'Knowledge Graph' },
  ];

  const handleCreateNote = () => {
    if (newNoteContent.trim()) {
      onCreateNote({ content: newNoteContent.trim() });
      setNewNoteContent('');
      setShowNewNote(false);
    }
  };

  return (
    <div className="flex w-80 flex-col border-l border-gray-200 bg-gray-50">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-4 py-3">
        <h3 className="font-semibold text-gray-900">Studio</h3>
        <p className="text-xs text-gray-500">Generate outputs from sources</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 bg-white">
        <button
          onClick={() => setActiveTab('outputs')}
          className={`flex-1 px-4 py-2.5 text-sm font-medium ${
            activeTab === 'outputs'
              ? 'border-b-2 border-purple-600 text-purple-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Outputs
        </button>
        <button
          onClick={() => setActiveTab('notes')}
          className={`flex-1 px-4 py-2.5 text-sm font-medium ${
            activeTab === 'notes'
              ? 'border-b-2 border-purple-600 text-purple-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Notes ({notes.length})
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'outputs' ? (
          <div className="p-4">
            <p className="mb-3 text-xs text-gray-500">
              {selectedSourceIds.size > 0
                ? `Generate from ${selectedSourceIds.size} selected sources`
                : 'Select sources to generate outputs'}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {outputTypes.map(({ type, icon: Icon, label }) => (
                <button
                  key={type}
                  onClick={() => onGenerateOutput(type)}
                  disabled={selectedSourceIds.size === 0}
                  className="flex flex-col items-center gap-2 rounded-lg border border-gray-200 bg-white p-3 text-center transition-all hover:border-purple-300 hover:shadow-sm disabled:opacity-50"
                >
                  <Icon className="h-5 w-5 text-purple-600" />
                  <span className="text-xs font-medium text-gray-700">
                    {label}
                  </span>
                </button>
              ))}
            </div>

            {/* Generated Outputs */}
            {outputs.length > 0 && (
              <div className="mt-6">
                <h4 className="mb-2 text-xs font-medium text-gray-500">
                  Generated
                </h4>
                <div className="space-y-2">
                  {outputs.map((output) => (
                    <div
                      key={output.id}
                      className="rounded-lg border border-gray-200 bg-white p-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900">
                          {output.title}
                        </span>
                        {output.status === 'GENERATING' ? (
                          <Loader2 className="h-4 w-4 animate-spin text-purple-600" />
                        ) : output.status === 'COMPLETED' ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : output.status === 'FAILED' ? (
                          <AlertCircle className="h-4 w-4 text-red-500" />
                        ) : (
                          <Circle className="h-4 w-4 text-gray-300" />
                        )}
                      </div>
                      {output.content && (
                        <p className="mt-1 line-clamp-2 text-xs text-gray-500">
                          {output.content}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="p-4">
            {/* New Note Button */}
            {!showNewNote ? (
              <button
                onClick={() => setShowNewNote(true)}
                className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 py-3 text-sm text-gray-500 hover:border-purple-300 hover:text-purple-600"
              >
                <Plus className="h-4 w-4" />
                Add note
              </button>
            ) : (
              <div className="mb-4 rounded-lg border border-gray-200 bg-white p-3">
                <textarea
                  value={newNoteContent}
                  onChange={(e) => setNewNoteContent(e.target.value)}
                  placeholder="Write your note..."
                  className="w-full resize-none border-0 p-0 text-sm focus:outline-none focus:ring-0"
                  rows={4}
                  autoFocus
                />
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    onClick={() => {
                      setShowNewNote(false);
                      setNewNoteContent('');
                    }}
                    className="rounded px-3 py-1 text-xs text-gray-500 hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateNote}
                    disabled={!newNoteContent.trim()}
                    className="rounded bg-purple-600 px-3 py-1 text-xs text-white hover:bg-purple-700 disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
              </div>
            )}

            {/* Notes List */}
            <div className="space-y-2">
              {notes.map((note) => (
                <div
                  key={note.id}
                  className="group rounded-lg border border-gray-200 bg-white p-3"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      {note.title && (
                        <h4 className="text-sm font-medium text-gray-900">
                          {note.title}
                        </h4>
                      )}
                      <p className="mt-1 line-clamp-3 text-sm text-gray-600">
                        {note.content}
                      </p>
                    </div>
                    <div className="ml-2 flex items-center gap-1 opacity-0 group-hover:opacity-100">
                      <button
                        onClick={() =>
                          onUpdateNote(note.id, { isPinned: !note.isPinned })
                        }
                        className="rounded p-1 hover:bg-gray-100"
                      >
                        {note.isPinned ? (
                          <PinOff className="h-3.5 w-3.5 text-purple-600" />
                        ) : (
                          <Pin className="h-3.5 w-3.5 text-gray-400" />
                        )}
                      </button>
                      <button
                        onClick={() => onDeleteNote(note.id)}
                        className="rounded p-1 hover:bg-red-100"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-gray-400 hover:text-red-500" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-gray-400">
                    {new Date(note.createdAt).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== Main Page ====================
export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSourceIds, setSelectedSourceIds] = useState<Set<string>>(
    new Set()
  );
  const [sourcesCollapsed, setSourcesCollapsed] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>('');

  // Load AI models
  const { models: aiModels, loading: modelsLoading } = useAIModels();

  // Set default model when models are loaded
  useEffect(() => {
    if (aiModels.length > 0 && !selectedModel) {
      const defaultModel = aiModels.find((m) => m.isDefault) || aiModels[0];
      setSelectedModel(defaultModel.modelName);
    }
  }, [aiModels, selectedModel]);

  // Load project
  useEffect(() => {
    async function loadProject() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchProject(projectId);
        setProject(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load project');
      } finally {
        setLoading(false);
      }
    }
    loadProject();
  }, [projectId]);

  // Toggle source selection
  const handleToggleSource = (id: string) => {
    setSelectedSourceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Add source
  const handleAddSource = async (source: Partial<Source>) => {
    if (!project) return;
    try {
      const newSource = await addSource(projectId, source);
      setProject((prev) =>
        prev
          ? {
              ...prev,
              sources: [newSource, ...prev.sources],
            }
          : null
      );
    } catch (err) {
      console.error('Failed to add source:', err);
    }
  };

  // Remove source
  const handleRemoveSource = async (id: string) => {
    if (!project) return;
    try {
      await removeSource(projectId, id);
      setProject((prev) =>
        prev
          ? {
              ...prev,
              sources: prev.sources.filter((s) => s.id !== id),
            }
          : null
      );
      setSelectedSourceIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (err) {
      console.error('Failed to remove source:', err);
    }
  };

  // Send chat message
  const handleSendMessage = async (message: string) => {
    if (!project) return;
    setChatLoading(true);
    try {
      // Add user message immediately for better UX
      const tempUserMsg: ChatMessage = {
        id: `temp-${Date.now()}`,
        role: 'user',
        content: message,
        timestamp: new Date().toISOString(),
      };

      setProject((prev) => {
        if (!prev) return null;
        const chat = prev.chats[0] || {
          id: 'temp-chat',
          messages: [],
          title: 'Chat',
          createdAt: new Date().toISOString(),
        };
        return {
          ...prev,
          chats: [
            {
              ...chat,
              messages: [...chat.messages, tempUserMsg],
            },
          ],
        };
      });

      // Send to API and get AI response
      const result = await sendChatMessage(
        projectId,
        message,
        Array.from(selectedSourceIds),
        selectedModel
      );

      // Add AI response from backend
      if (result.aiMessage) {
        const aiResponse: ChatMessage = {
          id: result.aiMessage.id,
          role: 'assistant',
          content: result.aiMessage.content,
          timestamp: result.aiMessage.timestamp,
          citations: result.aiMessage.citations,
        };

        setProject((prev) => {
          if (!prev) return null;
          const chat = prev.chats[0];
          if (!chat) return prev;
          return {
            ...prev,
            chats: [
              {
                ...chat,
                messages: [...chat.messages, aiResponse],
              },
            ],
          };
        });
      }
      setChatLoading(false);
    } catch (err) {
      console.error('Failed to send message:', err);
      // Show error message
      const errorResponse: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: '抱歉，消息发送失败。请稍后重试。',
        timestamp: new Date().toISOString(),
      };
      setProject((prev) => {
        if (!prev) return null;
        const chat = prev.chats[0];
        if (!chat) return prev;
        return {
          ...prev,
          chats: [
            {
              ...chat,
              messages: [...chat.messages, errorResponse],
            },
          ],
        };
      });
      setChatLoading(false);
    }
  };

  // Save as note
  const handleSaveAsNote = async (content: string) => {
    if (!project) return;
    try {
      const newNote = await createNote(projectId, {
        content,
        sourceType: 'ai-chat',
      });
      setProject((prev) =>
        prev
          ? {
              ...prev,
              notes: [newNote, ...prev.notes],
            }
          : null
      );
    } catch (err) {
      console.error('Failed to save note:', err);
    }
  };

  // Create note
  const handleCreateNote = async (note: Partial<Note>) => {
    if (!project) return;
    try {
      const newNote = await createNote(projectId, note);
      setProject((prev) =>
        prev
          ? {
              ...prev,
              notes: [newNote, ...prev.notes],
            }
          : null
      );
    } catch (err) {
      console.error('Failed to create note:', err);
    }
  };

  // Update note
  const handleUpdateNote = async (id: string, updates: Partial<Note>) => {
    if (!project) return;
    try {
      const updatedNote = await updateNote(projectId, id, updates);
      setProject((prev) =>
        prev
          ? {
              ...prev,
              notes: prev.notes.map((n) => (n.id === id ? updatedNote : n)),
            }
          : null
      );
    } catch (err) {
      console.error('Failed to update note:', err);
    }
  };

  // Delete note
  const handleDeleteNote = async (id: string) => {
    if (!project) return;
    try {
      await deleteNote(projectId, id);
      setProject((prev) =>
        prev
          ? {
              ...prev,
              notes: prev.notes.filter((n) => n.id !== id),
            }
          : null
      );
    } catch (err) {
      console.error('Failed to delete note:', err);
    }
  };

  // Generate output
  const handleGenerateOutput = async (type: string) => {
    if (!project) return;
    try {
      const newOutput = await generateOutput(
        projectId,
        type,
        Array.from(selectedSourceIds)
      );
      setProject((prev) =>
        prev
          ? {
              ...prev,
              outputs: [newOutput, ...prev.outputs],
            }
          : null
      );
    } catch (err) {
      console.error('Failed to generate output:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex h-screen flex-col items-center justify-center">
        <AlertCircle className="h-12 w-12 text-red-500" />
        <p className="mt-4 text-gray-600">{error || 'Project not found'}</p>
        <button
          onClick={() => router.push('/studio')}
          className="mt-4 text-purple-600 hover:underline"
        >
          Back to projects
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-gray-100">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/studio')}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xl">{project.icon || '📚'}</span>
            <h1 className="font-semibold text-gray-900">{project.name}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
            <Globe className="h-4 w-4" />
            Share
          </button>
          <button className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100">
            <MoreVertical className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Three-column Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Sources */}
        <SourcesPanel
          sources={project.sources}
          selectedIds={selectedSourceIds}
          onToggleSelect={handleToggleSource}
          onAddSource={handleAddSource}
          onRemoveSource={handleRemoveSource}
          collapsed={sourcesCollapsed}
          onToggleCollapse={() => setSourcesCollapsed(!sourcesCollapsed)}
        />

        {/* Center: Chat */}
        <ChatPanel
          chat={project.chats[0] || null}
          sources={project.sources}
          selectedSourceIds={selectedSourceIds}
          onSendMessage={handleSendMessage}
          onSaveAsNote={handleSaveAsNote}
          isLoading={chatLoading}
          models={aiModels.map((m) => ({
            id: m.id,
            name: m.name,
            modelName: m.modelName,
            icon: m.icon,
            isDefault: m.isDefault,
          }))}
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
        />

        {/* Right: Studio */}
        <StudioPanel
          notes={project.notes}
          outputs={project.outputs}
          onCreateNote={handleCreateNote}
          onUpdateNote={handleUpdateNote}
          onDeleteNote={handleDeleteNote}
          onGenerateOutput={handleGenerateOutput}
          selectedSourceIds={selectedSourceIds}
        />
      </div>
    </div>
  );
}
