/**
 * MOSAIC — Shared Game Types & Enums
 *
 * These types are the authoritative source of truth for all game state.
 * They are used by BOTH the backend (Express/MongoDB) and
 * may be safely duplicated/imported into the frontend via a shared types package.
 *
 * The backend is the ONLY authority on state transitions.
 * The frontend only displays what the backend reports.
 */

// ─── Game Phase (State Machine) ───────────────────────────────────────────────

export enum GamePhase {
  LOBBY = 'LOBBY',
  ROUND_1_ACTIVE = 'ROUND_1_ACTIVE',
  ROUND_1_COMPLETE = 'ROUND_1_COMPLETE',
  TRANSITION = 'TRANSITION',
  ROUND_2_ACTIVE = 'ROUND_2_ACTIVE',
  BODY_REPORT = 'BODY_REPORT',
  MOVE_TO_VOTING = 'MOVE_TO_VOTING',
  VOTING = 'VOTING',
  GAME_COMPLETE = 'GAME_COMPLETE',
}

/**
 * Valid state-machine transitions.
 * The backend enforces these — no client can force an arbitrary transition.
 */
export const VALID_PHASE_TRANSITIONS: Record<GamePhase, GamePhase[]> = {
  [GamePhase.LOBBY]: [GamePhase.ROUND_1_ACTIVE],
  [GamePhase.ROUND_1_ACTIVE]: [GamePhase.ROUND_1_COMPLETE],
  [GamePhase.ROUND_1_COMPLETE]: [GamePhase.TRANSITION],
  [GamePhase.TRANSITION]: [GamePhase.ROUND_2_ACTIVE],
  [GamePhase.ROUND_2_ACTIVE]: [GamePhase.BODY_REPORT, GamePhase.GAME_COMPLETE],
  [GamePhase.BODY_REPORT]: [GamePhase.MOVE_TO_VOTING],
  [GamePhase.MOVE_TO_VOTING]: [GamePhase.VOTING],
  [GamePhase.VOTING]: [GamePhase.ROUND_2_ACTIVE, GamePhase.GAME_COMPLETE],
  [GamePhase.GAME_COMPLETE]: [],
};

export function isValidTransition(from: GamePhase, to: GamePhase): boolean {
  return VALID_PHASE_TRANSITIONS[from]?.includes(to) ?? false;
}

// ─── Game Result ──────────────────────────────────────────────────────────────

export enum GameResult {
  CREWMATES_WIN = 'CREWMATES_WIN',
  IMPOSTER_WIN_KILLS = 'IMPOSTER_WIN_KILLS',
  IMPOSTER_WIN_TIME = 'IMPOSTER_WIN_TIME',
  ROUND_1_FAILED = 'ROUND_1_FAILED',
  ROUND_TERMINATED = 'ROUND_TERMINATED',
}

// ─── Player Role ──────────────────────────────────────────────────────────────

export enum PlayerRole {
  CREWMATE = 'CREWMATE',
  IMPOSTER = 'IMPOSTER',
}

// ─── Player Status ────────────────────────────────────────────────────────────

export enum PlayerStatus {
  REGISTERED = 'REGISTERED', // GM created the slot, player has not joined yet
  JOINED = 'JOINED',         // Player has claimed their slot (lobby)
  ALIVE = 'ALIVE',           // Active in Round 2
  ELIMINATED = 'ELIMINATED', // Voted out or killed
}

// ─── QR Type ─────────────────────────────────────────────────────────────────

export enum QrType {
  PUZZLE = 'PUZZLE',
  DECOY = 'DECOY',
}

// ─── Tie Rule ─────────────────────────────────────────────────────────────────

export enum TieRule {
  NO_ELIMINATION = 'NO_ELIMINATION',
  REVOTE = 'REVOTE',
  RANDOM_PICK = 'RANDOM_PICK',
}

// ─── Answer Option ────────────────────────────────────────────────────────────

export enum AnswerOption {
  A = 'A',
  B = 'B',
  C = 'C',
  D = 'D',
}

// ─── Body Report Status ───────────────────────────────────────────────────────

export enum BodyReportStatus {
  PENDING = 'PENDING',   // Within the 20s window
  ACCEPTED = 'ACCEPTED', // First valid manual report
  AUTO = 'AUTO',         // System auto-reported after window expired
}

// ─── Web Role ─────────────────────────────────────────────────────────────────

export enum WebRole {
  GM = 'GM',
  PLAYER = 'PLAYER',
  // NO VOLUNTEER ROLE — volunteers are entirely outside the software
}

// ─── Game Event Types ─────────────────────────────────────────────────────────

export enum GameEventType {
  GAME_CREATED = 'GAME_CREATED',
  PLAYER_JOINED = 'PLAYER_JOINED',
  GAME_STARTED = 'GAME_STARTED',
  QR_SCANNED = 'QR_SCANNED',
  ANSWER_SUBMITTED = 'ANSWER_SUBMITTED',
  LIFE_LOST = 'LIFE_LOST',
  QR_COMPLETED = 'QR_COMPLETED',
  PUZZLE_PIECE_UNLOCKED = 'PUZZLE_PIECE_UNLOCKED',
  ROUND_1_COMPLETED = 'ROUND_1_COMPLETED',
  TRANSITION_STARTED = 'TRANSITION_STARTED',
  ROLE_ASSIGNED = 'ROLE_ASSIGNED',
  TASK_ASSIGNED = 'TASK_ASSIGNED',
  ROUND_2_STARTED = 'ROUND_2_STARTED',
  KILL_REPORTED = 'KILL_REPORTED',
  BODY_REPORTED = 'BODY_REPORTED',
  VOTING_STARTED = 'VOTING_STARTED',
  VOTE_CAST = 'VOTE_CAST',
  PLAYER_ELIMINATED = 'PLAYER_ELIMINATED',
  GAME_COMPLETED = 'GAME_COMPLETED',
  PHASE_TRANSITION = 'PHASE_TRANSITION',
  TIMER_EXPIRED = 'TIMER_EXPIRED',
  GAME_PAUSED = 'GAME_PAUSED',
  GAME_RESUMED = 'GAME_RESUMED',
  ROUND_RESET = 'ROUND_RESET',
  ROUND_TERMINATED = 'ROUND_TERMINATED',
}

// ─── Socket.IO Event Names ────────────────────────────────────────────────────

/**
 * Canonical event names for Socket.IO communication.
 * Backend emits these. Frontend listens to these.
 * Never use magic strings elsewhere in the codebase.
 */
export const SocketEvent = {
  // Connection lifecycle
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  AUTH_ERROR: 'auth_error',

  // Server → Client: Game state
  GAME_STATE_UPDATE: 'game:state_update',
  LOBBY_UPDATE: 'lobby:update',
  PLAYER_JOINED: 'lobby:player_joined',
  PLAYER_LEFT: 'lobby:player_left',
  GAME_STARTED: 'game:started',
  PHASE_CHANGED: 'game:phase_changed',
  GAME_PAUSED: 'game:paused',
  GAME_RESUMED: 'game:resumed',
  ROUND_RESET: 'game:round_reset',
  ROUND_TERMINATED: 'game:round_terminated',

  // Server → Client: Round 1
  LIVES_UPDATE: 'r1:lives_update',
  PUZZLE_UPDATE: 'r1:puzzle_update',
  QR_SCAN_RESULT: 'r1:qr_scan_result',

  // Server → Client: Round 2 & Transition
  TRANSITION_STARTED: 'r2:transition_started',
  PLAYER_ROLE_ASSIGNED_PRIVATE: 'r2:role_assigned_private',
  PLAYER_STATUS_CHANGED: 'r2:player_status_changed',
  ROUND_2_STARTED: 'r2:started',
  KILL_OCCURRED: 'r2:kill',
  KILL_RECORDED: 'r2:kill_recorded',
  BODY_REPORT_STARTED: 'r2:body_report',
  BODY_REPORTED: 'r2:body_reported',
  BODY_REPORT_EXPIRED: 'r2:body_report_expired',
  MOVE_TO_VOTING_STARTED: 'r2:move_to_voting_started',
  VOTING_STARTED: 'r2:voting_started',
  VOTE_SUBMITTED: 'r2:vote_submitted',
  VOTE_CAST: 'r2:vote_cast',
  VOTING_CLOSED: 'r2:voting_closed',
  VOTING_RESULT: 'r2:voting_result',
  PLAYER_ELIMINATED: 'r2:player_eliminated',

  // Server → Client: Game completion
  GAME_COMPLETE: 'game:complete',
  GAME_WON: 'game:won',
  GAME_COMPLETED: 'game:completed',
  TIMER_TICK: 'game:timer_tick',

  // Client → Server: Actions
  JOIN_ROOM: 'join_room',
  GM_ACTION: 'gm:action',
} as const;

export type SocketEventName = (typeof SocketEvent)[keyof typeof SocketEvent];
