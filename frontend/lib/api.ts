/**
 * Global API utilities with automatic error handling and toast notifications
 */

import { toast } from '@/stores/toastStore';

export interface ApiErrorResponse {
  message: string;
  statusCode?: number;
  error?: string;
}

/**
 * Parse error response from API
 */
async function parseErrorResponse(response: Response): Promise<string> {
  try {
    const data = await response.json();
    return data.message || data.error || `Error ${response.status}`;
  } catch {
    return response.statusText || `Error ${response.status}`;
  }
}

/**
 * API fetch wrapper with automatic error toast
 * @param url - API endpoint URL
 * @param options - Fetch options
 * @param showErrorToast - Whether to show error toast (default: true)
 */
export async function apiFetch<T>(
  url: string,
  options?: RequestInit,
  showErrorToast = true
): Promise<T> {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const errorMessage = await parseErrorResponse(response);

      if (showErrorToast) {
        // Show appropriate toast based on status code
        if (response.status === 401) {
          toast.error('Authentication Required', 'Please log in to continue');
        } else if (response.status === 403) {
          toast.error(
            'Access Denied',
            'You do not have permission to perform this action'
          );
        } else if (response.status === 404) {
          toast.error('Not Found', errorMessage);
        } else if (response.status >= 500) {
          toast.error(
            'Server Error',
            'Something went wrong. Please try again later.'
          );
        } else {
          toast.error('Request Failed', errorMessage);
        }
      }

      throw new ApiError(errorMessage, response.status);
    }

    // Handle empty responses
    const text = await response.text();
    if (!text) {
      return {} as T;
    }

    return JSON.parse(text) as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    // Network errors
    if (error instanceof TypeError && error.message.includes('fetch')) {
      if (showErrorToast) {
        toast.error('Network Error', 'Please check your internet connection');
      }
      throw new ApiError('Network error', 0);
    }

    // Unknown errors
    if (showErrorToast) {
      toast.error('Error', 'An unexpected error occurred');
    }
    throw error;
  }
}

/**
 * Custom API Error class
 */
export class ApiError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number = 0) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

/**
 * GET request helper
 */
export function apiGet<T>(url: string, showErrorToast = true): Promise<T> {
  return apiFetch<T>(url, { method: 'GET' }, showErrorToast);
}

/**
 * POST request helper
 */
export function apiPost<T>(
  url: string,
  body?: unknown,
  showErrorToast = true
): Promise<T> {
  return apiFetch<T>(
    url,
    {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    },
    showErrorToast
  );
}

/**
 * PUT request helper
 */
export function apiPut<T>(
  url: string,
  body?: unknown,
  showErrorToast = true
): Promise<T> {
  return apiFetch<T>(
    url,
    {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    },
    showErrorToast
  );
}

/**
 * PATCH request helper
 */
export function apiPatch<T>(
  url: string,
  body?: unknown,
  showErrorToast = true
): Promise<T> {
  return apiFetch<T>(
    url,
    {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    },
    showErrorToast
  );
}

/**
 * DELETE request helper
 */
export function apiDelete<T>(url: string, showErrorToast = true): Promise<T> {
  return apiFetch<T>(url, { method: 'DELETE' }, showErrorToast);
}
