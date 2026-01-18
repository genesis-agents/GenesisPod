import { useApiGet, useApiPost, useApiPut, useApiDelete } from '../core';
import { useCallback, useState } from 'react';

export interface User {
  id: string;
  email: string;
  name: string | null;
  username: string | null;
  avatar?: string;
  avatarUrl?: string;
  role: 'USER' | 'ADMIN' | 'user' | 'admin';
  status: 'active' | 'inactive' | 'banned';
  isActive?: boolean;
  isAdmin?: boolean;
  createdAt: string;
  lastLoginAt?: string;
  credits?: {
    balance: number;
    totalEarned: number;
    totalSpent: number;
    isFrozen: boolean;
  } | null;
}

export function useAdminUsers() {
  const [creditsLoading, setCreditsLoading] = useState(false);

  const {
    data,
    loading: listLoading,
    error: listError,
    execute: refreshUsers,
  } = useApiGet<{ users: User[]; total: number }>('/admin/users', {
    immediate: true,
  });

  const { loading: updateLoading, execute: updateUserApi } = useApiPut<
    User,
    Partial<User>
  >('/admin/users');

  const { loading: deleteLoading, execute: deleteUserApi } = useApiDelete<
    void,
    { id: string }
  >('/admin/users');

  const updateUser = useCallback(
    async (id: string, data: Partial<User>) => {
      const result = await updateUserApi({ ...data, id });
      if (result) await refreshUsers();
      return result;
    },
    [updateUserApi, refreshUsers]
  );

  const deleteUser = useCallback(
    async (id: string) => {
      await deleteUserApi({ id });
      await refreshUsers();
    },
    [deleteUserApi, refreshUsers]
  );

  const banUser = useCallback(
    (id: string) => updateUser(id, { status: 'banned' }),
    [updateUser]
  );

  const activateUser = useCallback(
    (id: string) => updateUser(id, { status: 'active' }),
    [updateUser]
  );

  // Credits management functions
  const grantCredits = useCallback(
    async (userId: string, amount: number, reason?: string) => {
      setCreditsLoading(true);
      try {
        const response = await fetch(
          `/api/v1/admin/users/${userId}/credits/grant`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount, reason }),
          }
        );
        const result = await response.json();
        if (result.success) {
          await refreshUsers();
        }
        return result;
      } finally {
        setCreditsLoading(false);
      }
    },
    [refreshUsers]
  );

  const toggleCreditFreeze = useCallback(
    async (userId: string, freeze: boolean, reason?: string) => {
      setCreditsLoading(true);
      try {
        const response = await fetch(
          `/api/v1/admin/users/${userId}/credits/freeze`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ freeze, reason }),
          }
        );
        const result = await response.json();
        if (result.success) {
          await refreshUsers();
        }
        return result;
      } finally {
        setCreditsLoading(false);
      }
    },
    [refreshUsers]
  );

  return {
    users: data?.users ?? [],
    total: data?.total ?? 0,
    loading: listLoading || updateLoading || deleteLoading || creditsLoading,
    error: listError,
    refreshUsers,
    updateUser,
    deleteUser,
    banUser,
    activateUser,
    grantCredits,
    toggleCreditFreeze,
    isUpdating: updateLoading,
    isDeleting: deleteLoading,
    isCreditsLoading: creditsLoading,
  };
}
