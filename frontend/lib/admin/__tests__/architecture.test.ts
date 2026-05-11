import { beforeEach, describe, expect, it } from 'vitest';

import {
  ARCHITECTURE_LAYERS,
  LAYER_STYLES,
  type ArchitectureCard,
  type ArchitectureLayer,
} from '../architecture';

function getLayer(id: string): ArchitectureLayer {
  const layer = ARCHITECTURE_LAYERS.find((item) => item.id === id);
  expect(layer).toBeDefined();
  return layer as ArchitectureLayer;
}

describe('ARCHITECTURE_LAYERS', () => {
  it('contains the five backend-aligned layers', () => {
    expect(ARCHITECTURE_LAYERS).toHaveLength(5);
    expect(ARCHITECTURE_LAYERS.map((layer) => layer.id)).toEqual([
      'openApi',
      'aiApps',
      'aiHarness',
      'aiEngine',
      'infrastructure',
    ]);
    expect(ARCHITECTURE_LAYERS.map((layer) => layer.level)).toEqual([
      4, 3, 5, 2, 1,
    ]);
  });

  it('every layer has a non-empty titleKey and id', () => {
    for (const layer of ARCHITECTURE_LAYERS) {
      expect(layer.id).toBeTruthy();
      expect(layer.titleKey).toBeTruthy();
    }
  });
});

describe('AI Harness layer', () => {
  let layer: ArchitectureLayer;

  beforeEach(() => {
    layer = getLayer('aiHarness');
  });

  it('has eight subsystem cards', () => {
    expect(layer.level).toBe(5);
    expect(layer.cards).toHaveLength(8);
    expect(layer.groups).toBeUndefined();
  });

  it('makes every harness subsystem card configurable', () => {
    for (const card of layer.cards ?? []) {
      expect(card.clickable).toBe(true);
      expect(card.href).toBeTruthy();
    }
  });

  it('exposes governance and eval management', () => {
    const card = layer.cards?.find((item) => item.id === 'harnessGovernance');
    expect(card?.clickable).toBe(true);
    expect(card?.href).toBe('/admin/ai/eval');
    expect(card?.stats?.[0]?.key).toBe('harnessEvalRuns');
  });

  it('routes harness cards directly to real admin pages', () => {
    const expectedCards: Array<{ id: string; href: string }> = [
      { id: 'harnessFacade', href: '/admin/ai/harness' },
      { id: 'harnessKernel', href: '/admin/kernel/scheduler' },
      { id: 'harnessExecution', href: '/admin/ai/traces' },
      { id: 'harnessMemory', href: '/admin/kernel/memory' },
      { id: 'harnessProcess', href: '/admin/kernel/processes' },
      { id: 'harnessProtocol', href: '/admin/kernel/ipc' },
      { id: 'harnessGovernance', href: '/admin/ai/eval' },
      { id: 'harnessRuntime', href: '/admin/kernel/observability' },
    ];

    for (const { id, href } of expectedCards) {
      const card = layer.cards?.find((item) => item.id === id);
      expect(card?.clickable).toBe(true);
      expect(card?.href).toBe(href);
    }
  });

  it('uses harness-native stats instead of unrelated engine stats', () => {
    const statsByCard = new Map(
      layer.cards?.map((card) => [
        card.id,
        card.stats?.map((stat) => stat.key) ?? [],
      ])
    );

    expect(statsByCard.get('harnessExecution')).toEqual(['agentTraces']);
    expect(statsByCard.get('harnessProtocol')).toEqual(['kernelSubscriptions']);
    expect(statsByCard.get('harnessFacade')).toEqual([]);
  });
});

describe('Open API layer', () => {
  it('contains the externally visible API surface', () => {
    const layer = getLayer('openApi');
    expect(layer.cards).toHaveLength(5);
    expect(layer.cards?.find((card) => card.id === 'mcpServer')?.href).toBe(
      '/admin/system/mcp-server'
    );
  });
});

describe('AI Engine layer', () => {
  let layer: ArchitectureLayer;

  beforeEach(() => {
    layer = getLayer('aiEngine');
  });

  it('has an engineCore group with core capability cards', () => {
    expect(layer.groups).toHaveLength(1);
    const group = layer.groups?.find((item) => item.id === 'engineCore');
    expect(group?.cards).toHaveLength(7);
  });

  it('routes guardrails, RAG, skills, and models to their admin surfaces', () => {
    const group = layer.groups?.find((item) => item.id === 'engineCore');
    const expectedCards: Array<{ id: string; href: string }> = [
      { id: 'models', href: '/admin/ai/models' },
      { id: 'skills', href: '/admin/ai/skills' },
      { id: 'rag', href: '/library/rag' },
      { id: 'guardrails', href: '/admin/ai/guardrails' },
    ];

    for (const { id, href } of expectedCards) {
      const card = group?.cards.find((item) => item.id === id);
      expect(card?.clickable).toBe(true);
      expect(card?.href).toBe(href);
    }
  });
});

describe('Infrastructure layer', () => {
  // Wave 4 (2026-05-11): L1 重构为 4 张大卡（无 groups），对应 4 实体
  // 用户 / 密钥 / 数据 / 系统。旧 4-group × 12 卡结构已被替代。
  it('has 4 entity cards (user / secret / data / system) without sub-groups', () => {
    const layer = getLayer('infrastructure');
    expect(layer.groups).toBeUndefined();
    expect(layer.cards).toHaveLength(4);

    const ids = layer.cards?.map((c) => c.id);
    expect(ids).toEqual([
      'userManagement',
      'secretManagement',
      'dataManagement',
      'systemManagement',
    ]);
  });

  it('system management card links to /admin/system with monitoring stats', () => {
    const layer = getLayer('infrastructure');
    const systemCard = layer.cards?.find((c) => c.id === 'systemManagement');
    expect(systemCard?.href).toBe('/admin/system');
    expect(systemCard?.stats?.map((stat) => stat.key)).toEqual([
      'kernelLLMCalls',
      'monitoringErrors',
    ]);
  });

  it('all 4 cards are clickable and point to their merged hubs', () => {
    const layer = getLayer('infrastructure');
    const expected: Record<string, string> = {
      userManagement: '/admin/access/users',
      secretManagement: '/admin/access/secrets',
      dataManagement: '/admin/data',
      systemManagement: '/admin/system',
    };
    for (const card of layer.cards ?? []) {
      expect(card.clickable).toBe(true);
      expect(card.href).toBe(expected[card.id]);
    }
  });
});

describe('LAYER_STYLES', () => {
  it('has style entries for levels 1-5', () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(LAYER_STYLES[level]).toBeDefined();
    }
  });

  it('uses distinct layer themes', () => {
    expect(LAYER_STYLES[5].badge).toContain('teal');
    expect(LAYER_STYLES[4].badge).toContain('orange');
    expect(LAYER_STYLES[3].badge).toContain('violet');
    expect(LAYER_STYLES[2].badge).toContain('blue');
    expect(LAYER_STYLES[1].badge).toContain('emerald');
  });
});

describe('card structure invariants', () => {
  function getAllCards(): ArchitectureCard[] {
    const cards: ArchitectureCard[] = [];
    for (const layer of ARCHITECTURE_LAYERS) {
      if (layer.cards) cards.push(...layer.cards);
      if (layer.groups) {
        for (const group of layer.groups) cards.push(...group.cards);
      }
    }
    return cards;
  }

  it('all cards have id, i18nKey, icon, and clickable fields', () => {
    for (const card of getAllCards()) {
      expect(card.id).toBeTruthy();
      expect(card.i18nKey).toBeTruthy();
      expect(card.icon).toBeDefined();
      expect(typeof card.clickable).toBe('boolean');
    }
  });

  it('clickable cards have an href', () => {
    for (const card of getAllCards().filter((item) => item.clickable)) {
      expect(card.href).toBeTruthy();
    }
  });

  it('stats have label and key fields when present', () => {
    for (const card of getAllCards()) {
      for (const stat of card.stats ?? []) {
        expect(stat.label).toBeTruthy();
        expect(stat.key).toBeTruthy();
      }
    }
  });
});
