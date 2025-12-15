# ExploreContent Component Refactoring Guide

## Overview

The original `ExploreContent.tsx` file was **3,506 lines** - far too large for maintainability. This guide documents the refactoring that reduces it to **under 500 lines** by extracting components and hooks.

## Files Created

### Components (692 lines total)

1. **ResourceCard.tsx** (340 lines)
   - Individual resource display card with thumbnail, metadata, and action buttons
   - Handles bookmarking, upvoting, commenting, AI Office integration, image pool
   - Props: resource, callbacks, state flags

2. **SearchBar.tsx** (196 lines)
   - Search input with autocomplete suggestions
   - Displays type icons for different resource types (Paper, Blog, YouTube, etc.)
   - Keyboard navigation support (Arrow keys, Enter, Escape)
   - Props: search state, suggestions, callbacks

3. **ResourceListView.tsx** (156 lines)
   - Renders list of ResourceCard components
   - Loading states, infinite scroll trigger
   - Empty states and "no more results" indicator
   - Props: resources array, loading flags, callbacks

### Custom Hooks (3 files)

1. **hooks/useBookmarks.ts** (existing)
   - Manages bookmark state and API calls
   - Returns: bookmarks, isBookmarked(), toggleBookmark()

2. **hooks/usePDFText.ts** (existing)
   - Extracts text from PDF resources
   - Returns: pdfText string

3. **hooks/useResources.ts** (NEW - 224 lines)
   - Manages resource fetching with pagination
   - Infinite scroll logic
   - YouTube video deduplication
   - Returns: resources, loading states, fetchResources()

4. **hooks/useAIAssistant.ts** (NEW - 75 lines)
   - Manages AI chat state (messages, input, loading)
   - File attachment handling
   - Returns: AI state and actions

### Existing Support Files (already extracted)

- **types.ts** - TypeScript interfaces
- **constants.ts** - PAGE_SIZE, FILE_RESTRICTIONS, TYPE_MAP
- **utils.ts** - Helper functions
- **resourceHelpers.ts** - Resource-specific utilities
- **aiHelpers.ts** - AI API integration
- **Base64Image.tsx** - Image display component

## Migration Steps

### Step 1: Verify Extracted Components

Test each extracted component individually:

```bash
# Check TypeScript compilation
npx tsc --noEmit

# Verify all imports resolve
grep -r "from './" frontend/components/explore/
```

### Step 2: Backup Original File

```bash
cp frontend/components/explore/ExploreContent.tsx \
   frontend/components/explore/ExploreContent.tsx.BACKUP
```

### Step 3: Replace with Refactored Version

```bash
mv frontend/components/explore/ExploreContent.REFACTORED.tsx \
   frontend/components/explore/ExploreContent.tsx
```

### Step 4: Handle Missing Functionality

The refactored version currently shows:

- ✅ List view with resource cards
- ✅ Search bar with suggestions
- ✅ Infinite scroll
- ✅ Filters and tabs
- ⚠️ Simplified detail view (needs AI panel integration)

**TODO**: Extract and integrate these large sections:

1. **ResourceDetailView.tsx** (~800 lines)
   - PDF/HTML viewer integration
   - Content rendering (PDFViewer, HTMLViewer, ReaderView)
   - Header with metadata
   - View mode toggles

2. **AIAssistantPanel.tsx** (~600 lines)
   - Model selector
   - Quick actions (Summary, Insights, Methodology)
   - Chat messages display
   - AI-generated content cards
   - Input area with attachments
   - Tab navigation (Assistant, Notes, Comments, Similar)

3. **DetailViewContent.tsx** (~400 lines)
   - Different content types (PAPER, BLOG, REPORT, etc.)
   - TextSelectionToolbar integration
   - Article loaded handler
   - Context menu for notes

## Line Count Comparison

| File                 | Original  | Refactored | Savings    |
| -------------------- | --------- | ---------- | ---------- |
| ExploreContent.tsx   | 3,506     | 441        | -3,065     |
| ResourceCard.tsx     | -         | 340        | -          |
| SearchBar.tsx        | -         | 196        | -          |
| ResourceListView.tsx | -         | 156        | -          |
| useResources.ts      | -         | 224        | -          |
| useAIAssistant.ts    | -         | 75         | -          |
| **Total**            | **3,506** | **1,432**  | **-2,074** |

## Benefits

### Maintainability

- Main file is now **87% smaller**
- Each component has single responsibility
- Easy to locate and fix bugs

### Reusability

- ResourceCard can be used in other views
- SearchBar is generic enough for other pages
- Hooks can be shared across components

### Testing

- Each component can be unit tested independently
- Mock props easily for component testing
- Hooks can be tested in isolation

### Performance

- Code splitting opportunities
- Easier to optimize individual components
- Better tree-shaking

## Known Issues & TODOs

### Immediate

- [ ] Complete detail view extraction (currently simplified)
- [ ] Extract AIAssistantPanel component
- [ ] Add proper error boundaries
- [ ] Test all user flows

### Future Improvements

- [ ] Extract context menu to separate component
- [ ] Create useSearchSuggestions hook
- [ ] Split AI functionality into smaller hooks
- [ ] Add loading skeleton components
- [ ] Implement virtual scrolling for large lists

## Testing Checklist

Before deploying:

- [ ] List view displays resources correctly
- [ ] Search suggestions work
- [ ] Infinite scroll loads more items
- [ ] Filters apply correctly
- [ ] Bookmark toggle works
- [ ] Upvote button functions
- [ ] Resource click navigates properly
- [ ] YouTube videos redirect correctly
- [ ] File upload works
- [ ] Import dialogs function
- [ ] Admin delete works (if admin)
- [ ] Detail view displays (basic version)
- [ ] Mobile responsive layout
- [ ] No TypeScript errors
- [ ] No console errors

## Rollback Plan

If issues arise:

```bash
# Restore original file
mv frontend/components/explore/ExploreContent.tsx.BACKUP \
   frontend/components/explore/ExploreContent.tsx

# Keep extracted files for future use
mkdir -p frontend/components/explore/extracted
mv frontend/components/explore/ResourceCard.tsx frontend/components/explore/extracted/
mv frontend/components/explore/SearchBar.tsx frontend/components/explore/extracted/
mv frontend/components/explore/ResourceListView.tsx frontend/components/explore/extracted/
```

## Next Steps

1. **Extract AI Panel** - Create AIAssistantPanel.tsx with all AI interaction logic
2. **Extract Detail View** - Create ResourceDetailView.tsx for content viewing
3. **Test Thoroughly** - Ensure all functionality works
4. **Deploy** - Replace original file with refactored version
5. **Monitor** - Watch for bugs in production
6. **Iterate** - Continue improving based on usage patterns

## Questions?

Contact the development team or review:

- Original file: `ExploreContent.tsx.BACKUP` (if created)
- Refactored file: `ExploreContent.tsx`
- This guide: `REFACTORING_GUIDE.md`
