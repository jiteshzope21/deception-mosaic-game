/**
 * MOSAIC — Core Enumeration Types
 * These match the PostgreSQL enums defined in migrations.
 * All state transitions are server-authoritative.
 */

// ─── Game Phase / State Machine ───────────────────────────────────────────────

export const GAME_PHASE = {
  LOBBY: 'LOBBY',
  ROUND_1_ACTIVE: 'ROUND_1_ACTIVE',
  ROUND_1_COMPLETE: 'ROUND_1_COMPLETE',
  TRANSITION: 'TRANSITION',
  ROUND_2_ACTIVE: 'ROUND_2_ACTIVE',
  BODY_REPORT: 'BODY_REPORT',
  MOVE_TO_VOTING: 'MOVE_TO_VOTING',
  VOTING: 'VOTING',
  GAME_COMPLETE: 'GAME_COMPLETE',
} as const;

export type GamePhase = (typeof GAME_PHASE)[keyof typeof GAME_PHASE];

// ─── Game Result ──────────────────────────────────────────────────────────────

export const GAME_RESULT = {
  CREWMATES_WIN: 'CREWMATES_WIN',
  IMPOSTER_WIN_KILLS: 'IMPOSTER_WIN_KILLS',
  IMPOSTER_WIN_TIME: 'IMPOSTER_WIN_TIME',
  ROUND_1_FAILED: 'ROUND_1_FAILED',
} as const;

export type GameResult = (typeof GAME_RESULT)[keyof typeof GAME_RESULT];

// ─── Player Role ──────────────────────────────────────────────────────────────

export const PLAYER_ROLE = {
  CREWMATE: 'CREWMATE',
  IMPOSTER: 'IMPOSTER',
} as const;

export type PlayerRole = (typeof PLAYER_ROLE)[keyof typeof PLAYER_ROLE];

// ─── Player Status ────────────────────────────────────────────────────────────

export const PLAYER_STATUS = {
  REGISTERED: 'REGISTERED', // Name created by GM, not yet joined
  JOINED: 'JOINED',         // Player has claimed this slot
  ALIVE: 'ALIVE',           // Active in Round 2
  ELIMINATED: 'ELIMINATED', // Voted out or killed
} as const;

export type PlayerStatus = (typeof PLAYER_STATUS)[keyof typeof PLAYER_STATUS];

// ─── QR Type (per-game assignment) ───────────────────────────────────────────

export const QR_TYPE = {
  PUZZLE: 'PUZZLE',
  DECOY: 'DECOY',
} as const;

export type QrType = (typeof QR_TYPE)[keyof typeof QR_TYPE];

// ─── Tie Rule ─────────────────────────────────────────────────────────────────

export const TIE_RULE = {
  NO_ELIMINATION: 'NO_ELIMINATION',
  REVOTE: 'REVOTE',
  RANDOM_PICK: 'RANDOM_PICK',
} as const;

export type TieRule = (typeof TIE_RULE)[keyof typeof TIE_RULE];

// ─── Answer Option ────────────────────────────────────────────────────────────

export const ANSWER_OPTION = {
  A: 'A',
  B: 'B',
  C: 'C',
  D: 'D',
} as const;

export type AnswerOption = (typeof ANSWER_OPTION)[keyof typeof ANSWER_OPTION];

// ─── Web Role (application-level) ────────────────────────────────────────────

export const WEB_ROLE = {
  GM: 'GM',
  PLAYER: 'PLAYER',
} as const;

export type WebRole = (typeof WEB_ROLE)[keyof typeof WEB_ROLE];

// ─── Body Report Status ───────────────────────────────────────────────────────

export const BODY_REPORT_STATUS = {
  PENDING: 'PENDING',     // Within the 20s window
  ACCEPTED: 'ACCEPTED',   // First valid report
  AUTO: 'AUTO',           // System auto-reported after 20s
} as const;

export type BodyReportStatus = (typeof BODY_REPORT_STATUS)[keyof typeof BODY_REPORT_STATUS];

// ─── Game Event Types ─────────────────────────────────────────────────────────

export const GAME_EVENT_TYPE = {
  GAME_CREATED: 'GAME_CREATED',
  PLAYER_JOINED: 'PLAYER_JOINED',
  GAME_STARTED: 'GAME_STARTED',
  QR_SCANNED: 'QR_SCANNED',
  ANSWER_SUBMITTED: 'ANSWER_SUBMITTED',
  LIFE_LOST: 'LIFE_LOST',
  QR_COMPLETED: 'QR_COMPLETED',
  PUZZLE_PIECE_UNLOCKED: 'PUZZLE_PIECE_UNLOCKED',
  ROUND_1_COMPLETED: 'ROUND_1_COMPLETED',
  TRANSITION_STARTED: 'TRANSITION_STARTED',
  ROLE_ASSIGNED: 'ROLE_ASSIGNED',
  TASK_ASSIGNED: 'TASK_ASSIGNED',
  ROUND_2_STARTED: 'ROUND_2_STARTED',
  KILL_REPORTED: 'KILL_REPORTED',
  BODY_REPORTED: 'BODY_REPORTED',
  VOTING_STARTED: 'VOTING_STARTED',
  VOTE_CAST: 'VOTE_CAST',
  PLAYER_ELIMINATED: 'PLAYER_ELIMINATED',
  GAME_COMPLETED: 'GAME_COMPLETED',
  PHASE_TRANSITION: 'PHASE_TRANSITION',
  TIMER_EXPIRED: 'TIMER_EXPIRED',
} as const;

export type GameEventType = (typeof GAME_EVENT_TYPE)[keyof typeof GAME_EVENT_TYPE];

// ─── Socket Events ────────────────────────────────────────────────────────────

export const SOCKET_EVENT = {
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  AUTH_ERROR: 'auth_error',
  GAME_STATE_UPDATE: 'game:state_update',
  LOBBY_UPDATE: 'lobby:update',
  PLAYER_JOINED: 'lobby:player_joined',
  PLAYER_LEFT: 'lobby:player_left',
  GAME_STARTED: 'game:started',
  PHASE_CHANGED: 'game:phase_changed',
  LIVES_UPDATE: 'r1:lives_update',
  PUZZLE_UPDATE: 'r1:puzzle_update',
  QR_SCAN_RESULT: 'r1:qr_scan_result',
  ROUND_2_STARTED: 'r2:started',
  KILL_OCCURRED: 'r2:kill',
  BODY_REPORT_STARTED: 'r2:body_report',
  VOTING_STARTED: 'r2:voting_started',
  VOTE_CAST: 'r2:vote_cast',
  VOTING_RESULT: 'r2:voting_result',
  PLAYER_ELIMINATED: 'r2:player_eliminated',
  GAME_COMPLETE: 'game:complete',
  TIMER_TICK: 'game:timer_tick',
  JOIN_ROOM: 'join_room',
  GM_ACTION: 'gm:action',
} as const;

export type SocketEvent = (typeof SOCKET_EVENT)[keyof typeof SOCKET_EVENT];
export const SocketEvent = SOCKET_EVENT;
export type SocketEventName = SocketEvent;

// ─── Value Aliases ────────────────────────────────────────────────────────────
export const GamePhase = GAME_PHASE;
export const GameResult = GAME_RESULT;
export const PlayerRole = PLAYER_ROLE;
export const PlayerStatus = PLAYER_STATUS;
export const QrType = QR_TYPE;
export const TieRule = TIE_RULE;
export const AnswerOption = ANSWER_OPTION;
export const WebRole = WEB_ROLE;
export const BodyReportStatus = BODY_REPORT_STATUS;
export const GameEventType = GAME_EVENT_TYPE;
