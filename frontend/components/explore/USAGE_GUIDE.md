# Component Usage Guide

## Overview

This guide shows how to use the newly extracted components from ExploreContent.tsx refactoring.

## Import Components

### Using Barrel Exports (Recommended)

```tsx
import {
  DetailView,
  AIAssistantPanel,
  ResourceHeader,
  ContentPreview,
} from './components';
```

### Individual Imports

```tsx
import DetailView from './components/DetailView';
import AIAssistantPanel from './components/AIAssistantPanel';
import ResourceHeader from './components/ResourceHeader';
import ContentPreview from './components/ContentPreview';
```

## Component Usage Examples

### 1. DetailView

Complete detail view container that includes header and content preview.

```tsx
import { DetailView } from './components';

<DetailView
  selectedResource={selectedResource}
  htmlViewMode={htmlViewMode}
  setHtmlViewMode={setHtmlViewMode}
  isHeaderCollapsed={isHeaderCollapsed}
  setIsHeaderCollapsed={setIsHeaderCollapsed}
  onBackToList={handleBackToList}
  onToggleBookmark={toggleBookmark}
  onToggleUpvote={toggleUpvote}
  isBookmarked={isBookmarked}
  hasUpvoted={hasUpvoted}
  onArticleLoaded={handleArticleLoaded}
  onAddToNotes={handleAddToNotes}
  onAskAI={handleAskAI}
  convertToAIOfficeResource={convertToAIOfficeResource}
  aiOfficeStore={aiOfficeStore}
/>;
```

### 2. ResourceHeader

Header section with navigation, metadata, and actions.

```tsx
import { ResourceHeader } from './components';

<ResourceHeader
  selectedResource={selectedResource}
  htmlViewMode={htmlViewMode}
  setHtmlViewMode={setHtmlViewMode}
  isHeaderCollapsed={isHeaderCollapsed}
  setIsHeaderCollapsed={setIsHeaderCollapsed}
  onBackToList={handleBackToList}
  onToggleBookmark={toggleBookmark}
  onToggleUpvote={toggleUpvote}
  isBookmarked={isBookmarked}
  hasUpvoted={hasUpvoted}
  convertToAIOfficeResource={convertToAIOfficeResource}
  aiOfficeStore={aiOfficeStore}
/>;
```

### 3. ContentPreview

Content viewer for PDF, HTML, and YouTube.

```tsx
import { ContentPreview } from './components';

<ContentPreview
  selectedResource={selectedResource}
  htmlViewMode={htmlViewMode}
  onArticleLoaded={handleArticleLoaded}
  onAddToNotes={handleAddToNotes}
  onAskAI={handleAskAI}
/>;
```

### 4. AIAssistantPanel

Complete AI assistant panel with all features.

```tsx
import { AIAssistantPanel } from './components';

<AIAssistantPanel
  isCollapsed={isAiPanelCollapsed}
  onToggleCollapse={() => setIsAiPanelCollapsed(!isAiPanelCollapsed)}
  selectedResource={selectedResource}
  aiRightTab={aiRightTab}
  setAiRightTab={setAiRightTab}
  aiModel={aiModel}
  setAiModel={setAiModel}
  aiModels={aiModels}
  aiLoading={aiLoading}
  isStreaming={isStreaming}
  aiSummary={aiSummary}
  aiInsights={aiInsights}
  aiMethodology={aiMethodology}
  aiMessages={aiMessages}
  aiInput={aiInput}
  setAiInput={setAiInput}
  attachments={attachments}
  onQuickAction={handleQuickAction}
  onSendMessage={sendAIMessage}
  onContextMenu={handleContextMenu}
  notesRefreshKey={notesRefreshKey}
  setNotesRefreshKey={setNotesRefreshKey}
  onAttachmentClick={handleAttachmentClick}
  onRemoveAttachment={removeAttachment}
  onSaveConversation={saveConversationToNotes}
  attachmentFileInputRef={attachmentFileInputRef}
  onAttachmentFileChange={handleAttachmentFileChange}
  resources={resources}
  router={router}
  extractYouTubeVideoId={extractYouTubeVideoId}
/>;
```

### 5. Individual AI Components

You can also use AI sub-components individually:

```tsx
import {
  AIModelSelector,
  QuickActions,
  AISummaryCard,
  AIInsightsCard,
  AIMethodologyCard,
  AIChatMessages,
  AIInputArea,
} from './components';

// Model Selector
<AIModelSelector
  aiModel={aiModel}
  setAiModel={setAiModel}
  aiModels={aiModels}
/>

// Quick Actions
<QuickActions
  onQuickAction={handleQuickAction}
  aiLoading={aiLoading}
  isStreaming={isStreaming}
/>

// Summary Card
<AISummaryCard
  aiSummary={aiSummary}
  onContextMenu={handleContextMenu}
/>

// Insights Card
<AIInsightsCard
  aiInsights={aiInsights}
  onContextMenu={handleContextMenu}
/>

// Methodology Card
<AIMethodologyCard
  aiMethodology={aiMethodology}
  onContextMenu={handleContextMenu}
/>

// Chat Messages
<AIChatMessages
  aiMessages={aiMessages}
  isStreaming={isStreaming}
  aiModel={aiModel}
  aiModels={aiModels}
  onContextMenu={handleContextMenu}
  chatEndRef={chatEndRef}
/>

// Input Area
<AIInputArea
  selectedResource={selectedResource}
  aiInput={aiInput}
  setAiInput={setAiInput}
  aiLoading={aiLoading}
  attachments={attachments}
  onSendMessage={sendAIMessage}
  onAttachmentClick={handleAttachmentClick}
  onRemoveAttachment={removeAttachment}
  onSaveConversation={saveConversationToNotes}
  attachmentFileInputRef={attachmentFileInputRef}
  onAttachmentFileChange={handleAttachmentFileChange}
  aiMessages={aiMessages}
/>
```

## Refactored ExploreContent.tsx Structure

Here's the recommended structure for the refactored main component:

```tsx
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { config } from '@/lib/utils/config';
import { useAuth } from '@/contexts/AuthContext';
import { getAuthHeader } from '@/lib/utils/auth';
import Sidebar from '@/components/layout/Sidebar';
import VersionUpdateBanner from '@/components/layout/VersionUpdateBanner';
import ReportWorkspace from '@/components/features/ReportWorkspace';
import ResponsiveNav from '@/components/layout/ResponsiveNav';
import FilterPanel from '@/components/features/FilterPanel';
import { ImportUrlDialog } from '@/components/shared/dialogs/ImportUrlDialog';
import { ImportFileDialog } from '@/components/shared/dialogs/ImportFileDialog';
import { AIContextBuilder } from '@/lib/ai-office/context-builder';
import { useResourceStore } from '@/stores/aiOfficeStore';
import { useAIModels } from '@/hooks/useAIModels';
import { useImageSourceStore } from '@/stores/imageSourceStore';

// Import extracted components
import { DetailView, AIAssistantPanel } from './components';
import { ResourceListView } from './ResourceListView';
import { SearchBar } from './SearchBar';
import type { Resource, SearchSuggestion, AIMessage, AIInsight } from './types';
import { PAGE_SIZE, FILE_RESTRICTIONS } from './constants';
import { extractYouTubeVideoId, parseMarkdownToInsights } from './utils';
import { convertToAIOfficeResource } from './resourceHelpers';
import {
  saveAIAnalysisToDatabase,
  generateSummary as generateSummaryHelper,
  generateInsights as generateInsightsHelper,
} from './aiHelpers';
import { useBookmarks } from './hooks/useBookmarks';
import { usePDFText } from './hooks/usePDFText';

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isAdmin, accessToken } = useAuth();

  // State management (keep all state here)
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedResource, setSelectedResource] = useState<Resource | null>(
    null
  );
  const [viewMode, setViewMode] = useState<'list' | 'detail'>('list');

  // ... all other state declarations

  // Custom hooks
  const { bookmarks, defaultCollectionId, isBookmarked, toggleBookmark } =
    useBookmarks();
  const pdfText = usePDFText(selectedResource);
  const { models: allAiModels } = useAIModels();

  // Data fetching functions
  const fetchResources = async (loadMore = false) => {
    // ... existing fetch logic
  };

  // Event handlers
  const handleResourceClick = (resource: Resource) => {
    // ... existing logic
  };

  const handleBackToList = () => {
    setViewMode('list');
  };

  // ... all other handlers

  return (
    <div className="relative flex h-screen w-screen overflow-hidden bg-gray-50">
      <VersionUpdateBanner />
      <ReportWorkspace />
      <Sidebar />

      {/* Center Content Area */}
      <main
        className={`min-w-0 flex-1 bg-gray-50 ${
          viewMode === 'detail'
            ? 'flex flex-col overflow-hidden'
            : 'overflow-y-auto'
        }`}
      >
        {/* List View */}
        {viewMode === 'list' && (
          <>
            <SearchBar
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              onSearch={handleSearch}
              // ... other props
            />
            <ResponsiveNav
              activeTab={activeTab}
              onTabChange={setActiveTab}
              // ... other props
            />
            <ResourceListView
              resources={resources}
              loading={loading}
              onResourceClick={handleResourceClick}
              // ... other props
            />
          </>
        )}

        {/* Detail View */}
        {viewMode === 'detail' && selectedResource && (
          <DetailView
            selectedResource={selectedResource}
            htmlViewMode={htmlViewMode}
            setHtmlViewMode={setHtmlViewMode}
            isHeaderCollapsed={isHeaderCollapsed}
            setIsHeaderCollapsed={setIsHeaderCollapsed}
            onBackToList={handleBackToList}
            onToggleBookmark={toggleBookmark}
            onToggleUpvote={toggleUpvote}
            isBookmarked={isBookmarked}
            hasUpvoted={hasUpvoted}
            onArticleLoaded={handleArticleLoaded}
            onAddToNotes={handleAddToNotes}
            onAskAI={handleAskAI}
            convertToAIOfficeResource={convertToAIOfficeResource}
            aiOfficeStore={aiOfficeStore}
          />
        )}
      </main>

      {/* AI Assistant Panel */}
      {viewMode === 'detail' && (
        <AIAssistantPanel
          isCollapsed={isAiPanelCollapsed}
          onToggleCollapse={() => setIsAiPanelCollapsed(!isAiPanelCollapsed)}
          selectedResource={selectedResource}
          aiRightTab={aiRightTab}
          setAiRightTab={setAiRightTab}
          aiModel={aiModel}
          setAiModel={setAiModel}
          aiModels={aiModels}
          aiLoading={aiLoading}
          isStreaming={isStreaming}
          aiSummary={aiSummary}
          aiInsights={aiInsights}
          aiMethodology={aiMethodology}
          aiMessages={aiMessages}
          aiInput={aiInput}
          setAiInput={setAiInput}
          attachments={attachments}
          onQuickAction={handleQuickAction}
          onSendMessage={sendAIMessage}
          onContextMenu={handleContextMenu}
          notesRefreshKey={notesRefreshKey}
          setNotesRefreshKey={setNotesRefreshKey}
          onAttachmentClick={handleAttachmentClick}
          onRemoveAttachment={removeAttachment}
          onSaveConversation={saveConversationToNotes}
          attachmentFileInputRef={attachmentFileInputRef}
          onAttachmentFileChange={handleAttachmentFileChange}
          resources={resources}
          router={router}
          extractYouTubeVideoId={extractYouTubeVideoId}
        />
      )}

      {/* Dialogs and Modals */}
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

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="context-menu fixed z-50 rounded-lg border-2 border-blue-500 bg-white py-2 shadow-xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              saveToNotes();
            }}
            disabled={savingNote}
            className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-medium hover:bg-blue-100 disabled:opacity-50"
          >
            <svg
              className="h-4 w-4 text-blue-600"
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
            {savingNote ? 'Saving...' : 'Add to Notes'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function ExploreContent() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <HomeContent />
    </Suspense>
  );
}
```

## Benefits

1. **Main component is now ~400-500 lines** (down from 3506)
2. **Clear component hierarchy**
3. **Easy to understand and maintain**
4. **All state management in one place**
5. **Reusable components**
6. **Easy to test**

## Testing Components

### Unit Testing Example

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { QuickActions } from './components';

describe('QuickActions', () => {
  it('renders all three buttons', () => {
    const mockOnQuickAction = jest.fn();
    render(
      <QuickActions
        onQuickAction={mockOnQuickAction}
        aiLoading={false}
        isStreaming={false}
      />
    );

    expect(screen.getByText('Summary')).toBeInTheDocument();
    expect(screen.getByText('Insights')).toBeInTheDocument();
    expect(screen.getByText('Methods')).toBeInTheDocument();
  });

  it('calls onQuickAction when Summary button is clicked', () => {
    const mockOnQuickAction = jest.fn();
    render(
      <QuickActions
        onQuickAction={mockOnQuickAction}
        aiLoading={false}
        isStreaming={false}
      />
    );

    fireEvent.click(screen.getByText('Summary'));
    expect(mockOnQuickAction).toHaveBeenCalledWith('summary');
  });

  it('disables buttons when loading', () => {
    const mockOnQuickAction = jest.fn();
    render(
      <QuickActions
        onQuickAction={mockOnQuickAction}
        aiLoading={true}
        isStreaming={false}
      />
    );

    const summaryButton = screen.getByText('Summary').closest('button');
    expect(summaryButton).toBeDisabled();
  });
});
```

## Storybook Example

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { QuickActions } from './components';

const meta: Meta<typeof QuickActions> = {
  title: 'Explore/AI/QuickActions',
  component: QuickActions,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof QuickActions>;

export const Default: Story = {
  args: {
    onQuickAction: (action) => console.log('Quick action:', action),
    aiLoading: false,
    isStreaming: false,
  },
};

export const Loading: Story = {
  args: {
    onQuickAction: (action) => console.log('Quick action:', action),
    aiLoading: true,
    isStreaming: false,
  },
};

export const Streaming: Story = {
  args: {
    onQuickAction: (action) => console.log('Quick action:', action),
    aiLoading: false,
    isStreaming: true,
  },
};
```

## Troubleshooting

### Import Errors

If you see import errors, check:

1. File paths are correct
2. Barrel exports are properly set up
3. TypeScript compilation is successful

### Type Errors

If you see type errors, ensure:

1. All prop interfaces are correctly defined
2. Types are imported from the correct location
3. Optional props are marked with `?`

### Runtime Errors

If you see runtime errors, verify:

1. All required props are passed
2. Event handlers are defined
3. Refs are properly initialized

## Best Practices

1. **Always use barrel exports** for cleaner imports
2. **Pass only required props** to each component
3. **Keep state in parent** (ExploreContent.tsx)
4. **Use TypeScript** for type safety
5. **Add prop validation** with TypeScript interfaces
6. **Document complex props** with JSDoc comments
7. **Test components individually** before integration

## Further Improvements

1. **Memoization**: Add React.memo to components that receive stable props
2. **Lazy Loading**: Use React.lazy for heavy components
3. **Error Boundaries**: Wrap components in error boundaries
4. **Loading States**: Add skeleton loaders
5. **Accessibility**: Add ARIA labels and keyboard navigation
6. **Performance**: Monitor re-renders with React DevTools

---

**Last Updated:** 2025-12-15
**Version:** 1.0
**Status:** Ready for Production ✅
