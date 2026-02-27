/**
 * Tests for stores/ai-writing/aiWritingStore.ts
 *
 * Covers state mutations, async actions, error handling, and edge cases
 * that were not covered by the existing 58.93% baseline.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module-level mocks (must be hoisted before any import)
// ---------------------------------------------------------------------------
vi.mock('@/lib/api/ai-writing', () => ({
  getProjects: vi.fn(),
  getProject: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
  getVolumes: vi.fn(),
  createVolume: vi.fn(),
  getChapter: vi.fn(),
  updateChapter: vi.fn(),
  createChapter: vi.fn(),
  getStoryBible: vi.fn(),
  updateStoryBible: vi.fn(),
  getCharacters: vi.fn(),
  createCharacter: vi.fn(),
  deleteCharacter: vi.fn(),
  startMission: vi.fn(),
  cancelMission: vi.fn(),
  getMissionStatus: vi.fn(),
  getProjectMissions: vi.fn(),
  forceCleanupStuckMissions: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
    }
  },
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Import AFTER mocks
// ---------------------------------------------------------------------------
import * as api from '@/lib/api/ai-writing';
import type { StoryBible, WritingProject } from '@/lib/api/ai-writing';
import { useAIWritingStore } from '../aiWritingStore';

const mockedApi = api as ReturnType<typeof vi.mocked<typeof api>>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeProject(overrides: Record<string, unknown> = {}): WritingProject {
  return {
    id: 'p1',
    name: 'Epic Fantasy',
    genre: 'Fantasy',
    status: 'WRITING',
    targetWords: 80000,
    currentWords: 0,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  } as unknown as WritingProject;
}

function makeVolume(overrides: Record<string, unknown> = {}) {
  return {
    id: 'v1',
    projectId: 'p1',
    title: 'Volume 1',
    volumeNumber: 1,
    chapters: [],
    ...overrides,
  };
}

function makeChapter(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ch1',
    volumeId: 'v1',
    title: 'Chapter 1',
    chapterNumber: 1,
    content: 'Once upon a time...',
    wordCount: 100,
    status: 'draft',
    ...overrides,
  };
}

function makeCharacter(overrides: Record<string, unknown> = {}) {
  return {
    id: 'char1',
    projectId: 'p1',
    name: 'Aragorn',
    role: 'hero',
    description: 'Ranger of the north',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.resetAllMocks();
  // Reset store to initial state before each test
  useAIWritingStore.getState().reset();
});

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe('initial state', () => {
  it('has empty projects list', () => {
    expect(useAIWritingStore.getState().projects).toEqual([]);
  });

  it('has null currentProject', () => {
    expect(useAIWritingStore.getState().currentProject).toBeNull();
  });

  it('has isMissionRunning = false', () => {
    expect(useAIWritingStore.getState().isMissionRunning).toBe(false);
  });

  it('has null error', () => {
    expect(useAIWritingStore.getState().error).toBeNull();
  });

  it('has missionProgress = 0', () => {
    expect(useAIWritingStore.getState().missionProgress).toBe(0);
  });

  it('has empty conversationHistory', () => {
    expect(useAIWritingStore.getState().conversationHistory).toEqual([]);
  });

  it('has isStuckMission = false', () => {
    expect(useAIWritingStore.getState().isStuckMission).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// fetchProjects
// ---------------------------------------------------------------------------

describe('fetchProjects', () => {
  it('loads projects into state on success', async () => {
    const projects = [
      makeProject(),
      makeProject({ id: 'p2', name: 'Sci-Fi Novel' }),
    ];
    mockedApi.getProjects.mockResolvedValue({
      items: projects,
      nextCursor: undefined,
    });

    await useAIWritingStore.getState().fetchProjects();

    expect(useAIWritingStore.getState().projects).toEqual(projects);
    expect(useAIWritingStore.getState().isLoadingProjects).toBe(false);
  });

  it('sets isLoadingProjects true during fetch', async () => {
    let resolveProjects: (v: {
      items: WritingProject[];
      nextCursor?: string;
    }) => void;
    mockedApi.getProjects.mockReturnValue(
      new Promise<{ items: WritingProject[]; nextCursor?: string }>((r) => {
        resolveProjects = r;
      })
    );

    const fetchPromise = useAIWritingStore.getState().fetchProjects();
    expect(useAIWritingStore.getState().isLoadingProjects).toBe(true);

    resolveProjects!({ items: [], nextCursor: undefined });
    await fetchPromise;
  });

  it('sets error on failure', async () => {
    mockedApi.getProjects.mockRejectedValue(new Error('Network error'));

    await useAIWritingStore.getState().fetchProjects();

    expect(useAIWritingStore.getState().error).toBe('Network error');
    expect(useAIWritingStore.getState().isLoadingProjects).toBe(false);
  });

  it('handles missing items field gracefully', async () => {
    mockedApi.getProjects.mockResolvedValue(
      {} as ReturnType<typeof api.getProjects> extends Promise<infer T>
        ? T
        : never
    );

    await useAIWritingStore.getState().fetchProjects();

    expect(useAIWritingStore.getState().projects).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// fetchProject
// ---------------------------------------------------------------------------

describe('fetchProject', () => {
  it('sets currentProject on success', async () => {
    const project = makeProject();
    mockedApi.getProject.mockResolvedValue(project);

    await useAIWritingStore.getState().fetchProject('p1');

    expect(useAIWritingStore.getState().currentProject).toEqual(project);
  });

  it('silent=true does not set loading state', async () => {
    mockedApi.getProject.mockResolvedValue(makeProject());

    await useAIWritingStore.getState().fetchProject('p1', true);

    // isLoadingProjects should still be false (silent mode)
    expect(useAIWritingStore.getState().isLoadingProjects).toBe(false);
  });

  it('silent=true ignores errors without setting error state', async () => {
    mockedApi.getProject.mockRejectedValue(new Error('Not found'));

    await useAIWritingStore.getState().fetchProject('p1', true);

    // Silent mode: error should not be set
    expect(useAIWritingStore.getState().error).toBeNull();
  });

  it('non-silent mode sets error on failure', async () => {
    mockedApi.getProject.mockRejectedValue(new Error('Server error'));

    await useAIWritingStore.getState().fetchProject('p1', false);

    expect(useAIWritingStore.getState().error).toBe('Server error');
    expect(useAIWritingStore.getState().currentProject).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// createProject
// ---------------------------------------------------------------------------

describe('createProject', () => {
  it('adds new project to the beginning of the list', async () => {
    const existing = makeProject({ id: 'p-old', name: 'Old Project' });
    useAIWritingStore.setState({ projects: [existing] });

    const newProject = makeProject({ id: 'p-new', name: 'New Project' });
    mockedApi.createProject.mockResolvedValue(newProject);

    const result = await useAIWritingStore
      .getState()
      .createProject({
        name: 'New Project',
        genre: 'Fantasy',
        targetWords: 80000,
      });

    const { projects } = useAIWritingStore.getState();
    expect(projects[0]).toEqual(newProject);
    expect(projects[1]).toEqual(existing);
    expect(result).toEqual(newProject);
  });

  it('throws and sets error on failure', async () => {
    mockedApi.createProject.mockRejectedValue(new Error('Validation failed'));

    await expect(
      useAIWritingStore
        .getState()
        .createProject({ name: '', genre: 'Fantasy', targetWords: 1000 })
    ).rejects.toThrow('Validation failed');

    expect(useAIWritingStore.getState().error).toBe('Validation failed');
  });
});

// ---------------------------------------------------------------------------
// updateProject
// ---------------------------------------------------------------------------

describe('updateProject', () => {
  it('updates the project in the list', async () => {
    const original = makeProject({ name: 'Old Name' });
    const updated = makeProject({ name: 'New Name' });
    useAIWritingStore.setState({ projects: [original] });
    mockedApi.updateProject.mockResolvedValue(updated);

    await useAIWritingStore
      .getState()
      .updateProject('p1', { name: 'New Name' });

    expect(useAIWritingStore.getState().projects[0].name).toBe('New Name');
  });

  it('updates currentProject if it matches the updated project', async () => {
    const original = makeProject({ name: 'Old' });
    const updated = makeProject({ name: 'Updated' });
    useAIWritingStore.setState({
      projects: [original],
      currentProject: original,
    });
    mockedApi.updateProject.mockResolvedValue(updated);

    await useAIWritingStore.getState().updateProject('p1', { name: 'Updated' });

    expect(useAIWritingStore.getState().currentProject?.name).toBe('Updated');
  });

  it('does not change currentProject if different project updated', async () => {
    const current = makeProject({ id: 'p1', name: 'Current' });
    const other = makeProject({ id: 'p2', name: 'Other' });
    const updatedOther = makeProject({ id: 'p2', name: 'Updated Other' });
    useAIWritingStore.setState({
      projects: [current, other] as ReturnType<typeof makeProject>[],
      currentProject: current,
    });
    mockedApi.updateProject.mockResolvedValue(updatedOther);

    await useAIWritingStore
      .getState()
      .updateProject('p2', { name: 'Updated Other' });

    expect(useAIWritingStore.getState().currentProject?.name).toBe('Current');
  });
});

// ---------------------------------------------------------------------------
// deleteProject
// ---------------------------------------------------------------------------

describe('deleteProject', () => {
  it('removes the project from the list', async () => {
    const p1 = makeProject({ id: 'p1' });
    const p2 = makeProject({ id: 'p2' });
    useAIWritingStore.setState({
      projects: [p1, p2] as ReturnType<typeof makeProject>[],
    });
    mockedApi.deleteProject.mockResolvedValue(
      undefined as ReturnType<typeof api.deleteProject> extends Promise<infer T>
        ? T
        : never
    );

    await useAIWritingStore.getState().deleteProject('p1');

    const { projects } = useAIWritingStore.getState();
    expect(projects).toHaveLength(1);
    expect(projects[0].id).toBe('p2');
  });

  it('clears currentProject if it was deleted', async () => {
    const project = makeProject();
    useAIWritingStore.setState({
      currentProject: project,
      projects: [project] as ReturnType<typeof makeProject>[],
    });
    mockedApi.deleteProject.mockResolvedValue(
      undefined as ReturnType<typeof api.deleteProject> extends Promise<infer T>
        ? T
        : never
    );

    await useAIWritingStore.getState().deleteProject('p1');

    expect(useAIWritingStore.getState().currentProject).toBeNull();
  });

  it('sets error on failure', async () => {
    mockedApi.deleteProject.mockRejectedValue(new Error('Delete failed'));

    await expect(
      useAIWritingStore.getState().deleteProject('p1')
    ).rejects.toThrow();
    expect(useAIWritingStore.getState().error).toBe('Delete failed');
  });
});

// ---------------------------------------------------------------------------
// setCurrentProject
// ---------------------------------------------------------------------------

describe('setCurrentProject', () => {
  it('sets a project as current', () => {
    const project = makeProject();
    useAIWritingStore.getState().setCurrentProject(project);
    expect(useAIWritingStore.getState().currentProject).toEqual(project);
  });

  it('sets currentProject to null', () => {
    useAIWritingStore.setState({ currentProject: makeProject() });
    useAIWritingStore.getState().setCurrentProject(null);
    expect(useAIWritingStore.getState().currentProject).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// fetchVolumes
// ---------------------------------------------------------------------------

describe('fetchVolumes', () => {
  it('loads volumes on success', async () => {
    const volumes = [makeVolume()];
    mockedApi.getVolumes.mockResolvedValue(
      volumes as ReturnType<typeof api.getVolumes> extends Promise<infer T>
        ? T
        : never
    );

    await useAIWritingStore.getState().fetchVolumes('p1');

    expect(useAIWritingStore.getState().volumes).toEqual(volumes);
  });

  it('silent=false shows loading state', async () => {
    mockedApi.getVolumes.mockResolvedValue([]);

    await useAIWritingStore.getState().fetchVolumes('p1', false);

    expect(useAIWritingStore.getState().isLoadingVolumes).toBe(false);
  });

  it('silent=true does not set loading state on error', async () => {
    mockedApi.getVolumes.mockRejectedValue(new Error('Network error'));

    await useAIWritingStore.getState().fetchVolumes('p1', true);

    // Silent mode: error should not propagate to state
    expect(useAIWritingStore.getState().error).toBeNull();
  });

  it('sets error on non-silent failure', async () => {
    mockedApi.getVolumes.mockRejectedValue(new Error('Volumes not found'));

    await useAIWritingStore.getState().fetchVolumes('p1', false);

    expect(useAIWritingStore.getState().error).toBe('Volumes not found');
  });
});

// ---------------------------------------------------------------------------
// createVolume
// ---------------------------------------------------------------------------

describe('createVolume', () => {
  it('appends new volume to the list', async () => {
    const existing = makeVolume({ id: 'v1' });
    const newVol = makeVolume({ id: 'v2', title: 'Volume 2', volumeNumber: 2 });
    useAIWritingStore.setState({
      volumes: [existing] as ReturnType<typeof makeVolume>[],
    });
    mockedApi.createVolume.mockResolvedValue(
      newVol as ReturnType<typeof api.createVolume> extends Promise<infer T>
        ? T
        : never
    );

    const result = await useAIWritingStore
      .getState()
      .createVolume('p1', { title: 'Volume 2', volumeNumber: 2 });

    expect(useAIWritingStore.getState().volumes).toHaveLength(2);
    expect(result).toEqual(newVol);
  });
});

// ---------------------------------------------------------------------------
// fetchChapter
// ---------------------------------------------------------------------------

describe('fetchChapter', () => {
  it('sets currentChapter on success', async () => {
    const chapter = makeChapter();
    mockedApi.getChapter.mockResolvedValue(
      chapter as ReturnType<typeof api.getChapter> extends Promise<infer T>
        ? T
        : never
    );

    await useAIWritingStore.getState().fetchChapter('ch1');

    expect(useAIWritingStore.getState().currentChapter).toEqual(chapter);
  });

  it('sets error on failure', async () => {
    mockedApi.getChapter.mockRejectedValue(new Error('Chapter not found'));

    await useAIWritingStore.getState().fetchChapter('ch1');

    expect(useAIWritingStore.getState().error).toBe('Chapter not found');
  });
});

// ---------------------------------------------------------------------------
// updateChapter
// ---------------------------------------------------------------------------

describe('updateChapter', () => {
  it('updates chapter in volumes and currentChapter', async () => {
    const chapter = makeChapter();
    const volume = makeVolume({ chapters: [chapter] });
    const updatedChapter = makeChapter({
      content: 'Updated content',
      wordCount: 200,
    });
    useAIWritingStore.setState({
      volumes: [volume] as ReturnType<typeof makeVolume>[],
      currentChapter: chapter,
    });
    mockedApi.updateChapter.mockResolvedValue(
      updatedChapter as ReturnType<typeof api.updateChapter> extends Promise<
        infer T
      >
        ? T
        : never
    );

    await useAIWritingStore.getState().updateChapter('ch1', 'Updated content');

    const { volumes, currentChapter } = useAIWritingStore.getState();
    expect(volumes[0].chapters?.[0].content).toBe('Updated content');
    expect(currentChapter?.content).toBe('Updated content');
  });

  it('throws and sets error on failure', async () => {
    mockedApi.updateChapter.mockRejectedValue(new Error('Update failed'));

    await expect(
      useAIWritingStore.getState().updateChapter('ch1', 'content')
    ).rejects.toThrow('Update failed');
    expect(useAIWritingStore.getState().error).toBe('Update failed');
  });
});

// ---------------------------------------------------------------------------
// createChapter
// ---------------------------------------------------------------------------

describe('createChapter', () => {
  it('adds chapter to correct volume', async () => {
    const vol1 = makeVolume({ id: 'v1', chapters: [] });
    const vol2 = makeVolume({ id: 'v2', chapters: [] });
    const newChapter = makeChapter({ volumeId: 'v1' });
    useAIWritingStore.setState({
      volumes: [vol1, vol2] as ReturnType<typeof makeVolume>[],
    });
    mockedApi.createChapter.mockResolvedValue(
      newChapter as ReturnType<typeof api.createChapter> extends Promise<
        infer T
      >
        ? T
        : never
    );

    await useAIWritingStore
      .getState()
      .createChapter('v1', { title: 'Chapter 1', chapterNumber: 1 });

    const { volumes } = useAIWritingStore.getState();
    expect(volumes.find((v) => v.id === 'v1')?.chapters).toHaveLength(1);
    expect(volumes.find((v) => v.id === 'v2')?.chapters).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// setCurrentChapter
// ---------------------------------------------------------------------------

describe('setCurrentChapter', () => {
  it('sets a chapter as current', () => {
    const chapter = makeChapter();
    useAIWritingStore.getState().setCurrentChapter(chapter);
    expect(useAIWritingStore.getState().currentChapter).toEqual(chapter);
  });

  it('clears currentChapter when null passed', () => {
    useAIWritingStore.setState({ currentChapter: makeChapter() });
    useAIWritingStore.getState().setCurrentChapter(null);
    expect(useAIWritingStore.getState().currentChapter).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// fetchStoryBible
// ---------------------------------------------------------------------------

describe('fetchStoryBible', () => {
  it('sets storyBible on success', async () => {
    const bible = {
      id: 'bible-1',
      projectId: 'p1',
      premise: 'A world of magic',
    };
    mockedApi.getStoryBible.mockResolvedValue(
      bible as ReturnType<typeof api.getStoryBible> extends Promise<infer T>
        ? T
        : never
    );

    await useAIWritingStore.getState().fetchStoryBible('p1');

    expect(useAIWritingStore.getState().storyBible).toEqual(bible);
    expect(useAIWritingStore.getState().isLoadingBible).toBe(false);
  });

  it('sets storyBible to null on error (expected when bible not created yet)', async () => {
    mockedApi.getStoryBible.mockRejectedValue(new Error('Not found'));

    await useAIWritingStore.getState().fetchStoryBible('p1');

    expect(useAIWritingStore.getState().storyBible).toBeNull();
    expect(useAIWritingStore.getState().isLoadingBible).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// updateStoryBible
// ---------------------------------------------------------------------------

describe('updateStoryBible', () => {
  it('updates storyBible in state', async () => {
    const updated = {
      id: 'bible-1',
      projectId: 'p1',
      premise: 'Updated premise',
    };
    mockedApi.updateStoryBible.mockResolvedValue(
      updated as ReturnType<typeof api.updateStoryBible> extends Promise<
        infer T
      >
        ? T
        : never
    );

    await useAIWritingStore
      .getState()
      .updateStoryBible('p1', { premise: 'Updated premise' });

    expect(useAIWritingStore.getState().storyBible).toEqual(updated);
  });

  it('throws and sets error on failure', async () => {
    mockedApi.updateStoryBible.mockRejectedValue(new Error('Save failed'));

    await expect(
      useAIWritingStore.getState().updateStoryBible('p1', {})
    ).rejects.toThrow('Save failed');
    expect(useAIWritingStore.getState().error).toBe('Save failed');
  });
});

// ---------------------------------------------------------------------------
// fetchCharacters
// ---------------------------------------------------------------------------

describe('fetchCharacters', () => {
  it('sets characters on success', async () => {
    const chars = [
      makeCharacter(),
      makeCharacter({ id: 'char2', name: 'Legolas' }),
    ];
    mockedApi.getCharacters.mockResolvedValue(
      chars as ReturnType<typeof api.getCharacters> extends Promise<infer T>
        ? T
        : never
    );

    await useAIWritingStore.getState().fetchCharacters('p1');

    expect(useAIWritingStore.getState().characters).toEqual(chars);
  });

  it('sets error on failure', async () => {
    mockedApi.getCharacters.mockRejectedValue(new Error('Fetch error'));

    await useAIWritingStore.getState().fetchCharacters('p1');

    expect(useAIWritingStore.getState().error).toBe('Fetch error');
  });
});

// ---------------------------------------------------------------------------
// createCharacter
// ---------------------------------------------------------------------------

describe('createCharacter', () => {
  it('appends character to the list', async () => {
    const existing = makeCharacter({ id: 'char1', name: 'Aragorn' });
    const newChar = makeCharacter({ id: 'char2', name: 'Legolas' });
    useAIWritingStore.setState({
      characters: [existing] as ReturnType<typeof makeCharacter>[],
    });
    mockedApi.createCharacter.mockResolvedValue(
      newChar as ReturnType<typeof api.createCharacter> extends Promise<infer T>
        ? T
        : never
    );

    const result = await useAIWritingStore.getState().createCharacter('p1', {
      name: 'Legolas',
      role: 'hero',
      description: 'Elf archer',
    } as Parameters<typeof api.createCharacter>[1]);

    expect(useAIWritingStore.getState().characters).toHaveLength(2);
    expect(result).toEqual(newChar);
  });
});

// ---------------------------------------------------------------------------
// deleteCharacter
// ---------------------------------------------------------------------------

describe('deleteCharacter', () => {
  it('removes character from the list', async () => {
    const char1 = makeCharacter({ id: 'char1' });
    const char2 = makeCharacter({ id: 'char2', name: 'Legolas' });
    useAIWritingStore.setState({
      characters: [char1, char2] as ReturnType<typeof makeCharacter>[],
    });
    mockedApi.deleteCharacter.mockResolvedValue(
      undefined as ReturnType<typeof api.deleteCharacter> extends Promise<
        infer T
      >
        ? T
        : never
    );

    await useAIWritingStore.getState().deleteCharacter('p1', 'char1');

    const { characters } = useAIWritingStore.getState();
    expect(characters).toHaveLength(1);
    expect(characters[0].id).toBe('char2');
  });

  it('sets error on failure', async () => {
    mockedApi.deleteCharacter.mockRejectedValue(new Error('Delete failed'));

    await expect(
      useAIWritingStore.getState().deleteCharacter('p1', 'char1')
    ).rejects.toThrow('Delete failed');
    expect(useAIWritingStore.getState().error).toBe('Delete failed');
  });
});

// ---------------------------------------------------------------------------
// startMission
// ---------------------------------------------------------------------------

describe('startMission', () => {
  it('sets isMissionRunning=true and initial orchestrator state on call', async () => {
    mockedApi.startMission.mockResolvedValue({
      missionId: 'm1',
      success: true,
      projectId: 'p1',
      message: 'Started',
      missionType: 'world-building',
    });
    // getMissionStatus needs to be set up so pollMissionStatus doesn't loop
    mockedApi.getMissionStatus.mockResolvedValue({
      id: 'm1',
      status: 'COMPLETED',
      result: {},
      orchestratorState: {
        completedSteps: [],
        currentSteps: [],
        progress: 100,
      },
    } as unknown as ReturnType<typeof api.getMissionStatus> extends Promise<
      infer T
    >
      ? T
      : never);
    mockedApi.getVolumes.mockResolvedValue([]);
    mockedApi.getProject.mockResolvedValue(makeProject());

    await useAIWritingStore
      .getState()
      .startMission('p1', {
        prompt: 'Write chapter 1',
        missionType: 'chapter',
      });

    // Should have been set during the call
    expect(mockedApi.startMission).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ prompt: 'Write chapter 1' })
    );
  });

  it('sets error and isMissionRunning=false when startMission API fails', async () => {
    mockedApi.startMission.mockRejectedValue(
      new Error('Mission creation failed')
    );

    await expect(
      useAIWritingStore
        .getState()
        .startMission('p1', { prompt: 'Write', missionType: 'chapter' })
    ).rejects.toThrow('Mission creation failed');

    const state = useAIWritingStore.getState();
    expect(state.isMissionRunning).toBe(false);
    expect(state.error).toBe('Mission creation failed');
    expect(state.activeAgentIds).toEqual([]);
  });

  it('throws when no missionId returned', async () => {
    mockedApi.startMission.mockResolvedValue({
      missionId: '',
      success: false,
      projectId: 'p1',
      message: 'Error',
      missionType: 'chapter',
    });

    await expect(
      useAIWritingStore
        .getState()
        .startMission('p1', { prompt: 'Test', missionType: 'chapter' })
    ).rejects.toThrow('未获取到任务ID');
  });
});

// ---------------------------------------------------------------------------
// cancelMission
// ---------------------------------------------------------------------------

describe('cancelMission', () => {
  it('resets all mission state after cancel', async () => {
    useAIWritingStore.setState({
      isMissionRunning: true,
      currentMissionId: 'm1',
      missionProgress: 50,
      activeAgentIds: ['writer-1'],
    });
    mockedApi.cancelMission.mockResolvedValue(
      undefined as unknown as { success: boolean }
    );
    mockedApi.getProjectMissions.mockResolvedValue({
      items: [],
      total: 0,
    } as ReturnType<typeof api.getProjectMissions> extends Promise<infer T>
      ? T
      : never);
    mockedApi.forceCleanupStuckMissions.mockResolvedValue({
      cleaned: 0,
    } as unknown as {
      success: boolean;
      cleanedCount: number;
      message: string;
    });

    await useAIWritingStore.getState().cancelMission('p1');

    const state = useAIWritingStore.getState();
    expect(state.isMissionRunning).toBe(false);
    expect(state.currentMissionId).toBeNull();
    expect(state.missionProgress).toBe(0);
    expect(state.activeAgentIds).toEqual([]);
    expect(state.isStuckMission).toBe(false);
  });

  it('clears stuck mission state on cancel', async () => {
    useAIWritingStore.setState({
      isStuckMission: true,
      stuckMissionId: 'm1',
      currentMissionId: 'm1',
    });
    mockedApi.cancelMission.mockRejectedValue(new Error('already cancelled'));
    mockedApi.getProjectMissions.mockResolvedValue({
      items: [],
      total: 0,
    } as ReturnType<typeof api.getProjectMissions> extends Promise<infer T>
      ? T
      : never);
    mockedApi.forceCleanupStuckMissions.mockResolvedValue({
      cleaned: 1,
    } as unknown as {
      success: boolean;
      cleanedCount: number;
      message: string;
    });

    await useAIWritingStore.getState().cancelMission('p1');

    const state = useAIWritingStore.getState();
    expect(state.isStuckMission).toBe(false);
    expect(state.stuckMissionId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// clearStuckMission
// ---------------------------------------------------------------------------

describe('clearStuckMission', () => {
  it('resets stuck mission flags', () => {
    useAIWritingStore.setState({
      isStuckMission: true,
      stuckMissionId: 'm1',
      isMissionRunning: true,
      missionProgress: 50,
      missionMessage: 'Stuck',
    });

    useAIWritingStore.getState().clearStuckMission();

    const state = useAIWritingStore.getState();
    expect(state.isStuckMission).toBe(false);
    expect(state.stuckMissionId).toBeNull();
    expect(state.isMissionRunning).toBe(false);
    expect(state.missionProgress).toBe(0);
    expect(state.missionMessage).toBe('');
  });
});

// ---------------------------------------------------------------------------
// checkRunningMission
// ---------------------------------------------------------------------------

describe('checkRunningMission', () => {
  it('sets missionCompleted=true when a completed mission is found', async () => {
    mockedApi.getProjectMissions.mockResolvedValue({
      items: [{ id: 'm1', status: 'COMPLETED' }],
      total: 1,
    } as ReturnType<typeof api.getProjectMissions> extends Promise<infer T>
      ? T
      : never);

    await useAIWritingStore.getState().checkRunningMission('p1');

    const state = useAIWritingStore.getState();
    expect(state.missionCompleted).toBe(true);
    expect(state.missionProgress).toBe(100);
  });

  it('detects stuck mission (last update > 3 minutes ago)', async () => {
    const staleTime = new Date(Date.now() - 4 * 60 * 1000).toISOString();
    mockedApi.getProjectMissions.mockResolvedValue({
      items: [
        { id: 'm1', status: 'IN_PROGRESS', updatedAt: staleTime, progress: 30 },
      ],
      total: 1,
    } as ReturnType<typeof api.getProjectMissions> extends Promise<infer T>
      ? T
      : never);

    await useAIWritingStore.getState().checkRunningMission('p1');

    const state = useAIWritingStore.getState();
    expect(state.isStuckMission).toBe(true);
    expect(state.stuckMissionId).toBe('m1');
    expect(state.isMissionRunning).toBe(false);
  });

  it('ignores errors silently', async () => {
    mockedApi.getProjectMissions.mockRejectedValue(new Error('Network error'));

    await expect(
      useAIWritingStore.getState().checkRunningMission('p1')
    ).resolves.not.toThrow();

    // Error should not propagate to state
    expect(useAIWritingStore.getState().error).toBeNull();
  });

  it('does nothing when no missions exist', async () => {
    mockedApi.getProjectMissions.mockResolvedValue({
      items: [],
      total: 0,
    } as ReturnType<typeof api.getProjectMissions> extends Promise<infer T>
      ? T
      : never);

    await useAIWritingStore.getState().checkRunningMission('p1');

    const state = useAIWritingStore.getState();
    expect(state.isMissionRunning).toBe(false);
    expect(state.isStuckMission).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// conversationHistory
// ---------------------------------------------------------------------------

describe('addToConversationHistory', () => {
  it('appends messages to the history', () => {
    const msg1 = {
      role: 'user' as const,
      content: 'Hello',
      timestamp: '2024-01-01T00:00:00Z',
    };
    const msg2 = {
      role: 'assistant' as const,
      content: 'Hi there',
      timestamp: '2024-01-01T00:01:00Z',
    };

    useAIWritingStore.getState().addToConversationHistory(msg1);
    useAIWritingStore.getState().addToConversationHistory(msg2);

    const { conversationHistory } = useAIWritingStore.getState();
    expect(conversationHistory).toHaveLength(2);
    expect(conversationHistory[0].content).toBe('Hello');
    expect(conversationHistory[1].content).toBe('Hi there');
  });

  it('adds timestamp if not provided', () => {
    const msg = { role: 'user' as const, content: 'Test message' };
    useAIWritingStore.getState().addToConversationHistory(msg);

    const { conversationHistory } = useAIWritingStore.getState();
    expect(conversationHistory[0].timestamp).toBeTruthy();
  });
});

describe('clearConversationHistory', () => {
  it('empties the conversation history', () => {
    useAIWritingStore.setState({
      conversationHistory: [
        { role: 'user', content: 'Hello', timestamp: '2024-01-01T00:00:00Z' },
        { role: 'assistant', content: 'Hi', timestamp: '2024-01-01T00:01:00Z' },
      ],
    });

    useAIWritingStore.getState().clearConversationHistory();

    expect(useAIWritingStore.getState().conversationHistory).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// clearError
// ---------------------------------------------------------------------------

describe('clearError', () => {
  it('clears the error state', () => {
    useAIWritingStore.setState({ error: 'Something went wrong' });

    useAIWritingStore.getState().clearError();

    expect(useAIWritingStore.getState().error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// reset
// ---------------------------------------------------------------------------

describe('reset', () => {
  it('restores all state to initial values', () => {
    useAIWritingStore.setState({
      projects: [makeProject()] as ReturnType<typeof makeProject>[],
      currentProject: makeProject(),
      isMissionRunning: true,
      missionProgress: 75,
      error: 'Some error',
    });

    useAIWritingStore.getState().reset();

    const state = useAIWritingStore.getState();
    expect(state.projects).toEqual([]);
    expect(state.currentProject).toBeNull();
    expect(state.isMissionRunning).toBe(false);
    expect(state.missionProgress).toBe(0);
    expect(state.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// clearCurrentProjectData
// ---------------------------------------------------------------------------

describe('clearCurrentProjectData', () => {
  it('clears all project-specific state but keeps projects list', () => {
    const projects = [makeProject()];
    useAIWritingStore.setState({
      projects: projects,
      currentProject: makeProject(),
      volumes: [makeVolume()] as ReturnType<typeof makeVolume>[],
      currentChapter: makeChapter(),
      storyBible: { id: 'b1', projectId: 'p1' } as unknown as StoryBible,
      characters: [makeCharacter()] as ReturnType<typeof makeCharacter>[],
      isMissionRunning: true,
      currentMissionId: 'm1',
      missionProgress: 50,
      missionCompleted: true,
      conversationHistory: [
        { role: 'user', content: 'Hi', timestamp: '2024-01-01T00:00:00Z' },
      ],
    });

    useAIWritingStore.getState().clearCurrentProjectData();

    const state = useAIWritingStore.getState();
    // projects list should be preserved
    expect(state.projects).toHaveLength(1);
    // project-specific data should be cleared
    expect(state.currentProject).toBeNull();
    expect(state.volumes).toEqual([]);
    expect(state.currentChapter).toBeNull();
    expect(state.characters).toEqual([]);
    expect(state.isMissionRunning).toBe(false);
    expect(state.missionProgress).toBe(0);
    expect(state.missionCompleted).toBe(false);
    expect(state.conversationHistory).toEqual([]);
  });
});
