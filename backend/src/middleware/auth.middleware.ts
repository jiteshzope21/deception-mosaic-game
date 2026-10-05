/**
 * MOSAIC — Authentication & Authorization Middleware
 *
 * All protected routes must pass through these middleware.
 * The backend is the ONLY authority on identity — never trust client-provided IDs.
 *
 * Token extraction order: Authorization header → cookie
 */

import type { Request, Response, NextFunction } from 'express';
import { verifyToken, isGmPayload, isPlayerPayload } from '../utils/jwt.utils';
import { sendUnauthorized, sendForbidden } from '../utils/response.utils';

// ─── Token Extraction ─────────────────────────────────────────────────────────

function extractToken(req: Request): string | null {
  // 1. Authorization: Bearer <token>
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  // 2. HttpOnly cookie (preferred for security)
  const cookieToken = req.cookies?.mosaic_token as string | undefined;
  if (cookieToken) return cookieToken;

  return null;
}

// ─── Require Authenticated ────────────────────────────────────────────────────

/**
 * Requires any valid JWT (GM or Player).
 * Populates req.webRole and role-specific fields.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) {
    sendUnauthorized(res);
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    sendUnauthorized(res, 'Invalid or expired token. Please re-authenticate.');
    return;
  }

  req.webRole = payload.role;

  if (isGmPayload(payload)) {
    req.gmId = payload.sub;
  } else if (isPlayerPayload(payload)) {
    req.playerId = payload.sub;
    req.gameId = payload.gameId;
    req.playerName = payload.playerName;
  }

  next();
}

// ─── Require GM ───────────────────────────────────────────────────────────────

/**
 * Requires an authenticated GM session.
 * Rejects player sessions.
 */
export function requireGm(req: Request, res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) {
    sendUnauthorized(res);
    return;
  }

  const payload = verifyToken(token);
  if (!payload || !isGmPayload(payload)) {
    sendForbidden(res, 'This endpoint requires Game Master authentication.');
    return;
  }

  req.gmId = payload.sub;
  req.webRole = payload.role;
  next();
}

// ─── Require Player ───────────────────────────────────────────────────────────

/**
 * Requires an authenticated Player session.
 * Rejects GM sessions.
 */
export function requirePlayer(req: Request, res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) {
    sendUnauthorized(res);
    return;
  }

  const payload = verifyToken(token);
  if (!payload || !isPlayerPayload(payload)) {
    sendForbidden(res, 'This endpoint requires a Player session.');
    return;
  }

  req.playerId = payload.sub;
  req.gameId = payload.gameId;
  req.playerName = payload.playerName;
  req.webRole = payload.role;
  next();
}

// ─── Error Handling Middleware ────────────────────────────────────────────────

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error('[MOSAIC] Unhandled error:', err.message);

  // Never expose stack traces or internal error details to clients
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An internal server error occurred.',
    },
  });
}

// ─── Not Found Handler ────────────────────────────────────────────────────────

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found.`,
    },
  });
}
