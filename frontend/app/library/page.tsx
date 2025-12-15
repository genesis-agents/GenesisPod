'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import dynamicImport from 'next/dynamic';
import { config } from '@/lib/utils/config';
import Sidebar from '@/components/layout/Sidebar';
import { Tag, UserStats } from '@/components/library/CollectionNav';
import ReadStatusBadge from '@/components/library/ReadStatusBadge';
import TagList from '@/components/library/TagList';
import { getAuthHeader } from '@/lib/utils/auth';
import { useMultiSelect } from '@/hooks/useMultiSelect';
import {
  useCollections,
  ReadStatus,
  CollectionItem,
  Collection,
  PaginatedResult,
} from '@/hooks/useCollections';
import { useResourceStore } from '@/stores/aiOfficeStore';
import { useImageSourceStore } from '@/stores/imageSourceStore';
import type { Resource as AIOfficeResource } from '@/types/ai-office';
import type { Note } from '@/components/features/NotesList';

// 懒加载条件渲染的组件
const NotesList = dynamicImport(
  () => import('@/components/features/NotesList'),
  { ssr: false }
);

const KnowledgeGraphView = dynamicImport(
  () => import('@/components/shared/views/KnowledgeGraphView'),
  { ssr: false, loading: () => <GraphLoadingSkeleton /> }
);

// Graph loading skeleton
function GraphLoadingSkeleton() {
  return (
    <div className="flex h-[600px] items-center justify-center rounded-lg border border-gray-200 bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="text-center">
        <div className="mx-auto h-12 w-12 animate-pulse rounded-full bg-gradient-to-r from-purple-400 to-blue-400" />
        <p className="mt-4 text-gray-600">Loading knowledge graph...</p>
      </div>
    </div>
  );
}

const CollectionModal = dynamicImport(
  () => import('@/components/library/CollectionModal'),
  { ssr: false }
);

const BatchActionBar = dynamicImport(
  () => import('@/components/library/BatchActionBar'),
  { ssr: false }
);

const AddToAIStudioDialog = dynamicImport(
  () =>
    import('@/components/shared/dialogs/AddToAIStudioDialog').then(
      (mod) => mod.AddToAIStudioDialog
    ),
  { ssr: false }
);

const AIOrganizePanel = dynamicImport(
  () => import('@/components/library/AIOrganizePanel'),
  { ssr: false }
);

export const dynamic = 'force-dynamic';

interface YouTubeVideo {
  id: string;
  videoId: string;
  title: string;
  url: string;
  transcript: unknown;
  translatedText?: string;
  aiReport?: unknown;
  createdAt: string;
}

interface Resource {
  id: string;
  type: string;
  title: string;
  abstract?: string;
  publishedAt: string;
  sourceUrl: string;
  thumbnailUrl?: string;
  upvoteCount?: number;
}

interface BookmarkedImage {
  id: string;
  prompt: string;
  enhancedPrompt?: string;
  imageUrl: string;
  width: number;
  height: number;
  createdAt: string;
  isBookmarked: boolean;
}

function LibraryPageContent() {
  const searchParams = useSearchParams();
  const tabParam = searchParams?.get('tab');

  const [activeTab, setActiveTab] = useState<
    'bookmarks' | 'notes' | 'images' | 'graph'
  >(() => {
    // Initialize from URL parameter if present
    if (tabParam === 'images' || tabParam === 'notes' || tabParam === 'graph') {
      return tabParam;
    }
    return 'bookmarks';
  });

  // Update activeTab when URL parameter changes
  useEffect(() => {
    if (
      tabParam === 'images' ||
      tabParam === 'notes' ||
      tabParam === 'bookmarks' ||
      tabParam === 'graph'
    ) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [paginatedItems, setPaginatedItems] =
    useState<PaginatedResult<CollectionItem> | null>(null);
  const [currentCollectionId, setCurrentCollectionId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'addedAt' | 'title' | 'publishedAt'>(
    'addedAt'
  );
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Tags and stats
  const [tags, setTags] = useState<Tag[]>([]);
  const [stats, setStats] = useState<UserStats | null>(null);

  // Multi-select mode
  const [selectionMode, setSelectionMode] = useState(false);
  const {
    selectedIds,
    selectedCount,
    toggleSelect,
    selectAll,
    clearAll,
    isSelected,
  } = useMultiSelect(50);

  // Modal states
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [editNoteModalOpen, setEditNoteModalOpen] = useState(false);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<CollectionItem | null>(null);

  // Collection navigation states
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(
    null
  );
  const [collectionModalOpen, setCollectionModalOpen] = useState(false);
  const [collectionModalMode, setCollectionModalMode] = useState<
    'create' | 'edit'
  >('create');
  const [editingCollection, setEditingCollection] = useState<Collection | null>(
    null
  );

  // Infinite scroll ref
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Bookmarked images state
  const [bookmarkedImages, setBookmarkedImages] = useState<BookmarkedImage[]>(
    []
  );
  const [bookmarkedImagesLoading, setBookmarkedImagesLoading] = useState(false);

  // Selected image ID for navigation from bookmarks to Images tab
  const [selectedImageId, setSelectedImageId] = useState<string | undefined>(
    undefined
  );

  // Image modal state
  const [viewImageModalOpen, setViewImageModalOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<BookmarkedImage | null>(
    null
  );

  // Knowledge Graph state
  const [graphData, setGraphData] = useState<{
    nodes: Array<{
      id: string;
      label: string;
      type:
        | 'User'
        | 'Collection'
        | 'Resource'
        | 'Note'
        | 'Author'
        | 'Topic'
        | 'Tag';
      properties: Record<string, unknown>;
    }>;
    edges: Array<{
      source: string;
      target: string;
      type: string;
      weight?: number;
    }>;
  } | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphError, setGraphError] = useState<string | null>(null);

  // API hooks
  const collectionsApi = useCollections();

  // AI Office stores
  const aiOfficeStore = useResourceStore();
  const imageSourceStore = useImageSourceStore();

  // Toast state for notifications
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);

  // AI Studio dialog state
  const [aiStudioDialogOpen, setAiStudioDialogOpen] = useState(false);
  const [selectedResourceForStudio, setSelectedResourceForStudio] =
    useState<Resource | null>(null);

  // Auto-hide toast after 3 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Convert resource to AI Office format (simplified version for adding to store)
  const convertToAIOfficeResource = (
    resource: Resource
  ): Partial<AIOfficeResource> => ({
    _id: resource.id,
    userId: 'current-user',
    resourceId: resource.id,
    resourceType: 'web_page' as const,
    status: 'collected' as const,
    collectedAt: new Date(),
    updatedAt: new Date(),
    metadata: {
      title: resource.title,
      description: resource.abstract || '',
      url: resource.sourceUrl,
      thumbnailUrl: resource.thumbnailUrl,
    } as any,
  });

  // Handle adding a note to AI Office
  const handleAddNoteToOffice = (note: Note) => {
    // Notes can be added as reference material
    // Create a pseudo-resource from the note
    const noteAsResource: Partial<AIOfficeResource> = {
      _id: `note-${note.id}`,
      userId: 'current-user',
      resourceId: note.id,
      resourceType: 'web_page' as const,
      status: 'collected' as const,
      collectedAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        title: note.resource?.title || 'Note',
        description: note.content.slice(0, 200),
        url: '',
        content: note.content,
      } as any,
    };

    if (!aiOfficeStore.resources.some((r) => r._id === `note-${note.id}`)) {
      aiOfficeStore.addResource(noteAsResource as any);
      setToast({
        message: 'Note added to AI Office',
        type: 'success',
      });
    } else {
      setToast({
        message: 'Note already in AI Office',
        type: 'error',
      });
    }
  };

  // Load tags and stats
  const loadTagsAndStats = useCallback(async () => {
    try {
      const [tagsData, statsData] = await Promise.all([
        collectionsApi.getTags(),
        collectionsApi.getStats(),
      ]);
      setTags(tagsData);
      setStats(statsData);
    } catch (err) {
      console.error('Failed to load tags/stats:', err);
    }
  }, [collectionsApi]);

  // Load paginated items
  const loadItems = useCallback(
    async (page = 1, append = false) => {
      if (page === 1) setLoading(true);
      else setLoadingMore(true);

      try {
        // Determine filter based on activeCollectionId
        let collectionId: string | undefined;
        let status: ReadStatus | undefined;
        let tag: string | undefined;

        if (activeCollectionId) {
          if (activeCollectionId === 'recent') {
            // Recent items - no special filter, just sort by addedAt
          } else if (activeCollectionId === 'reading') {
            status = ReadStatus.READING;
          } else if (activeCollectionId === 'completed') {
            status = ReadStatus.COMPLETED;
          } else if (activeCollectionId.startsWith('tag:')) {
            tag = activeCollectionId.substring(4);
          } else {
            collectionId = activeCollectionId;
          }
        }

        const result = await collectionsApi.getItemsPaginated({
          collectionId,
          page,
          limit: 20,
          status,
          tag,
          search: searchQuery || undefined,
          sortBy,
          sortOrder,
        });

        if (append && paginatedItems) {
          setPaginatedItems({
            items: [...paginatedItems.items, ...result.items],
            pagination: result.pagination,
          });
        } else {
          setPaginatedItems(result);
        }
      } catch (err) {
        console.error('Failed to load items:', err);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [
      activeCollectionId,
      searchQuery,
      sortBy,
      sortOrder,
      collectionsApi,
      paginatedItems,
    ]
  );

  const loadCollections = useCallback(async () => {
    try {
      const authHeaders = getAuthHeader();
      const response = await fetch(`${config.apiBaseUrl}/api/v1/collections`, {
        headers: authHeaders,
      });
      if (response.ok) {
        const data = await response.json();
        // Deduplicate collections by id to avoid displaying duplicates
        const uniqueCollections = data.filter(
          (collection: Collection, index: number, self: Collection[]) =>
            index === self.findIndex((c) => c.id === collection.id)
        );
        setCollections(uniqueCollections);
        // Set default collection ID
        const defaultCollection = uniqueCollections.find(
          (c: Collection) => c.name === '我的收藏'
        );
        if (defaultCollection) {
          setCurrentCollectionId(defaultCollection.id);
        }
        return uniqueCollections;
      }
      return [];
    } catch (err) {
      console.error('Failed to load collections:', err);
      return [];
    }
  }, []);

  // Load bookmarked images
  const loadBookmarkedImages = useCallback(async () => {
    setBookmarkedImagesLoading(true);
    try {
      const response = await fetch(
        `${config.apiBaseUrl}/api/v1/ai-image/bookmarks`,
        { headers: { ...getAuthHeader() } }
      );
      if (response.ok) {
        const data: BookmarkedImage[] = await response.json();
        setBookmarkedImages(data);
      }
    } catch (err) {
      console.error('Failed to load bookmarked images:', err);
    } finally {
      setBookmarkedImagesLoading(false);
    }
  }, []);

  // Load knowledge graph data
  const loadGraphData = useCallback(async () => {
    setGraphLoading(true);
    setGraphError(null);
    try {
      // 构建 API URL，包含用户个性化参数
      const params = new URLSearchParams();
      // 如果选中了特定收藏集，则筛选该收藏集的内容
      if (
        activeCollectionId &&
        !['recent', 'reading', 'completed'].includes(activeCollectionId) &&
        !activeCollectionId.startsWith('tag:')
      ) {
        params.append('collectionId', activeCollectionId);
      }
      const queryString = params.toString();
      const url = `${config.apiUrl}/knowledge-graph/overview${queryString ? `?${queryString}` : ''}`;

      const response = await fetch(url, {
        headers: { ...getAuthHeader() },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch knowledge graph');
      }

      const data = await response.json();
      setGraphData(data);
    } catch (err) {
      console.error('Error fetching graph:', err);
      setGraphError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setGraphLoading(false);
    }
  }, [activeCollectionId]);

  // Initial load
  useEffect(() => {
    loadCollections();
    loadTagsAndStats();
  }, []);

  // Load items when filters change
  useEffect(() => {
    if (activeTab === 'bookmarks') {
      loadItems(1, false);
      loadBookmarkedImages();
    } else if (activeTab === 'images') {
      loadBookmarkedImages();
    } else if (activeTab === 'graph') {
      loadGraphData();
    }
  }, [
    activeCollectionId,
    searchQuery,
    sortBy,
    sortOrder,
    activeTab,
    loadBookmarkedImages,
    loadGraphData,
  ]);

  // Infinite scroll observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0].isIntersecting &&
          paginatedItems?.pagination.hasMore &&
          !loadingMore
        ) {
          loadItems(paginatedItems.pagination.page + 1, true);
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => observer.disconnect();
  }, [paginatedItems, loadingMore]);

  // Collection management handlers
  const handleCreateCollection = () => {
    setCollectionModalMode('create');
    setEditingCollection(null);
    setCollectionModalOpen(true);
  };

  const handleEditCollection = (collection: Collection) => {
    const fullCollection = collections.find((c) => c.id === collection.id);
    if (fullCollection) {
      setCollectionModalMode('edit');
      setEditingCollection(fullCollection);
      setCollectionModalOpen(true);
    }
  };

  const handleDeleteCollection = async (collection: Collection) => {
    if (
      !confirm(
        `Are you sure you want to delete "${collection.name}"? All bookmarks in this collection will be removed.`
      )
    ) {
      return;
    }

    try {
      await collectionsApi.deleteCollection(collection.id);
      setCollections(collections.filter((c) => c.id !== collection.id));
      if (activeCollectionId === collection.id) {
        setActiveCollectionId(null);
      }
    } catch (err) {
      console.error('Failed to delete collection:', err);
      alert('Failed to delete collection');
    }
  };

  const handleSaveCollection = async (data: {
    name: string;
    description?: string;
    icon?: string;
    color?: string;
    isPublic: boolean;
  }) => {
    if (collectionModalMode === 'create') {
      const newCollection = await collectionsApi.createCollection(data);
      setCollections([...collections, { ...newCollection, items: [] }]);
    } else if (editingCollection) {
      await collectionsApi.updateCollection(editingCollection.id, data);
      setCollections(
        collections.map((c) =>
          c.id === editingCollection.id ? { ...c, ...data } : c
        )
      );
    }
  };

  // Batch operations
  const handleBatchMove = async (targetCollectionId: string) => {
    try {
      await collectionsApi.batchMoveItems(selectedIds, targetCollectionId);
      clearAll();
      setSelectionMode(false);
      loadItems(1, false);
      loadCollections();
    } catch (err) {
      console.error('Failed to move items:', err);
      alert('Failed to move items');
    }
  };

  const handleBatchDelete = async () => {
    try {
      await collectionsApi.batchDeleteItems(selectedIds);
      clearAll();
      setSelectionMode(false);
      loadItems(1, false);
      loadCollections();
      loadTagsAndStats();
    } catch (err) {
      console.error('Failed to delete items:', err);
      alert('Failed to delete items');
    }
  };

  const handleBatchUpdateStatus = async (status: ReadStatus) => {
    try {
      await collectionsApi.batchUpdateStatus(selectedIds, status);
      clearAll();
      setSelectionMode(false);
      loadItems(1, false);
      loadTagsAndStats();
    } catch (err) {
      console.error('Failed to update status:', err);
      alert('Failed to update status');
    }
  };

  const handleBatchAddTags = async (newTags: string[]) => {
    try {
      await collectionsApi.batchUpdateTags(selectedIds, newTags, 'add');
      clearAll();
      setSelectionMode(false);
      loadItems(1, false);
      loadTagsAndStats();
    } catch (err) {
      console.error('Failed to add tags:', err);
      alert('Failed to add tags');
    }
  };

  // Single item operations
  const handleUpdateItemStatus = async (itemId: string, status: ReadStatus) => {
    try {
      await collectionsApi.updateItem(itemId, { readStatus: status });
      // Update local state
      if (paginatedItems) {
        setPaginatedItems({
          ...paginatedItems,
          items: paginatedItems.items.map((item) =>
            item.id === itemId ? { ...item, readStatus: status } : item
          ),
        });
      }
      loadTagsAndStats();
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  const handleUpdateItemTags = async (itemId: string, newTags: string[]) => {
    try {
      await collectionsApi.updateItem(itemId, { tags: newTags });
      // Update local state
      if (paginatedItems) {
        setPaginatedItems({
          ...paginatedItems,
          items: paginatedItems.items.map((item) =>
            item.id === itemId ? { ...item, tags: newTags } : item
          ),
        });
      }
      loadTagsAndStats();
    } catch (err) {
      console.error('Failed to update tags:', err);
    }
  };

  // Handle view resource
  const handleView = (item: CollectionItem) => {
    setSelectedItem(item);
    setViewModalOpen(true);
  };

  // Handle edit note
  const handleEditNote = (item: CollectionItem) => {
    setSelectedItem(item);
    setEditNoteModalOpen(true);
  };

  // Handle remove from collection
  const handleRemove = (item: CollectionItem) => {
    setSelectedItem(item);
    setRemoveDialogOpen(true);
  };

  // Confirm remove from collection
  const confirmRemove = async () => {
    if (!selectedItem || !currentCollectionId) return;

    try {
      await collectionsApi.removeFromCollection(
        selectedItem.collectionId,
        selectedItem.resourceId
      );
      loadItems(1, false);
      loadCollections();
      loadTagsAndStats();
      setRemoveDialogOpen(false);
      setSelectedItem(null);
    } catch (err) {
      console.error('Failed to remove:', err);
      alert('Failed to remove from collection');
    }
  };

  // Update note
  const updateNote = async (newNote: string) => {
    if (!selectedItem) return;

    try {
      await collectionsApi.updateItem(selectedItem.id, { note: newNote });
      // Update local state
      if (paginatedItems) {
        setPaginatedItems({
          ...paginatedItems,
          items: paginatedItems.items.map((item) =>
            item.id === selectedItem.id ? { ...item, note: newNote } : item
          ),
        });
      }
      setEditNoteModalOpen(false);
      setSelectedItem(null);
    } catch (err) {
      console.error('Failed to update note:', err);
      alert('Failed to update note');
    }
  };

  const resolveThumbnailUrl = (thumbnailUrl?: string | null) => {
    if (!thumbnailUrl) return null;
    if (thumbnailUrl.startsWith('http')) return thumbnailUrl;
    return `${config.apiBaseUrl}${thumbnailUrl}`;
  };

  // Handle clicking on bookmarked AI image - navigate to Images tab and select the image
  const handleBookmarkedImageClick = (imageId: string) => {
    setSelectedImageId(imageId);
    setActiveTab('images');
  };

  // Handle clicking an image in Images tab to view full size
  const handleImageClick = (image: BookmarkedImage) => {
    setSelectedImage(image);
    setViewImageModalOpen(true);
  };

  // Handle removing bookmark from AI image
  const handleRemoveImageBookmark = async (
    imageId: string,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    try {
      const response = await fetch(
        `${config.apiBaseUrl}/api/v1/ai-image/${imageId}/bookmark`,
        {
          method: 'DELETE',
          headers: { ...getAuthHeader() },
        }
      );
      if (response.ok) {
        setBookmarkedImages((prev) => prev.filter((img) => img.id !== imageId));
      }
    } catch (err) {
      console.error('Failed to remove bookmark:', err);
    }
  };

  // 工具函数：根据资源类型获取正确的链接
  // YouTube 视频打开专属 YouTube 页面，其他类型打开 Explore 详情页（带 PDF 阅读器和 AI 助手）
  const getResourceLink = (resource: Resource): string => {
    if (resource.type === 'YOUTUBE' || resource.type === 'YOUTUBE_VIDEO') {
      // 从 sourceUrl 提取 YouTube videoId
      const url = resource.sourceUrl || '';
      let videoId = '';
      try {
        const urlObj = new URL(url);
        if (urlObj.hostname.includes('youtu.be')) {
          videoId = urlObj.pathname.slice(1);
        } else if (urlObj.hostname.includes('youtube.com')) {
          videoId =
            urlObj.searchParams.get('v') ||
            urlObj.pathname.split('/').pop() ||
            '';
        }
      } catch {
        // URL 解析失败，尝试正则匹配
        const match = url.match(
          /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([a-zA-Z0-9_-]+)/
        );
        if (match) videoId = match[1];
      }
      return videoId
        ? `/explore/youtube?videoId=${videoId}`
        : `/explore?id=${resource.id}`;
    }
    // 所有非 YouTube 资源都跳转到 Explore 页面，和从 Explore 列表点击进入体验一致
    return `/explore?id=${resource.id}`;
  };

  // Type badge config
  const typeConfig: Record<
    string,
    {
      bg: string;
      text: string;
      borderColor: string;
      icon: (className: string) => React.ReactNode;
    }
  > = {
    PAPER: {
      bg: 'bg-blue-50',
      text: 'text-blue-700',
      borderColor: 'border-blue-200',
      icon: (className) => (
        <svg
          className={className}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      ),
    },
    BLOG: {
      bg: 'bg-purple-50',
      text: 'text-purple-700',
      borderColor: 'border-purple-200',
      icon: (className) => (
        <svg
          className={className}
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
      ),
    },
    NEWS: {
      bg: 'bg-orange-50',
      text: 'text-orange-700',
      borderColor: 'border-orange-200',
      icon: (className) => (
        <svg
          className={className}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v4m2-4a2 2 0 012 2v10a2 2 0 01-2 2"
          />
        </svg>
      ),
    },
    YOUTUBE: {
      bg: 'bg-red-50',
      text: 'text-red-700',
      borderColor: 'border-red-200',
      icon: (className) => (
        <svg
          className={className}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      ),
    },
    YOUTUBE_VIDEO: {
      bg: 'bg-red-50',
      text: 'text-red-700',
      borderColor: 'border-red-200',
      icon: (className) => (
        <svg
          className={className}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      ),
    },
    REPORT: {
      bg: 'bg-green-50',
      text: 'text-green-700',
      borderColor: 'border-green-200',
      icon: (className) => (
        <svg
          className={className}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
      ),
    },
    PROJECT: {
      bg: 'bg-indigo-50',
      text: 'text-indigo-700',
      borderColor: 'border-indigo-200',
      icon: (className) => (
        <svg
          className={className}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
          />
        </svg>
      ),
    },
  };

  // Resource Card Component with selection support
  const ResourceCard = ({ item }: { item: CollectionItem }) => {
    const { resource } = item;
    const cfg = typeConfig[resource.type] || {
      bg: 'bg-gray-50',
      text: 'text-gray-700',
      borderColor: 'border-gray-200',
      icon: (className: string) => (
        <svg
          className={className}
          fill="none"
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
      ),
    };

    const itemSelected = isSelected(item.id);

    return (
      <div
        className={`group relative overflow-hidden rounded-lg border bg-white transition-all hover:shadow-lg ${
          itemSelected
            ? 'border-blue-500 ring-2 ring-blue-200'
            : 'border-gray-200'
        }`}
      >
        {/* Selection checkbox */}
        {selectionMode && (
          <div className="absolute left-2 top-2 z-20">
            <input
              type="checkbox"
              checked={itemSelected}
              onChange={() => toggleSelect(item.id)}
              className="h-5 w-5 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
          </div>
        )}

        {/* Action buttons - appear on hover */}
        <div className="absolute right-2 top-2 z-10 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {!selectionMode && (
            <>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  setSelectionMode(true);
                  toggleSelect(item.id);
                }}
                className="rounded-lg bg-white p-2 shadow-md transition-all hover:bg-gray-50"
                title="Select"
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
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </button>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  handleView(item);
                }}
                className="rounded-lg bg-white p-2 shadow-md transition-all hover:bg-blue-50 hover:text-blue-600"
                title="View details"
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
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                  />
                </svg>
              </button>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  handleEditNote(item);
                }}
                className="rounded-lg bg-white p-2 shadow-md transition-all hover:bg-amber-50 hover:text-amber-600"
                title="Edit note"
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
              </button>
              {/* Add to AI Office */}
              <button
                onClick={(e) => {
                  e.preventDefault();
                  if (
                    !aiOfficeStore.resources.some((r) => r._id === resource.id)
                  ) {
                    const aiResource = convertToAIOfficeResource(resource);
                    aiOfficeStore.addResource(aiResource as any);
                    setToast({
                      message: `Added "${resource.title.slice(0, 30)}..." to AI Office`,
                      type: 'success',
                    });
                  }
                }}
                disabled={aiOfficeStore.resources.some(
                  (r) => r._id === resource.id
                )}
                className={`rounded-lg p-2 shadow-md transition-all ${
                  aiOfficeStore.resources.some((r) => r._id === resource.id)
                    ? 'bg-green-100 text-green-600'
                    : 'bg-white hover:bg-green-50 hover:text-green-600'
                }`}
                title={
                  aiOfficeStore.resources.some((r) => r._id === resource.id)
                    ? 'Already in AI Office'
                    : 'Add to AI Office'
                }
              >
                <svg
                  className="h-4 w-4"
                  fill={
                    aiOfficeStore.resources.some((r) => r._id === resource.id)
                      ? 'currentColor'
                      : 'none'
                  }
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </button>
              {/* Add to AI Studio */}
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setSelectedResourceForStudio(resource);
                  setAiStudioDialogOpen(true);
                }}
                className="rounded-lg bg-white p-2 shadow-md transition-all hover:bg-purple-50 hover:text-purple-600"
                title="Add to AI Studio"
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
                    d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
                  />
                </svg>
              </button>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  handleRemove(item);
                }}
                className="rounded-lg bg-white p-2 shadow-md transition-all hover:bg-red-50 hover:text-red-600"
                title="Remove"
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
                    d="M20 12H4"
                  />
                </svg>
              </button>
            </>
          )}
        </div>

        {/* Main card content */}
        <Link
          href={getResourceLink(resource)}
          className="block"
          onClick={(e) => {
            if (selectionMode) {
              e.preventDefault();
              toggleSelect(item.id);
            }
          }}
        >
          <div className="p-4">
            {/* Top row: Type badge and status */}
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex-shrink-0">
                  {cfg.icon('w-4 h-4 text-gray-600')}
                </div>
                <span
                  className={`inline-block rounded px-2.5 py-0.5 text-xs font-semibold ${cfg.text} bg-gray-50`}
                >
                  {resource.type.replace('_', ' ')}
                </span>
              </div>
              <ReadStatusBadge
                status={item.readStatus}
                onChange={(status) => handleUpdateItemStatus(item.id, status)}
                showLabel={false}
              />
            </div>

            {/* Title */}
            <h3 className="mb-2 line-clamp-2 text-sm font-semibold text-gray-900 transition-colors hover:text-blue-600">
              {resource.title}
            </h3>

            {/* Abstract */}
            {resource.abstract && (
              <p className="mb-3 line-clamp-1 text-xs text-gray-600">
                {resource.abstract}
              </p>
            )}

            {/* Tags */}
            {item.tags && item.tags.length > 0 && (
              <div className="mb-3">
                <TagList tags={item.tags} maxVisible={2} size="sm" />
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>
                {new Date(resource.publishedAt).toLocaleDateString('en-US')}
              </span>
              {resource.upvoteCount !== undefined &&
                resource.upvoteCount > 0 && (
                  <div className="flex items-center gap-1">
                    <svg
                      className="h-3.5 w-3.5 text-gray-400"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M2 10.5a1.5 1.5 0 113 0v-7a1.5 1.5 0 01-3 0v7zM14 4a1 1 0 011 1v12a1 1 0 11-2 0V5a1 1 0 011-1zm3 1a1 1 0 010 2H9a3 3 0 00-3 3v6a3 3 0 003 3h8a1 1 0 110-2H9a1 1 0 01-1-1v-6a1 1 0 011-1h8z" />
                    </svg>
                    <span>{resource.upvoteCount}</span>
                  </div>
                )}
            </div>
          </div>
        </Link>

        {/* Personal Note Preview */}
        {item.note && (
          <div className="border-t border-gray-100 bg-amber-50/50 px-4 py-2">
            <div className="flex items-start gap-2">
              <svg
                className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-600"
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
              <p className="line-clamp-2 text-xs italic text-amber-900">
                {item.note}
              </p>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-gray-50">
        {/* Sticky Search Bar Container */}
        <div className="sticky top-0 z-10 bg-gray-50 pb-4 pt-6">
          <div className="px-8">
            {/* Large Search Bar */}
            <div className="mb-6">
              <div className="relative rounded-lg border border-gray-300 bg-white shadow-sm">
                <div className="flex items-center">
                  <div className="flex items-center px-4 py-3">
                    <svg
                      className="h-5 w-5 text-gray-400"
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
                  </div>
                  <input
                    type="text"
                    placeholder={
                      activeTab === 'notes'
                        ? 'Search notes...'
                        : 'Search all resources...'
                    }
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 border-none px-4 py-3 text-sm focus:outline-none focus:ring-0"
                  />
                  <div className="flex items-center gap-2 px-4">
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="rounded p-1 text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-600"
                        title="Clear search"
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
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    )}
                    {/* Sort dropdown */}
                    {activeTab === 'bookmarks' && (
                      <select
                        value={`${sortBy}-${sortOrder}`}
                        onChange={(e) => {
                          const [newSortBy, newSortOrder] =
                            e.target.value.split('-');
                          setSortBy(newSortBy as typeof sortBy);
                          setSortOrder(newSortOrder as typeof sortOrder);
                        }}
                        className="cursor-pointer rounded border border-gray-300 bg-white px-3 py-2 text-xs font-medium transition-all focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="addedAt-desc">Recently Added</option>
                        <option value="addedAt-asc">Oldest First</option>
                        <option value="title-asc">Title A-Z</option>
                        <option value="title-desc">Title Z-A</option>
                        <option value="publishedAt-desc">
                          Latest Published
                        </option>
                        <option value="publishedAt-asc">
                          Earliest Published
                        </option>
                      </select>
                    )}
                    {/* Selection mode toggle */}
                    {activeTab === 'bookmarks' &&
                      paginatedItems &&
                      paginatedItems.items.length > 0 && (
                        <button
                          onClick={() => {
                            if (selectionMode) {
                              clearAll();
                              setSelectionMode(false);
                            } else {
                              setSelectionMode(true);
                            }
                          }}
                          className={`rounded px-3 py-2 text-xs font-medium transition-all ${
                            selectionMode
                              ? 'bg-blue-600 text-white'
                              : 'border border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          {selectionMode ? 'Cancel' : 'Select'}
                        </button>
                      )}
                    {/* View Graph button - 切换到 Graph Tab */}
                    <button
                      onClick={() => setActiveTab('graph')}
                      className={`flex items-center gap-1.5 rounded border px-3 py-2 text-xs font-medium transition-all ${
                        activeTab === 'graph'
                          ? 'border-purple-500 bg-purple-50 text-purple-700'
                          : 'border-gray-300 bg-white text-gray-600 hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700'
                      }`}
                      title="View Knowledge Graph"
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
                          d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                        />
                      </svg>
                      Graph
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex gap-8 border-b border-gray-200">
              <button
                onClick={() => setActiveTab('bookmarks')}
                className={`relative border-b-2 px-0 py-3 text-sm font-semibold transition-all ${
                  activeTab === 'bookmarks'
                    ? 'border-blue-600 text-gray-900'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                Bookmarks
              </button>
              <button
                onClick={() => setActiveTab('notes')}
                className={`border-b-2 px-0 py-3 text-sm font-semibold transition-all ${
                  activeTab === 'notes'
                    ? 'border-blue-600 text-gray-900'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                Notes
              </button>
              <button
                onClick={() => setActiveTab('images')}
                className={`border-b-2 px-0 py-3 text-sm font-semibold transition-all ${
                  activeTab === 'images'
                    ? 'border-purple-600 text-gray-900'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                Images
              </button>
              <button
                onClick={() => setActiveTab('graph')}
                className={`border-b-2 px-0 py-3 text-sm font-semibold transition-all ${
                  activeTab === 'graph'
                    ? 'border-purple-600 text-gray-900'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                Graph
              </button>
            </div>
          </div>
        </div>

        {/* Main content area */}
        <div className="px-8 py-6">
          {/* AI Organize Panel - Show on all tabs */}
          <AIOrganizePanel
            collections={collections.map((c) => ({
              id: c.id,
              name: c.name,
              itemCount: c.items?.length || 0,
            }))}
            onRefresh={() => {
              // Refresh based on active tab
              if (activeTab === 'bookmarks') {
                loadItems(1, false);
                loadTagsAndStats();
              } else if (activeTab === 'images') {
                loadBookmarkedImages();
              } else if (activeTab === 'graph') {
                loadGraphData();
              }
              // Notes tab refreshes via its own component
            }}
            activeTab={activeTab}
          />

          {/* Bookmarks and All Content View */}
          {activeTab === 'bookmarks' &&
            (loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
              </div>
            ) : !paginatedItems || paginatedItems.items.length === 0 ? (
              <div>
                {/* Empty state for regular bookmarks */}
                {bookmarkedImages.length === 0 && (
                  <div className="py-12 text-center">
                    <svg
                      className="mx-auto h-12 w-12 text-gray-400"
                      fill="none"
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
                    <h3 className="mt-2 text-sm font-medium text-gray-900">
                      No bookmarks yet
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Browse resources and click the bookmark button to save
                      your favorites
                    </p>
                    <Link
                      href="/"
                      className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                    >
                      <span>Browse Resources</span>
                    </Link>
                  </div>
                )}
              </div>
            ) : (
              <div>
                {/* Selection info bar */}
                {selectionMode && (
                  <div className="mb-4 flex items-center justify-between rounded-lg bg-blue-50 px-4 py-2">
                    <span className="text-sm text-blue-700">
                      {selectedCount} of {paginatedItems.items.length} selected
                    </span>
                    <button
                      onClick={() =>
                        selectAll(paginatedItems.items.map((i) => i.id))
                      }
                      className="text-sm font-medium text-blue-600 hover:text-blue-700"
                    >
                      Select all on this page
                    </button>
                  </div>
                )}

                {/* Categorized Bookmarks */}
                {(() => {
                  // Categorize items by type
                  const videoTypes = ['YOUTUBE', 'YOUTUBE_VIDEO'];
                  const documentTypes = ['PAPER', 'BLOG', 'NEWS', 'REPORT'];

                  const videoItems = paginatedItems.items.filter((item) =>
                    videoTypes.includes(item.resource.type)
                  );
                  const documentItems = paginatedItems.items.filter((item) =>
                    documentTypes.includes(item.resource.type)
                  );
                  const otherItems = paginatedItems.items.filter(
                    (item) =>
                      !videoTypes.includes(item.resource.type) &&
                      !documentTypes.includes(item.resource.type)
                  );

                  return (
                    <div className="space-y-8">
                      {/* Videos Section */}
                      {videoItems.length > 0 && (
                        <div>
                          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
                            <svg
                              className="h-5 w-5 text-red-600"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                              />
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </svg>
                            Videos ({videoItems.length})
                          </h3>
                          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {videoItems.map((item) => (
                              <ResourceCard key={item.id} item={item} />
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Documents Section */}
                      {documentItems.length > 0 && (
                        <div>
                          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
                            <svg
                              className="h-5 w-5 text-blue-600"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                              />
                            </svg>
                            Documents ({documentItems.length})
                          </h3>
                          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {documentItems.map((item) => (
                              <ResourceCard key={item.id} item={item} />
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Other Items Section */}
                      {otherItems.length > 0 && (
                        <div>
                          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
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
                                d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                              />
                            </svg>
                            Other ({otherItems.length})
                          </h3>
                          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {otherItems.map((item) => (
                              <ResourceCard key={item.id} item={item} />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Load more indicator */}
                <div ref={loadMoreRef} className="py-8 text-center">
                  {loadingMore && (
                    <div className="flex items-center justify-center gap-2">
                      <div className="h-5 w-5 animate-spin rounded-full border-b-2 border-blue-600"></div>
                      <span className="text-sm text-gray-500">
                        Loading more...
                      </span>
                    </div>
                  )}
                  {!loadingMore && !paginatedItems.pagination.hasMore && (
                    <span className="text-sm text-gray-400">
                      {paginatedItems.pagination.total} items total
                    </span>
                  )}
                </div>
              </div>
            ))}

          {/* Notes Tab */}
          {activeTab === 'notes' && (
            <NotesList
              searchQuery={searchQuery}
              showActions
              onAddToOffice={handleAddNoteToOffice}
            />
          )}

          {/* Images Tab - Bookmarked AI Images Gallery */}
          {activeTab === 'images' && (
            <div>
              {bookmarkedImages.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 py-20">
                  <svg
                    className="h-16 w-16 text-gray-300"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  <h3 className="mt-4 text-lg font-medium text-gray-900">
                    No saved images
                  </h3>
                  <p className="mt-1 text-gray-500">
                    AI-generated images you save will appear here
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                  {bookmarkedImages.map((image) => (
                    <div
                      key={image.id}
                      className="group relative aspect-square cursor-pointer overflow-hidden rounded-xl bg-gray-100"
                      onClick={() => handleImageClick(image)}
                    >
                      <img
                        src={image.imageUrl}
                        alt={image.prompt}
                        className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

                      {/* Action buttons - visible on hover */}
                      <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        {/* Add to Image Source Pool */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (
                              !imageSourceStore.sources.some(
                                (s) => s.id === image.id
                              )
                            ) {
                              imageSourceStore.addSource({
                                id: image.id,
                                type: 'blog', // AI generated images
                                title: image.prompt.slice(0, 50),
                                url: image.imageUrl,
                                thumbnailUrl: image.imageUrl,
                                addedAt: new Date(),
                              });
                              setToast({
                                message: 'Added to Image Source Pool',
                                type: 'success',
                              });
                            }
                          }}
                          disabled={imageSourceStore.sources.some(
                            (s) => s.id === image.id
                          )}
                          className={`rounded-lg p-2 shadow-md backdrop-blur-sm transition-all ${
                            imageSourceStore.sources.some(
                              (s) => s.id === image.id
                            )
                              ? 'bg-purple-100 text-purple-600'
                              : 'bg-white/90 hover:bg-purple-50 hover:text-purple-600'
                          }`}
                          title={
                            imageSourceStore.sources.some(
                              (s) => s.id === image.id
                            )
                              ? 'Added to Image Pool'
                              : 'Add to Image Source Pool'
                          }
                        >
                          <svg
                            className="h-4 w-4"
                            fill={
                              imageSourceStore.sources.some(
                                (s) => s.id === image.id
                              )
                                ? 'currentColor'
                                : 'none'
                            }
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                          </svg>
                        </button>
                        {/* Download */}
                        <a
                          href={image.imageUrl}
                          download
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="rounded-lg bg-white/90 p-2 shadow-md backdrop-blur-sm transition-all hover:bg-white hover:text-blue-600"
                          title="Download"
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
                              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                            />
                          </svg>
                        </a>
                        {/* Remove */}
                        <button
                          onClick={(e) =>
                            handleRemoveImageBookmark(image.id, e)
                          }
                          className="rounded-lg bg-white/90 p-2 shadow-md backdrop-blur-sm transition-all hover:bg-red-50 hover:text-red-600"
                          title="Remove from Library"
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
                        </button>
                      </div>

                      <div className="absolute bottom-0 left-0 right-0 p-3 text-white opacity-0 transition-opacity group-hover:opacity-100">
                        <p className="line-clamp-2 text-sm">{image.prompt}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Knowledge Graph View */}
          {activeTab === 'graph' && (
            <div className="rounded-lg border border-gray-200 bg-white">
              {/* Graph Header */}
              <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-semibold text-gray-900">
                    Knowledge Graph
                  </h3>
                  {activeCollectionId &&
                    !['recent', 'reading', 'completed'].includes(
                      activeCollectionId
                    ) &&
                    !activeCollectionId.startsWith('tag:') && (
                      <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700">
                        Filtered by Collection
                      </span>
                    )}
                  {graphData && (
                    <span className="text-xs text-gray-500">
                      {graphData.nodes.length} nodes · {graphData.edges.length}{' '}
                      edges
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={loadGraphData}
                    disabled={graphLoading}
                    className="flex items-center gap-1.5 rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition-all hover:bg-gray-50 disabled:opacity-50"
                  >
                    {graphLoading ? (
                      <>
                        <svg
                          className="h-3 w-3 animate-spin"
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
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                        Loading...
                      </>
                    ) : (
                      <>
                        <svg
                          className="h-3 w-3"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                          />
                        </svg>
                        Refresh
                      </>
                    )}
                  </button>
                  <Link
                    href="/knowledge-graph"
                    className="flex items-center gap-1.5 rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition-all hover:bg-gray-50"
                    title="Open in full screen"
                  >
                    <svg
                      className="h-3 w-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                      />
                    </svg>
                    Full Screen
                  </Link>
                </div>
              </div>

              {/* Graph Content */}
              <div className="h-[600px]">
                {graphLoading ? (
                  <GraphLoadingSkeleton />
                ) : graphError ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="text-center">
                      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                        <svg
                          className="h-6 w-6 text-red-500"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                          />
                        </svg>
                      </div>
                      <p className="mt-3 text-sm text-gray-600">{graphError}</p>
                      <button
                        onClick={loadGraphData}
                        className="mt-3 rounded-lg bg-blue-500 px-4 py-2 text-sm text-white hover:bg-blue-600"
                      >
                        Retry
                      </button>
                    </div>
                  </div>
                ) : graphData && graphData.nodes.length > 0 ? (
                  <KnowledgeGraphView
                    nodes={graphData.nodes}
                    edges={graphData.edges}
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-8">
                    <div className="text-center">
                      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-purple-100 to-blue-100">
                        <svg
                          className="h-8 w-8 text-purple-500"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                          />
                        </svg>
                      </div>
                      <h3 className="mt-4 text-lg font-semibold text-gray-900">
                        No Graph Data
                      </h3>
                      <p className="mt-2 max-w-sm text-sm text-gray-600">
                        {activeCollectionId
                          ? 'Add resources to this collection to visualize connections.'
                          : 'Add some resources to your library to see their relationships.'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Batch Action Bar */}
      <BatchActionBar
        selectedCount={selectedCount}
        selectedIds={selectedIds}
        collections={collections}
        currentCollectionId={activeCollectionId || undefined}
        onMove={handleBatchMove}
        onDelete={handleBatchDelete}
        onUpdateStatus={handleBatchUpdateStatus}
        onAddTags={handleBatchAddTags}
        onClearSelection={() => {
          clearAll();
          setSelectionMode(false);
        }}
      />

      {/* View Details Modal */}
      {viewModalOpen && selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">
                Resource Details
              </h2>
              <button
                onClick={() => setViewModalOpen(false)}
                className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              >
                <svg
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              {/* Type and Status Row */}
              <div className="flex items-center justify-between">
                <span className="inline-block rounded-lg bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
                  {selectedItem.resource.type.replace('_', ' ')}
                </span>
                <ReadStatusBadge
                  status={selectedItem.readStatus}
                  onChange={(status) =>
                    handleUpdateItemStatus(selectedItem.id, status)
                  }
                  size="md"
                />
              </div>

              {/* Title */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Title
                </label>
                <p className="text-gray-900">{selectedItem.resource.title}</p>
              </div>

              {/* Abstract */}
              {selectedItem.resource.abstract && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Abstract
                  </label>
                  <p className="text-gray-700">
                    {selectedItem.resource.abstract}
                  </p>
                </div>
              )}

              {/* Tags */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Tags
                </label>
                <TagList
                  tags={selectedItem.tags || []}
                  onChange={(newTags) =>
                    handleUpdateItemTags(selectedItem.id, newTags)
                  }
                  editable
                  size="md"
                />
              </div>

              {/* Published Date */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Published Date
                </label>
                <p className="text-gray-700">
                  {new Date(
                    selectedItem.resource.publishedAt
                  ).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>

              {/* Source URL */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Source URL
                </label>
                <a
                  href={selectedItem.resource.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  {selectedItem.resource.sourceUrl}
                </a>
              </div>

              {/* Thumbnail */}
              {selectedItem.resource.thumbnailUrl &&
                resolveThumbnailUrl(selectedItem.resource.thumbnailUrl) && (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Thumbnail
                    </label>
                    <img
                      src={
                        resolveThumbnailUrl(selectedItem.resource.thumbnailUrl)!
                      }
                      alt={selectedItem.resource.title}
                      className="max-w-full rounded-lg"
                    />
                  </div>
                )}

              {/* Personal Note */}
              {selectedItem.note && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    My Note
                  </label>
                  <div className="rounded-lg bg-amber-50 p-3">
                    <p className="text-sm text-amber-900">
                      {selectedItem.note}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setViewModalOpen(false)}
                className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
              >
                Close
              </button>
              <a
                href={getResourceLink(selectedItem.resource)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                View Full Details
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Edit Note Modal */}
      {editNoteModalOpen && selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">
                Edit Bookmark Note
              </h2>
              <button
                onClick={() => setEditNoteModalOpen(false)}
                className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              >
                <svg
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Resource Info - Read-only */}
            <div className="mb-4 rounded-lg bg-gray-50 p-3">
              <p className="text-sm font-medium text-gray-700">
                {selectedItem.resource.title}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {selectedItem.resource.type.replace('_', ' ')} •{' '}
                {new Date(selectedItem.resource.publishedAt).toLocaleDateString(
                  'en-US'
                )}
              </p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const newNote = formData.get('note') as string;
                void updateNote(newNote);
              }}
              className="space-y-4"
            >
              <div>
                <label
                  htmlFor="note"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Your Personal Note
                </label>
                <textarea
                  id="note"
                  name="note"
                  rows={6}
                  defaultValue={selectedItem.note || ''}
                  placeholder="Add your thoughts, insights, or reminders about this resource..."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  This note is private and only visible to you.
                </p>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditNoteModalOpen(false)}
                  className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700"
                >
                  Save Note
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Remove from Collection Confirmation Dialog */}
      {removeDialogOpen && selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <div className="mb-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-orange-100">
                <svg
                  className="h-6 w-6 text-orange-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M20 12H4"
                  />
                </svg>
              </div>
              <h3 className="mt-4 text-center text-lg font-semibold text-gray-900">
                Remove from Collection
              </h3>
              <p className="mt-2 text-center text-sm text-gray-600">
                This will remove the bookmark from your collection. The resource
                itself will not be deleted.
              </p>
              <p className="mt-3 rounded-lg bg-gray-50 p-3 text-center text-sm font-medium text-gray-900">
                "{selectedItem.resource.title}"
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setRemoveDialogOpen(false)}
                className="flex-1 rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={confirmRemove}
                className="flex-1 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-700"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Collection Create/Edit Modal */}
      <CollectionModal
        isOpen={collectionModalOpen}
        onClose={() => setCollectionModalOpen(false)}
        onSave={handleSaveCollection}
        collection={editingCollection}
        mode={collectionModalMode}
      />

      {/* Image Viewing Modal */}
      {viewImageModalOpen && selectedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={() => setViewImageModalOpen(false)}
        >
          <div
            className="relative max-h-[90vh] max-w-[90vw]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={() => setViewImageModalOpen(false)}
              className="absolute -right-4 -top-4 z-10 rounded-full bg-white p-2 text-gray-600 shadow-lg transition-colors hover:bg-gray-100 hover:text-gray-900"
            >
              <svg
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>

            {/* Image */}
            <img
              src={selectedImage.imageUrl}
              alt={selectedImage.prompt}
              className="max-h-[80vh] max-w-full rounded-lg object-contain"
            />

            {/* Image info */}
            <div className="mt-4 rounded-lg bg-white/10 p-4 backdrop-blur-sm">
              <p className="text-sm text-white/90">
                {selectedImage.enhancedPrompt || selectedImage.prompt}
              </p>
              <div className="mt-2 flex items-center justify-between text-xs text-white/60">
                <span>
                  {selectedImage.width} × {selectedImage.height}
                </span>
                <span>
                  {new Date(selectedImage.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="mt-3 flex justify-center gap-3">
              <a
                href={selectedImage.imageUrl}
                download
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
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
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                Download
              </a>
              <button
                onClick={(e) => {
                  handleRemoveImageBookmark(selectedImage.id, e);
                  setViewImageModalOpen(false);
                }}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
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
                Remove from Library
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 animate-fade-in">
          <div
            className={`rounded-lg px-4 py-3 shadow-lg ${
              toast.type === 'success'
                ? 'bg-green-600 text-white'
                : 'bg-red-600 text-white'
            }`}
          >
            <div className="flex items-center gap-2">
              {toast.type === 'success' ? (
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
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              ) : (
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
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              )}
              <span className="text-sm font-medium">{toast.message}</span>
            </div>
          </div>
        </div>
      )}

      {/* Add to AI Studio Dialog */}
      {selectedResourceForStudio && (
        <AddToAIStudioDialog
          isOpen={aiStudioDialogOpen}
          onClose={() => {
            setAiStudioDialogOpen(false);
            setSelectedResourceForStudio(null);
          }}
          resource={selectedResourceForStudio}
          onSuccess={(projectId, projectName) => {
            setToast({
              message: `Added to "${projectName}" in AI Studio`,
              type: 'success',
            });
          }}
        />
      )}
    </div>
  );
}

export default function LibraryPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
            <p className="text-gray-500">Loading...</p>
          </div>
        </div>
      }
    >
      <LibraryPageContent />
    </Suspense>
  );
}
