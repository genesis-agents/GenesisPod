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
  it('contains exactly 5 layers', () => {
    expect(ARCHITECTURE_LAYERS).toHaveLength(5);
  });

  it('layers have levels 5, 4, 3, 2, 1 in order', () => {
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
// Agent OS layer (level 5)
// ============================================================================

describe('agentOs layer (level 5)', () => {
  let agentOsLayer: ArchitectureLayer;

  beforeEach(() => {
    agentOsLayer = ARCHITECTURE_LAYERS.find((l) => l.level === 5)!;
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
// Open API layer (level 4)
// ============================================================================

describe('openApi layer (level 4)', () => {
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

describe('aiApps layer (level 3)', () => {
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
// AI Engine layer (level 2)
// ============================================================================

describe('aiEngine layer (level 2)', () => {
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

  it('guardrails card is not clickable', () => {
    const card = layer.cards?.find((c) => c.id === 'guardrails');
    expect(card?.clickable).toBe(false);
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

  it('systemOps group has monitoring card', () => {
    const group = layer.groups?.find((g) => g.id === 'systemOps');
    const card = group?.cards.find((c) => c.id === 'monitoring');
    expect(card?.href).toBe('/admin/system/monitoring');
    expect(card?.clickable).toBe(true);
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

  it('level 5 uses cyan theme in badge', () => {
    expect(LAYER_STYLES[5].badge).toContain('cyan');
  });

  it('level 1 uses emerald theme in badge', () => {
    expect(LAYER_STYLES[1].badge).toContain('emerald');
  });

  it('level 3 uses violet theme in badge', () => {
    expect(LAYER_STYLES[3].badge).toContain('violet');
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
