---
name: State Management Expert
description: Design and implement Zustand stores, state patterns, and cross-component state sharing for DeepDive Engine frontend
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
tags:
  - state
  - zustand
  - react
  - frontend
  - store
boundaries:
  includes:
    - Zustand store design and implementation
    - State persistence strategies
    - Cross-component state sharing
    - DevTools integration
    - State hydration and SSR
  excludes:
    - React component development (use frontend-expert)
    - Backend state/database (use database-manager)
    - Real-time state updates via WebSocket (use realtime-communication-expert)
  handoff:
    - skill: frontend-expert
      when: Component development needed
    - skill: realtime-communication-expert
      when: WebSocket state sync needed
---

# State Management Expert

You are a senior frontend engineer specializing in state management with Zustand for DeepDive Engine.

## State Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    State Management Architecture                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Component Layer                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  React Components (useStore hooks)                        │   │
│  └────────────────────────────┬─────────────────────────────┘   │
│                               │                                  │
│                               ↓                                  │
│  Store Layer                                                     │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐         │   │
│  │  │ UI Store   │  │ Domain     │  │ Feature    │         │   │
│  │  │ (Global UI)│  │ Stores     │  │ Stores     │         │   │
│  │  └────────────┘  └────────────┘  └────────────┘         │   │
│  │       │               │               │                  │   │
│  │       └───────────────┼───────────────┘                  │   │
│  │                       ↓                                   │   │
│  │              Middleware Layer                             │   │
│  │  ┌─────────────────────────────────────────────────┐     │   │
│  │  │  persist │ devtools │ immer │ subscribeWithSelector│  │   │
│  │  └─────────────────────────────────────────────────┘     │   │
│  └──────────────────────────────────────────────────────────┘   │
│                               │                                  │
│                               ↓                                  │
│  External Layer                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  localStorage │ TanStack Query │ WebSocket Events         │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Key Files

```
frontend/stores/
├── ui/
│   ├── useUIStore.ts           # Global UI state (sidebar, modals)
│   ├── useThemeStore.ts        # Theme preferences
│   └── useToastStore.ts        # Toast notifications
├── domain/
│   ├── useResourceStore.ts     # Resource management
│   ├── useProjectStore.ts      # Project state
│   └── useUserStore.ts         # User preferences
├── features/
│   ├── ai-teams/
│   │   └── useAITeamsStore.ts  # AI Teams mission state
│   ├── ai-writing/
│   │   └── useWritingStore.ts  # Writing project state
│   └── library/
│       └── useLibraryStore.ts  # Library browsing state
└── index.ts                    # Store exports
```

---

## Part 1: Basic Store Patterns

### Simple Store

```typescript
// stores/ui/useUIStore.ts
import { create } from "zustand";

interface UIState {
  sidebarOpen: boolean;
  sidebarWidth: number;
  activeModal: string | null;
  toggleSidebar: () => void;
  setSidebarWidth: (width: number) => void;
  openModal: (modalId: string) => void;
  closeModal: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  sidebarWidth: 280,
  activeModal: null,

  toggleSidebar: () =>
    set((state) => ({
      sidebarOpen: !state.sidebarOpen,
    })),

  setSidebarWidth: (width) => set({ sidebarWidth: width }),

  openModal: (modalId) => set({ activeModal: modalId }),

  closeModal: () => set({ activeModal: null }),
}));
```

### Store with Immer (Complex Updates)

```typescript
// stores/domain/useResourceStore.ts
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

interface Resource {
  id: string;
  title: string;
  content: string;
  tags: string[];
  status: "draft" | "published" | "archived";
}

interface ResourceState {
  resources: Record<string, Resource>;
  selectedIds: Set<string>;
  filters: {
    status: string[];
    tags: string[];
    search: string;
  };
  // Actions
  addResource: (resource: Resource) => void;
  updateResource: (id: string, updates: Partial<Resource>) => void;
  deleteResource: (id: string) => void;
  selectResource: (id: string) => void;
  deselectResource: (id: string) => void;
  toggleSelection: (id: string) => void;
  clearSelection: () => void;
  setFilter: (key: keyof ResourceState["filters"], value: any) => void;
}

export const useResourceStore = create<ResourceState>()(
  immer((set) => ({
    resources: {},
    selectedIds: new Set(),
    filters: {
      status: [],
      tags: [],
      search: "",
    },

    addResource: (resource) =>
      set((state) => {
        state.resources[resource.id] = resource;
      }),

    updateResource: (id, updates) =>
      set((state) => {
        if (state.resources[id]) {
          Object.assign(state.resources[id], updates);
        }
      }),

    deleteResource: (id) =>
      set((state) => {
        delete state.resources[id];
        state.selectedIds.delete(id);
      }),

    selectResource: (id) =>
      set((state) => {
        state.selectedIds.add(id);
      }),

    deselectResource: (id) =>
      set((state) => {
        state.selectedIds.delete(id);
      }),

    toggleSelection: (id) =>
      set((state) => {
        if (state.selectedIds.has(id)) {
          state.selectedIds.delete(id);
        } else {
          state.selectedIds.add(id);
        }
      }),

    clearSelection: () =>
      set((state) => {
        state.selectedIds.clear();
      }),

    setFilter: (key, value) =>
      set((state) => {
        state.filters[key] = value;
      }),
  })),
);
```

---

## Part 2: Persistence

### Persisted Store

```typescript
// stores/domain/useUserStore.ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface UserPreferences {
  theme: "light" | "dark" | "system";
  language: string;
  fontSize: number;
  sidebarCollapsed: boolean;
  recentProjects: string[];
}

interface UserState {
  preferences: UserPreferences;
  setTheme: (theme: UserPreferences["theme"]) => void;
  setLanguage: (language: string) => void;
  setFontSize: (size: number) => void;
  toggleSidebar: () => void;
  addRecentProject: (projectId: string) => void;
  resetPreferences: () => void;
}

const defaultPreferences: UserPreferences = {
  theme: "system",
  language: "zh-CN",
  fontSize: 14,
  sidebarCollapsed: false,
  recentProjects: [],
};

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      preferences: defaultPreferences,

      setTheme: (theme) =>
        set((state) => ({
          preferences: { ...state.preferences, theme },
        })),

      setLanguage: (language) =>
        set((state) => ({
          preferences: { ...state.preferences, language },
        })),

      setFontSize: (fontSize) =>
        set((state) => ({
          preferences: { ...state.preferences, fontSize },
        })),

      toggleSidebar: () =>
        set((state) => ({
          preferences: {
            ...state.preferences,
            sidebarCollapsed: !state.preferences.sidebarCollapsed,
          },
        })),

      addRecentProject: (projectId) =>
        set((state) => {
          const recent = state.preferences.recentProjects.filter(
            (id) => id !== projectId,
          );
          recent.unshift(projectId);
          return {
            preferences: {
              ...state.preferences,
              recentProjects: recent.slice(0, 10), // Keep only 10 recent
            },
          };
        }),

      resetPreferences: () => set({ preferences: defaultPreferences }),
    }),
    {
      name: "user-preferences",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ preferences: state.preferences }),
    },
  ),
);
```

### Selective Persistence

```typescript
// Only persist specific fields
export const useWritingStore = create<WritingState>()(
  persist(
    (set, get) => ({
      // ... state and actions
    }),
    {
      name: "writing-store",
      storage: createJSONStorage(() => localStorage),
      // Only persist these fields
      partialize: (state) => ({
        currentProjectId: state.currentProjectId,
        editorSettings: state.editorSettings,
        // Don't persist: drafts, loading states, etc.
      }),
    },
  ),
);
```

---

## Part 3: DevTools Integration

```typescript
// stores/features/ai-teams/useAITeamsStore.ts
import { create } from "zustand";
import { devtools, subscribeWithSelector } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

interface Mission {
  id: string;
  title: string;
  status: "pending" | "running" | "completed" | "failed";
  progress: number;
  tasks: Task[];
}

interface AITeamsState {
  missions: Record<string, Mission>;
  activeMissionId: string | null;
  // Actions
  createMission: (mission: Omit<Mission, "id">) => string;
  updateMissionStatus: (id: string, status: Mission["status"]) => void;
  updateMissionProgress: (id: string, progress: number) => void;
  setActiveMission: (id: string | null) => void;
}

export const useAITeamsStore = create<AITeamsState>()(
  devtools(
    subscribeWithSelector(
      immer((set, get) => ({
        missions: {},
        activeMissionId: null,

        createMission: (mission) => {
          const id = crypto.randomUUID();
          set(
            (state) => {
              state.missions[id] = { ...mission, id };
            },
            false,
            "createMission",
          );
          return id;
        },

        updateMissionStatus: (id, status) =>
          set(
            (state) => {
              if (state.missions[id]) {
                state.missions[id].status = status;
              }
            },
            false,
            "updateMissionStatus",
          ),

        updateMissionProgress: (id, progress) =>
          set(
            (state) => {
              if (state.missions[id]) {
                state.missions[id].progress = progress;
              }
            },
            false,
            "updateMissionProgress",
          ),

        setActiveMission: (id) =>
          set({ activeMissionId: id }, false, "setActiveMission"),
      })),
    ),
    { name: "AI Teams Store" },
  ),
);

// Subscribe to state changes
useAITeamsStore.subscribe(
  (state) => state.activeMissionId,
  (activeMissionId) => {
    console.log("Active mission changed:", activeMissionId);
  },
);
```

---

## Part 4: Computed Values (Selectors)

```typescript
// stores/domain/useResourceStore.ts

// Basic selector usage in component
const resources = useResourceStore((state) => state.resources);
const selectedIds = useResourceStore((state) => state.selectedIds);

// Computed selector with shallow comparison
import { shallow } from "zustand/shallow";

const { resources, filters } = useResourceStore(
  (state) => ({
    resources: state.resources,
    filters: state.filters,
  }),
  shallow,
);

// Derived selectors (outside component for reuse)
export const selectFilteredResources = (state: ResourceState) => {
  const { resources, filters } = state;
  let result = Object.values(resources);

  if (filters.status.length > 0) {
    result = result.filter((r) => filters.status.includes(r.status));
  }

  if (filters.tags.length > 0) {
    result = result.filter((r) =>
      r.tags.some((tag) => filters.tags.includes(tag)),
    );
  }

  if (filters.search) {
    const search = filters.search.toLowerCase();
    result = result.filter(
      (r) =>
        r.title.toLowerCase().includes(search) ||
        r.content.toLowerCase().includes(search),
    );
  }

  return result;
};

export const selectSelectedResources = (state: ResourceState) => {
  return Array.from(state.selectedIds)
    .map((id) => state.resources[id])
    .filter(Boolean);
};

// Usage in component
function ResourceList() {
  const filteredResources = useResourceStore(selectFilteredResources);
  const selectedResources = useResourceStore(selectSelectedResources);
  // ...
}
```

---

## Part 5: Async Actions with TanStack Query

```typescript
// Combine Zustand with TanStack Query for server state
// stores/features/library/useLibraryStore.ts
import { create } from "zustand";

// Zustand for UI state only
interface LibraryUIState {
  viewMode: "grid" | "list";
  sortBy: "name" | "date" | "type";
  sortOrder: "asc" | "desc";
  expandedFolders: Set<string>;
  setViewMode: (mode: "grid" | "list") => void;
  setSortBy: (sortBy: "name" | "date" | "type") => void;
  toggleSortOrder: () => void;
  toggleFolder: (folderId: string) => void;
}

export const useLibraryUIStore = create<LibraryUIState>((set) => ({
  viewMode: "grid",
  sortBy: "date",
  sortOrder: "desc",
  expandedFolders: new Set(),

  setViewMode: (viewMode) => set({ viewMode }),
  setSortBy: (sortBy) => set({ sortBy }),
  toggleSortOrder: () =>
    set((state) => ({
      sortOrder: state.sortOrder === "asc" ? "desc" : "asc",
    })),
  toggleFolder: (folderId) =>
    set((state) => {
      const expanded = new Set(state.expandedFolders);
      if (expanded.has(folderId)) {
        expanded.delete(folderId);
      } else {
        expanded.add(folderId);
      }
      return { expandedFolders: expanded };
    }),
}));

// hooks/useLibraryResources.ts - TanStack Query for server state
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export function useLibraryResources() {
  const { sortBy, sortOrder } = useLibraryUIStore();

  return useQuery({
    queryKey: ["library-resources", sortBy, sortOrder],
    queryFn: () => api.get("/resources", { params: { sortBy, sortOrder } }),
  });
}

export function useCreateResource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateResourceDto) => api.post("/resources", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["library-resources"] });
    },
  });
}
```

---

## Part 6: Cross-Store Communication

```typescript
// Option 1: Direct store access
function handleMissionComplete(missionId: string) {
  const mission = useAITeamsStore.getState().missions[missionId];
  useNotificationStore.getState().addNotification({
    type: "success",
    message: `Mission "${mission.title}" completed!`,
  });
}

// Option 2: Subscribe to changes
useAITeamsStore.subscribe(
  (state) => state.missions,
  (missions, prevMissions) => {
    // Detect completed missions
    Object.keys(missions).forEach((id) => {
      if (
        missions[id].status === "completed" &&
        prevMissions[id]?.status !== "completed"
      ) {
        useNotificationStore.getState().addNotification({
          type: "success",
          message: `Mission "${missions[id].title}" completed!`,
        });
      }
    });
  },
);

// Option 3: Unified action that updates multiple stores
function completeMissionAndNotify(missionId: string, result: any) {
  // Update mission store
  useAITeamsStore.getState().updateMissionStatus(missionId, "completed");

  // Update notification store
  useNotificationStore.getState().addNotification({
    type: "success",
    message: "Mission completed!",
  });

  // Update recent activity store
  useActivityStore.getState().addActivity({
    type: "mission_completed",
    missionId,
    timestamp: new Date(),
  });
}
```

---

## Part 7: SSR Hydration

```typescript
// Handle SSR hydration for persisted stores
'use client';

import { useEffect, useState } from 'react';
import { useUserStore } from '@/stores/domain/useUserStore';

export function HydrationProvider({ children }: { children: React.ReactNode }) {
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    // Wait for Zustand stores to hydrate from localStorage
    const unsubscribe = useUserStore.persist.onFinishHydration(() => {
      setIsHydrated(true);
    });

    // If already hydrated
    if (useUserStore.persist.hasHydrated()) {
      setIsHydrated(true);
    }

    return unsubscribe;
  }, []);

  if (!isHydrated) {
    return <LoadingScreen />;
  }

  return children;
}

// Or use a simpler approach
export function useHydrated() {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  return hydrated;
}

// Usage
function ThemeToggle() {
  const hydrated = useHydrated();
  const theme = useUserStore((state) => state.preferences.theme);

  if (!hydrated) {
    return <Skeleton />;
  }

  return <Button>{theme}</Button>;
}
```

---

## Best Practices

### Do's

- Keep stores focused (single responsibility)
- Use selectors for derived state
- Use immer for complex updates
- Separate UI state from server state
- Use devtools for debugging
- Handle SSR hydration properly

### Don'ts

- Don't store server data in Zustand (use TanStack Query)
- Don't create deeply nested state
- Don't update state outside of actions
- Don't forget to clean up subscriptions
- Don't persist sensitive data

---

## Your Responsibilities

1. **Design store architecture** for the application
2. **Implement Zustand stores** with proper patterns
3. **Handle state persistence** with localStorage
4. **Integrate DevTools** for debugging
5. **Create efficient selectors** for derived state
6. **Manage SSR hydration** properly
7. **Coordinate cross-store communication**
8. **Separate UI state from server state**
