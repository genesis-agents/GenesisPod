'use client';

/**
 * REFACTORED VERSION - Main ExploreContent Component
 * This demonstrates the target structure after extraction.
 * Replace ExploreContent.tsx with this file after verification.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { config } from '@/lib/utils/config';
import { useAuth } from '@/contexts/AuthContext';
import { getAuthHeader } from '@/lib/utils/auth';
import Sidebar from '@/components/layout/Sidebar';
import VersionUpdateBanner from '@/components/layout/VersionUpdateBanner';
import ReportWorkspace from '@/components/features/ReportWorkspace';
import ResponsiveNav, { type TabType } from '@/components/layout/ResponsiveNav';
import FilterPanel from '@/components/features/FilterPanel';
import { ImportUrlDialog } from '@/components/shared/dialogs/ImportUrlDialog';
import { ImportFileDialog } from '@/components/shared/dialogs/ImportFileDialog';

// Import extracted components
import { SearchBar } from './SearchBar';
import { ResourceListView } from './ResourceListView';
import { ResourceCard } from './ResourceCard';

// Import types and constants
import type { Resource, SearchSuggestion } from './types';
import { FILE_RESTRICTIONS } from './constants';
import { extractYouTubeVideoId } from './utils';
import {
  generateSummary as generateSummaryHelper,
  generateInsights as generateInsightsHelper,
} from './aiHelpers';

// Import custom hooks
import { useBookmarks } from './hooks/useBookmarks';
import { usePDFText } from './hooks/usePDFText';
import { useResources } from './hooks/useResources';
import { useAIAssistant } from './hooks/useAIAssistant';
import { useAIModels, useReportWorkspace } from '@/hooks';
import { useResourceStore } from '@/stores/aiOfficeStore';

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isAdmin, accessToken } = useAuth();

  // Tab and view state
  const initialTab = (searchParams?.get('tab') || 'papers') as TabType;
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [selectedResource, setSelectedResource] = useState<Resource | null>(
    null
  );
  const [viewMode, setViewMode] = useState<'list' | 'detail'>('list');

  // Search and filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<
    'publishedAt' | 'qualityScore' | 'trendingScore'
  >('trendingScore');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<
    'all' | '24h' | '7d' | '30d' | '90d'
  >('all');
  const [minQualityScore, setMinQualityScore] = useState<number>(0);

  // Search suggestions
  const [searchSuggestions, setSearchSuggestions] = useState<
    SearchSuggestion[]
  >([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);

  // File upload
  const [uploadingFile, setUploadingFile] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Import dialogs
  const [showImportUrlDialog, setShowImportUrlDialog] = useState(false);
  const [showImportFileDialog, setShowImportFileDialog] = useState(false);

  // Toast notifications
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);

  // Upvote states
  const [upvotes, setUpvotes] = useState<Set<string>>(new Set());

  // Custom hooks
  const { bookmarks, isBookmarked, toggleBookmark } = useBookmarks();
  const aiOfficeStore = useResourceStore();
  const { models: allAiModels } = useAIModels();
  const aiModels = allAiModels.filter(
    (m) =>
      m.modelType === 'CHAT' ||
      m.modelType === 'CHAT_FAST' ||
      m.modelType === 'MULTIMODAL'
  );

  // Resource management hook
  const {
    resources,
    loading,
    loadingMore,
    hasMore,
    loadMoreTriggerRef,
    setResources,
    fetchResources,
  } = useResources({
    activeTab,
    searchQuery,
    sortBy,
    sortOrder,
    filterCategory,
    selectedCategories,
    selectedSources,
    dateRange,
    minQualityScore,
  });

  // Auto-hide toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Handlers
  const handleResourceClick = (resource: Resource) => {
    // For YouTube videos, navigate to the YouTube page
    if (
      resource.type === 'YOUTUBE' ||
      resource.type === 'YOUTUBE_VIDEO' ||
      (resource as any).videoId
    ) {
      const videoId =
        (resource as any).videoId || extractYouTubeVideoId(resource.sourceUrl);
      if (videoId) {
        router.push(`/explore/youtube?videoId=${videoId}`);
        return;
      }
    }

    setSelectedResource(resource);
    setViewMode('detail');
  };

  const handleBackToList = () => {
    setViewMode('list');
  };

  const handleSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (
        selectedSuggestionIndex >= 0 &&
        searchSuggestions[selectedSuggestionIndex]
      ) {
        handleSuggestionClick(searchSuggestions[selectedSuggestionIndex]);
      } else {
        setShowSuggestions(false);
        fetchResources();
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedSuggestionIndex((prev) =>
        prev < searchSuggestions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedSuggestionIndex((prev) => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setSelectedSuggestionIndex(-1);
    }
  };

  const handleSuggestionClick = (suggestion: SearchSuggestion) => {
    setSearchQuery(suggestion.title);
    setShowSuggestions(false);
    setSelectedSuggestionIndex(-1);
    const resource = resources.find((r) => r.id === suggestion.id);
    if (resource) {
      handleResourceClick(resource);
    }
  };

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const restrictions = FILE_RESTRICTIONS[activeTab];
    if (!restrictions) {
      setToast({ message: '当前标签页不支持文件上传', type: 'error' });
      return;
    }

    // File validation logic here (omitted for brevity)

    setSelectedFile(file);
    setUploadingFile(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', activeTab.toUpperCase());

      const response = await fetch(`${config.apiUrl}/resources/upload-file`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('文件上传失败');
      }

      setToast({ message: `文件 "${file.name}" 上传成功！`, type: 'success' });
      await fetchResources();
    } catch (error) {
      console.error('File upload error:', error);
      setToast({ message: '文件上传失败', type: 'error' });
    } finally {
      setUploadingFile(false);
      setSelectedFile(null);
      if (event.target) event.target.value = '';
    }
  };

  const toggleUpvote = (resourceId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newUpvotes = new Set(upvotes);
    if (newUpvotes.has(resourceId)) {
      newUpvotes.delete(resourceId);
      setResources((prev) =>
        prev.map((r) =>
          r.id === resourceId
            ? { ...r, upvoteCount: Math.max(0, (r.upvoteCount || 0) - 1) }
            : r
        )
      );
    } else {
      newUpvotes.add(resourceId);
      setResources((prev) =>
        prev.map((r) =>
          r.id === resourceId
            ? { ...r, upvoteCount: (r.upvoteCount || 0) + 1 }
            : r
        )
      );
    }
    setUpvotes(newUpvotes);
  };

  const hasUpvoted = (resourceId: string) => upvotes.has(resourceId);

  const handleCommentClick = (resource: Resource, e: React.MouseEvent) => {
    e.stopPropagation();
    handleResourceClick(resource);
  };

  const handleDeleteResource = async (
    resourceId: string,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    if (!isAdmin) return;

    if (!confirm('确定要删除这个资源吗？此操作无法撤销。')) return;

    try {
      const response = await fetch(
        `${config.apiUrl}/admin/resources/${resourceId}`,
        {
          method: 'DELETE',
          headers: getAuthHeader(),
        }
      );

      if (response.ok) {
        setResources((prev) => prev.filter((r) => r.id !== resourceId));
        if (selectedResource?.id === resourceId) {
          setSelectedResource(null);
          setViewMode('list');
        }
        setToast({ message: '资源已删除', type: 'success' });
      }
    } catch (err) {
      console.error('Failed to delete resource:', err);
      setToast({ message: '删除资源失败', type: 'error' });
    }
  };

  const handleApplyFilters = () => {
    fetchResources();
  };

  const handleResetFilters = () => {
    setSelectedCategories([]);
    setSelectedSources([]);
    setDateRange('all');
    setMinQualityScore(0);
    fetchResources();
  };

  const handleToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
  };

  return (
    <div className="relative flex h-screen w-screen overflow-hidden bg-gray-50">
      <VersionUpdateBanner />
      <ReportWorkspace />
      <Sidebar />

      {/* Center Content Area */}
      <main
        className={`min-w-0 flex-1 bg-gray-50 ${viewMode === 'detail' ? 'flex flex-col overflow-hidden' : 'overflow-y-auto'}`}
      >
        {/* Sticky Search Bar - Only show in list view */}
        {viewMode === 'list' && (
          <div className="sticky top-0 z-10 bg-gray-50 pb-4 pt-6">
            <div className="mx-auto max-w-6xl px-8">
              <SearchBar
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                onSearch={handleSearch}
                onFocus={() => {
                  if (searchQuery.length >= 2) {
                    setShowSuggestions(true);
                  }
                }}
                showSuggestions={showSuggestions}
                searchSuggestions={searchSuggestions}
                selectedSuggestionIndex={selectedSuggestionIndex}
                onSuggestionClick={handleSuggestionClick}
                fileInputRef={fileInputRef}
                acceptedFileTypes={FILE_RESTRICTIONS[activeTab]?.accept || '*'}
                onFileChange={handleFileChange}
              />

              {/* Tabs and Filters */}
              <ResponsiveNav
                activeTab={activeTab}
                onTabChange={setActiveTab}
                onImportUrlClick={() => setShowImportUrlDialog(true)}
                onImportFileClick={() => setShowImportFileDialog(true)}
                onFilterClick={() => setShowFilterPanel(true)}
                filterActive={
                  selectedCategories.length > 0 ||
                  selectedSources.length > 0 ||
                  dateRange !== 'all' ||
                  minQualityScore > 0
                }
                sortBy={sortBy}
                onSortChange={setSortBy}
              />
            </div>
          </div>
        )}

        {/* Content Area */}
        <div
          className={`${viewMode === 'detail' ? 'flex w-full flex-1 flex-col overflow-hidden px-2 pt-2' : 'mx-auto max-w-6xl px-8 pb-6'}`}
        >
          {/* List View */}
          {viewMode === 'list' && (
            <ResourceListView
              resources={resources}
              loading={loading}
              loadingMore={loadingMore}
              hasMore={hasMore}
              loadMoreTriggerRef={loadMoreTriggerRef}
              selectedSources={selectedSources}
              isBookmarked={isBookmarked}
              hasUpvoted={hasUpvoted}
              onResourceClick={handleResourceClick}
              onToggleBookmark={toggleBookmark}
              onToggleUpvote={toggleUpvote}
              onCommentClick={handleCommentClick}
              onDeleteResource={isAdmin ? handleDeleteResource : undefined}
              onToast={handleToast}
              isAdmin={isAdmin}
            />
          )}

          {/* Detail View - Placeholder */}
          {viewMode === 'detail' && selectedResource && (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="border-b border-gray-200 bg-white p-4">
                <button
                  onClick={handleBackToList}
                  className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
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
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                  Back to List
                </button>
                <h1 className="mt-2 text-2xl font-bold text-gray-900">
                  {selectedResource.title}
                </h1>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                <p className="text-gray-700">{selectedResource.abstract}</p>
                {/* Additional detail view content would go here */}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Filter Panel */}
      <FilterPanel
        isOpen={showFilterPanel}
        onClose={() => setShowFilterPanel(false)}
        activeTab={activeTab}
        selectedCategories={selectedCategories}
        setSelectedCategories={setSelectedCategories}
        dateRange={dateRange}
        setDateRange={setDateRange}
        minQualityScore={minQualityScore}
        setMinQualityScore={setMinQualityScore}
        selectedSources={selectedSources}
        setSelectedSources={setSelectedSources}
        onApply={handleApplyFilters}
        onReset={handleResetFilters}
      />

      {/* Import Dialogs */}
      <ImportUrlDialog
        isOpen={showImportUrlDialog}
        onClose={() => setShowImportUrlDialog(false)}
        activeTab={activeTab}
        onImportSuccess={() => fetchResources()}
        apiBaseUrl={config.apiBaseUrl}
      />

      <ImportFileDialog
        isOpen={showImportFileDialog}
        onClose={() => setShowImportFileDialog(false)}
        activeTab={activeTab}
        onImportSuccess={() => fetchResources()}
        apiBaseUrl={config.apiBaseUrl}
      />

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50">
          <div
            className={`rounded-lg px-6 py-3 shadow-lg ${
              toast.type === 'success'
                ? 'bg-green-500 text-white'
                : 'bg-red-500 text-white'
            }`}
          >
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}

export default HomeContent;
