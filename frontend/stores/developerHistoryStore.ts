/**
 * Developer 历史记录 Store
 * 使用 localStorage 持久化存储操作历史
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface DeveloperHistoryItem {
  id: string;
  timestamp: number;
  prompt: string;
  language: string;
  includeTests: boolean;
  testFramework: string;
  status: 'success' | 'error' | 'pending';
  summary?: string;
}

interface DeveloperHistoryStore {
  history: DeveloperHistoryItem[];
  addHistory: (item: Omit<DeveloperHistoryItem, 'id' | 'timestamp'>) => string;
  updateHistory: (id: string, updates: Partial<DeveloperHistoryItem>) => void;
  removeHistory: (id: string) => void;
  clearHistory: () => void;
}

const MAX_HISTORY_ITEMS = 50;

export const useDeveloperHistoryStore = create<DeveloperHistoryStore>()(
  persist(
    (set, get) => ({
      history: [],

      addHistory: (item) => {
        const id = `dev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const newItem: DeveloperHistoryItem = {
          ...item,
          id,
          timestamp: Date.now(),
        };

        set((state) => {
          const newHistory = [newItem, ...state.history];
          // 保留最多 MAX_HISTORY_ITEMS 条记录
          if (newHistory.length > MAX_HISTORY_ITEMS) {
            newHistory.splice(MAX_HISTORY_ITEMS);
          }
          return { history: newHistory };
        });

        return id;
      },

      updateHistory: (id, updates) => {
        set((state) => ({
          history: state.history.map((item) =>
            item.id === id ? { ...item, ...updates } : item
          ),
        }));
      },

      removeHistory: (id) => {
        set((state) => ({
          history: state.history.filter((item) => item.id !== id),
        }));
      },

      clearHistory: () => {
        set({ history: [] });
      },
    }),
    {
      name: 'developer-history-storage',
    }
  )
);

/**
 * 格式化时间为相对时间
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;

  const date = new Date(timestamp);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}
