/**
 * MOSAIC — Application & API Types
 * Types for service layer, API responses, and application state.
 */

import type { GamePhase, PlayerRole, TieRule } from './enums';
import type { GameConfigSnapshot, GamePlayer, PlayerPrivateState } from './database';

// ─── Auth Types ───────────────────────────────────────────────────────────────

export interface GmAuthUser {
  id: string;
  email: string;
  role: 'GM';
  displayName?: string;
}

/**
 * Player identity comes from the game_players document in MongoDB.
 * Handled via server-issued JWT token.
 */
export interface PlayerAuthUser {
  id: string;
  role: 'PLAYER';
  game_player_id: string;
  game_id: string;
  player_name: string;
}

export type AuthUser = GmAuthUser | PlayerAuthUser;

// ─── Session Types ────────────────────────────────────────────────────────────

export interface GmSession {
  type: 'GM';
  user: GmAuthUser;
  token: string;
}

export interface PlayerSession {
  type: 'PLAYER';
  user: PlayerAuthUser;
  token: string;
  game_player: GamePlayer;
  private_state: PlayerPrivateState | null;
}

export type AppSession = GmSession | PlayerSession;

// ─── API Response Wrappers ────────────────────────────────────────────────────

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: AppError;
}

export type ApiResult<T> = ApiSuccess<T> | ApiError;

// ─── Error Types ──────────────────────────────────────────────────────────────

export const ERROR_CODE = {
  // Auth
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  // Game code
  GAME_NOT_FOUND: 'GAME_NOT_FOUND',
  GAME_NOT_IN_LOBBY: 'GAME_NOT_IN_LOBBY',
  PLAYER_NAME_NOT_FOUND: 'PLAYER_NAME_NOT_FOUND',
  PLAYER_ALREADY_JOINED: 'PLAYER_ALREADY_JOINED',
  PLAYER_SLOT_TAKEN: 'PLAYER_SLOT_TAKEN',
  // Game state
  INVALID_GAME_PHASE: 'INVALID_GAME_PHASE',
  INVALID_ACTION: 'INVALID_ACTION',
  GAME_ALREADY_ACTIVE: 'GAME_ALREADY_ACTIVE',
  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_TEAM_SIZE: 'INVALID_TEAM_SIZE',
  INVALID_ANSWER: 'INVALID_ANSWER',
  // QR
  INVALID_QR: 'INVALID_QR',
  QR_ALREADY_COMPLETED: 'QR_ALREADY_COMPLETED',
  // Round 2
  NOT_IMPOSTER: 'NOT_IMPOSTER',
  PLAYER_NOT_ALIVE: 'PLAYER_NOT_ALIVE',
  MAX_KILLS_REACHED: 'MAX_KILLS_REACHED',
  DUPLICATE_KILL: 'DUPLICATE_KILL',
  CANNOT_VOTE: 'CANNOT_VOTE',
  ALREADY_VOTED: 'ALREADY_VOTED',
  // Generic
  NETWORK_ERROR: 'NETWORK_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODE)[keyof typeof ERROR_CODE];

export interface AppError {
  code: ErrorCode;
  message: string;
  status?: number;
  details?: Record<string, unknown>;
}

// ─── Game State (client-side view) ───────────────────────────────────────────

/**
 * A safe, sanitized view of game state for the player client.
 * Never contains other players' private information.
 */
export interface PlayerGameView {
  game_id: string;
  game_code: string;
  team_name: string;
  team_size: 5 | 6;
  phase: GamePhase;
  // Timer info (client calculates display from these authoritative timestamps)
  phase_started_at: string | null;
  phase_ends_at: string | null;
  // Players (public info only)
  players: PlayerPublicInfo[];
  // Own private info
  my_player_id: string;
  my_lives: number;
  my_status: string;
  my_role: PlayerRole | null;        // Only revealed after transition
  my_task_zone: number | null;       // Only revealed after transition
  my_task_name: string | null;
  // Puzzle progress (public)
  puzzle_pieces_total: number;
  puzzle_pieces_unlocked: number;
  // Kill tracking (public)
  kill_count: number;
}

export interface PlayerPublicInfo {
  id: string;
  player_name: string;
  status: string;
  lives: number;
  has_joined: boolean;
}

/**
 * GM has full game visibility.
 */
export interface GmGameView {
  game_id: string;
  game_code: string;
  team_name: string;
  team_size: 5 | 6;
  phase: GamePhase;
  phase_started_at: string | null;
  phase_ends_at: string | null;
  players: GmPlayerView[];
  kill_count: number;
  puzzle_completed: boolean;
  voting_cycle: number;
  config_snapshot: GameConfigSnapshot | null;
}

export interface GmPlayerView {
  id: string;
  player_name: string;
  status: string;
  lives: number;
  auth_user_id: string | null;
  has_joined: boolean;
  role: PlayerRole | null;   // GM can see roles
  assigned_zone: number | null;
  assigned_task: string | null;
}

// ─── Player Join Flow ─────────────────────────────────────────────────────────

export interface JoinGameRequest {
  game_code: string;
  player_name: string;
}

export interface JoinGameResponse {
  game_player_id: string;
  player_name: string;
  game_id: string;
  game_code: string;
  team_name: string;
  access_token: string;  // JWT auth token
  refresh_token: string;
}

// ─── Configuration Types ──────────────────────────────────────────────────────

export interface GameConfigDefaults {
  round_1_duration_seconds: 240;
  transition_duration_seconds: 60;
  round_2_duration_seconds: 420;
  body_report_duration_seconds: 20;
  move_to_voting_duration_seconds: 15;
  voting_duration_seconds: 15;
  starting_lives: 2;
  max_kills: 2;
  allow_self_vote: false;
  tie_rule: TieRule;
  min_questions_per_qr: 1;
  max_questions_per_qr: 2;
  imposter_count: 1;
  allowed_team_sizes: [5, 6];
}

// ─── Timer Types ──────────────────────────────────────────────────────────────

export interface TimerState {
  phase: GamePhase;
  started_at: string;
  ends_at: string;
  total_duration_seconds: number;
  // Calculated client-side:
  remaining_seconds: number;
  elapsed_seconds: number;
  is_expired: boolean;
}
