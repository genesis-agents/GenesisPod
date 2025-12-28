import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

/**
 * 积分账户信息
 */
export interface CreditAccountInfo {
  balance: number;
  totalEarned: number;
  totalSpent: number;
  giftBalance: number;
  giftExpiresAt: string | null;
  isActive: boolean;
  isFrozen: boolean;
  todaySpent: number;
  isLow: boolean;
  isCritical: boolean;
}

/**
 * 签到状态
 */
export interface CheckinStatus {
  canCheckin: boolean;
  hasCheckedInToday: boolean;
  streakDays: number;
  lastCheckinDate: string | null;
  nextReward: number;
  message?: string;
}

/**
 * 签到结果
 */
export interface CheckinResult {
  success: boolean;
  creditsEarned: number;
  streakDays: number;
  message: string;
  isStreakBonus: boolean;
  bonusType?: 'streak7' | 'streak30';
}

/**
 * 交易记录
 */
export interface CreditTransaction {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  description: string;
  moduleType?: string;
  operationType?: string;
  tokenCount?: number;
  modelName?: string;
  createdAt: string;
}

/**
 * 余额不足数据
 */
export interface InsufficientCreditsData {
  required: number;
  available: number;
  deficit: number;
}

/**
 * 积分 Store 状态
 */
interface CreditsState {
  // 账户信息
  account: CreditAccountInfo | null;
  isLoading: boolean;
  error: string | null;

  // 签到状态
  checkinStatus: CheckinStatus | null;
  isCheckingIn: boolean;

  // 余额不足弹窗
  insufficientModalOpen: boolean;
  insufficientData: InsufficientCreditsData | null;

  // 签到弹窗
  checkinModalOpen: boolean;
  checkinResult: CheckinResult | null;

  // Actions
  fetchBalance: () => Promise<void>;
  fetchAccount: () => Promise<void>;
  fetchCheckinStatus: () => Promise<void>;
  performCheckin: () => Promise<CheckinResult | null>;

  // 弹窗控制
  showInsufficientModal: (data: InsufficientCreditsData) => void;
  hideInsufficientModal: () => void;
  showCheckinModal: () => void;
  hideCheckinModal: () => void;

  // 余额更新（供 AI 模块调用后更新）
  updateBalance: (newBalance: number, spent?: number) => void;

  // 重置
  reset: () => void;
}

const API_BASE = '/api/credits';

/**
 * 积分 Store
 */
export const useCreditsStore = create<CreditsState>()(
  devtools(
    (set, get) => ({
      // 初始状态
      account: null,
      isLoading: false,
      error: null,
      checkinStatus: null,
      isCheckingIn: false,
      insufficientModalOpen: false,
      insufficientData: null,
      checkinModalOpen: false,
      checkinResult: null,

      // 获取余额（轻量级）
      fetchBalance: async () => {
        try {
          const response = await fetch(API_BASE + '/balance', {
            credentials: 'include',
          });
          if (!response.ok) throw new Error('Failed to fetch balance');

          const result = await response.json();
          if (result.success) {
            const currentAccount = get().account;
            set({
              account: currentAccount
                ? {
                    ...currentAccount,
                    balance: result.data.balance,
                    isLow: result.data.isLow,
                    isCritical: result.data.isCritical,
                    todaySpent: result.data.todaySpent,
                  }
                : {
                    balance: result.data.balance,
                    totalEarned: 0,
                    totalSpent: 0,
                    giftBalance: 0,
                    giftExpiresAt: null,
                    isActive: true,
                    isFrozen: false,
                    todaySpent: result.data.todaySpent,
                    isLow: result.data.isLow,
                    isCritical: result.data.isCritical,
                  },
              error: null,
            });
          }
        } catch (error) {
          set({ error: (error as Error).message });
        }
      },

      // 获取完整账户信息
      fetchAccount: async () => {
        set({ isLoading: true, error: null });
        try {
          const response = await fetch(API_BASE, {
            credentials: 'include',
          });
          if (!response.ok) throw new Error('Failed to fetch account');

          const result = await response.json();
          if (result.success) {
            set({ account: result.data, isLoading: false });
          } else {
            throw new Error(result.message || 'Failed to fetch account');
          }
        } catch (error) {
          set({ error: (error as Error).message, isLoading: false });
        }
      },

      // 获取签到状态
      fetchCheckinStatus: async () => {
        try {
          const response = await fetch(API_BASE + '/checkin/status', {
            credentials: 'include',
          });
          if (!response.ok) throw new Error('Failed to fetch checkin status');

          const result = await response.json();
          if (result.success) {
            set({ checkinStatus: result.data });
          }
        } catch (error) {
          console.error('Failed to fetch checkin status:', error);
        }
      },

      // 执行签到
      performCheckin: async () => {
        set({ isCheckingIn: true });
        try {
          const response = await fetch(API_BASE + '/checkin', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
          });

          const result = await response.json();

          if (result.success && result.data.success) {
            const checkinResult = result.data as CheckinResult;

            // 更新余额
            const currentAccount = get().account;
            if (currentAccount) {
              set({
                account: {
                  ...currentAccount,
                  balance: currentAccount.balance + checkinResult.creditsEarned,
                  totalEarned:
                    currentAccount.totalEarned + checkinResult.creditsEarned,
                },
              });
            }

            // 更新签到状态
            set({
              checkinStatus: {
                canCheckin: false,
                hasCheckedInToday: true,
                streakDays: checkinResult.streakDays,
                lastCheckinDate: new Date().toISOString(),
                nextReward: 50, // 默认基础奖励
              },
              checkinResult,
              isCheckingIn: false,
            });

            return checkinResult;
          } else {
            set({ isCheckingIn: false });
            return result.data as CheckinResult;
          }
        } catch (error) {
          set({ isCheckingIn: false });
          return null;
        }
      },

      // 显示余额不足弹窗
      showInsufficientModal: (data) => {
        set({
          insufficientModalOpen: true,
          insufficientData: data,
        });
      },

      // 隐藏余额不足弹窗
      hideInsufficientModal: () => {
        set({
          insufficientModalOpen: false,
          insufficientData: null,
        });
      },

      // 显示签到弹窗
      showCheckinModal: () => {
        set({ checkinModalOpen: true });
      },

      // 隐藏签到弹窗
      hideCheckinModal: () => {
        set({
          checkinModalOpen: false,
          checkinResult: null,
        });
      },

      // 更新余额
      updateBalance: (newBalance, spent) => {
        const currentAccount = get().account;
        if (currentAccount) {
          set({
            account: {
              ...currentAccount,
              balance: newBalance,
              isLow: newBalance <= 500,
              isCritical: newBalance <= 100,
              todaySpent:
                spent !== undefined
                  ? currentAccount.todaySpent + spent
                  : currentAccount.todaySpent,
              totalSpent:
                spent !== undefined
                  ? currentAccount.totalSpent + spent
                  : currentAccount.totalSpent,
            },
          });
        }
      },

      // 重置
      reset: () => {
        set({
          account: null,
          isLoading: false,
          error: null,
          checkinStatus: null,
          isCheckingIn: false,
          insufficientModalOpen: false,
          insufficientData: null,
          checkinModalOpen: false,
          checkinResult: null,
        });
      },
    }),
    { name: 'credits-store' }
  )
);

/**
 * 便捷 hook: 获取当前余额
 */
export function useCreditsBalance() {
  return useCreditsStore((state) => ({
    balance: state.account?.balance ?? 0,
    isLow: state.account?.isLow ?? false,
    isCritical: state.account?.isCritical ?? false,
  }));
}

/**
 * 便捷 hook: 签到相关
 */
export function useCheckin() {
  return useCreditsStore((state) => ({
    status: state.checkinStatus,
    isCheckingIn: state.isCheckingIn,
    result: state.checkinResult,
    performCheckin: state.performCheckin,
    fetchStatus: state.fetchCheckinStatus,
    showModal: state.showCheckinModal,
    hideModal: state.hideCheckinModal,
    isModalOpen: state.checkinModalOpen,
  }));
}

/**
 * 便捷 hook: 余额不足弹窗
 */
export function useInsufficientCreditsModal() {
  return useCreditsStore((state) => ({
    isOpen: state.insufficientModalOpen,
    data: state.insufficientData,
    show: state.showInsufficientModal,
    hide: state.hideInsufficientModal,
  }));
}
