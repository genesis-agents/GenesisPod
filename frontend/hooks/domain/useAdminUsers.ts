import { useApiGet, useApiPost, useApiPut, useApiDelete } from '../core';
import { useCallback } from 'react';

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  role: 'user' | 'admin';
  status: 'active' | 'inactive' | 'banned';
  createdAt: string;
  lastLoginAt?: string;
}

export function useAdminUsers() {
  const {
    data,
    loading: listLoading,
    error: listError,
    execute: refreshUsers,
  } = useApiGet<{ users: User[]; total: number }>('/api/admin/users', {
    immediate: true,
  });

  const { loading: updateLoading, execute: updateUserApi } = useApiPut<
    User,
    Partial<User>
  >('/api/admin/users');

  const { loading: deleteLoading, execute: deleteUserApi } = useApiDelete<
    void,
    { id: string }
  >('/api/admin/users');

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

  return {
    users: data?.users ?? [],
    total: data?.total ?? 0,
    loading: listLoading || updateLoading || deleteLoading,
    error: listError,
    refreshUsers,
    updateUser,
    deleteUser,
    banUser,
    activateUser,
    isUpdating: updateLoading,
    isDeleting: deleteLoading,
  };
}
