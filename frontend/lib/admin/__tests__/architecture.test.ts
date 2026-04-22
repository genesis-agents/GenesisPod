import { describe, it, expect, beforeEach } from 'vitest';

// architecture.ts is a pure data/config module — no async, no network calls.
// We import it directly.
import {
  ARCHITECTURE_LAYERS,
  LAYER_STYLES,
  type ArchitectureLayer,
  type ArchitectureCard,
} from '../architecture';

// ============================================================================
// ARCHITECTURE_LAYERS
// ============================================================================

describe('ARCHITECTURE_LAYERS', () => {
  it('contains exactly 5 layers (matches backend modules/: intent-gateway, open-api, ai-app, ai-engine, ai-infra)', () => {
    expect(ARCHITECTURE_LAYERS).toHaveLength(5);
  });

  it('layers have levels 5, 4, 3, 2, 1 in order (top → bottom)', () => {
    const levels = ARCHITECTURE_LAYERS.map((l) => l.level);
    expect(levels).toEqual([5, 4, 3, 2, 1]);
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
// Intent Gateway layer (level 5)
// ============================================================================

describe('Intent Gateway layer (level 5)', () => {
  let layer: ArchitectureLayer;

  beforeEach(() => {
    layer = ARCHITECTURE_LAYERS.find((l) => l.level === 5)!;
  });

  it('has id "intentGateway"', () => {
    expect(layer.id).toBe('intentGateway');
  });

  it('has cards (not groups)', () => {
    expect(Array.isArray(layer.cards)).toBe(true);
    expect(layer.groups).toBeUndefined();
  });

  it('contains 2 cards', () => {
    expect(layer.cards).toHaveLength(2);
  });

  it('contains a clickable intentRouter card with traces href', () => {
    const card = layer.cards?.find((c) => c.id === 'intentRouter');
    expect(card).toBeDefined();
    expect(card?.clickable).toBe(true);
    expect(card?.href).toBe('/admin/ai/traces');
  });

  it('contains a non-clickable aiAskEntry card', () => {
    const card = layer.cards?.find((c) => c.id === 'aiAskEntry');
    expect(card?.clickable).toBe(false);
  });
});

// ============================================================================
// Open API layer (level 4)
// ============================================================================

describe('Open API layer (level 4)', () => {
  let layer: ArchitectureLayer;

  beforeEach(() => {
    layer = ARCHITECTURE_LAYERS.find((l) => l.level === 4)!;
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
// AI Apps layer (level 3)
// ============================================================================

describe('AI Apps layer (level 3)', () => {
  let layer: ArchitectureLayer;

  beforeEach(() => {
    layer = ARCHITECTURE_LAYERS.find((l) => l.level === 3)!;
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
// AI Engine layer (level 2) — Core Capabilities + Runtime
// ============================================================================

describe('AI Engine layer (level 2)', () => {
  let layer: ArchitectureLayer;

  beforeEach(() => {
    layer = ARCHITECTURE_LAYERS.find((l) => l.level === 2)!;
  });

  it('has id "aiEngine"', () => {
    expect(layer.id).toBe('aiEngine');
  });

  it('has groups (not flat cards) — post-merger with former ai-kernel', () => {
    expect(Array.isArray(layer.groups)).toBe(true);
    expect(layer.cards).toBeUndefined();
  });

  it('has 2 groups: engineCore + engineRuntime', () => {
    expect(layer.groups).toHaveLength(2);
    const ids = layer.groups!.map((g) => g.id);
    expect(ids).toEqual(['engineCore', 'engineRuntime']);
  });

  describe('engineCore group', () => {
    it('contains 7 core capability cards', () => {
      const group = layer.groups?.find((g) => g.id === 'engineCore');
      expect(group?.cards).toHaveLength(7);
    });

    it('models card is clickable with correct href', () => {
      const group = layer.groups?.find((g) => g.id === 'engineCore');
      const card = group?.cards.find((c) => c.id === 'models');
      expect(card?.clickable).toBe(true);
      expect(card?.href).toBe('/admin/ai/models');
    });

    it('guardrails card has href /admin/ai/guardrails', () => {
      const group = layer.groups?.find((g) => g.id === 'engineCore');
      const card = group?.cards.find((c) => c.id === 'guardrails');
      expect(card?.href).toBe('/admin/ai/guardrails');
    });

    it('rag card has href /library/rag', () => {
      const group = layer.groups?.find((g) => g.id === 'engineCore');
      const card = group?.cards.find((c) => c.id === 'rag');
      expect(card?.href).toBe('/library/rag');
    });

    it('skills card has a stats entry keyed on "skills"', () => {
      const group = layer.groups?.find((g) => g.id === 'engineCore');
      const card = group?.cards.find((c) => c.id === 'skills');
      const stat = card?.stats?.find((s) => s.key === 'skills');
      expect(stat).toBeDefined();
    });
  });

  describe('engineRuntime group (former ai-kernel, now ai-engine/runtime)', () => {
    it('contains 8 runtime cards, all clickable', () => {
      const group = layer.groups?.find((g) => g.id === 'engineRuntime');
      expect(group?.cards).toHaveLength(8);
      for (const card of group!.cards) {
        expect(card.clickable).toBe(true);
        expect(card.href).toBeTruthy();
      }
    });

    it('all 8 runtime cards route to /admin/kernel/* paths', () => {
      const expectedCards: Array<{ id: string; href: string }> = [
        { id: 'runtimeProcesses', href: '/admin/kernel/processes' },
        { id: 'runtimeJournal', href: '/admin/kernel/journal' },
        { id: 'runtimeMemory', href: '/admin/kernel/memory' },
        { id: 'runtimeIPC', href: '/admin/kernel/ipc' },
        { id: 'runtimeResources', href: '/admin/kernel/resources' },
        { id: 'runtimeObservability', href: '/admin/kernel/observability' },
        { id: 'runtimeSecurity', href: '/admin/kernel/security' },
        { id: 'runtimeScheduler', href: '/admin/kernel/scheduler' },
      ];
      const group = layer.groups?.find((g) => g.id === 'engineRuntime');
      for (const { id, href } of expectedCards) {
        const card = group?.cards.find((c) => c.id === id);
        expect(card?.href).toBe(href);
      }
    });

    it('journal/memory/scheduler carry their stat keys', () => {
      const group = layer.groups?.find((g) => g.id === 'engineRuntime');
      const journal = group?.cards.find((c) => c.id === 'runtimeJournal');
      expect(journal?.stats?.[0]?.key).toBe('kernelEvents');

      const memory = group?.cards.find((c) => c.id === 'runtimeMemory');
      expect(memory?.stats?.[0]?.key).toBe('kernelMemories');

      const scheduler = group?.cards.find((c) => c.id === 'runtimeScheduler');
      expect(scheduler?.stats?.[0]?.key).toBe('kernelRunning');
    });
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

  it('dataStorage group has 3 cards: storage / dataManagement / resourceManagement', () => {
    const group = layer.groups?.find((g) => g.id === 'dataStorage');
    expect(group?.cards.length).toBe(3);

    const storage = group?.cards.find((c) => c.id === 'storage');
    expect(storage?.href).toBe('/admin/storage');

    const dm = group?.cards.find((c) => c.id === 'dataManagement');
    expect(dm?.href).toBe('/admin/data-management');

    const rm = group?.cards.find((c) => c.id === 'resourceManagement');
    expect(rm?.href).toBe('/admin/resources');
  });
});

// ============================================================================
// LAYER_STYLES
// ============================================================================

describe('LAYER_STYLES', () => {
  it('has style entries for levels 1-5', () => {
    expect(LAYER_STYLES[1]).toBeDefined();
    expect(LAYER_STYLES[2]).toBeDefined();
    expect(LAYER_STYLES[3]).toBeDefined();
    expect(LAYER_STYLES[4]).toBeDefined();
    expect(LAYER_STYLES[5]).toBeDefined();
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
    for (const level of [1, 2, 3, 4, 5] as const) {
      const style = LAYER_STYLES[level];
      for (const key of keys) {
        expect(style[key]).toBeTruthy();
      }
    }
  });

  it('level 5 uses cyan theme in badge (Intent Gateway)', () => {
    expect(LAYER_STYLES[5].badge).toContain('cyan');
  });

  it('level 4 uses orange theme in badge (Open API)', () => {
    expect(LAYER_STYLES[4].badge).toContain('orange');
  });

  it('level 3 uses violet theme in badge (AI Apps)', () => {
    expect(LAYER_STYLES[3].badge).toContain('violet');
  });

  it('level 2 uses blue theme in badge (AI Engine)', () => {
    expect(LAYER_STYLES[2].badge).toContain('blue');
  });

  it('level 1 uses emerald theme in badge (Infrastructure)', () => {
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
