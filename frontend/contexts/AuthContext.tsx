'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  type User,
  type AuthState,
  getCurrentUser,
  getAuthTokens,
  saveAuthTokens,
  saveCurrentUser,
  clearAuthTokens,
  loginWithGoogle as authLoginWithGoogle,
  logout as authLogout,
  isUserAdmin,
} from '@/lib/utils/auth';
import { config } from '@/lib/utils/config';

interface AuthContextType extends AuthState {
  login: (user: User, accessToken: string, refreshToken: string) => void;
  logout: () => void;
  loginWithGoogle: () => void;
  isLoading: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    accessToken: null,
    refreshToken: null,
  });
  const [isLoading, setIsLoading] = useState(true);

  // Load auth state from localStorage on mount
  useEffect(() => {
    const tokens = getAuthTokens();
    const user = getCurrentUser();

    if (tokens && user) {
      setAuthState({
        user,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      });
    }

    setIsLoading(false);
  }, []);

  const login = (user: User, accessToken: string, refreshToken: string) => {
    saveAuthTokens({ accessToken, refreshToken });
    saveCurrentUser(user);
    setAuthState({
      user,
      accessToken,
      refreshToken,
    });
  };

  const logout = () => {
    clearAuthTokens();
    setAuthState({
      user: null,
      accessToken: null,
      refreshToken: null,
    });
    authLogout();
  };

  const loginWithGoogle = () => {
    authLoginWithGoogle();
  };

  return (
    <AuthContext.Provider
      value={{
        ...authState,
        login,
        logout,
        loginWithGoogle,
        isLoading,
        isAdmin: isUserAdmin(authState.user),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
