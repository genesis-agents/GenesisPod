import { useApiGet } from '../core';
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

export interface CreateUserData {
  email: string;
  username?: string;
  role?: 'USER' | 'ADMIN';
  password?: string;
}

export function useAdminUsers() {
  const [creditsLoading, setCreditsLoading] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);

  const {
    data,
    loading: listLoading,
    error: listError,
    execute: refreshUsers,
  } = useApiGet<{ users: User[]; total: number }>('/admin/users', {
    immediate: true,
  });

  const [updateLoading, setUpdateLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const createUser = useCallback(
    async (data: CreateUserData) => {
      setCreateLoading(true);
      try {
        const response = await fetch('/api/v1/admin/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(data),
        });
        const result = await response.json();
        if (result.success || result.id) {
          await refreshUsers();
        }
        return result;
      } finally {
        setCreateLoading(false);
      }
    },
    [refreshUsers]
  );

  const updateUser = useCallback(
    async (id: string, data: Partial<User>) => {
      setUpdateLoading(true);
      try {
        const response = await fetch(`/api/v1/admin/users/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(data),
        });
        const result = await response.json();
        if (result) await refreshUsers();
        return result;
      } finally {
        setUpdateLoading(false);
      }
    },
    [refreshUsers]
  );

  const deleteUser = useCallback(
    async (id: string) => {
      setDeleteLoading(true);
      try {
        await fetch(`/api/v1/admin/users/${id}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        await refreshUsers();
      } finally {
        setDeleteLoading(false);
      }
    },
    [refreshUsers]
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
            credentials: 'include',
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
            credentials: 'include',
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
    loading:
      listLoading ||
      updateLoading ||
      deleteLoading ||
      creditsLoading ||
      createLoading,
    error: listError,
    refreshUsers,
    createUser,
    updateUser,
    deleteUser,
    banUser,
    activateUser,
    grantCredits,
    toggleCreditFreeze,
    isCreating: createLoading,
    isUpdating: updateLoading,
    isDeleting: deleteLoading,
    isCreditsLoading: creditsLoading,
  };
}
