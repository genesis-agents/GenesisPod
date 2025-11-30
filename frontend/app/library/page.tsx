'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { config } from '@/lib/config';
import NotesList from '@/components/features/NotesList';
import Sidebar from '@/components/layout/Sidebar';
import { Tag, UserStats } from '@/components/library/CollectionNav';
import ImageGenerator from '@/components/ai-image/ImageGenerator';
import CollectionModal from '@/components/library/CollectionModal';
import BatchActionBar from '@/components/library/BatchActionBar';
import ReadStatusBadge from '@/components/library/ReadStatusBadge';
import TagList from '@/components/library/TagList';
import { getAuthHeader } from '@/lib/auth';
import { useMultiSelect } from '@/lib/use-multi-select';
import {
  useCollections,
  ReadStatus,
  CollectionItem,
  Collection,
  PaginatedResult,
} from '@/lib/use-collections';

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

export default function LibraryPage() {
  const searchParams = useSearchParams();
  const tabParam = searchParams?.get('tab');

  const [activeTab, setActiveTab] = useState<'bookmarks' | 'notes' | 'images'>(
    () => {
      // Initialize from URL parameter if present
      if (tabParam === 'images' || tabParam === 'notes') {
        return tabParam;
      }
      return 'bookmarks';
    }
  );

  // Update activeTab when URL parameter changes
  useEffect(() => {
    if (
      tabParam === 'images' ||
      tabParam === 'notes' ||
      tabParam === 'bookmarks'
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

  // API hooks
  const collectionsApi = useCollections();

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
    }
  }, [
    activeCollectionId,
    searchQuery,
    sortBy,
    sortOrder,
    activeTab,
    loadBookmarkedImages,
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
          href={`/?id=${resource.id}`}
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
          <div className="mx-auto max-w-7xl px-8">
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
            </div>
          </div>
        </div>

        {/* Main content area */}
        <div className="px-8 py-6">
          <div className="mx-auto max-w-7xl">
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

                  {/* Bookmarked AI Images Section (shown even without regular bookmarks) */}
                  {bookmarkedImages.length > 0 && (
                    <div className="py-4">
                      <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
                        <svg
                          className="h-5 w-5 text-purple-600"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                        AI Images ({bookmarkedImages.length})
                      </h3>
                      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                        {bookmarkedImages.map((img) => (
                          <div
                            key={img.id}
                            onClick={() => handleBookmarkedImageClick(img.id)}
                            className="group relative cursor-pointer overflow-hidden rounded-lg bg-gray-100"
                          >
                            <div className="aspect-square">
                              <img
                                src={img.imageUrl}
                                alt={img.prompt}
                                className="h-full w-full object-cover transition-transform group-hover:scale-105"
                              />
                            </div>
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100">
                              <div className="absolute bottom-0 left-0 right-0 p-2">
                                <p className="line-clamp-2 text-xs text-white">
                                  {img.enhancedPrompt || img.prompt}
                                </p>
                              </div>
                            </div>
                            {/* Action buttons */}
                            <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                              <button
                                onClick={(e) =>
                                  handleRemoveImageBookmark(img.id, e)
                                }
                                className="rounded-full bg-white/80 p-1.5 text-red-600 hover:bg-white hover:text-red-700"
                                title="Remove bookmark"
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
                                    d="M6 18L18 6M6 6l12 12"
                                  />
                                </svg>
                              </button>
                              <div className="rounded-full bg-white/80 p-1.5">
                                <svg
                                  className="h-4 w-4 text-gray-700"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                  />
                                </svg>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  {/* Selection info bar */}
                  {selectionMode && (
                    <div className="mb-4 flex items-center justify-between rounded-lg bg-blue-50 px-4 py-2">
                      <span className="text-sm text-blue-700">
                        {selectedCount} of {paginatedItems.items.length}{' '}
                        selected
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

                        {/* Bookmarked AI Images Section */}
                        {bookmarkedImages.length > 0 && (
                          <div>
                            <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
                              <svg
                                className="h-5 w-5 text-purple-600"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                                />
                              </svg>
                              AI Images ({bookmarkedImages.length})
                            </h3>
                            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                              {bookmarkedImages.map((img) => (
                                <div
                                  key={img.id}
                                  onClick={() =>
                                    handleBookmarkedImageClick(img.id)
                                  }
                                  className="group relative cursor-pointer overflow-hidden rounded-lg bg-gray-100"
                                >
                                  <div className="aspect-square">
                                    <img
                                      src={img.imageUrl}
                                      alt={img.prompt}
                                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                                    />
                                  </div>
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100">
                                    <div className="absolute bottom-0 left-0 right-0 p-2">
                                      <p className="line-clamp-2 text-xs text-white">
                                        {img.enhancedPrompt || img.prompt}
                                      </p>
                                    </div>
                                  </div>
                                  {/* Action buttons */}
                                  <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                                    <button
                                      onClick={(e) =>
                                        handleRemoveImageBookmark(img.id, e)
                                      }
                                      className="rounded-full bg-white/80 p-1.5 text-red-600 hover:bg-white hover:text-red-700"
                                      title="Remove bookmark"
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
                                          d="M6 18L18 6M6 6l12 12"
                                        />
                                      </svg>
                                    </button>
                                    <div className="rounded-full bg-white/80 p-1.5">
                                      <svg
                                        className="h-4 w-4 text-gray-700"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                        />
                                      </svg>
                                    </div>
                                  </div>
                                </div>
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
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900">
                    My Notes
                  </h2>
                  <p className="text-sm text-gray-500">
                    All your notes organized by resource
                  </p>
                </div>
                <NotesList searchQuery={searchQuery} showActions />
              </div>
            )}

            {/* Images Tab - AI Image Generator */}
            {activeTab === 'images' && (
              <div className="h-[calc(100vh-220px)]">
                <ImageGenerator initialImageId={selectedImageId} />
              </div>
            )}
          </div>
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
                href={`/?id=${selectedItem.resource.id}`}
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
    </div>
  );
}
