/**
 * MOSAIC — Auth & Session Types
 */

import type { WebRole } from './game.types';

// ─── JWT Payload ──────────────────────────────────────────────────────────────

export interface GmTokenPayload {
  sub: string;        // GM MongoDB _id
  email: string;
  role: WebRole.GM;
  iat?: number;
  exp?: number;
}

export interface PlayerTokenPayload {
  sub: string;        // game_player MongoDB _id
  gameId: string;
  playerName: string;
  role: WebRole.PLAYER;
  iat?: number;
  exp?: number;
}

export type TokenPayload = GmTokenPayload | PlayerTokenPayload;

// ─── Request Augmentation ─────────────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      gmId?: string;
      playerId?: string;    // game_player _id
      gameId?: string;
      playerName?: string;
      webRole?: WebRole;
    }
  }
}

// ─── API Responses ────────────────────────────────────────────────────────────

export interface ApiSuccess<T = unknown> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiError;

// ─── Error Codes ──────────────────────────────────────────────────────────────

export const ErrorCode = {
  // Auth
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  // Game
  GAME_NOT_FOUND: 'GAME_NOT_FOUND',
  GAME_NOT_IN_LOBBY: 'GAME_NOT_IN_LOBBY',
  GAME_ALREADY_ACTIVE: 'GAME_ALREADY_ACTIVE',
  INVALID_GAME_PHASE: 'INVALID_GAME_PHASE',
  INVALID_TEAM_SIZE: 'INVALID_TEAM_SIZE',
  // Player
  PLAYER_NOT_FOUND: 'PLAYER_NOT_FOUND',
  PLAYER_ALREADY_JOINED: 'PLAYER_ALREADY_JOINED',
  PLAYER_NOT_ALIVE: 'PLAYER_NOT_ALIVE',
  // QR / Round 1
  INVALID_QR: 'INVALID_QR',
  QR_ALREADY_COMPLETED: 'QR_ALREADY_COMPLETED',
  INVALID_ANSWER: 'INVALID_ANSWER',
  // Round 2
  NOT_IMPOSTER: 'NOT_IMPOSTER',
  MAX_KILLS_REACHED: 'MAX_KILLS_REACHED',
  DUPLICATE_KILL: 'DUPLICATE_KILL',
  CANNOT_VOTE: 'CANNOT_VOTE',
  ALREADY_VOTED: 'ALREADY_VOTED',
  // Generic
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];
