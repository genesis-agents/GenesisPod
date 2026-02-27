import { act, renderHook } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import {
  useSettingsStore,
  useAIFeature,
  AI_FEATURE_INFO,
} from '../settingsStore';
import type { Notification, AIFeatureSettings } from '../settingsStore';

// ── Mocks ─────────────────────────────────────────────────────────────────────

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
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

// ── Fixtures ──────────────────────────────────────────────────────────────────

const DEFAULT_AI_FEATURES: AIFeatureSettings = {
  aiSummaryEnabled: true,
  aiTranslationEnabled: true,
  aiInsightsEnabled: true,
  aiOfficeMultiAgentEnabled: true,
  aiOfficeAutoSaveEnabled: true,
  semanticSearchEnabled: false,
  smartRecommendationsEnabled: false,
  compactViewEnabled: false,
};

function makeNotification(
  overrides: Partial<Omit<Notification, 'id' | 'timestamp'>> = {}
): Omit<Notification, 'id' | 'timestamp'> {
  return {
    type: 'system',
    title: 'Test Notification',
    message: 'Test message',
    read: false,
    ...overrides,
  };
}

// ── Reset helpers ─────────────────────────────────────────────────────────────

function resetStore() {
  useSettingsStore.setState({
    aiFeatures: DEFAULT_AI_FEATURES,
    notifications: [],
    lastSeenVersion: '',
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// useSettingsStore - AI Features
// ═════════════════════════════════════════════════════════════════════════════

describe('useSettingsStore - aiFeatures', () => {
  beforeEach(() => {
    resetStore();
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should have correct default AI features', () => {
      const { result } = renderHook(() => useSettingsStore());
      expect(result.current.aiFeatures).toEqual(DEFAULT_AI_FEATURES);
    });

    it('should start with empty lastSeenVersion', () => {
      const { result } = renderHook(() => useSettingsStore());
      expect(result.current.lastSeenVersion).toBe('');
    });
  });

  describe('setAIFeature', () => {
    it('should enable a feature that was disabled', () => {
      const { result } = renderHook(() => useSettingsStore());

      act(() => {
        result.current.setAIFeature('semanticSearchEnabled', true);
      });

      expect(result.current.aiFeatures.semanticSearchEnabled).toBe(true);
    });

    it('should disable a feature that was enabled', () => {
      const { result } = renderHook(() => useSettingsStore());

      act(() => {
        result.current.setAIFeature('aiSummaryEnabled', false);
      });

      expect(result.current.aiFeatures.aiSummaryEnabled).toBe(false);
    });

    it('should not affect other feature flags', () => {
      const { result } = renderHook(() => useSettingsStore());

      act(() => {
        result.current.setAIFeature('compactViewEnabled', true);
      });

      expect(result.current.aiFeatures.aiSummaryEnabled).toBe(true);
      expect(result.current.aiFeatures.aiTranslationEnabled).toBe(true);
      expect(result.current.aiFeatures.aiInsightsEnabled).toBe(true);
    });

    it('should update any feature key generically', () => {
      const { result } = renderHook(() => useSettingsStore());
      const featureKeys = Object.keys(
        DEFAULT_AI_FEATURES
      ) as (keyof AIFeatureSettings)[];

      featureKeys.forEach((key) => {
        const currentVal = result.current.aiFeatures[key];
        act(() => {
          result.current.setAIFeature(key, !currentVal);
        });
        expect(result.current.aiFeatures[key]).toBe(!currentVal);
        // Reset
        act(() => {
          result.current.setAIFeature(key, currentVal);
        });
      });
    });
  });

  describe('resetAIFeatures', () => {
    it('should restore all features to default values', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => {
        result.current.setAIFeature('aiSummaryEnabled', false);
        result.current.setAIFeature('semanticSearchEnabled', true);
        result.current.setAIFeature('compactViewEnabled', true);
      });

      act(() => {
        result.current.resetAIFeatures();
      });

      expect(result.current.aiFeatures).toEqual(DEFAULT_AI_FEATURES);
    });
  });

  describe('setLastSeenVersion', () => {
    it('should update lastSeenVersion', () => {
      const { result } = renderHook(() => useSettingsStore());

      act(() => {
        result.current.setLastSeenVersion('2.5.0');
      });

      expect(result.current.lastSeenVersion).toBe('2.5.0');
    });

    it('should overwrite previous version', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => {
        result.current.setLastSeenVersion('1.0.0');
      });

      act(() => {
        result.current.setLastSeenVersion('2.0.0');
      });

      expect(result.current.lastSeenVersion).toBe('2.0.0');
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// useSettingsStore - Notifications
// ═════════════════════════════════════════════════════════════════════════════

describe('useSettingsStore - notifications', () => {
  beforeEach(() => {
    resetStore();
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  describe('addNotification', () => {
    it('should prepend notification with generated id and timestamp', () => {
      const { result } = renderHook(() => useSettingsStore());

      act(() => {
        result.current.addNotification(
          makeNotification({ title: 'New Notification' })
        );
      });

      expect(result.current.notifications).toHaveLength(1);
      const n = result.current.notifications[0];
      expect(n.id).toMatch(/^notif-/);
      expect(n.title).toBe('New Notification');
      expect(n.timestamp).toBeInstanceOf(Date);
    });

    it('should prepend new notifications (newest first)', () => {
      const { result } = renderHook(() => useSettingsStore());

      act(() => {
        result.current.addNotification(makeNotification({ title: 'First' }));
      });
      act(() => {
        result.current.addNotification(makeNotification({ title: 'Second' }));
      });

      expect(result.current.notifications[0].title).toBe('Second');
      expect(result.current.notifications[1].title).toBe('First');
    });

    it('should preserve optional fields like actionUrl and persistent', () => {
      const { result } = renderHook(() => useSettingsStore());

      act(() => {
        result.current.addNotification(
          makeNotification({
            actionUrl: '/settings',
            persistent: true,
          })
        );
      });

      const n = result.current.notifications[0];
      expect(n.actionUrl).toBe('/settings');
      expect(n.persistent).toBe(true);
    });
  });

  describe('markAsRead', () => {
    it('should mark a specific notification as read', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => {
        result.current.addNotification(makeNotification({ read: false }));
      });
      const id = result.current.notifications[0].id;

      act(() => {
        result.current.markAsRead(id);
      });

      expect(result.current.notifications[0].read).toBe(true);
    });

    it('should not affect other notifications', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => {
        result.current.addNotification(
          makeNotification({ title: 'A', read: false })
        );
        result.current.addNotification(
          makeNotification({ title: 'B', read: false })
        );
      });
      const idB = result.current.notifications[0].id; // B is first (prepended)

      act(() => {
        result.current.markAsRead(idB);
      });

      expect(result.current.notifications[0].read).toBe(true); // B
      expect(result.current.notifications[1].read).toBe(false); // A
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all notifications as read', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => {
        result.current.addNotification(makeNotification({ read: false }));
        result.current.addNotification(makeNotification({ read: false }));
        result.current.addNotification(makeNotification({ read: false }));
      });

      act(() => {
        result.current.markAllAsRead();
      });

      result.current.notifications.forEach((n) => {
        expect(n.read).toBe(true);
      });
    });

    it('should be safe when notifications is empty', () => {
      const { result } = renderHook(() => useSettingsStore());

      act(() => {
        result.current.markAllAsRead();
      });

      expect(result.current.notifications).toEqual([]);
    });
  });

  describe('deleteNotification', () => {
    it('should remove notification by id', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => {
        result.current.addNotification(
          makeNotification({ title: 'Delete me' })
        );
      });
      const id = result.current.notifications[0].id;

      act(() => {
        result.current.deleteNotification(id);
      });

      expect(result.current.notifications).toHaveLength(0);
    });

    it('should not remove other notifications', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => {
        result.current.addNotification(makeNotification({ title: 'Keep' }));
        result.current.addNotification(makeNotification({ title: 'Delete' }));
      });
      const idDelete = result.current.notifications[0].id; // Delete is first

      act(() => {
        result.current.deleteNotification(idDelete);
      });

      expect(result.current.notifications).toHaveLength(1);
      expect(result.current.notifications[0].title).toBe('Keep');
    });
  });

  describe('clearAllNotifications', () => {
    it('should remove all notifications', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => {
        result.current.addNotification(makeNotification());
        result.current.addNotification(makeNotification());
      });

      act(() => {
        result.current.clearAllNotifications();
      });

      expect(result.current.notifications).toEqual([]);
    });
  });

  describe('unreadCount', () => {
    it('should return the count of unread notifications', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => {
        result.current.addNotification(makeNotification({ read: false }));
        result.current.addNotification(makeNotification({ read: false }));
        result.current.addNotification(makeNotification({ read: true }));
      });

      expect(result.current.unreadCount()).toBe(2);
    });

    it('should return 0 when all notifications are read', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => {
        result.current.addNotification(makeNotification({ read: false }));
      });
      const id = result.current.notifications[0].id;
      act(() => {
        result.current.markAsRead(id);
      });

      expect(result.current.unreadCount()).toBe(0);
    });

    it('should return 0 when notifications array is empty', () => {
      const { result } = renderHook(() => useSettingsStore());

      expect(result.current.unreadCount()).toBe(0);
    });

    it('should decrease after markAllAsRead', () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => {
        result.current.addNotification(makeNotification({ read: false }));
        result.current.addNotification(makeNotification({ read: false }));
      });
      expect(result.current.unreadCount()).toBe(2);

      act(() => {
        result.current.markAllAsRead();
      });

      expect(result.current.unreadCount()).toBe(0);
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// useAIFeature hook
// ═════════════════════════════════════════════════════════════════════════════

describe('useAIFeature', () => {
  beforeEach(() => {
    resetStore();
  });

  it('should return the current value of the requested feature', () => {
    const { result } = renderHook(() => useAIFeature('aiSummaryEnabled'));
    expect(result.current).toBe(true);
  });

  it('should return false for beta features that are disabled by default', () => {
    const { result } = renderHook(() => useAIFeature('semanticSearchEnabled'));
    expect(result.current).toBe(false);
  });

  it('should reflect store changes reactively', () => {
    const { result } = renderHook(() => useAIFeature('aiSummaryEnabled'));
    expect(result.current).toBe(true);

    act(() => {
      useSettingsStore.getState().setAIFeature('aiSummaryEnabled', false);
    });

    expect(result.current).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// AI_FEATURE_INFO constant
// ═════════════════════════════════════════════════════════════════════════════

describe('AI_FEATURE_INFO', () => {
  it('should have 8 feature entries', () => {
    expect(AI_FEATURE_INFO).toHaveLength(8);
  });

  it('each entry should have key, name, description, category, icon', () => {
    AI_FEATURE_INFO.forEach((info) => {
      expect(info).toHaveProperty('key');
      expect(info).toHaveProperty('name');
      expect(info).toHaveProperty('description');
      expect(info).toHaveProperty('category');
      expect(info).toHaveProperty('icon');
    });
  });

  it('all keys should be valid AIFeatureSettings keys', () => {
    const validKeys = Object.keys(DEFAULT_AI_FEATURES);
    AI_FEATURE_INFO.forEach((info) => {
      expect(validKeys).toContain(info.key);
    });
  });

  it('categories should only be core, beta, or ui', () => {
    const validCategories = ['core', 'beta', 'ui'];
    AI_FEATURE_INFO.forEach((info) => {
      expect(validCategories).toContain(info.category);
    });
  });
});
