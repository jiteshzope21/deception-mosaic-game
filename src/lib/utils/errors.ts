/**
 * MOSAIC — Error Utilities
 *
 * Consistent error creation, classification, and handling.
 * Never expose sensitive backend details to clients.
 */

import type { AppError, ErrorCode } from '../../types/app';
import { ERROR_CODE } from '../../types/app';

// ─── Error Factory ────────────────────────────────────────────────────────────

export function createError(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>
): AppError {
  return { code, message, details };
}

// ─── API Error Classification ────────────────────────────────────────────────
/**
 * Maps API / network error codes to AppError codes.
 * Keep sensitive details server-side — expose only safe messages.
 */
export function classifyApiError(error: unknown): AppError {
  // Handle auth errors
  if (isAuthError(error)) {
    const authError = error as { message: string; status?: number };
    if (authError.status === 400 || authError.message?.includes('Invalid login')) {
      return createError(ERROR_CODE.INVALID_CREDENTIALS, 'Invalid email or password.');
    }
    if (authError.status === 401) {
      return createError(ERROR_CODE.UNAUTHORIZED, 'Authentication required.');
    }
    return createError(ERROR_CODE.UNKNOWN_ERROR, 'Authentication error. Please try again.');
  }

  // Handle server errors
  if (isPostgresError(error)) {
    const pgError = error as { code: string; message: string; details?: string };

    // Unique constraint violations
    if (pgError.code === '23505') {
      return createError(ERROR_CODE.INVALID_ACTION, 'This action has already been performed.');
    }
    // Check constraint violations
    if (pgError.code === '23514') {
      return createError(ERROR_CODE.VALIDATION_ERROR, 'The submitted data violates game rules.');
    }
    // Foreign key violations
    if (pgError.code === '23503') {
      return createError(ERROR_CODE.VALIDATION_ERROR, 'Referenced data not found.');
    }
    // Row Level Security violations
    if (pgError.code === '42501') {
      return createError(ERROR_CODE.UNAUTHORIZED, 'You do not have permission to perform this action.');
    }

    // Log to console in dev — do NOT expose pgError.details to client
    if (import.meta.env.DEV) {
      console.error('[MOSAIC DB Error]', pgError.code, pgError.message);
    }

    return createError(ERROR_CODE.DATABASE_ERROR, 'A database error occurred. Please try again.');
  }

  // Network errors
  if (isNetworkError(error)) {
    return createError(ERROR_CODE.NETWORK_ERROR, 'Network connection error. Please check your connection.');
  }

  // Unknown errors
  if (import.meta.env.DEV) {
    console.error('[MOSAIC Unknown Error]', error);
  }

  return createError(ERROR_CODE.UNKNOWN_ERROR, 'An unexpected error occurred. Please try again.');
}

// ─── Type Guards ──────────────────────────────────────────────────────────────

function isAuthError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    '__isAuthError' in error
  );
}

function isPostgresError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string' &&
    (error as { code: string }).code.length === 5 // PG error codes are 5 chars
  );
}

function isNetworkError(error: unknown): boolean {
  return (
    error instanceof TypeError &&
    (error.message.includes('fetch') || error.message.includes('network'))
  );
}

// ─── User-safe Error Messages ─────────────────────────────────────────────────

/**
 * Returns a user-safe message for an AppError.
 * Never expose stack traces or internal details to users.
 */
export function getUserMessage(error: AppError): string {
  return error.message;
}

/**
 * Checks if an error is an authorization error.
 */
export function isAuthorizationError(error: AppError): boolean {
  return (
    error.code === ERROR_CODE.UNAUTHORIZED ||
    error.code === ERROR_CODE.SESSION_EXPIRED ||
    error.code === ERROR_CODE.INVALID_CREDENTIALS
  );
}
