/**
 * MOSAIC — Database Entity Types
 * These mirror the PostgreSQL table schemas defined in migrations.
 * Used for typed responses throughout the application.
 */

import type { AnswerOption, BodyReportStatus, GameEventType, GamePhase, GameResult, PlayerRole, PlayerStatus, QrType, TieRule } from './enums';

// ─── GM Profile ───────────────────────────────────────────────────────────────

export interface GmProfile {
  id: string;              // FK → auth.users.id
  email: string;
  display_name: string;
  created_at: string;
  updated_at: string;
}

// ─── Game Configuration ───────────────────────────────────────────────────────

export interface GameConfiguration {
  id: string;
  // Timer durations (all in seconds)
  round_1_duration_seconds: number;       // default 240
  transition_duration_seconds: number;    // default 60
  round_2_duration_seconds: number;       // default 420
  body_report_duration_seconds: number;   // default 20
  move_to_voting_duration_seconds: number; // default 15
  voting_duration_seconds: number;        // default 15
  // Lives
  starting_lives: number;                 // default 2
  // Kill limit
  max_kills: number;                      // default 2 (NEVER exceed)
  // Voting rules
  allow_self_vote: boolean;               // default false
  tie_rule: TieRule;                      // default NO_ELIMINATION
  // Team
  allowed_team_sizes: number[];           // [5, 6]
  // Questions
  min_questions_per_qr: number;           // default 1
  max_questions_per_qr: number;           // default 2
  // Single imposter (non-configurable but stored)
  imposter_count: number;                 // always 1
  // Puzzle
  puzzle_image_path: string | null;
  // Metadata
  created_at: string;
  updated_at: string;
}

// ─── Question ─────────────────────────────────────────────────────────────────

export interface Question {
  id: string;            // Format: Q-001 through Q-050
  category: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: AnswerOption;
  technical_explanation: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Decoy Message ────────────────────────────────────────────────────────────

export interface DecoyMessage {
  id: string;
  message: string;       // MUST contain "Try another QR Buddy!"
  image_path: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Fixed QR Code ────────────────────────────────────────────────────────────

export interface FixedQrCode {
  id: string;            // Format: QR-01 through QR-10
  display_label: string; // Human-readable label
  created_at: string;
}

// ─── Physical Task ────────────────────────────────────────────────────────────

export interface PhysicalTask {
  id: string;
  zone_number: number;    // 1–6
  task_name: string;
  description: string | null;
  instructions: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Game ─────────────────────────────────────────────────────────────────────

export interface Game {
  id: string;
  game_code: string;     // Format: MOSAIC-XXXX
  team_name: string;
  team_size: 5 | 6;
  phase: GamePhase;
  result: GameResult | null;
  // Config snapshot (frozen at game start)
  config_snapshot: GameConfigSnapshot | null;
  // Timer state (server-authoritative timestamps)
  phase_started_at: string | null;
  phase_ends_at: string | null;
  // Kill tracking
  kill_count: number;    // 0, 1, or 2 — never 3
  // Puzzle
  puzzle_completed: boolean;
  // Voting cycle counter (increments per voting round)
  voting_cycle: number;
  // Timestamps
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

/**
 * Immutable snapshot of configuration when game was started.
 * Stored as JSONB in the games table.
 * GM edits after game start do NOT affect this.
 */
export interface GameConfigSnapshot {
  round_1_duration_seconds: number;
  transition_duration_seconds: number;
  round_2_duration_seconds: number;
  body_report_duration_seconds: number;
  move_to_voting_duration_seconds: number;
  voting_duration_seconds: number;
  starting_lives: number;
  max_kills: number;
  allow_self_vote: boolean;
  tie_rule: TieRule;
  min_questions_per_qr: number;
  max_questions_per_qr: number;
  imposter_count: number;
  team_size: 5 | 6;
  snapshotted_at: string;
}

// ─── Game Player ──────────────────────────────────────────────────────────────

export interface GamePlayer {
  id: string;
  game_id: string;
  player_name: string;
  status: PlayerStatus;
  lives: number;          // 0–2
  auth_user_id: string | null; // Set when player claims their slot
  joined_at: string | null;
  created_at: string;
}

// ─── Player Private State ─────────────────────────────────────────────────────

/**
 * RLS-protected: a player may only read their own row.
 * GM may read all rows.
 */
export interface PlayerPrivateState {
  id: string;
  game_id: string;
  game_player_id: string; // FK → game_players.id
  auth_user_id: string;   // FK → auth.users.id
  role: PlayerRole | null;
  assigned_task_id: string | null;
  assigned_zone_number: number | null;
  role_assigned_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Game QR Mapping ─────────────────────────────────────────────────────────

/**
 * Per-game assignment of QR codes to puzzle/decoy roles.
 * Immutable once game starts.
 */
export interface GameQrMapping {
  id: string;
  game_id: string;
  qr_code_id: string;     // FK → fixed_qr_codes.id
  qr_type: QrType;
  decoy_message_id: string | null; // Set if qr_type = DECOY
  is_locked: boolean;     // true once game starts
  created_at: string;
}

// ─── Game QR Question ─────────────────────────────────────────────────────────

/**
 * Per-game mapping of questions to QR codes.
 * Immutable once game starts.
 */
export interface GameQrQuestion {
  id: string;
  game_id: string;
  game_qr_mapping_id: string;
  question_id: string;    // FK → questions.id
  question_order: number; // 1 or 2 within this QR
  created_at: string;
}

// ─── Game Puzzle Piece ────────────────────────────────────────────────────────

export interface GamePuzzlePiece {
  id: string;
  game_id: string;
  game_qr_mapping_id: string; // The puzzle QR this piece is tied to
  piece_index: number;        // 0-based piece number
  is_unlocked: boolean;
  unlocked_at: string | null;
  unlocked_by_player_id: string | null;
  created_at: string;
}

// ─── QR Scan ──────────────────────────────────────────────────────────────────

export interface QrScan {
  id: string;
  game_id: string;
  game_player_id: string;
  qr_code_id: string;
  scanned_at: string;
  scan_result: 'PUZZLE' | 'DECOY' | 'ALREADY_COMPLETED' | 'INVALID';
}

// ─── Answer Attempt ───────────────────────────────────────────────────────────

export interface AnswerAttempt {
  id: string;
  game_id: string;
  game_player_id: string;
  game_qr_mapping_id: string;
  question_id: string;
  submitted_answer: AnswerOption;
  is_correct: boolean;    // Determined server-side
  life_deducted: boolean;
  submitted_at: string;
}

// ─── Puzzle Unlock ────────────────────────────────────────────────────────────

export interface PuzzleUnlock {
  id: string;
  game_id: string;
  game_puzzle_piece_id: string;
  game_player_id: string;   // Who triggered the unlock
  unlocked_at: string;
}

// ─── Kill ─────────────────────────────────────────────────────────────────────

export interface Kill {
  id: string;
  game_id: string;
  imposter_player_id: string;
  victim_player_id: string;
  kill_number: 1 | 2;        // DB constraint: 1 or 2 only
  reported_at: string;
}

// ─── Body Report ──────────────────────────────────────────────────────────────

export interface BodyReport {
  id: string;
  game_id: string;
  kill_id: string;
  reporter_player_id: string | null; // null if auto-reported
  status: BodyReportStatus;
  reported_at: string;
}

// ─── Vote ─────────────────────────────────────────────────────────────────────

/**
 * Vote targets are hidden from all clients until voting_revealed_at is set.
 * RLS enforces this — clients query a view, not the raw table.
 */
export interface Vote {
  id: string;
  game_id: string;
  voting_cycle: number;
  voter_player_id: string;
  target_player_id: string; // Hidden until voting phase closes
  cast_at: string;
}

/**
 * Public vote view — target hidden until revealed
 */
export interface VotePublic {
  id: string;
  game_id: string;
  voting_cycle: number;
  voter_player_id: string;
  target_player_id: string | null; // null until voting closes
  cast_at: string;
  is_revealed: boolean;
}

// ─── Game Event ───────────────────────────────────────────────────────────────

export interface GameEvent {
  id: string;
  game_id: string;
  event_type: GameEventType;
  player_id: string | null;
  event_data: Record<string, unknown>;
  occurred_at: string;
}
