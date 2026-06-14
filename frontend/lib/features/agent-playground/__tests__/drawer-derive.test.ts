import { describe, expect, it } from 'vitest';
import { deriveDrawerSections, TOOL_LABEL } from '../drawer-derive';
import type {
  AgentLiveState,
  AgentTraceItem,
} from '../mission-presentation.types';

function agent(trace: AgentTraceItem[]): AgentLiveState {
  return {
    agentId: 'a1',
    role: 'researcher' as AgentLiveState['role'],
    phase: 'done' as AgentLiveState['phase'],
    trace,
  };
}

describe('deriveDrawerSections', () => {
  it('returns empty result for undefined agent', () => {
    const r = deriveDrawerSections(undefined);
    expect(r.findings).toEqual([]);
    expect(r.toolUsage).toEqual([]);
    expect(r.sources).toEqual([]);
    expect(r.searchCalls).toEqual([]);
    expect(r.totalTokens).toBe(0);
  });

  it('returns empty result for empty trace', () => {
    expect(deriveDrawerSections(agent([])).findings).toEqual([]);
  });

  it('extracts findings + summary from finalize observation output', () => {
    const r = deriveDrawerSections(
      agent([
        {
          kind: 'observation',
          ts: 1,
          output: {
            summary: 'A sufficiently long summary text',
            findings: [
              { claim: 'Claim A', evidence: 'Evidence A', source: 'src-1' },
              { claim: 'Claim B' },
              { claim: '' }, // empty claim skipped
              { notClaim: true }, // no claim skipped
              'not-an-object',
            ],
          },
        },
      ])
    );
    expect(r.findings).toHaveLength(2);
    expect(r.findings[0]).toEqual({
      claim: 'Claim A',
      evidence: 'Evidence A',
      source: 'src-1',
    });
    expect(r.findings[1]).toEqual({
      claim: 'Claim B',
      evidence: undefined,
      source: undefined,
    });
    expect(r.finalizeSummary).toBe('A sufficiently long summary text');
  });

  it('ignores too-short summary (<=8 chars)', () => {
    const r = deriveDrawerSections(
      agent([{ kind: 'observation', ts: 1, output: { summary: 'short' } }])
    );
    expect(r.finalizeSummary).toBeUndefined();
  });

  it('parses finalize output from JSON string', () => {
    const r = deriveDrawerSections(
      agent([
        {
          kind: 'observation',
          ts: 1,
          output: JSON.stringify({ findings: [{ claim: 'Parsed' }] }),
        },
      ])
    );
    expect(r.findings[0].claim).toBe('Parsed');
  });

  it('extracts finalize from action when no clean observation', () => {
    const r = deriveDrawerSections(
      agent([
        {
          kind: 'action',
          ts: 1,
          toolId: 'finalize',
          input: { findings: [{ claim: 'FromAction' }] },
        },
      ])
    );
    expect(r.findings[0].claim).toBe('FromAction');
  });

  it('aggregates tool usage with deduped samples capped at 3', () => {
    const trace: AgentTraceItem[] = [];
    for (const q of ['q1', 'q1', 'q2', 'q3', 'q4']) {
      trace.push({
        kind: 'action',
        ts: 1,
        toolId: 'web-search',
        input: { query: q },
      });
      trace.push({ kind: 'observation', ts: 2, output: { results: [] } });
    }
    const r = deriveDrawerSections(agent(trace));
    const ws = r.toolUsage.find((t) => t.toolId === 'web-search')!;
    expect(ws.callCount).toBe(5);
    expect(ws.samples).toEqual(['q1', 'q2', 'q3']);
  });

  it('collects sources from observation results + dedups with hit count', () => {
    const r = deriveDrawerSections(
      agent([
        { kind: 'action', ts: 1, toolId: 'web-search', input: { query: 'x' } },
        {
          kind: 'observation',
          ts: 2,
          output: {
            results: [
              { title: 'T1', url: 'https://www.example.com/a' },
              { title: 'T1b', url: 'https://www.example.com/a' },
              { url: 'https://other.org/b', description: 'desc' },
            ],
          },
        },
      ])
    );
    const a = r.sources.find((s) => s.url === 'https://www.example.com/a')!;
    expect(a.hits).toBe(2);
    expect(a.domain).toBe('example.com');
    const b = r.sources.find((s) => s.url === 'https://other.org/b')!;
    expect(b.hits).toBe(1);
  });

  it('uses url as query fallback when no query field', () => {
    const r = deriveDrawerSections(
      agent([
        {
          kind: 'action',
          ts: 1,
          toolId: 'web-scraper',
          input: { url: 'https://site.com' },
        },
        { kind: 'observation', ts: 2, output: {} },
      ])
    );
    expect(r.searchCalls[0].query).toBe('https://site.com');
  });

  it('unpacks parallel_tool_call into per-sub search calls', () => {
    const r = deriveDrawerSections(
      agent([
        {
          kind: 'action',
          ts: 1,
          toolId: 'parallel_tool_call',
          input: [
            { toolId: 'web-search', input: { query: 'pq1' } },
            { tool: 'arxiv-search', input: { url: 'https://arxiv.org/x' } },
            null,
            'bad',
          ],
        },
        {
          kind: 'observation',
          ts: 2,
          output: { items: [{ title: 'R', url: 'https://r.com' }] },
          latencyMs: 42,
        },
      ])
    );
    expect(r.searchCalls).toHaveLength(2);
    expect(r.searchCalls[0]).toMatchObject({
      toolId: 'web-search',
      query: 'pq1',
      latencyMs: 42,
    });
    expect(r.searchCalls[1]).toMatchObject({
      toolId: 'arxiv-search',
      query: 'https://arxiv.org/x',
    });
    expect(r.sources[0].url).toBe('https://r.com');
  });

  it('falls back to unknown toolId in parallel sub when missing', () => {
    const r = deriveDrawerSections(
      agent([
        {
          kind: 'action',
          ts: 1,
          toolId: 'parallel_tool_call',
          input: [{ input: {} }],
        },
        { kind: 'observation', ts: 2, output: {} },
      ])
    );
    expect(r.searchCalls[0].toolId).toBe('unknown');
  });

  it('captures observation error message and skips result collection', () => {
    const r = deriveDrawerSections(
      agent([
        { kind: 'action', ts: 1, toolId: 'web-search', input: { query: 'q' } },
        {
          kind: 'observation',
          ts: 2,
          error: 'boom',
          output: { results: [{ url: 'https://x.com' }] },
        },
      ])
    );
    expect(r.searchCalls[0].errorMessage).toBe('boom');
    expect(r.searchCalls[0].results).toEqual([]);
    expect(r.sources).toEqual([]);
  });

  it('parses content snippet (sliced) and nested string JSON results', () => {
    const long = 'c'.repeat(400);
    const r = deriveDrawerSections(
      agent([
        { kind: 'action', ts: 1, toolId: 'web-search', input: { query: 'q' } },
        {
          kind: 'observation',
          ts: 2,
          output: JSON.stringify({
            data: [{ title: 'X', url: 'https://x.com', content: long }],
          }),
        },
      ])
    );
    expect(r.searchCalls[0].results[0].snippet).toHaveLength(280);
  });

  it('sums tokensUsed across observations', () => {
    const r = deriveDrawerSections(
      agent([
        { kind: 'observation', ts: 1, tokensUsed: 100, output: {} },
        { kind: 'observation', ts: 2, tokensUsed: 50, output: {} },
      ])
    );
    expect(r.totalTokens).toBe(150);
  });

  it('skips invalid url for safeHost (no domain)', () => {
    const r = deriveDrawerSections(
      agent([
        { kind: 'action', ts: 1, toolId: 'web-search', input: { query: 'q' } },
        {
          kind: 'observation',
          ts: 2,
          output: { results: [{ url: 'not a url' }] },
        },
      ])
    );
    expect(r.sources[0].domain).toBeUndefined();
  });

  it('skips action items without toolId', () => {
    const r = deriveDrawerSections(
      agent([{ kind: 'action', ts: 1, input: { query: 'q' } }])
    );
    expect(r.toolUsage).toEqual([]);
  });
});

describe('TOOL_LABEL', () => {
  it('maps known tool ids', () => {
    expect(TOOL_LABEL['web-search'].label).toBe('网络搜索');
    expect(TOOL_LABEL.finalize.label).toBe('完成产出');
  });
});
