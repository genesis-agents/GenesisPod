'use client';

/**
 * AI Studio - 研究项目详情页
 * Tab导航架构：Fast Research | Deep Research | Artifacts
 * - Fast Research: Sources管理 + AI对话
 * - Deep Research: 多轮迭代深度研究
 * - Artifacts: AI生成的知识产物（文档、笔记等）
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getAuthTokens } from '@/lib/utils/auth';
import { useAIModels, getDefaultChatModel } from '@/hooks';
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
  Microscope,
  Eye,
  Copy,
  RefreshCw,
  AlertCircle,
  Upload,
  Layers,
  Brain,
  GraduationCap,
  MessageSquare,
  FolderOpen,
  Shapes,
  Zap,
  Pencil,
  Check,
} from 'lucide-react';
import { FileUploader } from '@/components/ai-research/deep-research/FileUploader';
import { OutputViewer } from '@/components/ai-research/deep-research/outputs/OutputViewer';
import {
  CitationProvider,
  CitedContent,
  SourceCardHighlight,
  SourceHighlight,
  useCitationOptional,
  type SourceReference,
} from '@/components/ai-research/deep-research/citations';
import { ResearchTab } from '@/components/ai-research/deep-research/ResearchTab';
import ClientDate from '@/components/common/ClientDate';

import { logger } from '@/lib/utils/logger';
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
  metadata: Record<string, unknown> | null;
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
  // Sources used for this message (in citation order)
  sourceContext?: Array<{
    id: string;
    title: string;
    content?: string | null;
    abstract?: string | null;
  }>;
}

interface Chat {
  id: string;
  messages: ChatMessage[];
  title: string | null;
  createdAt: string;
}

interface ChatMessageResponse {
  aiMessage: {
    id: string;
    content: string;
    timestamp: string;
    citations?: string[];
  };
  sourceContext?: Array<{
    id: string;
    title: string;
    content?: string | null;
    abstract?: string | null;
  }>;
}

interface Output {
  id: string;
  type: string;
  title: string;
  status: 'PENDING' | 'GENERATING' | 'COMPLETED' | 'FAILED';
  content: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface Project {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  researchType: 'FAST' | 'DEEP';
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
    headers['Authorization'] = `Bearer ${tokens.accessToken}`;
  }
  return headers;
}

async function fetchProject(id: string): Promise<Project> {
  const res = await fetch(`${API_BASE}/api/v1/ai-studio/projects/${id}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch project');
  const json = await res.json();
  // Unwrap API response wrapper { success: true, data: T }
  return json?.data ?? json;
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
  const json = await res.json();
  return json?.data ?? json;
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

async function batchRemoveSources(
  projectId: string,
  sourceIds: string[]
): Promise<{ success: string[]; failed: string[] }> {
  const results = { success: [] as string[], failed: [] as string[] };
  await Promise.all(
    sourceIds.map(async (sourceId) => {
      try {
        await removeSource(projectId, sourceId);
        results.success.push(sourceId);
      } catch {
        results.failed.push(sourceId);
      }
    })
  );
  return results;
}

async function sendChatMessage(
  projectId: string,
  message: string,
  selectedSourceIds?: string[],
  model?: string
): Promise<unknown> {
  const res = await fetch(
    `${API_BASE}/api/v1/ai-studio/projects/${projectId}/chat/messages`,
    {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ message, selectedSourceIds, model }),
    }
  );
  if (!res.ok) throw new Error('Failed to send message');
  const json = await res.json();
  return json?.data ?? json;
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
  const json = await res.json();
  return json?.data ?? json;
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
  const json = await res.json();
  return json?.data ?? json;
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
  const json = await res.json();
  const data = json?.data ?? json;
  return data.output;
}

async function fetchOutput(
  projectId: string,
  outputId: string
): Promise<Output> {
  const res = await fetch(
    `${API_BASE}/api/v1/ai-studio/projects/${projectId}/outputs/${outputId}`,
    { headers: getAuthHeaders() }
  );
  if (!res.ok) throw new Error('Failed to fetch output');
  const json = await res.json();
  return json?.data ?? json;
}

async function deleteOutput(
  projectId: string,
  outputId: string
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/v1/ai-studio/projects/${projectId}/outputs/${outputId}`,
    {
      method: 'DELETE',
      headers: getAuthHeaders(),
    }
  );
  if (!res.ok) throw new Error('Failed to delete output');
}

async function updateOutput(
  projectId: string,
  outputId: string,
  updates: Partial<Output>
): Promise<Output> {
  const res = await fetch(
    `${API_BASE}/api/v1/ai-studio/projects/${projectId}/outputs/${outputId}`,
    {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify(updates),
    }
  );
  if (!res.ok) throw new Error('Failed to update output');
  const json = await res.json();
  return json?.data ?? json;
}

async function searchSourcesApi(
  query: string,
  mode: 'quick' | 'deep' = 'quick',
  sources: string[] = ['local', 'web', 'arxiv', 'github']
): Promise<unknown> {
  const res = await fetch(`${API_BASE}/api/v1/ai-studio/search`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ query, mode, sources, includeInternet: true }),
  });
  if (!res.ok) throw new Error('Search failed');
  const json = await res.json();
  return json?.data ?? json;
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
  results: Array<Record<string, unknown>>;
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
  onAddSources,
  onRemoveSource,
  onBatchRemoveSources,
  collapsed,
  onToggleCollapse,
  projectId,
}: {
  sources: Source[];
  // Array to preserve selection order for citations: [1]=first selected, [2]=second, etc.
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onAddSource: (source: Partial<Source>) => void;
  onAddSources: (sources: Source[]) => void;
  onRemoveSource: (id: string) => void;
  onBatchRemoveSources: (ids: string[]) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  projectId: string;
}) {
  // Convert to Set for efficient lookups
  const selectedIdSet = new Set(selectedIds);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [dialogTab, setDialogTab] = useState<'search' | 'upload'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchStats, setSearchStats] = useState<SearchStats | null>(null);

  // Citation context for highlighting sources when citations are clicked
  const citationContext = useCitationOptional();
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
      const result = (await searchSourcesApi(
        searchQuery,
        'quick',
        searchSources
      )) as SearchResponse;
      setSearchResults(result.results || []);
      setSearchStats(result.stats);
    } catch (err) {
      logger.error('Search failed:', err);
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
    uniqueSources.every((s) => selectedIdSet.has(s.id));
  const someSelected = uniqueSources.some((s) => selectedIdSet.has(s.id));

  const handleSelectAll = () => {
    if (allSelected) {
      // Deselect all
      uniqueSources.forEach((s) => {
        if (selectedIdSet.has(s.id)) {
          onToggleSelect(s.id);
        }
      });
    } else {
      // Select all
      uniqueSources.forEach((s) => {
        if (!selectedIdSet.has(s.id)) {
          onToggleSelect(s.id);
        }
      });
    }
  };

  // Get citation index for a source (based on selection order)
  const getCitationIndex = (sourceId: string): number | null => {
    const index = selectedIds.indexOf(sourceId);
    return index !== -1 ? index + 1 : null;
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
            {uniqueSources.map((source) => {
              const citationIndex = getCitationIndex(source.id);
              const isSelected = selectedIdSet.has(source.id);
              const isHighlighted =
                citationContext?.highlightedSource?.sourceId === source.id;
              const sourceContent = source.content || source.abstract || '';
              return (
                <SourceCardHighlight
                  key={source.id}
                  sourceId={source.id}
                  className={`group relative rounded-lg border p-2.5 transition-all ${
                    isSelected
                      ? 'border-purple-300 bg-purple-50'
                      : 'border-transparent hover:border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {/* Citation index badge - only shown for selected sources */}
                  {citationIndex !== null && (
                    <div className="absolute -left-1 -top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-purple-600 text-[10px] font-bold text-white shadow">
                      {citationIndex}
                    </div>
                  )}
                  <div className="flex items-start gap-2">
                    <button
                      onClick={() => onToggleSelect(source.id)}
                      className="mt-0.5 flex-shrink-0"
                    >
                      {isSelected ? (
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
                          {source.publishedAt && (
                            <>
                              {' · '}
                              <ClientDate
                                date={source.publishedAt}
                                format="date"
                              />
                            </>
                          )}
                        </span>
                      </div>
                      {/* Show highlighted content when this source is referenced */}
                      {isHighlighted && sourceContent && (
                        <div className="mt-2 border-t border-purple-200 pt-2">
                          <SourceHighlight
                            sourceId={source.id}
                            content={sourceContent}
                            className="line-clamp-6 text-xs leading-relaxed text-gray-600"
                          />
                        </div>
                      )}
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
                </SourceCardHighlight>
              );
            })}
          </div>
        )}
      </div>

      {/* Selected Count */}
      {selectedIds.length > 0 && (
        <div className="border-t border-gray-200 px-4 py-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">
              {selectedIds.length} selected for chat
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (
                    confirm(
                      `确定要删除选中的 ${selectedIds.length} 个资料吗？此操作无法撤销。`
                    )
                  ) {
                    onBatchRemoveSources(selectedIds);
                  }
                }}
                className="flex items-center gap-1 text-red-600 hover:underline"
              >
                <Trash2 className="h-3 w-3" />
                Delete
              </button>
              <button
                onClick={() => {
                  uniqueSources.forEach((s) => {
                    if (selectedIdSet.has(s.id)) onToggleSelect(s.id);
                  });
                }}
                className="text-purple-600 hover:underline"
              >
                Clear
              </button>
            </div>
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

            {/* Dialog Tabs */}
            <div className="mt-4 flex border-b border-gray-200">
              <button
                onClick={() => setDialogTab('search')}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium ${
                  dialogTab === 'search'
                    ? 'border-b-2 border-purple-600 text-purple-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Search className="h-4 w-4" />
                Search Sources
              </button>
              <button
                onClick={() => setDialogTab('upload')}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium ${
                  dialogTab === 'upload'
                    ? 'border-b-2 border-purple-600 text-purple-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Upload className="h-4 w-4" />
                Upload Files
              </button>
            </div>

            {/* Upload Tab Content */}
            {dialogTab === 'upload' && (
              <div className="mt-4">
                <FileUploader
                  projectId={projectId}
                  onFilesUploaded={(newSources) => {
                    // Convert UploadedSource to Source format
                    const convertedSources: Source[] = newSources.map((s) => ({
                      id: s.id,
                      title: s.title || s.fileName || 'Untitled',
                      sourceType: s.type || 'file',
                      sourceUrl: s.url || null,
                      abstract: null,
                      content: s.content || null,
                      authors: null,
                      publishedAt: null,
                      analysisStatus: 'PENDING' as const,
                      aiSummary: null,
                      resourceId: null,
                      metadata: {},
                      createdAt: new Date().toISOString(),
                    }));
                    onAddSources(convertedSources);
                    setShowAddDialog(false);
                  }}
                  onClose={() => setShowAddDialog(false)}
                />
              </div>
            )}

            {/* Search Tab Content */}
            {dialogTab === 'search' && (
              <>
                {/* Search Input */}
                <div className="mt-4 flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                      placeholder="Search papers, code, articles..."
                      className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                    />
                  </div>
                  <button
                    onClick={handleSearch}
                    disabled={
                      searching ||
                      !searchQuery.trim() ||
                      searchSources.length === 0
                    }
                    className="flex items-center gap-2 rounded-lg bg-purple-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                  >
                    {searching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                    Search
                  </button>
                </div>

                {/* Source Toggles - Simplified */}
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {[
                    { id: 'web', label: 'Web', icon: Globe },
                    { id: 'arxiv', label: 'arXiv', icon: FileText },
                    { id: 'github', label: 'GitHub', icon: Github },
                    { id: 'news', label: 'News', icon: Newspaper },
                    { id: 'local', label: 'Library', icon: Database },
                  ].map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      onClick={() => toggleSearchSource(id)}
                      className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
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

                {/* Search Stats */}
                {searchStats && (
                  <div className="mt-3 text-xs text-gray-500">
                    Found <strong>{searchStats.totalResults}</strong> results in{' '}
                    <strong>
                      {(searchStats.durationMs / 1000).toFixed(1)}s
                    </strong>
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
                                logger.error('Failed to import:', err);
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
                                logger.error('Failed to import:', err);
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
                                {result.authors &&
                                  result.authors.length > 0 && (
                                    <span className="max-w-[150px] truncate">
                                      {result.authors.slice(0, 2).join(', ')}
                                      {result.authors.length > 2 && ' et al.'}
                                    </span>
                                  )}
                                {result.publishedAt && (
                                  <ClientDate
                                    date={result.publishedAt}
                                    format="date"
                                  />
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
                                    const resultId =
                                      result.id || `result-${idx}`;
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
                                      logger.error(
                                        'Failed to add source:',
                                        err
                                      );
                                    } finally {
                                      setAddingId(null);
                                    }
                                  }}
                                  disabled={
                                    addingId === (result.id || `result-${idx}`)
                                  }
                                  className="flex items-center gap-1 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                                >
                                  {addingId ===
                                  (result.id || `result-${idx}`) ? (
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
                          Searching across sources...
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
                          Try: "LLM inference optimization", "transformer
                          attention"
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
                            <ClientDate
                              date={viewingSource.publishedAt}
                              format="date"
                            />
                          )}
                          {viewingSource.metadata?.stars && (
                            <span className="flex items-center gap-1">
                              <Sparkles className="h-3.5 w-3.5" />
                              {viewingSource.metadata.stars.toLocaleString()}{' '}
                              stars
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
                                  {JSON.stringify(
                                    viewingSource.metadata,
                                    null,
                                    2
                                  )}
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
                                  logger.error('Failed to add source:', err);
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
              </>
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
  // Array to preserve selection order for citations
  selectedSourceIds: string[];
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
          {selectedSourceIds.length > 0 && (
            <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700">
              Using {selectedSourceIds.length} sources
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
          <div className="space-y-6">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' ? (
                  /* AI message - full width, clean design */
                  <div className="group relative w-full">
                    <div className="rounded-lg border border-gray-200 bg-white px-5 py-4 shadow-sm">
                      <div className="text-sm leading-relaxed">
                        {/* Use CitedContent for AI messages to enable clickable citations */}
                        {/* Use msg.sourceContext (correct order) if available, fallback to sources */}
                        <CitedContent
                          content={msg.content}
                          sources={
                            msg.sourceContext && msg.sourceContext.length > 0
                              ? msg.sourceContext
                              : sources.map((s) => ({
                                  id: s.id,
                                  title: s.title,
                                  content: s.content,
                                  abstract: s.abstract,
                                }))
                          }
                          markdown={true}
                        />
                      </div>
                    </div>
                    {/* Action buttons */}
                    <div className="mt-2 flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={() => onSaveAsNote(msg.content)}
                        className="flex items-center gap-1 rounded-md bg-gray-50 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-100"
                      >
                        <BookMarked className="h-3.5 w-3.5" />
                        Save as note
                      </button>
                      <button
                        onClick={() =>
                          navigator.clipboard.writeText(msg.content)
                        }
                        className="flex items-center gap-1 rounded-md bg-gray-50 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-100"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copy
                      </button>
                    </div>
                  </div>
                ) : (
                  /* User message - right aligned bubble */
                  <div className="max-w-[80%] rounded-xl bg-purple-600 px-4 py-3 text-white">
                    <div className="whitespace-pre-wrap text-sm">
                      {msg.content}
                    </div>
                  </div>
                )}
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
              selectedSourceIds.length > 0
                ? `Ask about ${selectedSourceIds.length} selected sources...`
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
  onRegenerateOutput,
  selectedSourceIds,
  projectId,
}: {
  notes: Note[];
  outputs: Output[];
  onCreateNote: (note: Partial<Note>) => void;
  onUpdateNote: (id: string, updates: Partial<Note>) => void;
  onDeleteNote: (id: string) => void;
  onGenerateOutput: (type: string) => void;
  onRegenerateOutput: (outputId: string) => void;
  // Array to preserve selection order for citations
  selectedSourceIds: string[];
  projectId: string;
}) {
  const [activeTab, setActiveTab] = useState<'notes' | 'outputs'>('outputs');
  const [showNewNote, setShowNewNote] = useState(false);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [viewingOutput, setViewingOutput] = useState<Output | null>(null);

  const outputTypes = [
    { type: 'STUDY_GUIDE', icon: BookMarked, label: 'Study Guide' },
    { type: 'BRIEFING_DOC', icon: ClipboardList, label: 'Briefing Doc' },
    { type: 'FAQ', icon: HelpCircle, label: 'FAQ' },
    { type: 'TIMELINE', icon: Calendar, label: 'Timeline' },
    { type: 'AUDIO_OVERVIEW', icon: Mic, label: 'Audio Overview' },
    { type: 'TREND_REPORT', icon: TrendingUp, label: 'Trend Report' },
    { type: 'COMPARISON', icon: GitCompare, label: 'Comparison' },
    { type: 'KNOWLEDGE_GRAPH', icon: Network, label: 'Knowledge Graph' },
    { type: 'FLASHCARDS', icon: Layers, label: 'Flashcards' },
    { type: 'QUIZ', icon: GraduationCap, label: 'Quiz' },
    { type: 'MIND_MAP', icon: Brain, label: 'Mind Map' },
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
              {selectedSourceIds.length > 0
                ? `Generate from ${selectedSourceIds.length} selected sources`
                : 'Select sources to generate outputs'}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {outputTypes.map(({ type, icon: Icon, label }) => (
                <button
                  key={type}
                  onClick={() => onGenerateOutput(type)}
                  disabled={selectedSourceIds.length === 0}
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
                      onClick={() =>
                        output.status === 'COMPLETED' &&
                        setViewingOutput(output)
                      }
                      className={`rounded-lg border border-gray-200 bg-white p-3 ${
                        output.status === 'COMPLETED'
                          ? 'cursor-pointer hover:border-purple-300 hover:shadow-sm'
                          : ''
                      }`}
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
                      <p className="mt-1 line-clamp-2 text-xs text-gray-500">
                        {output.status === 'COMPLETED'
                          ? 'Click to view'
                          : output.status === 'GENERATING'
                            ? 'Generating...'
                            : output.status === 'FAILED'
                              ? 'Generation failed'
                              : 'Queued'}
                      </p>
                      {output.status === 'FAILED' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onRegenerateOutput(output.id);
                          }}
                          className="mt-2 flex items-center gap-1 text-xs text-purple-600 hover:underline"
                        >
                          <RefreshCw className="h-3 w-3" />
                          Retry
                        </button>
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
                  <ClientDate
                    date={note.createdAt}
                    format="date"
                    className="mt-2 text-xs text-gray-400"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Output Detail Modal */}
      {viewingOutput && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="max-h-[85vh] w-full max-w-4xl overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <h3 className="font-semibold text-gray-900">
                {viewingOutput.title}
              </h3>
              <button
                onClick={() => setViewingOutput(null)}
                className="rounded-lg p-1 hover:bg-gray-100"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-6">
              <OutputViewer
                output={viewingOutput}
                projectId={projectId}
                onRegenerate={() => {
                  onRegenerateOutput(viewingOutput.id);
                  setViewingOutput(null);
                }}
                onExport={(format) => {
                  // Export functionality
                  const content = viewingOutput.content || '';
                  const blob = new Blob(
                    [format === 'json' ? content : content],
                    {
                      type:
                        format === 'json'
                          ? 'application/json'
                          : 'text/markdown',
                    }
                  );
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${viewingOutput.title}.${format === 'json' ? 'json' : 'md'}`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== Artifacts Sidebar (Collapsible & Resizable) ====================
function ArtifactsSidebar({
  outputs,
  notes,
  selectedSourceIds,
  onGenerateOutput,
  onRegenerateOutput,
  onDeleteOutput,
  onUpdateOutput,
  onCreateNote,
  onUpdateNote,
  onDeleteNote,
  projectId,
  collapsed,
  onToggleCollapse,
}: {
  outputs: Output[];
  notes: Note[];
  selectedSourceIds: string[];
  onGenerateOutput: (type: string) => void;
  onRegenerateOutput: (outputId: string) => void;
  onDeleteOutput: (outputId: string) => void;
  onUpdateOutput: (outputId: string, updates: Partial<Output>) => void;
  onCreateNote: (note: Partial<Note>) => void;
  onUpdateNote: (id: string, updates: Partial<Note>) => void;
  onDeleteNote: (id: string) => void;
  projectId: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const [activeSection, setActiveSection] = useState<'create' | 'notes'>(
    'create'
  );
  const [viewingOutput, setViewingOutput] = useState<Output | null>(null);
  const [showNewNote, setShowNewNote] = useState(false);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [width, setWidth] = useState(320);
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [editingOutputId, setEditingOutputId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  // Handle resize drag
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = window.innerWidth - e.clientX;
      // Clamp between 280 and 500
      setWidth(Math.max(280, Math.min(500, newWidth)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  // Get output type icon
  const getOutputIcon = (type: string) => {
    switch (type) {
      case 'STUDY_GUIDE':
        return BookMarked;
      case 'BRIEFING_DOC':
        return ClipboardList;
      case 'FAQ':
        return HelpCircle;
      case 'TIMELINE':
        return Calendar;
      case 'TREND_REPORT':
        return TrendingUp;
      case 'COMPARISON':
        return GitCompare;
      case 'KNOWLEDGE_GRAPH':
        return Network;
      case 'FLASHCARDS':
        return Layers;
      case 'QUIZ':
        return GraduationCap;
      case 'MIND_MAP':
        return Brain;
      default:
        return FileText;
    }
  };

  const outputTypes = [
    {
      type: 'STUDY_GUIDE',
      icon: BookMarked,
      label: 'Study Guide',
      desc: 'Comprehensive study materials',
    },
    {
      type: 'BRIEFING_DOC',
      icon: ClipboardList,
      label: 'Briefing Doc',
      desc: 'Executive summary document',
    },
    {
      type: 'FAQ',
      icon: HelpCircle,
      label: 'FAQ',
      desc: 'Frequently asked questions',
    },
    {
      type: 'TIMELINE',
      icon: Calendar,
      label: 'Timeline',
      desc: 'Chronological overview',
    },
    {
      type: 'TREND_REPORT',
      icon: TrendingUp,
      label: 'Trend Report',
      desc: 'Analysis of trends',
    },
    {
      type: 'COMPARISON',
      icon: GitCompare,
      label: 'Comparison',
      desc: 'Side-by-side analysis',
    },
    {
      type: 'KNOWLEDGE_GRAPH',
      icon: Network,
      label: 'Knowledge Graph',
      desc: 'Visual concept map',
    },
    {
      type: 'FLASHCARDS',
      icon: Layers,
      label: 'Flashcards',
      desc: 'Study flashcards',
    },
    {
      type: 'QUIZ',
      icon: GraduationCap,
      label: 'Quiz',
      desc: 'Test your knowledge',
    },
    {
      type: 'MIND_MAP',
      icon: Brain,
      label: 'Mind Map',
      desc: 'Structured visualization',
    },
  ];

  const handleCreateNote = () => {
    if (newNoteContent.trim()) {
      onCreateNote({ content: newNoteContent.trim() });
      setNewNoteContent('');
      setShowNewNote(false);
    }
  };

  // Collapsed state - show narrow bar with expand button
  if (collapsed) {
    return (
      <div className="flex w-12 flex-shrink-0 flex-col border-l border-gray-200 bg-gray-50">
        <button
          onClick={onToggleCollapse}
          className="flex h-12 items-center justify-center border-b border-gray-200 hover:bg-gray-100"
          title="Expand Artifacts"
        >
          <ChevronRight className="h-4 w-4 rotate-180 text-gray-500" />
        </button>
        <div className="flex flex-1 flex-col items-center gap-2 py-4">
          {/* Show artifact type icons for recent outputs */}
          {outputs.slice(0, 5).map((output) => {
            const IconComponent = getOutputIcon(output.type);
            return (
              <div
                key={output.id}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-white shadow-sm"
                title={output.title}
              >
                <IconComponent className="h-4 w-4 text-purple-600" />
              </div>
            );
          })}
          {outputs.length > 5 && (
            <span className="text-xs text-gray-400">+{outputs.length - 5}</span>
          )}
          {outputs.length === 0 && (
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-white shadow-sm"
              title="Create Artifacts"
            >
              <Shapes className="h-4 w-4 text-gray-400" />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Resize Handle */}
      <div
        onMouseDown={handleMouseDown}
        className={`w-1 cursor-col-resize bg-transparent transition-colors hover:bg-purple-300 ${
          isResizing ? 'bg-purple-400' : ''
        }`}
      />
      <div
        ref={sidebarRef}
        style={{ width }}
        className="flex flex-shrink-0 flex-col border-l border-gray-200 bg-white"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <Shapes className="h-5 w-5 text-purple-600" />
            <h3 className="font-semibold text-gray-900">Artifacts</h3>
            {outputs.length > 0 && (
              <span className="rounded-full bg-purple-100 px-1.5 py-0.5 text-xs text-purple-700">
                {outputs.length}
              </span>
            )}
          </div>
          <button
            onClick={onToggleCollapse}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            title="Collapse"
          >
            <ChevronRight className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        {/* Section Tabs */}
        <div className="flex gap-2 border-b border-gray-200 px-4 py-2">
          <button
            onClick={() => setActiveSection('create')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              activeSection === 'create'
                ? 'bg-purple-100 text-purple-700'
                : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            Create
          </button>
          <button
            onClick={() => setActiveSection('notes')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              activeSection === 'notes'
                ? 'bg-purple-100 text-purple-700'
                : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            Notes ({notes.length})
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeSection === 'create' ? (
            <div className="space-y-4">
              {/* Artifact Types Grid - Compact */}
              <div>
                <h4 className="mb-2 text-xs font-medium text-gray-500">
                  Create New
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {outputTypes.map(({ type, icon: Icon, label }) => (
                    <button
                      key={type}
                      onClick={() => onGenerateOutput(type)}
                      disabled={selectedSourceIds.length === 0}
                      className="group flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-2 text-left transition-all hover:border-purple-300 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <div className="rounded-lg bg-gray-100 p-1.5 transition-colors group-hover:bg-purple-100">
                        <Icon className="h-3.5 w-3.5 text-gray-600 group-hover:text-purple-600" />
                      </div>
                      <span className="text-xs font-medium text-gray-700">
                        {label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Your Artifacts - Compact List */}
              {outputs.length > 0 && (
                <div>
                  <h4 className="mb-2 text-xs font-medium text-gray-500">
                    Your Artifacts ({outputs.length})
                  </h4>
                  <div className="space-y-2">
                    {outputs.map((output) => (
                      <div
                        key={output.id}
                        className={`group rounded-lg border border-gray-200 bg-white p-3 ${
                          output.status === 'COMPLETED' &&
                          editingOutputId !== output.id
                            ? 'cursor-pointer hover:border-purple-300 hover:shadow-sm'
                            : ''
                        } transition-all`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          {/* Title - Editable */}
                          {editingOutputId === output.id ? (
                            <div className="flex flex-1 items-center gap-1">
                              <input
                                type="text"
                                value={editingTitle}
                                onChange={(e) =>
                                  setEditingTitle(e.target.value)
                                }
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    onUpdateOutput(output.id, {
                                      title: editingTitle,
                                    });
                                    setEditingOutputId(null);
                                  } else if (e.key === 'Escape') {
                                    setEditingOutputId(null);
                                  }
                                }}
                                className="flex-1 rounded border border-purple-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
                                autoFocus
                                onClick={(e) => e.stopPropagation()}
                              />
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onUpdateOutput(output.id, {
                                    title: editingTitle,
                                  });
                                  setEditingOutputId(null);
                                }}
                                className="rounded p-1 text-green-600 hover:bg-green-100"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingOutputId(null);
                                }}
                                className="rounded p-1 text-gray-400 hover:bg-gray-100"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <span
                              className="line-clamp-1 flex-1 text-sm font-medium text-gray-900"
                              onClick={() =>
                                output.status === 'COMPLETED' &&
                                setViewingOutput(output)
                              }
                            >
                              {output.title}
                            </span>
                          )}

                          {/* Status Icon & Actions */}
                          <div className="flex flex-shrink-0 items-center gap-1">
                            {/* Edit/Delete buttons - show on hover */}
                            {editingOutputId !== output.id && (
                              <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingOutputId(output.id);
                                    setEditingTitle(output.title);
                                  }}
                                  className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                                  title="Rename"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (
                                      confirm(
                                        'Are you sure you want to delete this artifact?'
                                      )
                                    ) {
                                      onDeleteOutput(output.id);
                                    }
                                  }}
                                  className="rounded p-1 text-gray-400 hover:bg-red-100 hover:text-red-500"
                                  title="Delete"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )}
                            {/* Status Icon */}
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
                        </div>
                        {output.status === 'FAILED' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onRegenerateOutput(output.id);
                            }}
                            className="mt-1 flex items-center gap-1 text-xs text-purple-600 hover:underline"
                          >
                            <RefreshCw className="h-3 w-3" />
                            Retry
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {/* New Note */}
              {!showNewNote ? (
                <button
                  onClick={() => setShowNewNote(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 p-3 text-sm text-gray-500 transition-colors hover:border-purple-300 hover:text-purple-600"
                >
                  <Plus className="h-4 w-4" />
                  Add Note
                </button>
              ) : (
                <div className="rounded-lg border border-gray-200 bg-white p-3">
                  <textarea
                    value={newNoteContent}
                    onChange={(e) => setNewNoteContent(e.target.value)}
                    placeholder="Write your note..."
                    className="w-full resize-none border-0 p-0 text-sm text-gray-900 focus:outline-none focus:ring-0"
                    rows={3}
                    autoFocus
                  />
                  <div className="mt-2 flex justify-end gap-2">
                    <button
                      onClick={() => {
                        setShowNewNote(false);
                        setNewNoteContent('');
                      }}
                      className="rounded-lg px-2 py-1 text-xs text-gray-500 hover:bg-gray-100"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreateNote}
                      disabled={!newNoteContent.trim()}
                      className="rounded-lg bg-purple-600 px-2 py-1 text-xs text-white hover:bg-purple-700 disabled:opacity-50"
                    >
                      Save
                    </button>
                  </div>
                </div>
              )}

              {/* Notes List */}
              {notes.map((note) => (
                <div
                  key={note.id}
                  className="group rounded-lg border border-gray-200 bg-white p-3 transition-all hover:border-gray-300"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      {note.title && (
                        <h4 className="mb-1 line-clamp-1 text-sm font-medium text-gray-900">
                          {note.title}
                        </h4>
                      )}
                      <p className="line-clamp-2 text-sm text-gray-600">
                        {note.content}
                      </p>
                      <ClientDate
                        date={note.createdAt}
                        format="date"
                        className="mt-1 text-xs text-gray-400"
                      />
                    </div>
                    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
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
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Output Detail Modal */}
      {viewingOutput && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h3 className="font-semibold text-gray-900">
                {viewingOutput.title}
              </h3>
              <button
                onClick={() => setViewingOutput(null)}
                className="rounded-lg p-1 hover:bg-gray-100"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <OutputViewer
                output={viewingOutput}
                projectId={projectId}
                onRegenerate={() => {
                  onRegenerateOutput(viewingOutput.id);
                  setViewingOutput(null);
                }}
                onExport={(format) => {
                  const content = viewingOutput.content || '';
                  const blob = new Blob([content], {
                    type:
                      format === 'json' ? 'application/json' : 'text/markdown',
                  });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${viewingOutput.title}.${format === 'json' ? 'json' : 'md'}`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ==================== Artifacts View (Tab) - Now deprecated but kept for reference ====================
function ArtifactsView({
  outputs,
  notes,
  selectedSourceIds,
  onGenerateOutput,
  onRegenerateOutput,
  onCreateNote,
  onUpdateNote,
  onDeleteNote,
  projectId,
}: {
  outputs: Output[];
  notes: Note[];
  selectedSourceIds: string[];
  onGenerateOutput: (type: string) => void;
  onRegenerateOutput: (outputId: string) => void;
  onCreateNote: (note: Partial<Note>) => void;
  onUpdateNote: (id: string, updates: Partial<Note>) => void;
  onDeleteNote: (id: string) => void;
  projectId: string;
}) {
  const [activeSection, setActiveSection] = useState<'create' | 'notes'>(
    'create'
  );
  const [viewingOutput, setViewingOutput] = useState<Output | null>(null);
  const [showNewNote, setShowNewNote] = useState(false);
  const [newNoteContent, setNewNoteContent] = useState('');

  const outputTypes = [
    {
      type: 'STUDY_GUIDE',
      icon: BookMarked,
      label: 'Study Guide',
      desc: 'Comprehensive study materials',
    },
    {
      type: 'BRIEFING_DOC',
      icon: ClipboardList,
      label: 'Briefing Doc',
      desc: 'Executive summary document',
    },
    {
      type: 'FAQ',
      icon: HelpCircle,
      label: 'FAQ',
      desc: 'Frequently asked questions',
    },
    {
      type: 'TIMELINE',
      icon: Calendar,
      label: 'Timeline',
      desc: 'Chronological overview',
    },
    {
      type: 'TREND_REPORT',
      icon: TrendingUp,
      label: 'Trend Report',
      desc: 'Analysis of trends',
    },
    {
      type: 'COMPARISON',
      icon: GitCompare,
      label: 'Comparison',
      desc: 'Side-by-side analysis',
    },
    {
      type: 'KNOWLEDGE_GRAPH',
      icon: Network,
      label: 'Knowledge Graph',
      desc: 'Visual concept map',
    },
    {
      type: 'FLASHCARDS',
      icon: Layers,
      label: 'Flashcards',
      desc: 'Study flashcards',
    },
    {
      type: 'QUIZ',
      icon: GraduationCap,
      label: 'Quiz',
      desc: 'Test your knowledge',
    },
    {
      type: 'MIND_MAP',
      icon: Brain,
      label: 'Mind Map',
      desc: 'Structured visualization',
    },
  ];

  const handleCreateNote = () => {
    if (newNoteContent.trim()) {
      onCreateNote({ content: newNoteContent.trim() });
      setNewNoteContent('');
      setShowNewNote(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col bg-gray-50">
      {/* Header */}
      <div className="border-b bg-white px-6 py-4">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Artifacts</h2>
              <p className="mt-1 text-sm text-gray-500">
                Transform your research into knowledge products
              </p>
            </div>
            {selectedSourceIds.length > 0 && (
              <span className="flex items-center gap-1.5 rounded-full bg-purple-100 px-3 py-1.5 text-sm text-purple-700">
                <CheckCircle2 className="h-4 w-4" />
                {selectedSourceIds.length} sources selected
              </span>
            )}
          </div>

          {/* Section Tabs */}
          <div className="mt-4 flex gap-4">
            <button
              onClick={() => setActiveSection('create')}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                activeSection === 'create'
                  ? 'bg-purple-100 text-purple-700'
                  : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              Create
            </button>
            <button
              onClick={() => setActiveSection('notes')}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                activeSection === 'notes'
                  ? 'bg-purple-100 text-purple-700'
                  : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              Notes ({notes.length})
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-6xl">
          {activeSection === 'create' ? (
            <div>
              {/* Artifact Types Grid */}
              <h3 className="mb-4 text-sm font-medium text-gray-500">
                Create New Artifact
              </h3>
              <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
                {outputTypes.map(({ type, icon: Icon, label, desc }) => (
                  <button
                    key={type}
                    onClick={() => onGenerateOutput(type)}
                    disabled={selectedSourceIds.length === 0}
                    className="group flex flex-col items-center gap-2 rounded-xl border-2 border-gray-200 bg-white p-4 transition-all hover:border-purple-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <div className="rounded-xl bg-gray-100 p-3 transition-colors group-hover:bg-purple-100">
                      <Icon className="h-6 w-6 text-gray-600 group-hover:text-purple-600" />
                    </div>
                    <span className="text-sm font-medium text-gray-900">
                      {label}
                    </span>
                    <span className="text-center text-xs text-gray-500">
                      {desc}
                    </span>
                  </button>
                ))}
              </div>

              {/* Your Artifacts */}
              {outputs.length > 0 && (
                <div>
                  <h3 className="mb-4 text-sm font-medium text-gray-500">
                    Your Artifacts
                  </h3>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {outputs.map((output) => (
                      <div
                        key={output.id}
                        onClick={() =>
                          output.status === 'COMPLETED' &&
                          setViewingOutput(output)
                        }
                        className={`rounded-xl border border-gray-200 bg-white p-4 ${
                          output.status === 'COMPLETED'
                            ? 'cursor-pointer hover:border-purple-300 hover:shadow-md'
                            : ''
                        } transition-all`}
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <span className="font-medium text-gray-900">
                            {output.title}
                          </span>
                          {output.status === 'GENERATING' ? (
                            <Loader2 className="h-5 w-5 animate-spin text-purple-600" />
                          ) : output.status === 'COMPLETED' ? (
                            <CheckCircle2 className="h-5 w-5 text-green-500" />
                          ) : output.status === 'FAILED' ? (
                            <AlertCircle className="h-5 w-5 text-red-500" />
                          ) : (
                            <Circle className="h-5 w-5 text-gray-300" />
                          )}
                        </div>
                        <p className="text-sm text-gray-500">
                          {output.status === 'COMPLETED'
                            ? 'Click to view'
                            : output.status === 'GENERATING'
                              ? 'Generating...'
                              : output.status === 'FAILED'
                                ? 'Generation failed'
                                : 'Queued'}
                        </p>
                        {output.status === 'FAILED' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onRegenerateOutput(output.id);
                            }}
                            className="mt-2 flex items-center gap-1 text-sm text-purple-600 hover:underline"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Retry
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div>
              {/* New Note */}
              {!showNewNote ? (
                <button
                  onClick={() => setShowNewNote(true)}
                  className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 p-4 text-gray-500 transition-colors hover:border-purple-300 hover:text-purple-600"
                >
                  <Plus className="h-5 w-5" />
                  Add Note
                </button>
              ) : (
                <div className="mb-4 rounded-xl border border-gray-200 bg-white p-4">
                  <textarea
                    value={newNoteContent}
                    onChange={(e) => setNewNoteContent(e.target.value)}
                    placeholder="Write your note..."
                    className="w-full resize-none border-0 p-0 text-gray-900 focus:outline-none focus:ring-0"
                    rows={4}
                    autoFocus
                  />
                  <div className="mt-3 flex justify-end gap-2">
                    <button
                      onClick={() => {
                        setShowNewNote(false);
                        setNewNoteContent('');
                      }}
                      className="rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreateNote}
                      disabled={!newNoteContent.trim()}
                      className="rounded-lg bg-purple-600 px-3 py-1.5 text-sm text-white hover:bg-purple-700 disabled:opacity-50"
                    >
                      Save
                    </button>
                  </div>
                </div>
              )}

              {/* Notes List */}
              <div className="space-y-3">
                {notes.map((note) => (
                  <div
                    key={note.id}
                    className="group rounded-xl border border-gray-200 bg-white p-4 transition-all hover:border-gray-300"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        {note.title && (
                          <h4 className="mb-1 font-medium text-gray-900">
                            {note.title}
                          </h4>
                        )}
                        <p className="text-gray-600">{note.content}</p>
                        <ClientDate
                          date={note.createdAt}
                          format="date"
                          className="mt-2 text-xs text-gray-400"
                        />
                      </div>
                      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          onClick={() =>
                            onUpdateNote(note.id, { isPinned: !note.isPinned })
                          }
                          className="rounded-lg p-1.5 hover:bg-gray-100"
                        >
                          {note.isPinned ? (
                            <PinOff className="h-4 w-4 text-purple-600" />
                          ) : (
                            <Pin className="h-4 w-4 text-gray-400" />
                          )}
                        </button>
                        <button
                          onClick={() => onDeleteNote(note.id)}
                          className="rounded-lg p-1.5 hover:bg-red-100"
                        >
                          <Trash2 className="h-4 w-4 text-gray-400 hover:text-red-500" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Output Detail Modal */}
      {viewingOutput && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h3 className="font-semibold text-gray-900">
                {viewingOutput.title}
              </h3>
              <button
                onClick={() => setViewingOutput(null)}
                className="rounded-lg p-1 hover:bg-gray-100"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <OutputViewer
                output={viewingOutput}
                projectId={projectId}
                onRegenerate={() => {
                  onRegenerateOutput(viewingOutput.id);
                  setViewingOutput(null);
                }}
                onExport={(format) => {
                  const content = viewingOutput.content || '';
                  const blob = new Blob([content], {
                    type:
                      format === 'json' ? 'application/json' : 'text/markdown',
                  });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${viewingOutput.title}.${format === 'json' ? 'json' : 'md'}`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              />
            </div>
          </div>
        </div>
      )}
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
  // Use array instead of Set to preserve selection order for citations
  // [1] = first selected, [2] = second selected, etc.
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [sourcesCollapsed, setSourcesCollapsed] = useState(false);
  const [artifactsCollapsed, setArtifactsCollapsed] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>('');
  // 研究类型由项目决定，不再需要 Tab 切换
  // project.researchType 决定显示 Fast Research 还是 Deep Research

  // Scroll to source callback for citation system
  const handleScrollToSource = useCallback(
    (sourceId: string) => {
      // Expand sources panel if collapsed
      if (sourcesCollapsed) {
        setSourcesCollapsed(false);
      }
      // Find and scroll to the source element
      setTimeout(() => {
        const sourceElement = document.querySelector(
          `[data-source-id="${sourceId}"]`
        );
        if (sourceElement) {
          sourceElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    },
    [sourcesCollapsed]
  );

  // Convert sources to SourceReference format for citation system
  const sourceReferences: SourceReference[] =
    project?.sources.map((s) => ({
      id: s.id,
      title: s.title,
      content: s.content,
      abstract: s.abstract,
    })) || [];

  // Load AI models
  const { models: aiModels, loading: modelsLoading } = useAIModels();

  // Set default model when models are loaded
  // AI Studio uses standard chat model (CHAT type) for complex conversations
  useEffect(() => {
    if (aiModels.length > 0 && !selectedModel) {
      // Debug: 输出所有可用模型
      logger.debug(
        '[AI Studio] Available models:',
        aiModels.map((m) => ({
          name: m.name,
          modelName: m.modelName,
          modelType: m.modelType,
          isDefault: m.isDefault,
        }))
      );

      // 优先使用标准聊天(CHAT)类型的默认模型
      const chatModel = getDefaultChatModel(aiModels);
      logger.debug(
        '[AI Studio] getDefaultChatModel returned:',
        chatModel?.name
      );

      const defaultModel =
        chatModel || aiModels.find((m) => m.isDefault) || aiModels[0];
      logger.debug('[AI Studio] Final selected model:', defaultModel?.name);

      if (defaultModel) {
        setSelectedModel(defaultModel.modelName);
      }
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

  // Poll for output status updates (PENDING/GENERATING -> COMPLETED/FAILED)
  useEffect(() => {
    if (!project) return;

    // Find outputs that need polling
    const pendingOutputs = project.outputs.filter(
      (o) => o.status === 'PENDING' || o.status === 'GENERATING'
    );

    if (pendingOutputs.length === 0) return;

    const pollInterval = setInterval(async () => {
      try {
        // Fetch updated status for each pending output
        const updates = await Promise.all(
          pendingOutputs.map((o) => fetchOutput(projectId, o.id))
        );

        // Check if any outputs have changed status
        const hasChanges = updates.some((updated, i) => {
          return updated.status !== pendingOutputs[i].status;
        });

        if (hasChanges) {
          // Update project state with new output statuses
          setProject((prev) => {
            if (!prev) return null;
            const updatedMap = new Map(updates.map((u) => [u.id, u]));
            return {
              ...prev,
              outputs: prev.outputs.map((o) => updatedMap.get(o.id) || o),
            };
          });
        }
      } catch (err) {
        logger.error('Failed to poll output status:', err);
      }
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(pollInterval);
  }, [project?.outputs, projectId]);

  // Toggle source selection (preserves order for citation indices)
  const handleToggleSource = (id: string) => {
    setSelectedSourceIds((prev) => {
      const index = prev.indexOf(id);
      if (index !== -1) {
        // Remove from array
        return prev.filter((_, i) => i !== index);
      } else {
        // Add to end of array (new selections get next index)
        return [...prev, id];
      }
    });
  };

  // Helper: convert to Set for quick lookups
  const selectedSourceIdSet = new Set(selectedSourceIds);

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
      logger.error('Failed to add source:', err);
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
      setSelectedSourceIds((prev) =>
        prev.filter((sourceId) => sourceId !== id)
      );
    } catch (err) {
      logger.error('Failed to remove source:', err);
    }
  };

  // Batch remove sources
  const handleBatchRemoveSources = async (ids: string[]) => {
    if (!project || ids.length === 0) return;
    try {
      const results = await batchRemoveSources(projectId, ids);
      // Remove successfully deleted sources from state
      if (results.success.length > 0) {
        const successSet = new Set(results.success);
        setProject((prev) =>
          prev
            ? {
                ...prev,
                sources: prev.sources.filter((s) => !successSet.has(s.id)),
              }
            : null
        );
        setSelectedSourceIds((prev) =>
          prev.filter((sourceId) => !successSet.has(sourceId))
        );
      }
      // Notify user of results
      if (results.failed.length > 0) {
        alert(
          `删除完成：成功 ${results.success.length} 个，失败 ${results.failed.length} 个`
        );
      }
    } catch (err) {
      logger.error('Failed to batch remove sources:', err);
      alert('批量删除失败，请重试');
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
      const result = (await sendChatMessage(
        projectId,
        message,
        selectedSourceIds,
        selectedModel
      )) as ChatMessageResponse;

      // Add AI response from backend
      if (result.aiMessage) {
        const aiResponse: ChatMessage = {
          id: result.aiMessage.id,
          role: 'assistant',
          content: result.aiMessage.content,
          timestamp: result.aiMessage.timestamp,
          citations: result.aiMessage.citations,
          // Store source context in the order used for citations
          sourceContext: result.sourceContext?.map((s) => ({
            id: s.id,
            title: s.title,
            content: s.content,
            abstract: s.abstract,
          })),
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
      logger.error('Failed to send message:', err);
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
      logger.error('Failed to save note:', err);
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
      logger.error('Failed to create note:', err);
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
      logger.error('Failed to update note:', err);
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
      logger.error('Failed to delete note:', err);
    }
  };

  // Generate output
  const handleGenerateOutput = async (type: string) => {
    if (!project) return;
    try {
      const newOutput = await generateOutput(
        projectId,
        type,
        selectedSourceIds
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
      logger.error('Failed to generate output:', err);
    }
  };

  // Add multiple sources at once (from file upload)
  const handleAddSources = (newSources: Source[]) => {
    if (!project) return;
    setProject((prev) =>
      prev
        ? {
            ...prev,
            sources: [...newSources, ...prev.sources],
          }
        : null
    );
  };

  // Regenerate output
  const handleRegenerateOutput = async (outputId: string) => {
    if (!project) return;
    const output = project.outputs.find((o) => o.id === outputId);
    if (!output) return;
    try {
      // For now, just regenerate by creating a new output of same type
      const newOutput = await generateOutput(
        projectId,
        output.type,
        selectedSourceIds
      );
      setProject((prev) =>
        prev
          ? {
              ...prev,
              outputs: [
                newOutput,
                ...prev.outputs.filter((o) => o.id !== outputId),
              ],
            }
          : null
      );
    } catch (err) {
      logger.error('Failed to regenerate output:', err);
    }
  };

  // Delete output
  const handleDeleteOutput = async (outputId: string) => {
    if (!project) return;
    try {
      await deleteOutput(projectId, outputId);
      setProject((prev) =>
        prev
          ? {
              ...prev,
              outputs: prev.outputs.filter((o) => o.id !== outputId),
            }
          : null
      );
    } catch (err) {
      logger.error('Failed to delete output:', err);
    }
  };

  // Update output (for renaming)
  const handleUpdateOutput = async (
    outputId: string,
    updates: Partial<Output>
  ) => {
    if (!project) return;
    try {
      const updated = await updateOutput(projectId, outputId, updates);
      setProject((prev) =>
        prev
          ? {
              ...prev,
              outputs: prev.outputs.map((o) =>
                o.id === outputId ? { ...o, ...updated } : o
              ),
            }
          : null
      );
    } catch (err) {
      logger.error('Failed to update output:', err);
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
          onClick={() => router.push('/ai-research')}
          className="mt-4 text-purple-600 hover:underline"
        >
          Back to projects
        </button>
      </div>
    );
  }

  // 研究类型标签配置
  const researchTypeConfig = {
    FAST: { label: 'Fast Research', icon: Zap },
    DEEP: { label: 'Deep Research', icon: Microscope },
  };
  const currentTypeConfig = researchTypeConfig[project.researchType];
  const CurrentIcon = currentTypeConfig.icon;

  return (
    <CitationProvider
      sources={sourceReferences}
      onScrollToSource={handleScrollToSource}
    >
      <div className="flex h-screen flex-col bg-gray-50">
        {/* Top Header */}
        <div className="border-b border-gray-200 bg-white">
          <div className="flex items-center justify-between px-4 py-2">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/ai-research')}
                className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="flex items-center gap-2">
                <span className="text-xl">{project.icon || '📚'}</span>
                <h1 className="font-semibold text-gray-900">{project.name}</h1>
              </div>
            </div>
            {/* Header Actions */}
            <div className="flex items-center gap-3">
              {selectedSourceIds.length > 0 &&
                project.researchType === 'FAST' && (
                  <span className="flex items-center gap-1.5 rounded-full bg-purple-100 px-3 py-1 text-sm text-purple-700">
                    <CheckCircle2 className="h-4 w-4" />
                    {selectedSourceIds.length} sources selected
                  </span>
                )}
            </div>
          </div>

          {/* Research Type Indicator (no switching, type is fixed per project) */}
          <div className="flex items-center gap-2 border-t border-gray-100 px-4 py-2">
            <CurrentIcon className="h-4 w-4 text-purple-600" />
            <span className="text-sm font-medium text-purple-700">
              {currentTypeConfig.label}
            </span>
            {project.researchType === 'FAST' && project.sources.length > 0 && (
              <span className="rounded-full bg-purple-100 px-1.5 py-0.5 text-xs text-purple-700">
                {project.sources.length}
              </span>
            )}
          </div>
        </div>

        {/* Content based on Research Type */}
        <div className="flex flex-1 overflow-hidden">
          {/* Fast Research - Sources + Chat + Artifacts Sidebar */}
          {project.researchType === 'FAST' && (
            <>
              <div className="flex flex-1 overflow-hidden">
                {/* Sources Sidebar */}
                <SourcesPanel
                  sources={project.sources}
                  selectedIds={selectedSourceIds}
                  onToggleSelect={handleToggleSource}
                  onAddSource={handleAddSource}
                  onAddSources={handleAddSources}
                  onRemoveSource={handleRemoveSource}
                  onBatchRemoveSources={handleBatchRemoveSources}
                  collapsed={sourcesCollapsed}
                  onToggleCollapse={() =>
                    setSourcesCollapsed(!sourcesCollapsed)
                  }
                  projectId={projectId}
                />
                {/* Chat Area */}
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
              </div>
              {/* Artifacts Sidebar */}
              <ArtifactsSidebar
                outputs={project.outputs}
                notes={project.notes}
                selectedSourceIds={selectedSourceIds}
                onGenerateOutput={handleGenerateOutput}
                onRegenerateOutput={handleRegenerateOutput}
                onDeleteOutput={handleDeleteOutput}
                onUpdateOutput={handleUpdateOutput}
                onCreateNote={handleCreateNote}
                onUpdateNote={handleUpdateNote}
                onDeleteNote={handleDeleteNote}
                projectId={projectId}
                collapsed={artifactsCollapsed}
                onToggleCollapse={() =>
                  setArtifactsCollapsed(!artifactsCollapsed)
                }
              />
            </>
          )}

          {/* Deep Research - Research + Artifacts Sidebar */}
          {project.researchType === 'DEEP' && (
            <>
              <ResearchTab
                projectId={projectId}
                onExportToOutputs={(report) => {
                  // TODO: Export research report to outputs
                  logger.debug('Export research report:', report);
                }}
                className="flex-1"
              />
              {/* Artifacts Sidebar */}
              <ArtifactsSidebar
                outputs={project.outputs}
                notes={project.notes}
                selectedSourceIds={selectedSourceIds}
                onGenerateOutput={handleGenerateOutput}
                onRegenerateOutput={handleRegenerateOutput}
                onDeleteOutput={handleDeleteOutput}
                onUpdateOutput={handleUpdateOutput}
                onCreateNote={handleCreateNote}
                onUpdateNote={handleUpdateNote}
                onDeleteNote={handleDeleteNote}
                projectId={projectId}
                collapsed={artifactsCollapsed}
                onToggleCollapse={() =>
                  setArtifactsCollapsed(!artifactsCollapsed)
                }
              />
            </>
          )}
        </div>
      </div>
    </CitationProvider>
  );
}
