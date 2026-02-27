import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

// Mock zustand persist middleware localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

vi.mock('@/lib/ai-office/ppt-utils', () => ({
  calculateSlideCount: vi.fn((markdown: string) => {
    return (markdown.match(/^## /gm) || []).length;
  }),
}));

import {
  useResourceStore,
  useDocumentStore,
  useChatStore,
  useTaskStore,
  useUIStore,
  useSelectedResources,
  useCurrentDocument,
  useCurrentChatMessages,
  useCurrentTask,
} from '../aiOfficeStore';
import type { Task } from '../aiOfficeStore';
import type { Resource, Document } from '@/types/ai-office';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeResource = (id: string, overrides = {}): Resource =>
  ({
    _id: id,
    title: `Resource ${id}`,
    type: 'web' as const,
    url: `https://example.com/${id}`,
    content: 'Some content',
    createdAt: new Date(),
    ...overrides,
  }) as unknown as Resource;

const makeDocument = (
  id: string,
  type: 'article' | 'ppt' = 'article'
): Document =>
  ({
    _id: id,
    userId: 'user-1',
    title: `Document ${id}`,
    type,
    content:
      type === 'ppt'
        ? { markdown: '## Slide 1\nContent\n## Slide 2\nContent' }
        : { text: 'Article text' },
    metadata: { wordCount: 100, slideCount: 2 },
    status: 'completed' as const,
    resources: [],
    aiConfig: {
      model: 'grok',
      temperature: 0.7,
      maxTokens: 4000,
      language: 'zh-CN',
      detailLevel: 3,
      professionalLevel: 3,
    },
    generationHistory: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    versions: [],
  }) as unknown as Document;

const makeTask = (id: string): Task => ({
  _id: id,
  title: `Task ${id}`,
  type: 'article',
  createdAt: new Date(),
  refreshedAt: new Date(),
  context: {
    resourceIds: [],
    chatMessages: [],
  },
  metadata: {},
});

// ---------------------------------------------------------------------------
// ResourceStore tests
// ---------------------------------------------------------------------------

describe('useResourceStore', () => {
  beforeEach(() => {
    act(() => {
      useResourceStore.setState({ resources: [], selectedResourceIds: [] });
    });
  });

  it('starts with empty resources and selection', () => {
    const state = useResourceStore.getState();
    expect(state.resources).toEqual([]);
    expect(state.selectedResourceIds).toEqual([]);
  });

  it('addResource adds a new resource', () => {
    act(() => {
      useResourceStore.getState().addResource(makeResource('r1'));
    });
    expect(useResourceStore.getState().resources).toHaveLength(1);
  });

  it('addResource skips duplicate resources', () => {
    act(() => {
      useResourceStore.getState().addResource(makeResource('r1'));
      useResourceStore.getState().addResource(makeResource('r1'));
    });
    expect(useResourceStore.getState().resources).toHaveLength(1);
  });

  it('removeResource removes the resource and deselects it', () => {
    act(() => {
      useResourceStore.getState().addResource(makeResource('r1'));
      useResourceStore.getState().selectResource('r1');
    });

    act(() => {
      useResourceStore.getState().removeResource('r1');
    });

    const state = useResourceStore.getState();
    expect(state.resources).toHaveLength(0);
    expect(state.selectedResourceIds).not.toContain('r1');
  });

  it('updateResource updates fields on matching resource', () => {
    act(() => {
      useResourceStore.getState().addResource(makeResource('r1'));
    });

    act(() => {
      useResourceStore.getState().updateResource('r1', {
        title: 'Updated Title',
      } as unknown as Partial<Resource>);
    });

    expect(
      (useResourceStore.getState().resources[0] as unknown as { title: string })
        .title
    ).toBe('Updated Title');
  });

  it('selectResource adds to selectedIds only once', () => {
    act(() => {
      useResourceStore.getState().selectResource('r1');
      useResourceStore.getState().selectResource('r1');
    });
    expect(useResourceStore.getState().selectedResourceIds).toHaveLength(1);
  });

  it('deselectResource removes from selectedIds', () => {
    act(() => {
      useResourceStore.getState().selectResource('r1');
      useResourceStore.getState().selectResource('r2');
    });

    act(() => {
      useResourceStore.getState().deselectResource('r1');
    });

    expect(useResourceStore.getState().selectedResourceIds).toEqual(['r2']);
  });

  it('clearSelection empties selectedIds', () => {
    act(() => {
      useResourceStore.getState().selectResource('r1');
      useResourceStore.getState().selectResource('r2');
    });

    act(() => {
      useResourceStore.getState().clearSelection();
    });

    expect(useResourceStore.getState().selectedResourceIds).toEqual([]);
  });

  it('setLoading and setError update state', () => {
    act(() => {
      useResourceStore.getState().setLoading(true);
      useResourceStore.getState().setError('Some error');
    });

    const state = useResourceStore.getState();
    expect(state.isLoading).toBe(true);
    expect(state.error).toBe('Some error');
  });
});

// ---------------------------------------------------------------------------
// DocumentStore tests
// ---------------------------------------------------------------------------

describe('useDocumentStore', () => {
  beforeEach(() => {
    act(() => {
      useDocumentStore.setState({
        documents: [],
        currentDocumentId: null,
        isGenerating: false,
        generationProgress: 0,
        generationSteps: [],
        currentStep: '',
        resourcesFound: 0,
        estimatedTime: null,
        error: null,
      });
    });
  });

  it('addDocument appends to documents list', () => {
    act(() => {
      useDocumentStore.getState().addDocument(makeDocument('doc-1'));
    });
    expect(useDocumentStore.getState().documents).toHaveLength(1);
  });

  it('updateDocument updates matching document', () => {
    act(() => {
      useDocumentStore.getState().addDocument(makeDocument('doc-1'));
    });

    act(() => {
      useDocumentStore
        .getState()
        .updateDocument('doc-1', { title: 'Updated Doc' });
    });

    expect(useDocumentStore.getState().documents[0].title).toBe('Updated Doc');
  });

  it('deleteDocument removes document and clears currentDocumentId', () => {
    act(() => {
      useDocumentStore.getState().addDocument(makeDocument('doc-1'));
      useDocumentStore.getState().setCurrentDocument('doc-1');
    });

    act(() => {
      useDocumentStore.getState().deleteDocument('doc-1');
    });

    const state = useDocumentStore.getState();
    expect(state.documents).toHaveLength(0);
    expect(state.currentDocumentId).toBeNull();
  });

  it('setCurrentDocument clears selectedSlideIndex', () => {
    act(() => {
      useDocumentStore.getState().setSelectedSlideIndex(3);
    });
    expect(useDocumentStore.getState().selectedSlideIndex).toBe(3);

    act(() => {
      useDocumentStore.getState().setCurrentDocument('doc-1');
    });
    expect(useDocumentStore.getState().selectedSlideIndex).toBeNull();
  });

  it('setGenerating false resets generation state', () => {
    act(() => {
      useDocumentStore.getState().setGenerating(true);
      useDocumentStore
        .getState()
        .setGenerationSteps([
          { id: 's1', name: 'Step 1', status: 'processing' },
        ]);
    });

    act(() => {
      useDocumentStore.getState().setGenerating(false);
    });

    const state = useDocumentStore.getState();
    expect(state.isGenerating).toBe(false);
    expect(state.generationSteps).toEqual([]);
    expect(state.currentStep).toBe('');
  });

  it('setGenerationProgress sets the progress value', () => {
    act(() => {
      useDocumentStore.getState().setGenerationProgress(75);
    });
    expect(useDocumentStore.getState().generationProgress).toBe(75);
  });

  it('updateGenerationStep updates matching step', () => {
    act(() => {
      useDocumentStore.getState().setGenerationSteps([
        { id: 's1', name: 'Step 1', status: 'pending' },
        { id: 's2', name: 'Step 2', status: 'pending' },
      ]);
    });

    act(() => {
      useDocumentStore
        .getState()
        .updateGenerationStep('s1', { status: 'completed' });
    });

    const steps = useDocumentStore.getState().generationSteps;
    expect(steps[0].status).toBe('completed');
    expect(steps[1].status).toBe('pending');
  });

  it('saveVersion creates a version and returns versionId', () => {
    act(() => {
      useDocumentStore.getState().addDocument(makeDocument('doc-1'));
    });

    let versionId = '';
    act(() => {
      versionId = useDocumentStore
        .getState()
        .saveVersion('doc-1', 'manual', 'user_edit', 'Initial save');
    });

    expect(versionId).toMatch(/^v_/);
    const doc = useDocumentStore
      .getState()
      .documents.find((d) => d._id === 'doc-1');
    expect(doc?.versions).toHaveLength(1);
    expect(doc?.versions[0].id).toBe(versionId);
  });

  it('saveVersion returns empty string for non-existent document', () => {
    let versionId = '';
    act(() => {
      versionId = useDocumentStore
        .getState()
        .saveVersion('nonexistent', 'auto', 'ai_generation');
    });
    expect(versionId).toBe('');
  });

  it('getVersions returns versions for a document', () => {
    act(() => {
      useDocumentStore.getState().addDocument(makeDocument('doc-1'));
      useDocumentStore.getState().saveVersion('doc-1', 'auto', 'ai_generation');
      useDocumentStore.getState().saveVersion('doc-1', 'manual', 'user_edit');
    });

    const versions = useDocumentStore.getState().getVersions('doc-1');
    expect(versions).toHaveLength(2);
  });

  it('restoreVersion restores document content from a version', () => {
    act(() => {
      useDocumentStore.getState().addDocument(makeDocument('doc-1'));
    });

    let versionId = '';
    act(() => {
      versionId = useDocumentStore
        .getState()
        .saveVersion('doc-1', 'auto', 'ai_generation');
    });

    // Change document content
    act(() => {
      useDocumentStore
        .getState()
        .updateDocument('doc-1', { title: 'Modified' });
    });

    // Restore
    act(() => {
      useDocumentStore.getState().restoreVersion('doc-1', versionId);
    });

    const doc = useDocumentStore
      .getState()
      .documents.find((d) => d._id === 'doc-1');
    expect(doc?.currentVersionId).toBe(versionId);
  });

  it('deleteVersion removes version from document', () => {
    act(() => {
      useDocumentStore.getState().addDocument(makeDocument('doc-1'));
    });

    let versionId = '';
    act(() => {
      versionId = useDocumentStore
        .getState()
        .saveVersion('doc-1', 'auto', 'ai_generation');
    });

    act(() => {
      useDocumentStore.getState().deleteVersion('doc-1', versionId);
    });

    const doc = useDocumentStore
      .getState()
      .documents.find((d) => d._id === 'doc-1');
    expect(doc?.versions).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// ChatStore tests
// ---------------------------------------------------------------------------

describe('useChatStore', () => {
  beforeEach(() => {
    act(() => {
      useChatStore.setState({
        sessions: {},
        isStreaming: false,
        streamingMessage: '',
        shouldStopGeneration: false,
        error: null,
        agentMode: 'basic',
        agentStatus: null,
      });
    });
  });

  it('addMessage creates a session and appends message', () => {
    const msg = {
      id: 'msg-1',
      role: 'user' as const,
      content: 'Hello',
      timestamp: new Date(),
    };

    act(() => {
      useChatStore.getState().addMessage('doc-1', msg);
    });

    expect(useChatStore.getState().sessions['doc-1']).toHaveLength(1);
  });

  it('updateMessage modifies message in session', () => {
    const msg = {
      id: 'msg-1',
      role: 'user' as const,
      content: 'Hello',
      timestamp: new Date(),
    };

    act(() => {
      useChatStore.getState().addMessage('doc-1', msg);
      useChatStore
        .getState()
        .updateMessage('doc-1', 'msg-1', { content: 'Updated' });
    });

    expect(useChatStore.getState().sessions['doc-1'][0].content).toBe(
      'Updated'
    );
  });

  it('setStreaming true resets stop flag', () => {
    act(() => {
      useChatStore.getState().stopGeneration();
    });
    expect(useChatStore.getState().shouldStopGeneration).toBe(true);

    act(() => {
      useChatStore.getState().setStreaming(true);
    });
    expect(useChatStore.getState().shouldStopGeneration).toBe(false);
    expect(useChatStore.getState().isStreaming).toBe(true);
  });

  it('stopGeneration sets shouldStopGeneration', () => {
    act(() => {
      useChatStore.getState().stopGeneration();
    });
    expect(useChatStore.getState().shouldStopGeneration).toBe(true);
  });

  it('clearSession empties session messages', () => {
    const msg = {
      id: 'msg-1',
      role: 'user' as const,
      content: 'Hello',
      timestamp: new Date(),
    };
    act(() => {
      useChatStore.getState().addMessage('doc-1', msg);
    });
    act(() => {
      useChatStore.getState().clearSession('doc-1');
    });
    expect(useChatStore.getState().sessions['doc-1']).toEqual([]);
  });

  it('setAgentMode sets mode', () => {
    act(() => {
      useChatStore.getState().setAgentMode('enhanced');
    });
    expect(useChatStore.getState().agentMode).toBe('enhanced');
  });

  it('setAgentStatus sets status', () => {
    act(() => {
      useChatStore.getState().setAgentStatus('Analyzing resources...');
    });
    expect(useChatStore.getState().agentStatus).toBe('Analyzing resources...');
  });
});

// ---------------------------------------------------------------------------
// TaskStore tests
// ---------------------------------------------------------------------------

describe('useTaskStore', () => {
  beforeEach(() => {
    act(() => {
      useTaskStore.setState({
        tasks: [],
        currentTaskId: null,
        isTaskListOpen: false,
      });
    });
  });

  it('addTask prepends task to list', () => {
    const task1 = makeTask('task-1');
    const task2 = makeTask('task-2');

    act(() => {
      useTaskStore.getState().addTask(task1);
      useTaskStore.getState().addTask(task2);
    });

    const tasks = useTaskStore.getState().tasks;
    expect(tasks[0]._id).toBe('task-2');
  });

  it('updateTask deep-merges context', () => {
    const task = makeTask('task-1');
    task.context.resourceIds = ['r1'];

    act(() => {
      useTaskStore.getState().addTask(task);
    });

    act(() => {
      useTaskStore.getState().updateTask('task-1', {
        context: { resourceIds: ['r1', 'r2'], chatMessages: [] },
      });
    });

    const updated = useTaskStore.getState().tasks[0];
    expect(updated.context.resourceIds).toEqual(['r1', 'r2']);
  });

  it('deleteTask removes task and clears currentTaskId', () => {
    const task = makeTask('task-1');
    act(() => {
      useTaskStore.getState().addTask(task);
      useTaskStore.getState().setCurrentTask('task-1');
    });

    act(() => {
      useTaskStore.getState().deleteTask('task-1');
    });

    const state = useTaskStore.getState();
    expect(state.tasks).toHaveLength(0);
    expect(state.currentTaskId).toBeNull();
  });

  it('toggleTaskList toggles isTaskListOpen', () => {
    expect(useTaskStore.getState().isTaskListOpen).toBe(false);

    act(() => {
      useTaskStore.getState().toggleTaskList();
    });
    expect(useTaskStore.getState().isTaskListOpen).toBe(true);

    act(() => {
      useTaskStore.getState().toggleTaskList();
    });
    expect(useTaskStore.getState().isTaskListOpen).toBe(false);
  });

  it('saveTaskContext merges context into task', () => {
    const task = makeTask('task-1');
    act(() => {
      useTaskStore.getState().addTask(task);
    });

    act(() => {
      useTaskStore
        .getState()
        .saveTaskContext('task-1', { resourceIds: ['r1'] });
    });

    expect(useTaskStore.getState().tasks[0].context.resourceIds).toEqual([
      'r1',
    ]);
  });
});

// ---------------------------------------------------------------------------
// UIStore tests
// ---------------------------------------------------------------------------

describe('useUIStore', () => {
  beforeEach(() => {
    act(() => {
      useUIStore.setState({
        middlePanelWidth: 650,
        resourceListCollapsed: false,
        selectedResourceIds: [],
        isLoading: false,
      });
    });
  });

  it('setMiddlePanelWidth clamps to [400, 800]', () => {
    act(() => {
      useUIStore.getState().setMiddlePanelWidth(200);
    });
    expect(useUIStore.getState().middlePanelWidth).toBe(400);

    act(() => {
      useUIStore.getState().setMiddlePanelWidth(1000);
    });
    expect(useUIStore.getState().middlePanelWidth).toBe(800);

    act(() => {
      useUIStore.getState().setMiddlePanelWidth(600);
    });
    expect(useUIStore.getState().middlePanelWidth).toBe(600);
  });

  it('toggleResourceList toggles collapse state', () => {
    act(() => {
      useUIStore.getState().toggleResourceList();
    });
    expect(useUIStore.getState().resourceListCollapsed).toBe(true);

    act(() => {
      useUIStore.getState().toggleResourceList();
    });
    expect(useUIStore.getState().resourceListCollapsed).toBe(false);
  });

  it('setResourceListCollapsed sets value directly', () => {
    act(() => {
      useUIStore.getState().setResourceListCollapsed(true);
    });
    expect(useUIStore.getState().resourceListCollapsed).toBe(true);
  });

  it('setError sets error object with message and code', () => {
    act(() => {
      useUIStore.getState().setError('Something went wrong', 'ERR_500');
    });
    const state = useUIStore.getState();
    expect(state.error?.message).toBe('Something went wrong');
    expect(state.error?.code).toBe('ERR_500');
  });

  it('clearError clears error', () => {
    act(() => {
      useUIStore.getState().setError('Error');
    });
    act(() => {
      useUIStore.getState().clearError();
    });
    expect(useUIStore.getState().error).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

describe('useSelectedResources selector', () => {
  beforeEach(() => {
    act(() => {
      useResourceStore.setState({
        resources: [makeResource('r1'), makeResource('r2'), makeResource('r3')],
        selectedResourceIds: ['r1', 'r3'],
        isLoading: false,
        error: null,
      });
    });
  });

  it('returns only selected resources', () => {
    const { result } = renderHook(() => useSelectedResources());
    expect(result.current).toHaveLength(2);
    expect(result.current.map((r) => r._id)).toEqual(['r1', 'r3']);
  });

  it('returns empty array when no resources selected', () => {
    act(() => {
      useResourceStore.setState({ selectedResourceIds: [] });
    });
    const { result } = renderHook(() => useSelectedResources());
    expect(result.current).toHaveLength(0);
  });
});

describe('useCurrentDocument selector', () => {
  const doc1 = makeDocument('doc1');
  const doc2 = makeDocument('doc2', 'ppt');

  beforeEach(() => {
    act(() => {
      useDocumentStore.setState({
        documents: [doc1, doc2],
        currentDocumentId: 'doc1',
        error: null,
      });
    });
  });

  it('returns the current document', () => {
    const { result } = renderHook(() => useCurrentDocument());
    expect(result.current?._id).toBe('doc1');
  });

  it('returns undefined when no current document id', () => {
    act(() => {
      useDocumentStore.setState({ currentDocumentId: null });
    });
    const { result } = renderHook(() => useCurrentDocument());
    expect(result.current).toBeUndefined();
  });
});

describe('useCurrentChatMessages selector', () => {
  const msg1 = {
    id: 'msg-1',
    role: 'user' as const,
    content: 'Hello',
    timestamp: new Date(),
  };

  beforeEach(() => {
    act(() => {
      useDocumentStore.setState({ currentDocumentId: 'doc1' });
      useChatStore.setState({
        sessions: { doc1: [msg1] },
        isStreaming: false,
        streamingMessage: '',
        error: null,
      });
    });
  });

  it('returns messages for current document', () => {
    const { result } = renderHook(() => useCurrentChatMessages());
    expect(result.current).toHaveLength(1);
    expect(result.current[0].content).toBe('Hello');
  });

  it('returns empty array when no current document', () => {
    act(() => {
      useDocumentStore.setState({ currentDocumentId: null });
    });
    const { result } = renderHook(() => useCurrentChatMessages());
    expect(result.current).toHaveLength(0);
  });

  it('returns empty array when document has no session', () => {
    act(() => {
      useDocumentStore.setState({ currentDocumentId: 'doc-no-session' });
    });
    const { result } = renderHook(() => useCurrentChatMessages());
    expect(result.current).toHaveLength(0);
  });
});

describe('useCurrentTask selector', () => {
  const task1 = makeTask('task1');
  const task2 = makeTask('task2');

  beforeEach(() => {
    act(() => {
      useTaskStore.setState({
        tasks: [task1, task2],
        currentTaskId: 'task1',
      });
    });
  });

  it('returns the current task', () => {
    const { result } = renderHook(() => useCurrentTask());
    expect(result.current?._id).toBe('task1');
  });

  it('returns undefined when no current task id', () => {
    act(() => {
      useTaskStore.setState({ currentTaskId: null });
    });
    const { result } = renderHook(() => useCurrentTask());
    expect(result.current).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// DocumentStore - additional branches
// ---------------------------------------------------------------------------

describe('useDocumentStore - additional', () => {
  beforeEach(() => {
    act(() => {
      useDocumentStore.setState({
        documents: [],
        currentDocumentId: null,
        isGenerating: false,
        generationProgress: 0,
        generationSteps: [],
        currentStep: '',
        resourcesFound: 0,
        estimatedTime: null,
        error: null,
      });
    });
  });

  it('setGenerating true sets isGenerating without resetting steps', () => {
    act(() => {
      useDocumentStore
        .getState()
        .setGenerationSteps([
          { id: 's1', name: 'Step 1', status: 'processing' },
        ]);
      useDocumentStore.getState().setGenerating(true);
    });

    const state = useDocumentStore.getState();
    expect(state.isGenerating).toBe(true);
    // Steps are NOT reset when setting generating to true
    expect(state.generationSteps).toHaveLength(1);
  });

  it('setCurrentStep updates currentStep', () => {
    act(() => {
      useDocumentStore.getState().setCurrentStep('step-3');
    });
    expect(useDocumentStore.getState().currentStep).toBe('step-3');
  });

  it('setResourcesFound updates resourcesFound', () => {
    act(() => {
      useDocumentStore.getState().setResourcesFound(42);
    });
    expect(useDocumentStore.getState().resourcesFound).toBe(42);
  });

  it('setEstimatedTime updates estimatedTime', () => {
    act(() => {
      useDocumentStore.getState().setEstimatedTime(120);
    });
    expect(useDocumentStore.getState().estimatedTime).toBe(120);

    act(() => {
      useDocumentStore.getState().setEstimatedTime(null);
    });
    expect(useDocumentStore.getState().estimatedTime).toBeNull();
  });

  it('deleteDocument preserves currentDocumentId when different doc is deleted', () => {
    act(() => {
      useDocumentStore.getState().addDocument(makeDocument('doc-1'));
      useDocumentStore.getState().addDocument(makeDocument('doc-2'));
      useDocumentStore.getState().setCurrentDocument('doc-1');
    });

    act(() => {
      useDocumentStore.getState().deleteDocument('doc-2');
    });

    expect(useDocumentStore.getState().currentDocumentId).toBe('doc-1');
    expect(useDocumentStore.getState().documents).toHaveLength(1);
  });

  it('saveVersion for PPT document calculates slideCount from markdown', () => {
    const pptDoc = makeDocument('doc-ppt', 'ppt');
    act(() => {
      useDocumentStore.getState().addDocument(pptDoc);
    });

    let versionId = '';
    act(() => {
      versionId = useDocumentStore
        .getState()
        .saveVersion('doc-ppt', 'auto', 'ai_generation');
    });

    expect(versionId).toMatch(/^v_/);
    const doc = useDocumentStore
      .getState()
      .documents.find((d) => d._id === 'doc-ppt');
    expect(doc?.versions).toHaveLength(1);
    // The calculateSlideCount mock counts ## headers
    expect(doc?.versions[0].metadata.slideCount).toBe(2);
  });

  it('saveVersion records aiModel from document aiConfig', () => {
    const doc = makeDocument('doc-with-ai');
    act(() => {
      useDocumentStore.getState().addDocument(doc);
    });

    let versionId = '';
    act(() => {
      versionId = useDocumentStore
        .getState()
        .saveVersion('doc-with-ai', 'manual', 'user_edit', 'With AI config');
    });

    const savedDoc = useDocumentStore
      .getState()
      .documents.find((d) => d._id === 'doc-with-ai');
    expect(savedDoc?.versions[0].aiModel).toBe('grok');
  });

  it('restoreVersion does nothing when document not found', () => {
    act(() => {
      useDocumentStore.getState().restoreVersion('nonexistent-doc', 'v_1');
    });
    // No error, state unchanged
    expect(useDocumentStore.getState().documents).toHaveLength(0);
  });

  it('restoreVersion does nothing when version not found', () => {
    act(() => {
      useDocumentStore.getState().addDocument(makeDocument('doc-1'));
    });

    act(() => {
      useDocumentStore
        .getState()
        .restoreVersion('doc-1', 'v_nonexistent_version');
    });

    const doc = useDocumentStore
      .getState()
      .documents.find((d) => d._id === 'doc-1');
    // Document unchanged
    expect(doc?.versions).toHaveLength(0);
  });

  it('getVersions returns empty array for nonexistent document', () => {
    const versions = useDocumentStore.getState().getVersions('no-such-doc');
    expect(versions).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// ChatStore - additional branches
// ---------------------------------------------------------------------------

describe('useChatStore - additional', () => {
  beforeEach(() => {
    act(() => {
      useChatStore.setState({
        sessions: {},
        isStreaming: false,
        streamingMessage: '',
        shouldStopGeneration: false,
        error: null,
        agentMode: 'basic',
        agentStatus: null,
      });
    });
  });

  it('updateStreamingMessage updates streamingMessage', () => {
    act(() => {
      useChatStore.getState().updateStreamingMessage('Partial response...');
    });
    expect(useChatStore.getState().streamingMessage).toBe(
      'Partial response...'
    );
  });

  it('setStreaming false keeps shouldStopGeneration as false', () => {
    act(() => {
      useChatStore.getState().setStreaming(true);
      useChatStore.getState().setStreaming(false);
    });
    expect(useChatStore.getState().isStreaming).toBe(false);
    expect(useChatStore.getState().shouldStopGeneration).toBe(false);
  });

  it('setAgentStatus can be set to null', () => {
    act(() => {
      useChatStore.getState().setAgentStatus('Working...');
      useChatStore.getState().setAgentStatus(null);
    });
    expect(useChatStore.getState().agentStatus).toBeNull();
  });

  it('setError sets error message', () => {
    act(() => {
      useChatStore.getState().setError('Chat error');
    });
    expect(useChatStore.getState().error).toBe('Chat error');

    act(() => {
      useChatStore.getState().setError(null);
    });
    expect(useChatStore.getState().error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TaskStore - additional branches
// ---------------------------------------------------------------------------

describe('useTaskStore - additional', () => {
  beforeEach(() => {
    act(() => {
      useTaskStore.setState({
        tasks: [],
        currentTaskId: null,
        isTaskListOpen: false,
      });
      useDocumentStore.setState({
        documents: [],
        currentDocumentId: null,
        isGenerating: false,
        generationProgress: 0,
        generationSteps: [],
        currentStep: '',
        resourcesFound: 0,
        estimatedTime: null,
        error: null,
      });
      useResourceStore.setState({ resources: [], selectedResourceIds: [] });
      useChatStore.setState({
        sessions: {},
        isStreaming: false,
        streamingMessage: '',
        shouldStopGeneration: false,
        error: null,
        agentMode: 'basic',
        agentStatus: null,
      });
    });
  });

  it('setTaskListOpen sets isTaskListOpen directly', () => {
    act(() => {
      useTaskStore.getState().setTaskListOpen(true);
    });
    expect(useTaskStore.getState().isTaskListOpen).toBe(true);

    act(() => {
      useTaskStore.getState().setTaskListOpen(false);
    });
    expect(useTaskStore.getState().isTaskListOpen).toBe(false);
  });

  it('deleteTask preserves currentTaskId when different task is deleted', () => {
    const task1 = makeTask('task-1');
    const task2 = makeTask('task-2');
    act(() => {
      useTaskStore.getState().addTask(task1);
      useTaskStore.getState().addTask(task2);
      useTaskStore.getState().setCurrentTask('task-1');
    });

    act(() => {
      useTaskStore.getState().deleteTask('task-2');
    });

    expect(useTaskStore.getState().currentTaskId).toBe('task-1');
    expect(useTaskStore.getState().tasks).toHaveLength(1);
  });

  it('updateTask without context updates fields but keeps existing context', () => {
    const task = makeTask('task-1');
    task.context.resourceIds = ['r1', 'r2'];

    act(() => {
      useTaskStore.getState().addTask(task);
    });

    act(() => {
      useTaskStore.getState().updateTask('task-1', {
        title: 'Updated Title',
      });
    });

    const updated = useTaskStore
      .getState()
      .tasks.find((t) => t._id === 'task-1');
    expect(updated?.title).toBe('Updated Title');
    expect(updated?.context.resourceIds).toEqual(['r1', 'r2']);
  });

  it('restoreTaskContext does nothing when task not found', () => {
    act(() => {
      useTaskStore.getState().restoreTaskContext('nonexistent-task');
    });
    // No error thrown
    expect(useTaskStore.getState().currentTaskId).toBeNull();
  });

  it('restoreTaskContext restores resource selection', () => {
    const resource1 = makeResource('r1');
    const resource2 = makeResource('r2');

    act(() => {
      useResourceStore.getState().addResource(resource1);
      useResourceStore.getState().addResource(resource2);
      useResourceStore.getState().selectResource('r1');
    });

    const task = makeTask('task-restore');
    task.context.resourceIds = ['r2'];

    act(() => {
      useTaskStore.getState().addTask(task);
    });

    act(() => {
      useTaskStore.getState().restoreTaskContext('task-restore');
    });

    expect(useResourceStore.getState().selectedResourceIds).toEqual(['r2']);
    expect(useTaskStore.getState().currentTaskId).toBe('task-restore');
  });

  it('restoreTaskContext with documentId and existing document updates content', () => {
    const doc = makeDocument('doc-restore');
    const newContent = { text: 'Restored content from task context' };
    const newMetadata = { wordCount: 200, slideCount: 0 };

    act(() => {
      useDocumentStore.getState().addDocument(doc);
    });

    const task = makeTask('task-with-doc');
    task.context.documentId = 'doc-restore';
    task.context.documentContent = newContent as unknown as Document['content'];
    task.context.documentMetadata = newMetadata as Document['metadata'];
    task.context.chatMessages = [];

    act(() => {
      useTaskStore.getState().addTask(task);
    });

    act(() => {
      useTaskStore.getState().restoreTaskContext('task-with-doc');
    });

    const restoredDoc = useDocumentStore
      .getState()
      .documents.find((d) => d._id === 'doc-restore');
    expect(restoredDoc?.content).toEqual(newContent);
    expect(useDocumentStore.getState().currentDocumentId).toBe('doc-restore');
  });

  it('restoreTaskContext recreates document from snapshot when doc not in store', () => {
    const content = { text: 'Snapshot content' };
    const metadata = { wordCount: 150, slideCount: 0 };

    const task = makeTask('task-recreate');
    task.context.documentId = 'doc-snapshot';
    task.context.documentContent = content as unknown as Document['content'];
    task.context.documentMetadata = metadata as Document['metadata'];
    task.context.chatMessages = [];

    act(() => {
      useTaskStore.getState().addTask(task);
    });

    act(() => {
      useTaskStore.getState().restoreTaskContext('task-recreate');
    });

    const recreatedDoc = useDocumentStore
      .getState()
      .documents.find((d) => d._id === 'doc-snapshot');
    expect(recreatedDoc).toBeDefined();
    expect(recreatedDoc?._id).toBe('doc-snapshot');
    expect(useDocumentStore.getState().currentDocumentId).toBe('doc-snapshot');
  });

  it('restoreTaskContext maps summary/analysis task type to article document type', () => {
    const content = { text: 'Summary text' };
    const metadata = { wordCount: 100, slideCount: 0 };

    const task = makeTask('task-summary');
    task.type = 'summary';
    task.context.documentId = 'doc-summary';
    task.context.documentContent = content as unknown as Document['content'];
    task.context.documentMetadata = metadata as Document['metadata'];
    task.context.chatMessages = [];

    act(() => {
      useTaskStore.getState().addTask(task);
    });

    act(() => {
      useTaskStore.getState().restoreTaskContext('task-summary');
    });

    const recreatedDoc = useDocumentStore
      .getState()
      .documents.find((d) => d._id === 'doc-summary');
    expect(recreatedDoc?.type).toBe('article');
  });

  it('restoreTaskContext restores chat messages for existing documentId', () => {
    const doc = makeDocument('doc-chat');
    const msg1 = {
      id: 'msg-1',
      role: 'user' as const,
      content: 'Hello from task',
      timestamp: new Date(),
    };

    act(() => {
      useDocumentStore.getState().addDocument(doc);
    });

    const task = makeTask('task-chat');
    task.context.documentId = 'doc-chat';
    task.context.chatMessages = [msg1];

    act(() => {
      useTaskStore.getState().addTask(task);
    });

    act(() => {
      useTaskStore.getState().restoreTaskContext('task-chat');
    });

    const chatSessions = useChatStore.getState().sessions;
    expect(chatSessions['doc-chat']).toHaveLength(1);
    expect(chatSessions['doc-chat'][0].content).toBe('Hello from task');
  });

  it('restoreTaskContext with PPT document calculates slideCount', () => {
    const pptContent = {
      markdown:
        '## Slide 1\nContent\n## Slide 2\nMore content\n## Slide 3\nEnd',
    };
    const metadata = { wordCount: 50, slideCount: 1 };

    const task = makeTask('task-ppt');
    task.type = 'ppt';
    task.context.documentId = 'doc-ppt-restore';
    task.context.documentContent = pptContent as unknown as Document['content'];
    task.context.documentMetadata = metadata as Document['metadata'];
    task.context.chatMessages = [];

    const pptDoc = makeDocument('doc-ppt-restore', 'ppt');
    act(() => {
      useDocumentStore.getState().addDocument(pptDoc);
    });

    act(() => {
      useTaskStore.getState().addTask(task);
    });

    act(() => {
      useTaskStore.getState().restoreTaskContext('task-ppt');
    });

    const updatedDoc = useDocumentStore
      .getState()
      .documents.find((d) => d._id === 'doc-ppt-restore');
    // calculateSlideCount mock counts ## headers: 3 slides
    expect(updatedDoc?.metadata?.slideCount).toBe(3);
  });

  it('restoreTaskContext with documentVersions restores version history', () => {
    const content = { text: 'Versioned content' };
    const metadata = { wordCount: 100, slideCount: 0 };
    const versions = [
      {
        id: 'v_old_1',
        timestamp: new Date(),
        type: 'auto' as const,
        trigger: 'ai_generation' as const,
        content,
        metadata: { title: 'Old', wordCount: 80, slideCount: 0 },
      },
    ];

    const task = makeTask('task-versions');
    task.context.documentId = 'doc-versioned';
    task.context.documentContent = content as unknown as Document['content'];
    task.context.documentMetadata = metadata as Document['metadata'];
    task.context.documentVersions = versions as unknown as Document['versions'];
    task.context.chatMessages = [];

    act(() => {
      useTaskStore.getState().addTask(task);
    });

    act(() => {
      useTaskStore.getState().restoreTaskContext('task-versions');
    });

    const recreatedDoc = useDocumentStore
      .getState()
      .documents.find((d) => d._id === 'doc-versioned');
    expect(recreatedDoc?.versions).toHaveLength(1);
    expect(recreatedDoc?.currentVersionId).toBe('v_old_1');
  });
});

// ---------------------------------------------------------------------------
// UIStore - additional branches
// ---------------------------------------------------------------------------

describe('useUIStore - additional', () => {
  beforeEach(() => {
    act(() => {
      useUIStore.setState({
        middlePanelWidth: 650,
        resourceListCollapsed: false,
        selectedResourceIds: [],
        isLoading: false,
      });
    });
  });

  it('setLoading with message sets loadingMessage', () => {
    act(() => {
      useUIStore.getState().setLoading(true, 'Uploading files...');
    });
    const state = useUIStore.getState();
    expect(state.isLoading).toBe(true);
    expect(state.loadingMessage).toBe('Uploading files...');
  });

  it('setError with null message clears error', () => {
    act(() => {
      useUIStore.getState().setError('Some error', 'ERR_400');
      useUIStore.getState().setError(null);
    });
    expect(useUIStore.getState().error).toBeUndefined();
  });
});
