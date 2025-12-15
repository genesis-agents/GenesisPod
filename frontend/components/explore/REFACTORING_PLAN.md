# ExploreContent.tsx Refactoring Plan

## Overview

The ExploreContent.tsx file is currently 4218 lines. The goal is to reduce it to under 500 lines by extracting components, hooks, utilities, and types into separate files.

## Completed Extractions

### 1. Type Definitions (`types.ts`)

- ✅ `Resource` interface
- ✅ `SearchSuggestion` interface
- ✅ `AIMessage` interface
- ✅ `AIInsight` interface

### 2. Utility Functions (`utils.ts`)

- ✅ `extractImagesFromMarkdown()` - Extract base64 images from markdown
- ✅ `extractYouTubeVideoId()` - Extract YouTube video ID from URL
- ✅ `extractArxivId()` - Extract arXiv paper ID from URL
- ✅ `getResourceThumbnail()` - Get resource thumbnail based on type
- ✅ `parseMarkdownToInsights()` - Parse markdown to insights array

### 3. Components (`Base64Image.tsx`)

- ✅ `Base64Image` - Component for displaying base64-encoded images

### 4. Resource Helpers (`resourceHelpers.ts`)

- ✅ `getSourceName()` - Extract source name from resource
- ✅ `getSourceBadgeColor()` - Get badge color based on source type
- ✅ `convertToAIOfficeResource()` - Convert to AI Office resource format

### 5. AI Helpers (`aiHelpers.ts`)

- ✅ `saveAIAnalysisToDatabase()` - Save AI analysis to database
- ✅ `generateSummary()` - Generate AI summary for resource
- ✅ `generateInsights()` - Generate AI insights for resource

### 6. Custom Hooks

- ✅ `hooks/useBookmarks.ts` - Manage bookmarks and collections
- ✅ `hooks/usePDFText.ts` - Extract text from PDF files

### 7. Constants (`constants.ts`)

- ✅ `PAGE_SIZE` - Pagination size
- ✅ `FILE_RESTRICTIONS` - File upload restrictions by tab
- ✅ `TYPE_MAP` - Tab to resource type mapping

## Recommended Additional Extractions

### Components to Extract

1. **`components/ResourceCard.tsx`** (~200 lines)
   - The resource card display in list view
   - Props: resource, handlers (onClick, onBookmark, onUpvote, onComment, onDelete)

2. **`components/ResourceDetailHeader.tsx`** (~150 lines)
   - Resource header in detail view
   - Props: resource, handlers, metadata display

3. **`components/ResourceDetailPreview.tsx`** (~150 lines)
   - PDF/HTML/YouTube preview section
   - Props: resource, viewMode, handlers

4. **`components/AIAssistantPanel.tsx`** (~300 lines)
   - Right-side AI assistant panel
   - Props: resource, messages, handlers, model settings

5. **`components/SearchBar.tsx`** (~150 lines)
   - Search bar with suggestions
   - Props: query, suggestions, handlers

6. **`components/FilterControls.tsx`** (~100 lines)
   - Filter and sort controls
   - Props: filters, sorts, handlers

### Additional Hooks to Extract

1. **`hooks/useResourceFetch.ts`**
   - Manage resource fetching with pagination
   - Infinite scroll logic
   - YouTube special handling

2. **`hooks/useSearchSuggestions.ts`**
   - Search suggestions with debouncing
   - Keyboard navigation

3. **`hooks/useAIChat.ts`**
   - AI message handling
   - Streaming responses
   - Attachment management

4. **`hooks/useUpvotes.ts`**
   - Manage upvote state
   - Toggle upvote functionality

5. **`hooks/useNotes.ts`**
   - Note saving functionality
   - Context menu handling

### Additional Helpers to Extract

1. **`handlers.ts`**
   - `handleResourceClick()`
   - `handleFileUpload()`
   - `handleFileChange()`
   - `handleSearch()`
   - `handleApplyFilters()`
   - `handleResetFilters()`

2. **`fetchHelpers.ts`**
   - `fetchResources()`
   - `fetchResourceById()`
   - `fetchSearchSuggestions()`

## Final Structure

```
frontend/components/explore/
├── ExploreContent.tsx          # Main component (~400 lines)
├── types.ts                     # Type definitions ✅
├── constants.ts                 # Constants ✅
├── utils.ts                     # Utility functions ✅
├── resourceHelpers.ts          # Resource helpers ✅
├── aiHelpers.ts                # AI helpers ✅
├── handlers.ts                  # Event handlers (TODO)
├── fetchHelpers.ts             # Fetch helpers (TODO)
├── Base64Image.tsx             # Base64 image component ✅
├── components/
│   ├── ResourceCard.tsx        # Resource card (TODO)
│   ├── ResourceDetailHeader.tsx # Detail header (TODO)
│   ├── ResourceDetailPreview.tsx # Preview section (TODO)
│   ├── AIAssistantPanel.tsx    # AI panel (TODO)
│   ├── SearchBar.tsx           # Search bar (TODO)
│   └── FilterControls.tsx      # Filters (TODO)
└── hooks/
    ├── useBookmarks.ts         # Bookmarks hook ✅
    ├── usePDFText.ts          # PDF text extraction ✅
    ├── useResourceFetch.ts     # Resource fetching (TODO)
    ├── useSearchSuggestions.ts # Search suggestions (TODO)
    ├── useAIChat.ts           # AI chat (TODO)
    ├── useUpvotes.ts          # Upvotes (TODO)
    └── useNotes.ts            # Notes (TODO)
```

## Import Map for Main Component

The refactored `ExploreContent.tsx` will import from:

```typescript
// Types
import type { Resource, SearchSuggestion, AIMessage, AIInsight } from './types';

// Constants
import { PAGE_SIZE, FILE_RESTRICTIONS, TYPE_MAP } from './constants';

// Utilities
import {
  extractImagesFromMarkdown,
  extractYouTubeVideoId,
  extractArxivId,
  getResourceThumbnail,
  parseMarkdownToInsights,
} from './utils';

// Components
import { Base64Image } from './Base64Image';

// Resource helpers
import {
  getSourceName,
  getSourceBadgeColor,
  convertToAIOfficeResource,
} from './resourceHelpers';

// AI helpers
import {
  saveAIAnalysisToDatabase,
  generateSummary,
  generateInsights,
} from './aiHelpers';

// Hooks
import { useBookmarks } from './hooks/useBookmarks';
import { usePDFText } from './hooks/usePDFText';
```

## Benefits

1. **Maintainability**: Easier to find and modify specific functionality
2. **Testability**: Each module can be tested independently
3. **Reusability**: Components and hooks can be reused elsewhere
4. **Performance**: Better code splitting potential
5. **Readability**: Main component is now focused on composition

## Next Steps

1. Extract remaining components (ResourceCard, AIAssistantPanel, etc.)
2. Extract remaining hooks (useResourceFetch, useAIChat, etc.)
3. Extract event handlers to handlers.ts
4. Update main ExploreContent.tsx to use all extracted modules
5. Test all functionality
6. Update tests to cover new modules
