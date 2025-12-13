/**
 * Authentication utilities
 * Manages authentication state and token storage
 */

export interface User {
  id: string;
  email: string;
  username: string;
  avatarUrl?: string;
  bio?: string;
  interests?: string[];
  createdAt: string;
  role?: 'USER' | 'ADMIN';
}

// 管理员邮箱白名单
const ADMIN_EMAILS = ['hello.junjie.duan@gmail.com'];

/**
 * 检查用户是否是管理员
 */
export function isUserAdmin(user: User | null): boolean {
  if (!user) return false;
  return user.role === 'ADMIN' || ADMIN_EMAILS.includes(user.email);
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
}

const TOKEN_STORAGE_KEY = 'deepdive_auth_tokens';
const USER_STORAGE_KEY = 'deepdive_user';

/**
 * Get authentication tokens from localStorage
 */
export function getAuthTokens(): AuthTokens | null {
  if (typeof window === 'undefined') return null;

  try {
    const tokens = localStorage.getItem(TOKEN_STORAGE_KEY);
    return tokens ? JSON.parse(tokens) : null;
  } catch {
    return null;
  }
}

/**
 * Save authentication tokens to localStorage
 */
export function saveAuthTokens(tokens: AuthTokens): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(tokens));
  } catch (error) {
    console.error('Failed to save auth tokens:', error);
  }
}

/**
 * Remove authentication tokens from localStorage
 */
export function clearAuthTokens(): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear auth tokens:', error);
  }
}

/**
 * Get current user from localStorage
 */
export function getCurrentUser(): User | null {
  if (typeof window === 'undefined') return null;

  try {
    const user = localStorage.getItem(USER_STORAGE_KEY);
    return user ? JSON.parse(user) : null;
  } catch {
    return null;
  }
}

/**
 * Save current user to localStorage
 */
export function saveCurrentUser(user: User): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  } catch (error) {
    console.error('Failed to save user:', error);
  }
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  const tokens = getAuthTokens();
  return !!tokens?.accessToken;
}

/**
 * Get authorization header for API requests
 */
export function getAuthHeader(): Record<string, string> {
  const tokens = getAuthTokens();
  if (!tokens?.accessToken) return {};

  return {
    Authorization: `Bearer ${tokens.accessToken}`,
  };
}

/**
 * Initiate Google OAuth login
 */
export function loginWithGoogle(): void {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
  window.location.href = `${apiUrl}/api/v1/auth/google`;
}

/**
 * Logout user
 */
export function logout(): void {
  clearAuthTokens();
  // Reload to clear any cached state
  if (typeof window !== 'undefined') {
    window.location.href = '/';
  }
}
