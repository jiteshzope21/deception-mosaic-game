/**
 * MOSAIC — Game Model
 *
 * The central game document. Contains the complete state of one game.
 *
 * DESIGN RATIONALE:
 * - configSnapshot is embedded at game start and never changes after that.
 *   GM edits to GameConfiguration do NOT affect a running game.
 * - qrMappings, players, kills, bodyReports, votes, events are embedded/
 *   referenced documents for atomic operations and query efficiency.
 * - Timers use start/end timestamps — no per-second DB writes needed.
 *   Clients compute display countdown from these authoritative values.
 * - Only ONE game may be active (phase != GAME_COMPLETE) at a time,
 *   enforced by a partial unique index.
 */

import { Schema, model, Document, Types } from 'mongoose';
import {
  GamePhase,
  GameResult,
  PlayerRole,
  PlayerStatus,
  QrType,
  TieRule,
  AnswerOption,
  BodyReportStatus,
  GameEventType,
} from '../types/game.types';

// ─── Embedded: Config Snapshot ────────────────────────────────────────────────

export interface IConfigSnapshot {
  round1DurationSeconds: number;
  transitionDurationSeconds: number;
  round2DurationSeconds: number;
  bodyReportDurationSeconds: number;
  moveToVotingDurationSeconds: number;
  votingDurationSeconds: number;
  startingLives: number;
  maxKills: number;
  imposterCount: number;
  allowSelfVote: boolean;
  tieRule: TieRule;
  minQuestionsPerQr: number;
  maxQuestionsPerQr: number;
  teamSize: 5 | 6;
  snapshottedAt: Date;
}

const configSnapshotSchema = new Schema<IConfigSnapshot>(
  {
    round1DurationSeconds: { type: Number, required: true },
    transitionDurationSeconds: { type: Number, required: true },
    round2DurationSeconds: { type: Number, required: true },
    bodyReportDurationSeconds: { type: Number, required: true },
    moveToVotingDurationSeconds: { type: Number, required: true },
    votingDurationSeconds: { type: Number, required: true },
    startingLives: { type: Number, required: true },
    maxKills: { type: Number, required: true },
    imposterCount: { type: Number, required: true },
    allowSelfVote: { type: Boolean, required: true },
    tieRule: { type: String, enum: Object.values(TieRule), required: true },
    minQuestionsPerQr: { type: Number, required: true },
    maxQuestionsPerQr: { type: Number, required: true },
    teamSize: { type: Number, enum: [5, 6], required: true },
    snapshottedAt: { type: Date, required: true },
  },
  { _id: false }
);

// ─── Embedded: QR Mapping ─────────────────────────────────────────────────────

export interface IQrQuestion {
  questionId: string;   // Q-001 format
  questionOrder: number; // 1 or 2
}

export interface IQrMapping {
  qrCodeId: string;         // QR-01 through QR-10
  qrType: QrType;
  decoyMessageId: Types.ObjectId | null;
  questions: IQrQuestion[]; // 1–2 questions, empty if decoy
  puzzlePieceIndex: number | null; // 0-based piece index, null if decoy
  isCompleted: boolean;     // true when all questions answered correctly
  completedByPlayerId: Types.ObjectId | null;
  completedAt: Date | null;
}

const qrMappingSchema = new Schema<IQrMapping>(
  {
    qrCodeId: { type: String, required: true, match: /^QR-\d{2}$/ },
    qrType: { type: String, enum: Object.values(QrType), required: true },
    decoyMessageId: { type: Schema.Types.ObjectId, ref: 'DecoyMessage', default: null },
    questions: [
      {
        questionId: { type: String, required: true, match: /^Q-\d{3}$/ },
        questionOrder: { type: Number, required: true, min: 1, max: 2 },
        _id: false,
      },
    ],
    puzzlePieceIndex: { type: Number, default: null },
    isCompleted: { type: Boolean, default: false },
    completedByPlayerId: { type: Schema.Types.ObjectId, ref: 'Game.players', default: null },
    completedAt: { type: Date, default: null },
  },
  { _id: false }
);

// ─── Embedded: Game Player ────────────────────────────────────────────────────

export interface IGamePlayer {
  _id: Types.ObjectId;
  playerName: string;
  status: PlayerStatus;
  lives: number;
  // Set when player claims their slot (join flow)
  authToken: string | null;    // Opaque token stored server-side, matched at login
  joinedAt: Date | null;
  // Private (only sent to player's own session + GM)
  role: PlayerRole | null;
  assignedTaskZone: number | null;
  assignedTaskZoneName: string | null;
  assignedTaskName: string | null;
  assignedTaskDescription: string | null;
  roleAssignedAt: Date | null;
}

const gamePlayerSchema = new Schema<IGamePlayer>(
  {
    playerName: { type: String, required: true, trim: true, maxlength: 30 },
    status: {
      type: String,
      enum: Object.values(PlayerStatus),
      default: PlayerStatus.REGISTERED,
    },
    lives: {
      type: Number,
      default: 2,
      min: 0,
    },
    authToken: { type: String, default: null, select: false }, // Never sent to client
    joinedAt: { type: Date, default: null },
    // Private fields — only returned to owner + GM
    role: { type: String, enum: Object.values(PlayerRole), default: null },
    assignedTaskZone: { type: Number, min: 1, max: 6, default: null },
    assignedTaskZoneName: { type: String, default: null },
    assignedTaskName: { type: String, default: null },
    assignedTaskDescription: { type: String, default: null },
    roleAssignedAt: { type: Date, default: null },
  }
);

// ─── Embedded: Kill ───────────────────────────────────────────────────────────

export interface IKill {
  _id: Types.ObjectId;
  imposterPlayerId: Types.ObjectId;
  victimPlayerId: Types.ObjectId;
  killNumber: 1 | 2;   // 1 or 2 — never 3
  reportedAt: Date;
}

const killSchema = new Schema<IKill>({
  imposterPlayerId: { type: Schema.Types.ObjectId, required: true },
  victimPlayerId: { type: Schema.Types.ObjectId, required: true },
  killNumber: { type: Number, required: true, enum: [1, 2] },
  reportedAt: { type: Date, default: Date.now },
});

// ─── Embedded: Body Report ────────────────────────────────────────────────────

export interface IBodyReport {
  _id: Types.ObjectId;
  killId: Types.ObjectId;
  reporterPlayerId: Types.ObjectId | null; // null if auto-reported
  status: BodyReportStatus;
  reportedAt: Date;
}

const bodyReportSchema = new Schema<IBodyReport>({
  killId: { type: Schema.Types.ObjectId, required: true },
  reporterPlayerId: { type: Schema.Types.ObjectId, default: null },
  status: {
    type: String,
    enum: Object.values(BodyReportStatus),
    default: BodyReportStatus.PENDING,
  },
  reportedAt: { type: Date, default: Date.now },
});

// ─── Embedded: Vote ───────────────────────────────────────────────────────────

export interface IVote {
  _id: Types.ObjectId;
  votingCycle: number;
  voterPlayerId: Types.ObjectId;
  targetPlayerId: Types.ObjectId;
  castAt: Date;
}

const voteSchema = new Schema<IVote>({
  votingCycle: { type: Number, required: true },
  voterPlayerId: { type: Schema.Types.ObjectId, required: true },
  targetPlayerId: { type: Schema.Types.ObjectId, required: true },
  castAt: { type: Date, default: Date.now },
});

// ─── Embedded: Game Event ─────────────────────────────────────────────────────

export interface IGameEvent {
  _id: Types.ObjectId;
  eventType: GameEventType;
  playerId: Types.ObjectId | null;
  eventData: Record<string, unknown>;
  occurredAt: Date;
}

const gameEventSchema = new Schema<IGameEvent>({
  eventType: {
    type: String,
    enum: Object.values(GameEventType),
    required: true,
  },
  playerId: { type: Schema.Types.ObjectId, default: null },
  eventData: { type: Schema.Types.Mixed, default: {} },
  occurredAt: { type: Date, default: Date.now },
});

// ─── Embedded: Puzzle State ───────────────────────────────────────────────────

export interface IPuzzlePiece {
  pieceIndex: number;
  isUnlocked: boolean;
  unlockedAt: Date | null;
  unlockedByPlayerId: Types.ObjectId | null;
}

const puzzlePieceSchema = new Schema<IPuzzlePiece>(
  {
    pieceIndex: { type: Number, required: true },
    isUnlocked: { type: Boolean, default: false },
    unlockedAt: { type: Date, default: null },
    unlockedByPlayerId: { type: Schema.Types.ObjectId, default: null },
  },
  { _id: false }
);

// ─── Embedded: Answer Attempt ─────────────────────────────────────────────────

export interface IAnswerAttempt {
  _id: Types.ObjectId;
  gamePlayerId: Types.ObjectId;
  qrCodeId: string;
  questionId: string;
  submittedAnswer: AnswerOption;
  isCorrect: boolean;       // Determined server-side
  lifeDeducted: boolean;
  clientActionId?: string | null;
  submittedAt: Date;
}

const answerAttemptSchema = new Schema<IAnswerAttempt>({
  gamePlayerId: { type: Schema.Types.ObjectId, required: true },
  qrCodeId: { type: String, required: true },
  questionId: { type: String, required: true },
  submittedAnswer: { type: String, enum: Object.values(AnswerOption), required: true },
  isCorrect: { type: Boolean, required: true },
  lifeDeducted: { type: Boolean, required: true },
  clientActionId: { type: String, default: null },
  submittedAt: { type: Date, default: Date.now },
});

// ─── Main Game Document ───────────────────────────────────────────────────────

export interface IGame extends Document {
  gameCode: string;
  teamName: string;
  teamSize: 5 | 6;
  phase: GamePhase;
  result: GameResult | null;

  // Immutable snapshot (set at game start, never changed after)
  configSnapshot: IConfigSnapshot | null;

  // Server-authoritative timer state
  // Clients compute countdown from these — backend never writes per-second
  phaseStartedAt: Date | null;
  phaseEndsAt: Date | null;
  round1StartedAt: Date | null;
  round1EndsAt: Date | null;

  // Round 2 master timer (never resets)
  round2StartedAt: Date | null;
  round2EndsAt: Date | null;

  // Pause & Revision state
  isPaused: boolean;
  pausedAt: Date | null;
  pausedRemainingMs: number | null;
  pausedRound2RemainingMs: number | null;
  roundRevision: number;

  // Players (5 or 6)
  players: Types.DocumentArray<IGamePlayer>;

  // QR mappings (immutable after game starts)
  qrMappings: IQrMapping[];
  qrMappingsLockedAt: Date | null; // Set when game starts

  // Puzzle progress
  puzzlePieces: IPuzzlePiece[];
  puzzleCompleted: boolean;

  // Kill tracking
  killCount: number;    // 0, 1, or 2 — NEVER 3
  kills: Types.DocumentArray<IKill>;

  // Body reports
  bodyReports: Types.DocumentArray<IBodyReport>;

  // Voting
  votingCycle: number;
  votes: Types.DocumentArray<IVote>;
  votingRevealedAt: Date | null; // When vote targets become visible

  // Answer attempts (for history/audit)
  answerAttempts: Types.DocumentArray<IAnswerAttempt>;

  // Event log
  events: Types.DocumentArray<IGameEvent>;

  // Timestamps
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}

const gameSchema = new Schema<IGame>(
  {
    gameCode: {
      type: String,
      required: true,
      unique: true,
      match: /^MOSAIC-[A-Z0-9]{4}$/,
      index: true,
    },
    teamName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    teamSize: {
      type: Number,
      required: true,
      enum: [5, 6],
    },
    phase: {
      type: String,
      enum: Object.values(GamePhase),
      default: GamePhase.LOBBY,
      index: true,
    },
    result: {
      type: String,
      enum: Object.values(GameResult),
      default: null,
    },
    configSnapshot: {
      type: configSnapshotSchema,
      default: null,
    },
    phaseStartedAt: { type: Date, default: null },
    phaseEndsAt: { type: Date, default: null },
    round1StartedAt: { type: Date, default: null },
    round1EndsAt: { type: Date, default: null },
    round2StartedAt: { type: Date, default: null },
    round2EndsAt: { type: Date, default: null },
    isPaused: { type: Boolean, default: false },
    pausedAt: { type: Date, default: null },
    pausedRemainingMs: { type: Number, default: null },
    pausedRound2RemainingMs: { type: Number, default: null },
    roundRevision: { type: Number, default: 1 },
    players: [gamePlayerSchema],
    qrMappings: [qrMappingSchema],
    qrMappingsLockedAt: { type: Date, default: null },
    puzzlePieces: [puzzlePieceSchema],
    puzzleCompleted: { type: Boolean, default: false },
    killCount: {
      type: Number,
      default: 0,
      min: 0,
      max: 2, // DB-level max — NEVER 3
    },
    kills: [killSchema],
    bodyReports: [bodyReportSchema],
    votingCycle: { type: Number, default: 0 },
    votes: [voteSchema],
    votingRevealedAt: { type: Date, default: null },
    answerAttempts: [answerAttemptSchema],
    events: [gameEventSchema],
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    collection: 'games',
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

// Only one active game at a time (partial unique index on non-completed games)
gameSchema.index(
  { phase: 1 },
  {
    unique: false,
    partialFilterExpression: { phase: { $ne: GamePhase.GAME_COMPLETE } },
    name: 'active_game_phase_idx',
  }
);

// Fast lookup of player by name within a game
gameSchema.index({ 'players.playerName': 1 });

// Compound index for kill lookups
gameSchema.index({ 'kills.victimPlayerId': 1 });

// Vote uniqueness per cycle enforced at application level + this index
gameSchema.index({ 'votes.votingCycle': 1, 'votes.voterPlayerId': 1 });

export const Game = model<IGame>('Game', gameSchema);
