import { describe, expect, it, vi } from 'vitest';

const useMissionStreamMock = vi.fn(() => ({ events: [], connected: true }));
vi.mock('../useMissionStream', () => ({
  useMissionStream: (...args: unknown[]) => useMissionStreamMock(...args),
}));
vi.mock('@/services/agent-playground/api', () => ({
  replayMission: vi.fn(),
}));

import { useAgentPlaygroundStream } from '../useAgentPlaygroundStream';
import { replayMission } from '@/services/agent-playground/api';

describe('useAgentPlaygroundStream', () => {
  it('delegates to useMissionStream with playground namespace + replay', () => {
    const result = useAgentPlaygroundStream('m1');
    expect(useMissionStreamMock).toHaveBeenCalledWith('m1', {
      namespace: '/playground',
      replay: replayMission,
    });
    expect(result).toEqual({ events: [], connected: true });
  });

  it('passes null missionId through', () => {
    useAgentPlaygroundStream(null);
    expect(useMissionStreamMock).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ namespace: '/playground' })
    );
  });
});
