/**
 * MOSAIC — JWT Utilities
 *
 * All token operations happen server-side.
 * Tokens are signed with HS256 using the JWT_SECRET env var.
 * Tokens are sent to clients as HttpOnly cookies where possible.
 */

import jwt from 'jsonwebtoken';
import { config } from '../config/config';
import type { GmTokenPayload, PlayerTokenPayload, TokenPayload } from '../types/auth.types';
import { WebRole } from '../types/game.types';

export function signGmToken(gmId: string, email: string): string {
  const payload: GmTokenPayload = {
    sub: gmId,
    email,
    role: WebRole.GM,
  };
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.gmExpiry as jwt.SignOptions['expiresIn'],
    issuer: 'mosaic-backend',
  });
}

export function signPlayerToken(
  gamePlayerId: string,
  gameId: string,
  playerName: string
): string {
  const payload: PlayerTokenPayload = {
    sub: gamePlayerId,
    gameId,
    playerName,
    role: WebRole.PLAYER,
  };
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.playerExpiry as jwt.SignOptions['expiresIn'],
    issuer: 'mosaic-backend',
  });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, config.jwt.secret, {
      issuer: 'mosaic-backend',
    }) as TokenPayload;
  } catch {
    return null;
  }
}

export function isGmPayload(payload: TokenPayload): payload is GmTokenPayload {
  return payload.role === WebRole.GM;
}

export function isPlayerPayload(payload: TokenPayload): payload is PlayerTokenPayload {
  return payload.role === WebRole.PLAYER;
}
