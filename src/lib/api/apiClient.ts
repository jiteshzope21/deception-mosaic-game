/**
 * MOSAIC — Frontend API Client
 *
 * Centralized fetch wrapper for communication with the Express/MongoDB backend.
 * Handles:
 * - Base URL configuration via VITE_API_URL
 * - Automatic Authorization Bearer header injection
 * - Cookie inclusion for HttpOnly sessions
 * - Unified error handling & response parsing
 */

import type { ApiResult, AppError } from '@/types/app';
import { ERROR_CODE } from '@/types/app';

const TOKEN_KEY = 'mosaic_token';

export const API_BASE_URL = (
  import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
).replace(/\/$/, '');

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // localStorage might be unavailable in private browsing
  }
}

export function clearStoredToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
}

async function request<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<ApiResult<T>> {
  const { params, headers, ...customConfig } = options;

  let url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined) {
        searchParams.append(key, String(val));
      }
    });
    const queryString = searchParams.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }

  const token = getStoredToken();
  const requestHeaders: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...headers,
  };

  try {
    const response = await fetch(url, {
      ...customConfig,
      headers: requestHeaders,
      credentials: 'include', // Include HttpOnly cookies if present
    });

    const json = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMsg = json?.error?.message || response.statusText || 'An unexpected error occurred.';
      const errorCode = json?.error?.code || (
        response.status === 401 ? ERROR_CODE.UNAUTHORIZED :
        response.status === 403 ? ERROR_CODE.FORBIDDEN :
        response.status === 404 ? ERROR_CODE.GAME_NOT_FOUND :
        response.status === 422 ? ERROR_CODE.VALIDATION_ERROR :
        ERROR_CODE.NETWORK_ERROR
      );

      const appError: AppError = {
        code: errorCode as any,
        message: errorMsg,
        status: response.status,
      };

      return {
        success: false,
        error: appError,
      };
    }

    // Backend responds with { success: true, data: T }
    if (json && typeof json === 'object' && 'data' in json) {
      return {
        success: true,
        data: json.data as T,
      };
    }

    return {
      success: true,
      data: json as T,
    };
  } catch (error) {
    const appError: AppError = {
      code: ERROR_CODE.NETWORK_ERROR as any,
      message: error instanceof Error ? error.message : 'Network request failed. Is the server running?',
    };
    return {
      success: false,
      error: appError,
    };
  }
}

export const apiClient = {
  get: <T>(endpoint: string, options?: RequestOptions) =>
    request<T>(endpoint, { ...options, method: 'GET' }),

  post: <T>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  put: <T>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  delete: <T>(endpoint: string, options?: RequestOptions) =>
    request<T>(endpoint, { ...options, method: 'DELETE' }),
};
