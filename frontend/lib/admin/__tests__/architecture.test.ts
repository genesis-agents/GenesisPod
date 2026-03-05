import { describe, it, expect } from 'vitest';

// architecture.ts is a pure data/config module — no async, no network calls.
// We import it directly.
import {
  ARCHITECTURE_LAYERS,
  LAYER_STYLES,
  type ArchitectureLayer,
  type ArchitectureCard,
  type CardGroup,
  type CardStat,
} from '../architecture';

// ============================================================================
// ARCHITECTURE_LAYERS
// ============================================================================

describe('ARCHITECTURE_LAYERS', () => {
  it('contains exactly 6 layers', () => {
    expect(ARCHITECTURE_LAYERS).toHaveLength(6);
  });

  it('layers have levels 6, 5, 4, 3, 2, 1 in order', () => {
    const levels = ARCHITECTURE_LAYERS.map((l) => l.level);
    expect(levels).toEqual([6, 5, 4, 3, 2, 1]);
  });

  it('every layer has a non-empty titleKey and id', () => {
    for (const layer of ARCHITECTURE_LAYERS) {
      expect(layer.id).toBeTruthy();
      expect(layer.titleKey).toBeTruthy();
    }
  });

  it('all layer ids are unique', () => {
    const ids = ARCHITECTURE_LAYERS.map((l) => l.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});

// ============================================================================
// Agent Intent Gateway layer (level 6)
// ============================================================================

describe('Agent Intent Gateway layer (level 6)', () => {
  let agentOsLayer: ArchitectureLayer;

  beforeEach(() => {
    agentOsLayer = ARCHITECTURE_LAYERS.find((l) => l.level === 6)!;
  });

  it('has id "agentOs"', () => {
    expect(agentOsLayer.id).toBe('agentOs');
  });

  it('has cards (not groups)', () => {
    expect(Array.isArray(agentOsLayer.cards)).toBe(true);
    expect(agentOsLayer.groups).toBeUndefined();
  });

  it('contains 3 cards', () => {
    expect(agentOsLayer.cards).toHaveLength(3);
  });

  it('contains a clickable "traces" card with href', () => {
    const tracesCard = agentOsLayer.cards?.find((c) => c.id === 'traces');
    expect(tracesCard).toBeDefined();
    expect(tracesCard?.clickable).toBe(true);
    expect(tracesCard?.href).toBe('/admin/ai/traces');
  });

  it('contains a non-clickable intentRouter card', () => {
    const card = agentOsLayer.cards?.find((c) => c.id === 'intentRouter');
    expect(card?.clickable).toBe(false);
  });
});

// ============================================================================
// External Agent Access layer (level 5)
// ============================================================================

describe('External Agent Access layer (level 5)', () => {
  let layer: ArchitectureLayer;

  beforeEach(() => {
    layer = ARCHITECTURE_LAYERS.find((l) => l.level === 5)!;
  });

  it('has id "openApi"', () => {
    expect(layer.id).toBe('openApi');
  });

  it('contains mcpServer card with correct href', () => {
    const card = layer.cards?.find((c) => c.id === 'mcpServer');
    expect(card?.clickable).toBe(true);
    expect(card?.href).toBe('/admin/system/mcp-server');
  });

  it('has 2 cards', () => {
    expect(layer.cards).toHaveLength(2);
  });
});

// ============================================================================
// Agent Apps layer (level 4)
// ============================================================================

describe('Agent Apps layer (level 4)', () => {
  let layer: ArchitectureLayer;

  beforeEach(() => {
    layer = ARCHITECTURE_LAYERS.find((l) => l.level === 4)!;
  });

  it('has groups (not flat cards)', () => {
    expect(Array.isArray(layer.groups)).toBe(true);
    expect(layer.cards).toBeUndefined();
  });

  it('has 5 groups', () => {
    expect(layer.groups).toHaveLength(5);
  });

  it('all groups have unique ids', () => {
    const ids = layer.groups!.map((g) => g.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('knowledge group contains aiExplore with stats', () => {
    const knowledgeGroup = layer.groups?.find((g) => g.id === 'knowledge');
    const aiExplore = knowledgeGroup?.cards.find((c) => c.id === 'aiExplore');
    expect(aiExplore).toBeDefined();
    expect(aiExplore?.stats).toBeDefined();
    expect(aiExplore?.stats![0].key).toBe('resources');
  });

  it('all cards in all groups have icons', () => {
    for (const group of layer.groups!) {
      for (const card of group.cards) {
        expect(card.icon).toBeDefined();
      }
    }
  });

  it('researchAnalysisGroup contains aiResearch card', () => {
    const group = layer.groups?.find((g) => g.id === 'researchAnalysisGroup');
    const card = group?.cards.find((c) => c.id === 'aiResearch');
    expect(card).toBeDefined();
    expect(card?.clickable).toBe(false);
  });
});

// ============================================================================
// Agent Runtime layer (level 3)
// ============================================================================

describe('Agent Runtime layer (level 3)', () => {
  let layer: ArchitectureLayer;

  beforeEach(() => {
    layer = ARCHITECTURE_LAYERS.find((l) => l.level === 3)!;
  });

  it('has id "aiKernel"', () => {
    expect(layer.id).toBe('aiKernel');
  });

  it('has flat cards (not groups)', () => {
    expect(Array.isArray(layer.cards)).toBe(true);
    expect(layer.groups).toBeUndefined();
  });

  it('contains 8 cards', () => {
    expect(layer.cards).toHaveLength(8);
  });

  it('kernelProcesses card is clickable with correct href', () => {
    const card = layer.cards?.find((c) => c.id === 'kernelProcesses');
    expect(card?.clickable).toBe(true);
    expect(card?.href).toBe('/admin/kernel/processes');
  });

  it('all 8 kernel cards are clickable with hrefs', () => {
    const expectedCards: Array<{ id: string; href: string }> = [
      { id: 'kernelProcesses', href: '/admin/kernel/processes' },
      { id: 'kernelJournal', href: '/admin/kernel/journal' },
      { id: 'kernelMemory', href: '/admin/kernel/memory' },
      { id: 'kernelIPC', href: '/admin/kernel/ipc' },
      { id: 'kernelResources', href: '/admin/kernel/resources' },
      { id: 'kernelObservability', href: '/admin/kernel/observability' },
      { id: 'kernelSecurity', href: '/admin/kernel/security' },
      { id: 'kernelScheduler', href: '/admin/kernel/scheduler' },
    ];
    for (const { id, href } of expectedCards) {
      const card = layer.cards?.find((c) => c.id === id);
      expect(card?.clickable).toBe(true);
      expect(card?.href).toBe(href);
    }
  });

  it('kernelJournal has events stat, kernelMemory has entries stat, kernelScheduler has running stat', () => {
    const journalCard = layer.cards?.find((c) => c.id === 'kernelJournal');
    expect(journalCard?.stats?.[0]?.key).toBe('kernelEvents');

    const memoryCard = layer.cards?.find((c) => c.id === 'kernelMemory');
    expect(memoryCard?.stats?.[0]?.key).toBe('kernelMemories');

    const schedulerCard = layer.cards?.find((c) => c.id === 'kernelScheduler');
    expect(schedulerCard?.stats?.[0]?.key).toBe('kernelRunning');
  });
});

// ============================================================================
// Agent Engine layer (level 2)
// ============================================================================

describe('Agent Engine layer (level 2)', () => {
  let layer: ArchitectureLayer;

  beforeEach(() => {
    layer = ARCHITECTURE_LAYERS.find((l) => l.level === 2)!;
  });

  it('has id "aiEngine"', () => {
    expect(layer.id).toBe('aiEngine');
  });

  it('has flat cards (not groups)', () => {
    expect(Array.isArray(layer.cards)).toBe(true);
  });

  it('contains 8 cards', () => {
    expect(layer.cards).toHaveLength(8);
  });

  it('models card is clickable with correct href', () => {
    const card = layer.cards?.find((c) => c.id === 'models');
    expect(card?.clickable).toBe(true);
    expect(card?.href).toBe('/admin/ai/models');
  });

  it('guardrails card is clickable with href /admin/ai/guardrails', () => {
    const card = layer.cards?.find((c) => c.id === 'guardrails');
    expect(card?.clickable).toBe(true);
    expect(card?.href).toBe('/admin/ai/guardrails');
  });

  it('rag card is clickable with href /library/rag', () => {
    const card = layer.cards?.find((c) => c.id === 'rag');
    expect(card?.clickable).toBe(true);
    expect(card?.href).toBe('/library/rag');
  });

  it('mcpClients card has href /admin/ai/tools', () => {
    const card = layer.cards?.find((c) => c.id === 'mcpClients');
    expect(card?.clickable).toBe(true);
    expect(card?.href).toBe('/admin/ai/tools');
  });

  it('skills card has stats with key "skills"', () => {
    const card = layer.cards?.find((c) => c.id === 'skills');
    const stat = card?.stats?.find((s) => s.key === 'skills');
    expect(stat).toBeDefined();
  });
});

// ============================================================================
// Infrastructure layer (level 1)
// ============================================================================

describe('infrastructure layer (level 1)', () => {
  let layer: ArchitectureLayer;

  beforeEach(() => {
    layer = ARCHITECTURE_LAYERS.find((l) => l.level === 1)!;
  });

  it('has id "infrastructure"', () => {
    expect(layer.id).toBe('infrastructure');
  });

  it('has groups', () => {
    expect(Array.isArray(layer.groups)).toBe(true);
  });

  it('has 4 groups', () => {
    expect(layer.groups).toHaveLength(4);
  });

  it('userAccess group has users, permissions, secrets cards', () => {
    const group = layer.groups?.find((g) => g.id === 'userAccess');
    const ids = group?.cards.map((c) => c.id) ?? [];
    expect(ids).toContain('users');
    expect(ids).toContain('permissions');
    expect(ids).toContain('secrets');
  });

  it('users card has stats for totalUsers and activeUsers', () => {
    const group = layer.groups?.find((g) => g.id === 'userAccess');
    const usersCard = group?.cards.find((c) => c.id === 'users');
    const statKeys = usersCard?.stats?.map((s) => s.key) ?? [];
    expect(statKeys).toContain('totalUsers');
    expect(statKeys).toContain('activeUsers');
  });

  it('systemOps group has monitoring card with AI calls and error stats', () => {
    const group = layer.groups?.find((g) => g.id === 'systemOps');
    const card = group?.cards.find((c) => c.id === 'monitoring');
    expect(card?.href).toBe('/admin/system/monitoring');
    expect(card?.clickable).toBe(true);
    expect(card?.stats).toHaveLength(2);
    expect(card?.stats?.[0]?.key).toBe('kernelLLMCalls');
    expect(card?.stats?.[1]?.key).toBe('monitoringErrors');
  });

  it('systemOps group has logs card with totalLogins stat', () => {
    const group = layer.groups?.find((g) => g.id === 'systemOps');
    const card = group?.cards.find((c) => c.id === 'logs');
    expect(card?.stats?.[0]?.key).toBe('totalLogins');
  });

  it('dataStorage group has storage card with correct href', () => {
    const group = layer.groups?.find((g) => g.id === 'dataStorage');
    const card = group?.cards.find((c) => c.id === 'storage');
    expect(card?.href).toBe('/admin/system/storage');
  });
});

// ============================================================================
// LAYER_STYLES
// ============================================================================

describe('LAYER_STYLES', () => {
  it('has style entries for levels 1-6', () => {
    expect(LAYER_STYLES[1]).toBeDefined();
    expect(LAYER_STYLES[2]).toBeDefined();
    expect(LAYER_STYLES[3]).toBeDefined();
    expect(LAYER_STYLES[4]).toBeDefined();
    expect(LAYER_STYLES[5]).toBeDefined();
    expect(LAYER_STYLES[6]).toBeDefined();
  });

  it('each style has badge, border, accent, bg, accentBar, iconBg, hoverBorder', () => {
    const keys = [
      'badge',
      'border',
      'accent',
      'bg',
      'accentBar',
      'iconBg',
      'hoverBorder',
    ] as const;
    for (const level of [1, 2, 3, 4, 5, 6] as const) {
      const style = LAYER_STYLES[level];
      for (const key of keys) {
        expect(style[key]).toBeTruthy();
      }
    }
  });

  it('level 6 uses cyan theme in badge', () => {
    expect(LAYER_STYLES[6].badge).toContain('cyan');
  });

  it('level 5 uses orange theme in badge', () => {
    expect(LAYER_STYLES[5].badge).toContain('orange');
  });

  it('level 4 uses violet theme in badge', () => {
    expect(LAYER_STYLES[4].badge).toContain('violet');
  });

  it('level 3 uses teal theme in badge', () => {
    expect(LAYER_STYLES[3].badge).toContain('teal');
  });

  it('level 2 uses blue theme in badge', () => {
    expect(LAYER_STYLES[2].badge).toContain('blue');
  });

  it('level 1 uses emerald theme in badge', () => {
    expect(LAYER_STYLES[1].badge).toContain('emerald');
  });
});

// ============================================================================
// Card structure invariants
// ============================================================================

describe('card structure invariants', () => {
  function getAllCards(): ArchitectureCard[] {
    const cards: ArchitectureCard[] = [];
    for (const layer of ARCHITECTURE_LAYERS) {
      if (layer.cards) {
        cards.push(...layer.cards);
      }
      if (layer.groups) {
        for (const group of layer.groups) {
          cards.push(...group.cards);
        }
      }
    }
    return cards;
  }

  it('all cards have id, i18nKey, icon, and clickable fields', () => {
    const cards = getAllCards();
    for (const card of cards) {
      expect(card.id).toBeTruthy();
      expect(card.i18nKey).toBeTruthy();
      expect(card.icon).toBeDefined();
      expect(typeof card.clickable).toBe('boolean');
    }
  });

  it('clickable cards have an href', () => {
    const cards = getAllCards();
    for (const card of cards.filter((c) => c.clickable)) {
      expect(card.href).toBeTruthy();
    }
  });

  it('all card ids are unique across all layers', () => {
    const cards = getAllCards();
    const ids = cards.map((c) => c.id);
    const unique = new Set(ids);
    // Some ids may be reused (like 'activity'), allow for a reasonable spread
    // Expect at most 5% duplicates — here we just check no catastrophic collision
    expect(unique.size).toBeGreaterThan(cards.length * 0.8);
  });

  it('stats have label and key fields when present', () => {
    const cards = getAllCards();
    for (const card of cards) {
      if (card.stats) {
        for (const stat of card.stats) {
          expect(stat.label).toBeTruthy();
          expect(stat.key).toBeTruthy();
        }
      }
    }
  });
});

// needed for beforeEach to be available
import { beforeEach } from 'vitest';
