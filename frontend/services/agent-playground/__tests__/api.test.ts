import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/utils/config', () => ({
  config: { apiBaseUrl: 'http://test.local' },
}));
vi.mock('@/lib/utils/auth', () => ({
  getAuthHeader: () => ({ Authorization: 'Bearer tok' }),
}));
vi.mock('@/lib/utils/api-error', () => ({
  apiError: vi.fn(async (res: Response) => new Error(`apiError:${res.status}`)),
}));

import * as api from '../api';

const BASE = 'http://test.local/api/v1/playground';

/** Build a fake Response. */
function resp(
  body: unknown,
  opts: { ok?: boolean; status?: number; jsonThrows?: boolean } = {}
): Response {
  const { ok = true, status = 200, jsonThrows = false } = opts;
  return {
    ok,
    status,
    json: jsonThrows
      ? () => Promise.reject(new Error('bad json'))
      : () => Promise.resolve(body),
  } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('runTeam', () => {
  const input = { topic: 't', depth: 'quick', language: 'zh-CN' } as never;

  it('posts and returns unwrapped data', async () => {
    fetchMock.mockResolvedValue(
      resp({ success: true, data: { missionId: 'm1', streamNamespace: 'ns' } })
    );
    const r = await api.runTeam(input);
    expect(r.missionId).toBe('m1');
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/team/run`,
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('accepts unwrapped (no envelope) response', async () => {
    fetchMock.mockResolvedValue(
      resp({ missionId: 'm2', streamNamespace: 'ns' })
    );
    expect((await api.runTeam(input)).missionId).toBe('m2');
  });

  it('throws apiError when !ok', async () => {
    fetchMock.mockResolvedValue(resp({}, { ok: false, status: 500 }));
    await expect(api.runTeam(input)).rejects.toThrow('apiError:500');
  });

  it('throws on invalid JSON', async () => {
    fetchMock.mockResolvedValue(resp(null, { jsonThrows: true }));
    await expect(api.runTeam(input)).rejects.toThrow('invalid JSON');
  });

  it('throws when missionId missing/empty', async () => {
    fetchMock.mockResolvedValue(resp({ data: { missionId: '' } }));
    await expect(api.runTeam(input)).rejects.toThrow('missionId missing');
    fetchMock.mockResolvedValue(resp({ data: { missionId: 123 } }));
    await expect(api.runTeam(input)).rejects.toThrow('missionId missing');
  });
});

describe('listMissions', () => {
  it('returns items array', async () => {
    fetchMock.mockResolvedValue(resp({ data: { items: [{ id: 'a' }] } }));
    expect(await api.listMissions()).toHaveLength(1);
  });
  it('returns [] when items missing', async () => {
    fetchMock.mockResolvedValue(resp({ data: {} }));
    expect(await api.listMissions()).toEqual([]);
  });
  it('throws when !ok', async () => {
    fetchMock.mockResolvedValue(resp({}, { ok: false, status: 404 }));
    await expect(api.listMissions()).rejects.toThrow('404');
  });
});

describe('fetchBudgetTiers', () => {
  it('unwraps response', async () => {
    fetchMock.mockResolvedValue(resp({ data: { tiers: [], limits: {} } }));
    expect(await api.fetchBudgetTiers()).toEqual({ tiers: [], limits: {} });
  });
  it('throws when !ok', async () => {
    fetchMock.mockResolvedValue(resp({}, { ok: false, status: 503 }));
    await expect(api.fetchBudgetTiers()).rejects.toThrow('503');
  });
});

describe('listResumableMissions', () => {
  it('returns items', async () => {
    fetchMock.mockResolvedValue(
      resp({ data: { items: [{ missionId: 'm' }] } })
    );
    expect(await api.listResumableMissions()).toHaveLength(1);
  });
  it('returns [] when items not array', async () => {
    fetchMock.mockResolvedValue(resp({ data: { items: 'nope' } }));
    expect(await api.listResumableMissions()).toEqual([]);
  });
  it('throws when !ok', async () => {
    fetchMock.mockResolvedValue(resp({}, { ok: false, status: 500 }));
    await expect(api.listResumableMissions()).rejects.toThrow('500');
  });
});

describe('getMissionDetail', () => {
  it('returns mission', async () => {
    fetchMock.mockResolvedValue(resp({ data: { mission: { id: 'm' } } }));
    expect((await api.getMissionDetail('m')).id).toBe('m');
  });
  it('throws when mission missing', async () => {
    fetchMock.mockResolvedValue(resp({ data: {} }));
    await expect(api.getMissionDetail('m')).rejects.toThrow('not found');
  });
  it('throws when !ok', async () => {
    fetchMock.mockResolvedValue(resp({}, { ok: false, status: 404 }));
    await expect(api.getMissionDetail('m')).rejects.toThrow('404');
  });
});

describe('getMissionDetailView', () => {
  it('returns view and passes abort signal', async () => {
    fetchMock.mockResolvedValue(
      resp({ data: { view: { mission: { id: 'm' } } } })
    );
    const controller = new AbortController();
    const v = await api.getMissionDetailView('m', {
      signal: controller.signal,
    });
    expect(v.mission.id).toBe('m');
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/missions/m/view`,
      expect.objectContaining({ signal: controller.signal })
    );
  });
  it('works without opts', async () => {
    fetchMock.mockResolvedValue(
      resp({ data: { view: { mission: { id: 'x' } } } })
    );
    expect((await api.getMissionDetailView('x')).mission.id).toBe('x');
  });
  it('throws when view missing', async () => {
    fetchMock.mockResolvedValue(resp({ data: {} }));
    await expect(api.getMissionDetailView('m')).rejects.toThrow('not found');
  });
  it('throws when !ok', async () => {
    fetchMock.mockResolvedValue(resp({}, { ok: false, status: 500 }));
    await expect(api.getMissionDetailView('m')).rejects.toThrow('500');
  });
});

describe('rerunTodo / localRerunTodo', () => {
  const body = { origin: 'o', scope: 'dimension' } as never;
  it('rerunTodo returns unwrapped', async () => {
    fetchMock.mockResolvedValue(
      resp({ data: { missionId: 'm2', streamNamespace: 'n' } })
    );
    expect((await api.rerunTodo('m', 't', body)).missionId).toBe('m2');
  });
  it('rerunTodo throws when !ok', async () => {
    fetchMock.mockResolvedValue(resp({}, { ok: false, status: 400 }));
    await expect(api.rerunTodo('m', 't', body)).rejects.toThrow('apiError:400');
  });
  it('localRerunTodo returns unwrapped', async () => {
    fetchMock.mockResolvedValue(
      resp({ data: { ok: true, missionId: 'm', scope: 's', durationMs: 5 } })
    );
    expect((await api.localRerunTodo('m', 't', body)).durationMs).toBe(5);
  });
  it('localRerunTodo throws when !ok', async () => {
    fetchMock.mockResolvedValue(resp({}, { ok: false, status: 422 }));
    await expect(api.localRerunTodo('m', 't', body)).rejects.toThrow(
      'apiError:422'
    );
  });
});

describe('rerunMission', () => {
  it('appends mode query when provided', async () => {
    fetchMock.mockResolvedValue(
      resp({ data: { missionId: 'm', streamNamespace: 'n' } })
    );
    await api.rerunMission('m', 'fresh');
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/missions/m/rerun?mode=fresh`,
      expect.objectContaining({ method: 'POST' })
    );
  });
  it('omits mode query when not provided', async () => {
    fetchMock.mockResolvedValue(
      resp({ data: { missionId: 'm', streamNamespace: 'n' } })
    );
    await api.rerunMission('m');
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/missions/m/rerun`,
      expect.objectContaining({ method: 'POST' })
    );
  });
  it('throws when !ok', async () => {
    fetchMock.mockResolvedValue(resp({}, { ok: false, status: 409 }));
    await expect(api.rerunMission('m')).rejects.toThrow('apiError:409');
  });
});

describe('simple mutation endpoints', () => {
  it('deleteMission ok + error', async () => {
    fetchMock.mockResolvedValue(resp({ data: { ok: true } }));
    expect(await api.deleteMission('m')).toEqual({ ok: true });
    fetchMock.mockResolvedValue(resp({}, { ok: false, status: 500 }));
    await expect(api.deleteMission('m')).rejects.toThrow('apiError:500');
  });
  it('cleanupMissions ok + error', async () => {
    fetchMock.mockResolvedValue(resp({ data: { deleted: 3 } }));
    expect((await api.cleanupMissions()).deleted).toBe(3);
    fetchMock.mockResolvedValue(resp({}, { ok: false, status: 500 }));
    await expect(api.cleanupMissions()).rejects.toThrow('apiError:500');
  });
  it('updateMission ok + error', async () => {
    fetchMock.mockResolvedValue(resp({ data: { ok: true } }));
    expect(await api.updateMission('m', { topic: 'x' })).toEqual({ ok: true });
    fetchMock.mockResolvedValue(resp({}, { ok: false, status: 400 }));
    await expect(api.updateMission('m', {})).rejects.toThrow('apiError:400');
  });
  it('setVisibility ok + error', async () => {
    fetchMock.mockResolvedValue(
      resp({ data: { id: 'm', visibility: 'PUBLIC' } })
    );
    expect((await api.setVisibility('m', 'PUBLIC')).visibility).toBe('PUBLIC');
    fetchMock.mockResolvedValue(resp({}, { ok: false, status: 403 }));
    await expect(api.setVisibility('m', 'PUBLIC')).rejects.toThrow(
      'apiError:403'
    );
  });
  it('cancelMission ok + error', async () => {
    fetchMock.mockResolvedValue(
      resp({ data: { ok: true, status: 'cancelled' } })
    );
    expect((await api.cancelMission('m')).status).toBe('cancelled');
    fetchMock.mockResolvedValue(resp({}, { ok: false, status: 409 }));
    await expect(api.cancelMission('m')).rejects.toThrow('apiError:409');
  });
});

describe('leader chat', () => {
  it('listLeaderChat returns messages / [] / throws', async () => {
    fetchMock.mockResolvedValue(resp({ data: { messages: [{ id: '1' }] } }));
    expect(await api.listLeaderChat('m')).toHaveLength(1);
    fetchMock.mockResolvedValue(resp({ data: {} }));
    expect(await api.listLeaderChat('m')).toEqual([]);
    fetchMock.mockResolvedValue(resp({}, { ok: false, status: 500 }));
    await expect(api.listLeaderChat('m')).rejects.toThrow('500');
  });
  it('sendLeaderChat returns response / throws', async () => {
    fetchMock.mockResolvedValue(resp({ data: { user: {}, assistant: {} } }));
    expect(await api.sendLeaderChat('m', 'hi')).toHaveProperty('assistant');
    fetchMock.mockResolvedValue(resp({}, { ok: false, status: 400 }));
    await expect(api.sendLeaderChat('m', 'hi')).rejects.toThrow('apiError:400');
  });
});

describe('replayMission', () => {
  it('returns events; appends since query', async () => {
    fetchMock.mockResolvedValue(
      resp({ data: { events: [{ type: 'x' }], serverNow: 1 } })
    );
    const r = await api.replayMission('m', 123);
    expect(r.events).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/replay/m?since=123`,
      expect.anything()
    );
  });
  it('omits since query when undefined', async () => {
    fetchMock.mockResolvedValue(resp({ data: { events: [], serverNow: 1 } }));
    await api.replayMission('m');
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/replay/m`,
      expect.anything()
    );
  });
  it('throws when !ok', async () => {
    fetchMock.mockResolvedValue(resp({}, { ok: false, status: 500 }));
    await expect(api.replayMission('m')).rejects.toThrow('500');
  });
  it('throws on invalid JSON', async () => {
    fetchMock.mockResolvedValue(resp(null, { jsonThrows: true }));
    await expect(api.replayMission('m')).rejects.toThrow('invalid JSON');
  });
  it('throws when events not array', async () => {
    fetchMock.mockResolvedValue(resp({ data: { events: 'nope' } }));
    await expect(api.replayMission('m')).rejects.toThrow(
      'events array missing'
    );
  });
});

describe('report versions', () => {
  it('listReportVersions returns items / [] / throws', async () => {
    fetchMock.mockResolvedValue(resp({ data: { items: [{ version: 1 }] } }));
    expect(await api.listReportVersions('m')).toHaveLength(1);
    fetchMock.mockResolvedValue(resp({ data: { items: null } }));
    expect(await api.listReportVersions('m')).toEqual([]);
    fetchMock.mockResolvedValue(resp({}, { ok: false, status: 500 }));
    await expect(api.listReportVersions('m')).rejects.toThrow('500');
  });
  it('getReportVersion returns detail / throws', async () => {
    fetchMock.mockResolvedValue(resp({ data: { version: 2 } }));
    expect((await api.getReportVersion('m', 2)).version).toBe(2);
    fetchMock.mockResolvedValue(resp({}, { ok: false, status: 404 }));
    await expect(api.getReportVersion('m', 2)).rejects.toThrow('apiError:404');
  });
});

describe('mission dag + graph', () => {
  it('fetchMissionDag ok + error', async () => {
    fetchMock.mockResolvedValue(
      resp({ data: { missionId: 'm', nodes: [], edges: [] } })
    );
    expect((await api.fetchMissionDag('m')).missionId).toBe('m');
    fetchMock.mockResolvedValue(resp({}, { ok: false, status: 500 }));
    await expect(api.fetchMissionDag('m')).rejects.toThrow('500');
  });
  it('fetchMissionDagCascade ok + error', async () => {
    fetchMock.mockResolvedValue(
      resp({ data: { origin: 'o', willRerun: [], kept: [], rerunable: true } })
    );
    expect((await api.fetchMissionDagCascade('m', 'n')).origin).toBe('o');
    fetchMock.mockResolvedValue(resp({}, { ok: false, status: 500 }));
    await expect(api.fetchMissionDagCascade('m', 'n')).rejects.toThrow('500');
  });
  it('getMissionGraph ok + error', async () => {
    fetchMock.mockResolvedValue(
      resp({ data: { status: 'NONE', graph: null } })
    );
    expect((await api.getMissionGraph('m')).status).toBe('NONE');
    fetchMock.mockResolvedValue(resp({}, { ok: false, status: 500 }));
    await expect(api.getMissionGraph('m')).rejects.toThrow('apiError:500');
  });
  it('buildMissionGraph ok + error', async () => {
    fetchMock.mockResolvedValue(resp({ data: { status: 'READY' } }));
    expect((await api.buildMissionGraph('m')).status).toBe('READY');
    fetchMock.mockResolvedValue(resp({}, { ok: false, status: 500 }));
    await expect(api.buildMissionGraph('m')).rejects.toThrow('apiError:500');
  });
  it('enrichGraphNode ok + error', async () => {
    fetchMock.mockResolvedValue(resp({ data: { summary: 's' } }));
    expect(await api.enrichGraphNode('m', 'n')).toEqual({ summary: 's' });
    fetchMock.mockResolvedValue(resp({}, { ok: false, status: 500 }));
    await expect(api.enrichGraphNode('m', 'n')).rejects.toThrow('apiError:500');
  });
  it('fetchMissionDagReact ok + error', async () => {
    fetchMock.mockResolvedValue(
      resp({
        data: {
          nodeId: 'n',
          role: 'r',
          currentStep: 'idle',
          finalizeAttempts: 0,
          phase: 'pending',
        },
      })
    );
    expect((await api.fetchMissionDagReact('m', 'n')).nodeId).toBe('n');
    fetchMock.mockResolvedValue(resp({}, { ok: false, status: 500 }));
    await expect(api.fetchMissionDagReact('m', 'n')).rejects.toThrow('500');
  });
});

describe('unwrapStandard edge via listMissions', () => {
  it('handles non-object data field by treating raw as result', async () => {
    // data present but not an object → falls through to raw-as-T
    fetchMock.mockResolvedValue(
      resp({ success: true, data: 'scalar', items: [{ id: 'z' }] })
    );
    expect(await api.listMissions()).toHaveLength(1);
  });
});
