/**
 * AI Designer 历史记录 Store
 * 使用 localStorage 持久化存储设计生成历史
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * 设计产物
 */
export interface DesignerArtifact {
  id: string;
  name: string;
  type: string;
  url: string;
}

/**
 * 历史记录项
 */
export interface DesignerHistoryItem {
  id: string;
  timestamp: number;
  prompt: string;
  designType: string;
  style: string;
  aspectRatio: string;
  status: 'success' | 'error' | 'pending';
  summary?: string;
  /** 保存结果以便恢复 */
  result?: {
    artifacts: DesignerArtifact[];
    duration: number;
    designId?: string;
  };
}

interface DesignerHistoryStore {
  history: DesignerHistoryItem[];
  addHistory: (item: Omit<DesignerHistoryItem, 'id' | 'timestamp'>) => string;
  updateHistory: (id: string, updates: Partial<DesignerHistoryItem>) => void;
  removeHistory: (id: string) => void;
  clearHistory: () => void;
}

const MAX_HISTORY_ITEMS = 50;

export const useDesignerHistoryStore = create<DesignerHistoryStore>()(
  persist(
    (set) => ({
      history: [],

      addHistory: (item) => {
        const id = `design_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const newItem: DesignerHistoryItem = {
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
      name: 'designer-history-storage',
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
