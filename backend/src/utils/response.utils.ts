/**
 * MOSAIC — Response Utilities
 */

import type { Response } from 'express';
import type { ApiResponse } from '../types/auth.types';
import { ErrorCode } from '../types/auth.types';

export function sendSuccess<T>(res: Response, data: T, status = 200): void {
  const response: ApiResponse<T> = { success: true, data };
  res.status(status).json(response);
}

export function sendError(
  res: Response,
  code: string,
  message: string,
  status = 400
): void {
  const response: ApiResponse = {
    success: false,
    error: { code, message },
  };
  res.status(status).json(response);
}

export function sendUnauthorized(res: Response, message = 'Authentication required.'): void {
  sendError(res, ErrorCode.UNAUTHORIZED, message, 401);
}

export function sendForbidden(res: Response, message = 'You do not have permission to perform this action.'): void {
  sendError(res, ErrorCode.FORBIDDEN, message, 403);
}

export function sendNotFound(res: Response, message = 'Resource not found.'): void {
  sendError(res, ErrorCode.GAME_NOT_FOUND, message, 404);
}

export function sendValidationError(res: Response, message: string): void {
  sendError(res, ErrorCode.VALIDATION_ERROR, message, 422);
}

export function sendInternalError(res: Response): void {
  sendError(res, ErrorCode.INTERNAL_ERROR, 'An internal server error occurred.', 500);
}
