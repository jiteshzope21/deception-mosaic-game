/**
 * MOSAIC — Game Service (Phase 2: Lobby & Round 1 Core Gameplay)
 *
 * Implements authoritative game state transitions, QR assignment,
 * question validation, lives deduction, puzzle unlocking, and Socket.IO emission.
 *
 * CRITICAL SECURITY:
 * - Browser NEVER receives correctAnswer.
 * - Browser NEVER receives full QR mapping before scanning.
 * - Idempotency is enforced for start-game and answer submissions.
 */

import { Types } from 'mongoose';
import { Game, IGame, IQrMapping, IPuzzlePiece, IConfigSnapshot } from '../models/Game.model';
import { GameConfiguration } from '../models/GameConfiguration.model';
import { Question, IQuestion } from '../models/Question.model';
import { DecoyMessage } from '../models/DecoyMessage.model';
import {
  GamePhase,
  GameResult,
  PlayerStatus,
  PlayerRole,
  TieRule,
  BodyReportStatus,
  QrType,
  GameEventType,
  AnswerOption,
  SocketEvent,
} from '../types/game.types';
import { GAME_CONSTANTS } from '../config/constants';
import { emitToGame, emitToGm, emitToPlayer } from '../sockets/socketServer';
import { logger } from '../utils/logger';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CODE_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Excludes 0, O, 1, I to prevent confusion

export function generateGameCode(): string {
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
  }
  return `MOSAIC-${result}`;
}

function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ─── Game Creation & Lobby ────────────────────────────────────────────────────

export interface CreateGameParams {
  teamName: string;
  teamSize: 5 | 6;
  playerNames: string[];
}

export async function createGameLobby(params: {
  teamName: string;
  teamSize: 5 | 6;
  playerNames: string[];
}): Promise<IGame> {
  const { teamName, teamSize, playerNames } = params;

  // Rule 1: Only one active game may exist at a time
  const activeGame = await Game.findOne({ phase: { $ne: GamePhase.GAME_COMPLETE } });
  if (activeGame) {
    const error = new Error('An active game already exists. Complete or archive the current game first.');
    (error as any).code = 'ACTIVE_GAME_EXISTS';
    (error as any).statusCode = 409;
    throw error;
  }

  // Validate team size
  if (teamSize !== 5 && teamSize !== 6) {
    const error = new Error('Team size must be exactly 5 or 6.');
    (error as any).code = 'INVALID_TEAM_SIZE';
    (error as any).statusCode = 400;
    throw error;
  }

  if (playerNames.length !== teamSize) {
    const error = new Error(`Number of player names (${playerNames.length}) must match team size (${teamSize}).`);
    (error as any).code = 'PLAYER_COUNT_MISMATCH';
    (error as any).statusCode = 400;
    throw error;
  }

  // Check unique player names within team
  const normalizedNames = playerNames.map((n) => n.trim());
  const uniqueNames = new Set(normalizedNames.map((n) => n.toLowerCase()));
  if (uniqueNames.size !== normalizedNames.length) {
    const error = new Error('Player names within a team must be unique.');
    (error as any).code = 'DUPLICATE_PLAYER_NAMES';
    (error as any).statusCode = 400;
    throw error;
  }

  // Generate unique game code
  let gameCode = '';
  let isUnique = false;
  while (!isUnique) {
    gameCode = generateGameCode();
    const existing = await Game.findOne({ gameCode });
    if (!existing) isUnique = true;
  }

  // Create player subdocs
  const players = normalizedNames.map((name) => ({
    playerName: name,
    status: PlayerStatus.REGISTERED,
    lives: GAME_CONSTANTS.STARTING_LIVES,
    authToken: null,
    joinedAt: null,
    role: null,
    assignedTaskZone: null,
    assignedTaskName: null,
    roleAssignedAt: null,
  }));

  const game = new Game({
    gameCode,
    teamName: teamName.trim(),
    teamSize,
    phase: GamePhase.LOBBY,
    players,
    events: [
      {
        eventType: GameEventType.GAME_CREATED,
        playerId: null,
        eventData: { teamName, teamSize, playerNames: normalizedNames },
        occurredAt: new Date(),
      },
    ],
  });

  await game.save();
  logger.info(`[GameService] Game created: ${gameCode} (${teamName}, ${teamSize} players)`);
  return game;
}

export async function getActiveGame(): Promise<IGame | null> {
  return Game.findOne({ phase: { $ne: GamePhase.GAME_COMPLETE } });
}

export async function getPublicLobbyByCode(gameCode: string) {
  const game = await Game.findOne({ gameCode: gameCode.toUpperCase().trim() });
  if (!game) return null;

  return {
    gameId: game._id,
    gameCode: game.gameCode,
    teamName: game.teamName,
    teamSize: game.teamSize,
    phase: game.phase,
    players: game.players.map((p) => ({
      id: p._id,
      playerName: p.playerName,
      status: p.status,
      isClaimed: p.status !== PlayerStatus.REGISTERED,
    })),
  };
}

export async function getGameForGm(gameId: string) {
  const game = await Game.findById(gameId);
  if (!game) return null;

  // Auto-check timers
  await checkGameTimers(game);

  return {
    id: game._id,
    gameCode: game.gameCode,
    teamName: game.teamName,
    teamSize: game.teamSize,
    phase: game.phase,
    result: game.result,
    phaseStartedAt: game.phaseStartedAt,
    phaseEndsAt: game.phaseEndsAt,
    round1StartedAt: game.round1StartedAt || game.phaseStartedAt,
    round1EndsAt: game.round1EndsAt || game.phaseEndsAt,
    round2StartedAt: game.round2StartedAt,
    round2EndsAt: game.round2EndsAt,
    puzzleCompleted: game.puzzleCompleted,
    puzzlePieces: game.puzzlePieces,
    killCount: game.killCount,
    kills: game.kills.map((k) => {
      const victim = game.players.id(k.victimPlayerId);
      const imposter = game.players.id(k.imposterPlayerId);
      return {
        id: k._id,
        killNumber: k.killNumber,
        victimPlayerId: k.victimPlayerId,
        victimPlayerName: victim?.playerName ?? 'Unknown',
        imposterPlayerId: k.imposterPlayerId,
        imposterPlayerName: imposter?.playerName ?? 'Unknown',
        reportedAt: k.reportedAt,
      };
    }),
    bodyReports: game.bodyReports.map((b) => {
      const reporter = b.reporterPlayerId ? game.players.id(b.reporterPlayerId) : null;
      return {
        id: b._id,
        killId: b.killId,
        reporterPlayerId: b.reporterPlayerId,
        reporterPlayerName: reporter?.playerName ?? 'System (Auto)',
        status: b.status,
        reportedAt: b.reportedAt,
      };
    }),
    votingCycle: game.votingCycle,
    votingRevealedAt: game.votingRevealedAt,
    submittedVotesCount: game.votes.filter((v) => v.votingCycle === game.votingCycle).length,
    eligibleVotersCount: game.players.filter((p) => p.status === PlayerStatus.ALIVE).length,
    players: game.players.map((p) => ({
      id: p._id,
      playerName: p.playerName,
      status: p.status,
      lives: p.lives,
      role: p.role, // GM is permitted to see all roles
      assignedTaskZone: p.assignedTaskZone,
      assignedTaskName: p.assignedTaskName,
      joinedAt: p.joinedAt,
    })),
    qrMappings: game.qrMappings.map((m) => ({
      qrCodeId: m.qrCodeId,
      qrType: m.qrType,
      isCompleted: m.isCompleted,
      puzzlePieceIndex: m.puzzlePieceIndex,
      questionsCount: m.questions.length,
      completedAt: m.completedAt,
    })),
    recentEvents: game.events.slice(-25),
  };
}

export async function getGameForPlayer(gameId: string, playerId: string) {
  const game = await Game.findById(gameId);
  if (!game) return null;

  await checkGameTimers(game);

  const player = game.players.id(playerId);
  if (!player) return null;

  const eligibleVotersCount = game.players.filter((p) => p.status === PlayerStatus.ALIVE).length;
  const submittedVotesCount = game.votes.filter((v) => v.votingCycle === game.votingCycle).length;
  const hasVoted = game.votes.some(
    (v) => v.votingCycle === game.votingCycle && String(v.voterPlayerId) === playerId
  );

  // Sanitize: Player only sees public info, own role, own assigned task/zone
  // NEVER send other players' roles, other players' tasks, or unrevealed vote targets!
    const isRound2ActiveOrLater = [
      GamePhase.ROUND_2_ACTIVE,
      GamePhase.BODY_REPORT,
      GamePhase.MOVE_TO_VOTING,
      GamePhase.VOTING,
      GamePhase.GAME_COMPLETE,
    ].includes(game.phase);

    return {
      id: game._id,
      gameCode: game.gameCode,
      teamName: game.teamName,
      teamSize: game.teamSize,
      phase: game.phase,
      result: game.result,
      phaseStartedAt: game.phaseStartedAt,
      phaseEndsAt: game.phaseEndsAt,
      round1StartedAt: game.round1StartedAt || game.phaseStartedAt,
      round1EndsAt: game.round1EndsAt || game.phaseEndsAt,
      round2StartedAt: game.round2StartedAt,
      round2EndsAt: game.round2EndsAt, // Continuous 7-minute master timer
      votingCycle: game.votingCycle,
      votingStatus: {
        submittedVotesCount,
        eligibleVotersCount,
      },
      puzzleCompleted: game.puzzleCompleted,
      puzzlePieces: game.puzzlePieces.map((p) => ({
        pieceIndex: p.pieceIndex,
        isUnlocked: p.isUnlocked,
      })),
      myPlayer: {
        id: player._id,
        playerName: player.playerName,
        lives: player.lives,
        status: player.status,
        role: isRound2ActiveOrLater ? player.role : null, // Revealed only when Round 2 starts
        assignedTaskZone: isRound2ActiveOrLater ? player.assignedTaskZone : null,
        assignedTaskName: isRound2ActiveOrLater ? player.assignedTaskName : null,
        hasVoted,
        killCount: (isRound2ActiveOrLater && player.role === PlayerRole.IMPOSTER) ? game.killCount : undefined,
      },
    teammates: game.players.map((p) => ({
      id: p._id,
      playerName: p.playerName,
      status: p.status,
      lives: p.lives,
      // No role, no assignedTaskZone, no assignedTaskName!
    })),
    // Read-only reveal upon game completion
    completedSummary:
      game.phase === GamePhase.GAME_COMPLETE
        ? {
            finalResult: game.result,
            imposterId: game.players.find((p) => p.role === PlayerRole.IMPOSTER)?._id,
            imposterName: game.players.find((p) => p.role === PlayerRole.IMPOSTER)?.playerName,
            players: game.players.map((p) => ({
              id: p._id,
              playerName: p.playerName,
              role: p.role,
              status: p.status,
            })),
          }
        : null,
  };
}

// ─── Start Game & Round 1 Generation ──────────────────────────────────────────

export async function startGame(gameId: string): Promise<IGame> {
  const game = await Game.findById(gameId);
  if (!game) {
    const error = new Error('Game not found.');
    (error as any).statusCode = 404;
    throw error;
  }

  // Idempotency: Game must be in LOBBY phase
  if (game.phase !== GamePhase.LOBBY) {
    const error = new Error(`Cannot start game: Game is already in phase ${game.phase}.`);
    (error as any).statusCode = 400;
    (error as any).code = 'GAME_ALREADY_STARTED';
    throw error;
  }

  // Validate that all registered players have joined
  const allJoined = game.players.every((p) => p.status === PlayerStatus.JOINED);
  if (!allJoined) {
    const error = new Error('Cannot start game: Not all players have joined the lobby.');
    (error as any).statusCode = 400;
    (error as any).code = 'NOT_ALL_PLAYERS_JOINED';
    throw error;
  }

  if (game.players.length !== game.teamSize) {
    const error = new Error(`Cannot start game: Expected ${game.teamSize} players, found ${game.players.length}.`);
    (error as any).statusCode = 400;
    throw error;
  }

  // 1. Fetch Configuration Singleton
  let configDoc = await GameConfiguration.findOne({ _singleton: true });
  if (!configDoc) {
    configDoc = await GameConfiguration.create({ _singleton: true });
  }

  // 2. Build Immutable Config Snapshot
  const configSnapshot: IConfigSnapshot = {
    round1DurationSeconds: configDoc.round1DurationSeconds,
    transitionDurationSeconds: configDoc.transitionDurationSeconds,
    round2DurationSeconds: configDoc.round2DurationSeconds,
    bodyReportDurationSeconds: configDoc.bodyReportDurationSeconds,
    moveToVotingDurationSeconds: configDoc.moveToVotingDurationSeconds,
    votingDurationSeconds: configDoc.votingDurationSeconds,
    startingLives: configDoc.startingLives,
    maxKills: 2,
    imposterCount: 1,
    allowSelfVote: configDoc.allowSelfVote,
    tieRule: configDoc.tieRule,
    minQuestionsPerQr: configDoc.minQuestionsPerQr,
    maxQuestionsPerQr: configDoc.maxQuestionsPerQr,
    teamSize: game.teamSize,
    snapshottedAt: new Date(),
  };

  // 3. Round 1 QR Generation
  // Team size 5: 5 puzzle QRs, 5 decoy QRs, 5 puzzle pieces (0..4)
  // Team size 6: 6 puzzle QRs, 4 decoy QRs, 6 puzzle pieces (0..5)
  const puzzleCount = game.teamSize === 5 ? 5 : 6;
  const decoyCount = game.teamSize === 5 ? 5 : 4;
  const totalPieces = puzzleCount;

  // Shuffle fixed QR IDs
  const shuffledQrIds = shuffle([...GAME_CONSTANTS.QR_IDS]);
  const puzzleQrIds = shuffledQrIds.slice(0, puzzleCount);
  const decoyQrIds = shuffledQrIds.slice(puzzleCount, puzzleCount + decoyCount);

  // Fetch active decoy messages
  const decoyMessages = await DecoyMessage.find({ isActive: true });
  if (decoyMessages.length === 0) {
    // Seed at least one if missing
    await DecoyMessage.create({
      message: 'Nothing here! Try another QR Buddy! 🔍',
      isActive: true,
    });
  }
  const availableDecoys = await DecoyMessage.find({ isActive: true });
  const shuffledDecoys = shuffle(availableDecoys);

  // Fetch active questions
  const availableQuestions = await Question.find({ isActive: true });
  if (availableQuestions.length === 0) {
    const error = new Error('No active questions found in question bank.');
    (error as any).statusCode = 500;
    throw error;
  }
  const shuffledQuestions = shuffle(availableQuestions);
  let questionIdx = 0;

  function getNextQuestion(): IQuestion {
    const q = shuffledQuestions[questionIdx % shuffledQuestions.length];
    questionIdx++;
    return q;
  }

  // Build qrMappings
  const qrMappings: IQrMapping[] = [];

  // Puzzle QRs
  puzzleQrIds.forEach((qrCodeId, pieceIndex) => {
    // 1–2 questions per QR
    const qCount = Math.floor(
      Math.random() * (configSnapshot.maxQuestionsPerQr - configSnapshot.minQuestionsPerQr + 1)
    ) + configSnapshot.minQuestionsPerQr;

    const qrQuestions = [];
    const usedInQr = new Set<string>();
    for (let o = 1; o <= qCount; o++) {
      let q = getNextQuestion();
      let attempts = 0;
      while (usedInQr.has(q.questionId) && attempts < shuffledQuestions.length) {
        q = getNextQuestion();
        attempts++;
      }
      usedInQr.add(q.questionId);
      qrQuestions.push({
        questionId: q.questionId,
        questionOrder: o,
      });
    }

    qrMappings.push({
      qrCodeId,
      qrType: QrType.PUZZLE,
      decoyMessageId: null,
      questions: qrQuestions,
      puzzlePieceIndex: pieceIndex,
      isCompleted: false,
      completedByPlayerId: null,
      completedAt: null,
    });
  });

  // Decoy QRs
  decoyQrIds.forEach((qrCodeId, idx) => {
    const qCount = Math.floor(
      Math.random() * (configSnapshot.maxQuestionsPerQr - configSnapshot.minQuestionsPerQr + 1)
    ) + configSnapshot.minQuestionsPerQr;

    const qrQuestions = [];
    const usedInQr = new Set<string>();
    for (let o = 1; o <= qCount; o++) {
      let q = getNextQuestion();
      let attempts = 0;
      while (usedInQr.has(q.questionId) && attempts < shuffledQuestions.length) {
        q = getNextQuestion();
        attempts++;
      }
      usedInQr.add(q.questionId);
      qrQuestions.push({
        questionId: q.questionId,
        questionOrder: o,
      });
    }

    const decoyMsg = shuffledDecoys[idx % shuffledDecoys.length];

    qrMappings.push({
      qrCodeId,
      qrType: QrType.DECOY,
      decoyMessageId: (decoyMsg._id as Types.ObjectId),
      questions: qrQuestions,
      puzzlePieceIndex: null,
      isCompleted: false,
      completedByPlayerId: null,
      completedAt: null,
    });
  });

  // Build puzzlePieces
  const puzzlePieces: IPuzzlePiece[] = [];
  for (let i = 0; i < totalPieces; i++) {
    puzzlePieces.push({
      pieceIndex: i,
      isUnlocked: false,
      unlockedAt: null,
      unlockedByPlayerId: null,
    });
  }

  // Authoritative Timers
  const now = new Date();
  const endsAt = new Date(now.getTime() + configSnapshot.round1DurationSeconds * 1000);

  // Apply atomically with conditional check (idempotency against concurrent starts)
  const updatedGame = await Game.findOneAndUpdate(
    { _id: game._id, phase: GamePhase.LOBBY },
    {
      $set: {
        configSnapshot,
        qrMappings,
        qrMappingsLockedAt: now,
        puzzlePieces: puzzlePieces as any,
        puzzleCompleted: false,
        phase: GamePhase.ROUND_1_ACTIVE,
        phaseStartedAt: now,
        phaseEndsAt: endsAt,
        round1StartedAt: now,
        round1EndsAt: endsAt,
        startedAt: now,
      },
      $push: {
        events: {
          $each: [
            {
              eventType: GameEventType.GAME_STARTED,
              playerId: null,
              eventData: {
                teamSize: game.teamSize,
                puzzleQrCount: puzzleCount,
                decoyQrCount: decoyCount,
                durationSeconds: configSnapshot.round1DurationSeconds,
              },
              occurredAt: now,
            },
            {
              eventType: GameEventType.PHASE_TRANSITION,
              playerId: null,
              eventData: { from: GamePhase.LOBBY, to: GamePhase.ROUND_1_ACTIVE },
              occurredAt: now,
            },
          ],
        },
      },
    },
    { new: true }
  );

  if (!updatedGame) {
    const error = new Error('Cannot start game: Game is already started or not in LOBBY phase.');
    (error as any).statusCode = 400;
    (error as any).code = 'GAME_ALREADY_STARTED';
    throw error;
  }

  logger.info(`[GameService] Game ${updatedGame.gameCode} started Round 1. Ends at: ${endsAt.toISOString()}`);

  // Emit Realtime Events
  emitToGame(String(updatedGame._id), SocketEvent.GAME_STARTED, {
    gameId: updatedGame._id,
    phase: GamePhase.ROUND_1_ACTIVE,
    phaseStartedAt: now,
    phaseEndsAt: endsAt,
    round1StartedAt: now,
    round1EndsAt: endsAt,
    totalPuzzlePieces: totalPieces,
  });

  emitToGame(String(updatedGame._id), SocketEvent.PHASE_CHANGED, {
    from: GamePhase.LOBBY,
    to: GamePhase.ROUND_1_ACTIVE,
    phaseStartedAt: now,
    phaseEndsAt: endsAt,
    round1StartedAt: now,
    round1EndsAt: endsAt,
  });

  return updatedGame;
}

// ─── Authoritative Timers & Auto-Transitions ──────────────────────────────────

export async function checkGameTimers(game: IGame): Promise<boolean> {
  const now = new Date();

  // If already complete or in lobby, no timers active
  if (game.phase === GamePhase.GAME_COMPLETE || game.phase === GamePhase.LOBBY) {
    return false;
  }

  // 1. Round 1 timer
  if (game.phase === GamePhase.ROUND_1_ACTIVE) {
    if (game.phaseEndsAt && now.getTime() >= game.phaseEndsAt.getTime()) {
      logger.info(`[GameService] Round 1 timer expired for game ${game.gameCode}`);
      game.phase = GamePhase.ROUND_1_COMPLETE;
      game.events.push({
        eventType: GameEventType.TIMER_EXPIRED,
        playerId: null,
        eventData: { round: 'ROUND_1' },
        occurredAt: now,
      } as any);
      game.events.push({
        eventType: GameEventType.ROUND_1_COMPLETED,
        playerId: null,
        eventData: { reason: 'TIMER_EXPIRED' },
        occurredAt: now,
      } as any);

      await game.save();

      emitToGame(String(game._id), SocketEvent.PHASE_CHANGED, {
        from: GamePhase.ROUND_1_ACTIVE,
        to: GamePhase.ROUND_1_COMPLETE,
        reason: 'TIMER_EXPIRED',
      });
      return true;
    }
    return false;
  }

  // 2. Transition timer
  if (game.phase === GamePhase.TRANSITION) {
    if (game.phaseEndsAt && now.getTime() >= game.phaseEndsAt.getTime()) {
      logger.info(`[GameService] Transition timer expired for game ${game.gameCode}. Advancing to Round 2.`);
      await startRound2Internal(game);
      return true;
    }
    return false;
  }

  // 3. Round 2 Phases: First check continuous 7-minute master timer
  const r2Phases = [
    GamePhase.ROUND_2_ACTIVE,
    GamePhase.BODY_REPORT,
    GamePhase.MOVE_TO_VOTING,
    GamePhase.VOTING,
  ];

  if (r2Phases.includes(game.phase)) {
    // Check continuous master timer
    if (game.round2EndsAt && now.getTime() >= game.round2EndsAt.getTime()) {
      logger.info(`[GameService] Master Round 2 timer expired for game ${game.gameCode}. Imposter wins by timeout.`);
      game.phase = GamePhase.GAME_COMPLETE;
      game.result = GameResult.IMPOSTER_WIN_TIME;
      game.completedAt = now;

      game.events.push({
        eventType: GameEventType.TIMER_EXPIRED,
        playerId: null,
        eventData: { round: 'ROUND_2_MASTER' },
        occurredAt: now,
      } as any);
      game.events.push({
        eventType: GameEventType.GAME_COMPLETED,
        playerId: null,
        eventData: { reason: 'ROUND_2_TIMER_EXPIRED', winner: 'IMPOSTER' },
        occurredAt: now,
      } as any);

      await game.save();

      emitToGame(String(game._id), SocketEvent.PHASE_CHANGED, {
        from: game.phase,
        to: GamePhase.GAME_COMPLETE,
        reason: 'TIME_EXPIRED',
        result: game.result,
      });
      emitToGame(String(game._id), SocketEvent.GAME_COMPLETE, {
        result: game.result,
        winner: 'IMPOSTER',
      });
      return true;
    }

    // Body report timer (20s)
    if (game.phase === GamePhase.BODY_REPORT && game.phaseEndsAt && now.getTime() >= game.phaseEndsAt.getTime()) {
      logger.info(`[GameService] Body report window expired for game ${game.gameCode}. Auto-advancing to movement.`);
      const pendingReport = game.bodyReports.find((b) => b.status === BodyReportStatus.PENDING);
      if (pendingReport) {
        pendingReport.status = BodyReportStatus.AUTO;
      }

      const moveDuration = game.configSnapshot?.moveToVotingDurationSeconds ?? 15;
      const moveEndsAt = new Date(now.getTime() + moveDuration * 1000);

      game.phase = GamePhase.MOVE_TO_VOTING;
      game.phaseStartedAt = now;
      game.phaseEndsAt = moveEndsAt;

      game.events.push({
        eventType: GameEventType.PHASE_TRANSITION,
        playerId: null,
        eventData: { from: GamePhase.BODY_REPORT, to: GamePhase.MOVE_TO_VOTING, auto: true },
        occurredAt: now,
      } as any);

      await game.save();

      emitToGame(String(game._id), SocketEvent.BODY_REPORT_EXPIRED, { message: 'Body report window expired.' });
      emitToGame(String(game._id), SocketEvent.MOVE_TO_VOTING_STARTED, {
        phaseEndsAt: moveEndsAt,
        round2EndsAt: game.round2EndsAt,
      });
      emitToGame(String(game._id), SocketEvent.PHASE_CHANGED, {
        from: GamePhase.BODY_REPORT,
        to: GamePhase.MOVE_TO_VOTING,
        phaseEndsAt: moveEndsAt,
        round2EndsAt: game.round2EndsAt,
      });
      return true;
    }

    // Move to voting countdown (15s)
    if (game.phase === GamePhase.MOVE_TO_VOTING && game.phaseEndsAt && now.getTime() >= game.phaseEndsAt.getTime()) {
      logger.info(`[GameService] Movement countdown complete for game ${game.gameCode}. Starting voting.`);
      const votingDuration = game.configSnapshot?.votingDurationSeconds ?? 15;
      const votingEndsAt = new Date(now.getTime() + votingDuration * 1000);

      game.votingCycle = (game.votingCycle || 0) + 1;
      game.phase = GamePhase.VOTING;
      game.phaseStartedAt = now;
      game.phaseEndsAt = votingEndsAt;

      game.events.push({
        eventType: GameEventType.VOTING_STARTED,
        playerId: null,
        eventData: { cycle: game.votingCycle, endsAt: votingEndsAt },
        occurredAt: now,
      } as any);

      await game.save();

      emitToGame(String(game._id), SocketEvent.VOTING_STARTED, {
        votingCycle: game.votingCycle,
        phaseEndsAt: votingEndsAt,
        round2EndsAt: game.round2EndsAt,
      });
      emitToGame(String(game._id), SocketEvent.PHASE_CHANGED, {
        from: GamePhase.MOVE_TO_VOTING,
        to: GamePhase.VOTING,
        phaseEndsAt: votingEndsAt,
        round2EndsAt: game.round2EndsAt,
      });
      return true;
    }

    // Voting window (15s)
    if (game.phase === GamePhase.VOTING && game.phaseEndsAt && now.getTime() >= game.phaseEndsAt.getTime()) {
      logger.info(`[GameService] Voting timer expired for game ${game.gameCode}. Resolving votes.`);
      await resolveVotingInternal(game);
      return true;
    }
  }

  return false;
}

export async function checkRound1TimerExpiry(game: IGame): Promise<boolean> {
  return checkGameTimers(game);
}

async function startRound2Internal(game: IGame): Promise<IGame> {
  const now = new Date();
  const round2Duration = game.configSnapshot?.round2DurationSeconds ?? 420;
  const masterEndsAt = new Date(now.getTime() + round2Duration * 1000);

  game.phase = GamePhase.ROUND_2_ACTIVE;
  game.phaseStartedAt = now;
  game.phaseEndsAt = masterEndsAt;
  game.round2StartedAt = now;
  game.round2EndsAt = masterEndsAt;

  game.events.push({
    eventType: GameEventType.ROUND_2_STARTED,
    playerId: null,
    eventData: { durationSeconds: round2Duration, masterEndsAt },
    occurredAt: now,
  } as any);

  await game.save();

  emitToGame(String(game._id), SocketEvent.ROUND_2_STARTED, {
    round2StartedAt: now,
    round2EndsAt: masterEndsAt,
    phaseEndsAt: masterEndsAt,
  });
  emitToGame(String(game._id), SocketEvent.PHASE_CHANGED, {
    from: GamePhase.TRANSITION,
    to: GamePhase.ROUND_2_ACTIVE,
    phaseEndsAt: masterEndsAt,
    round2EndsAt: masterEndsAt,
  });

  // Private emit to each player: ONLY their own role and assigned task, NOW that Round 2 begins!
  for (const player of game.players) {
    emitToPlayer(String(player._id), SocketEvent.PLAYER_ROLE_ASSIGNED_PRIVATE, {
      role: player.role,
      assignedTaskZone: player.assignedTaskZone,
      assignedTaskName: player.assignedTaskName,
    });
  }

  return game;
}

// ─── QR Scanning & Question Retrieval ─────────────────────────────────────────

export async function scanQrCode(params: {
  gameId: string;
  playerId: string;
  qrCodeId: string;
}) {
  const { gameId, playerId, qrCodeId } = params;

  const game = await Game.findById(gameId);
  if (!game) {
    const error = new Error('Game not found.');
    (error as any).statusCode = 404;
    throw error;
  }

  // Timer expiry check
  const expired = await checkRound1TimerExpiry(game);
  if (expired || game.phase !== GamePhase.ROUND_1_ACTIVE) {
    return {
      status: 'ROUND_ENDED',
      message: 'Round 1 has ended.',
      phase: game.phase,
    };
  }

  const player = game.players.id(playerId);
  if (!player) {
    const error = new Error('Player not in this game.');
    (error as any).statusCode = 403;
    throw error;
  }

  if (player.lives <= 0) {
    return {
      status: 'ROUND_ENDED',
      message: 'No lives remaining.',
      phase: game.phase,
    };
  }

  // Format validation
  const normalizedQrId = qrCodeId.toUpperCase().trim();
  const qrMapping = game.qrMappings.find((m) => m.qrCodeId === normalizedQrId);
  if (!qrMapping) {
    const error = new Error(`Invalid QR code: ${qrCodeId}. Must be one of QR-01 through QR-10.`);
    (error as any).statusCode = 400;
    (error as any).code = 'INVALID_QR_CODE';
    throw error;
  }

  // Check if QR is already completed
  if (qrMapping.isCompleted) {
    return {
      status: 'ALREADY_COMPLETED',
      qrCodeId: normalizedQrId,
      message: 'This QR code has already been completed!',
    };
  }

  // Find next unanswered question for this QR
  // Check which questions on this QR have already been answered correctly
  const answeredQuestionIds = new Set(
    game.answerAttempts
      .filter((a) => a.qrCodeId === normalizedQrId && a.isCorrect)
      .map((a) => a.questionId)
  );

  const nextQuestionOrder = qrMapping.questions.find((q) => !answeredQuestionIds.has(q.questionId));
  if (!nextQuestionOrder) {
    // If somehow all questions were answered but not flagged completed
    qrMapping.isCompleted = true;
    await game.save();
    return {
      status: 'ALREADY_COMPLETED',
      qrCodeId: normalizedQrId,
      message: 'This QR code has already been completed!',
    };
  }

  // Fetch question details (CORRECT ANSWER STRIPPED)
  const questionDoc = await Question.findOne({ questionId: nextQuestionOrder.questionId });
  if (!questionDoc) {
    const error = new Error('Question not found in question bank.');
    (error as any).statusCode = 500;
    throw error;
  }

  // Record QR scanned event
  game.events.push({
    eventType: GameEventType.QR_SCANNED,
    playerId: player._id,
    eventData: { qrCodeId: normalizedQrId, questionId: questionDoc.questionId },
    occurredAt: new Date(),
  } as any);
  await game.save();

  return {
    status: 'QUESTION',
    qrCodeId: normalizedQrId,
    question: {
      questionId: questionDoc.questionId,
      category: questionDoc.category,
      questionText: questionDoc.questionText,
      optionA: questionDoc.optionA,
      optionB: questionDoc.optionB,
      optionC: questionDoc.optionC,
      optionD: questionDoc.optionD,
      questionOrder: nextQuestionOrder.questionOrder,
      totalQuestionsOnQr: qrMapping.questions.length,
    },
  };
}

// ─── Answer Submission ────────────────────────────────────────────────────────

export async function submitAnswer(params: {
  gameId: string;
  playerId: string;
  qrCodeId: string;
  questionId: string;
  answer: AnswerOption;
  clientActionId?: string;
}) {
  const { gameId, playerId, qrCodeId, questionId, answer, clientActionId } = params;

  const game = await Game.findById(gameId);
  if (!game) {
    const error = new Error('Game not found.');
    (error as any).statusCode = 404;
    throw error;
  }

  // Timer check
  const expired = await checkRound1TimerExpiry(game);
  if (expired || game.phase !== GamePhase.ROUND_1_ACTIVE) {
    const lastCompletedEvent = game.events.slice().reverse().find((e: any) => e.eventType === GameEventType.ROUND_1_COMPLETED);
    const endReason = expired ? 'TIMER_EXPIRED' : (lastCompletedEvent?.eventData?.reason || 'ROUND_ENDED');
    return {
      isCorrect: false,
      roundEnded: true,
      reason: endReason,
      message: 'Round 1 has ended.',
    };
  }

  const player = game.players.id(playerId);
  if (!player) {
    const error = new Error('Player not in this game.');
    (error as any).statusCode = 403;
    throw error;
  }

  if (player.lives <= 0) {
    return {
      isCorrect: false,
      roundEnded: true,
      reason: 'ZERO_LIVES',
      message: 'You have 0 lives remaining.',
    };
  }

  const normalizedQrId = qrCodeId.toUpperCase().trim();
  const qrMapping = game.qrMappings.find((m) => m.qrCodeId === normalizedQrId);
  if (!qrMapping) {
    const error = new Error('Invalid QR code.');
    (error as any).statusCode = 400;
    throw error;
  }

  // Verify question is assigned to this QR
  const assigned = qrMapping.questions.some((q) => q.questionId === questionId);
  if (!assigned) {
    const error = new Error('Question does not belong to this QR code.');
    (error as any).statusCode = 400;
    throw error;
  }

  // Idempotency Protection (prevent double-clicks, duplicate submits from deducting lives twice)
  if (clientActionId) {
    const actionDuplicate = game.answerAttempts.find(
      (a: any) => a.clientActionId === clientActionId
    );
    if (actionDuplicate) {
      logger.warn(`[GameService] Idempotency catch: Duplicate submission prevented for action ${clientActionId}`);
      return {
        isCorrect: actionDuplicate.isCorrect,
        livesRemaining: player.lives,
        roundEnded: false,
        idempotentCached: true,
      };
    }
  }

  const recentDuplicate = game.answerAttempts.find(
    (a) =>
      String(a.gamePlayerId) === playerId &&
      a.qrCodeId === normalizedQrId &&
      a.questionId === questionId &&
      a.submittedAnswer === answer &&
      Date.now() - new Date(a.submittedAt).getTime() < 3000
  );
  if (recentDuplicate) {
    logger.warn(`[GameService] Idempotency catch: Duplicate submission prevented for player ${playerId}`);
    return {
      isCorrect: recentDuplicate.isCorrect,
      livesRemaining: player.lives,
      roundEnded: false,
      idempotentCached: true,
    };
  }

  // Check if this question was already answered correctly on this QR
  const alreadySolved = game.answerAttempts.some(
    (a) => a.qrCodeId === normalizedQrId && a.questionId === questionId && a.isCorrect
  );
  if (alreadySolved) {
    return {
      isCorrect: true,
      alreadyAnswered: true,
      livesRemaining: player.lives,
      roundEnded: false,
      message: 'This question has already been completed.',
    };
  }

  // Fetch question to check answer
  const questionDoc = await Question.findOne({ questionId });
  if (!questionDoc) {
    const error = new Error('Question not found.');
    (error as any).statusCode = 500;
    throw error;
  }

  const isCorrect = answer === questionDoc.correctAnswer;

  if (!isCorrect) {
    // WRONG ANSWER: -1 life
    player.lives = Math.max(0, player.lives - 1);

    game.answerAttempts.push({
      gamePlayerId: player._id,
      qrCodeId: normalizedQrId,
      questionId,
      submittedAnswer: answer,
      isCorrect: false,
      lifeDeducted: true,
      clientActionId: clientActionId ?? null,
      submittedAt: new Date(),
    } as any);

    game.events.push({
      eventType: GameEventType.LIFE_LOST,
      playerId: player._id,
      eventData: {
        playerName: player.playerName,
        remainingLives: player.lives,
        qrCodeId: normalizedQrId,
        questionId,
      },
      occurredAt: new Date(),
    } as any);

    // Emit live update
    emitToGame(String(game._id), SocketEvent.LIVES_UPDATE, {
      playerId: player._id,
      playerName: player.playerName,
      lives: player.lives,
    });

    // Rule 10: If ANY player reaches 0 lives, Round 1 immediately ends for the entire team!
    if (player.lives <= 0) {
      game.phase = GamePhase.ROUND_1_COMPLETE;
      game.result = GameResult.ROUND_1_FAILED;

      game.events.push({
        eventType: GameEventType.ROUND_1_COMPLETED,
        playerId: player._id,
        eventData: { reason: 'ZERO_LIVES', failedByPlayer: player.playerName },
        occurredAt: new Date(),
      } as any);

      await game.save();

      emitToGame(String(game._id), SocketEvent.PHASE_CHANGED, {
        from: GamePhase.ROUND_1_ACTIVE,
        to: GamePhase.ROUND_1_COMPLETE,
        reason: 'ZERO_LIVES',
        playerName: player.playerName,
      });

      return {
        isCorrect: false,
        livesRemaining: 0,
        roundEnded: true,
        reason: 'ZERO_LIVES',
        explanation: questionDoc.technicalExplanation,
      };
    }

    await game.save();

    return {
      isCorrect: false,
      livesRemaining: player.lives,
      roundEnded: false,
      explanation: questionDoc.technicalExplanation,
    };
  }

  // CORRECT ANSWER
  game.answerAttempts.push({
    gamePlayerId: player._id,
    qrCodeId: normalizedQrId,
    questionId,
    submittedAnswer: answer,
    isCorrect: true,
    lifeDeducted: false,
    clientActionId: clientActionId ?? null,
    submittedAt: new Date(),
  } as any);

  // Check if all questions on this QR are now answered correctly
  const answeredQuestionIds = new Set(
    game.answerAttempts
      .filter((a) => a.qrCodeId === normalizedQrId && a.isCorrect)
      .map((a) => a.questionId)
  );
  // Add current question
  answeredQuestionIds.add(questionId);

  const allQrQuestionsComplete = qrMapping.questions.every((q) =>
    answeredQuestionIds.has(q.questionId)
  );

  if (allQrQuestionsComplete) {
    qrMapping.isCompleted = true;
    qrMapping.completedByPlayerId = player._id;
    qrMapping.completedAt = new Date();

    game.events.push({
      eventType: GameEventType.QR_COMPLETED,
      playerId: player._id,
      eventData: {
        qrCodeId: normalizedQrId,
        qrType: qrMapping.qrType,
        completedBy: player.playerName,
      },
      occurredAt: new Date(),
    } as any);

    if (qrMapping.qrType === QrType.PUZZLE) {
      // Unlock the assigned puzzle piece
      const piece = game.puzzlePieces.find((p) => p.pieceIndex === qrMapping.puzzlePieceIndex);
      if (piece && !piece.isUnlocked) {
        piece.isUnlocked = true;
        piece.unlockedAt = new Date();
        piece.unlockedByPlayerId = player._id;

        game.events.push({
          eventType: GameEventType.PUZZLE_PIECE_UNLOCKED,
          playerId: player._id,
          eventData: {
            pieceIndex: piece.pieceIndex,
            unlockedBy: player.playerName,
          },
          occurredAt: new Date(),
        } as any);

        const unlockedCount = game.puzzlePieces.filter((p) => p.isUnlocked).length;
        const totalPieces = game.puzzlePieces.length;

        // Emit puzzle update to all players & GM
        emitToGame(String(game._id), SocketEvent.PUZZLE_UPDATE, {
          pieces: game.puzzlePieces.map((p) => ({
            pieceIndex: p.pieceIndex,
            isUnlocked: p.isUnlocked,
          })),
          unlockedCount,
          totalPieces,
        });

        // Check if entire puzzle is solved
        const allPiecesUnlocked = game.puzzlePieces.every((p) => p.isUnlocked);
        if (allPiecesUnlocked) {
          game.puzzleCompleted = true;
          game.phase = GamePhase.ROUND_1_COMPLETE;

          game.events.push({
            eventType: GameEventType.ROUND_1_COMPLETED,
            playerId: null,
            eventData: { reason: 'PUZZLE_COMPLETED' },
            occurredAt: new Date(),
          } as any);

          await game.save();

          emitToGame(String(game._id), SocketEvent.PHASE_CHANGED, {
            from: GamePhase.ROUND_1_ACTIVE,
            to: GamePhase.ROUND_1_COMPLETE,
            reason: 'PUZZLE_COMPLETED',
          });

          return {
            isCorrect: true,
            qrCompleted: true,
            isPuzzle: true,
            pieceIndex: qrMapping.puzzlePieceIndex,
            puzzleCompleted: true,
            roundEnded: true,
            explanation: questionDoc.technicalExplanation,
          };
        }
      }

      await game.save();

      return {
        isCorrect: true,
        qrCompleted: true,
        isPuzzle: true,
        pieceIndex: qrMapping.puzzlePieceIndex,
        puzzleCompleted: false,
        roundEnded: false,
        explanation: questionDoc.technicalExplanation,
      };
    }

    if (qrMapping.qrType === QrType.DECOY) {
      // Retrieve assigned decoy message
      let decoyText = 'Nice try! This QR wasn’t part of the puzzle. Try another QR Buddy! 🔍';
      if (qrMapping.decoyMessageId) {
        const decoyDoc = await DecoyMessage.findById(qrMapping.decoyMessageId);
        if (decoyDoc) decoyText = decoyDoc.message;
      }

      await game.save();

      return {
        isCorrect: true,
        qrCompleted: true,
        isPuzzle: false,
        decoyMessage: decoyText,
        roundEnded: false,
        explanation: questionDoc.technicalExplanation,
      };
    }
  }

  // Not all questions complete yet on this QR — return next question!
  const remainingQuestion = qrMapping.questions.find((q) => !answeredQuestionIds.has(q.questionId));
  let nextQuestionData = null;
  if (remainingQuestion) {
    const nextQDoc = await Question.findOne({ questionId: remainingQuestion.questionId });
    if (nextQDoc) {
      nextQuestionData = {
        questionId: nextQDoc.questionId,
        category: nextQDoc.category,
        questionText: nextQDoc.questionText,
        optionA: nextQDoc.optionA,
        optionB: nextQDoc.optionB,
        optionC: nextQDoc.optionC,
        optionD: nextQDoc.optionD,
        questionOrder: remainingQuestion.questionOrder,
        totalQuestionsOnQr: qrMapping.questions.length,
      };
    }
  }

  await game.save();

  return {
    isCorrect: true,
    qrCompleted: false,
    nextQuestion: nextQuestionData,
    explanation: questionDoc.technicalExplanation,
  };
}

// ─── GM Emergency Controls ───────────────────────────────────────────────────

export async function emergencyEndRound1(gameId: string) {
  const game = await Game.findById(gameId);
  if (!game) {
    const error = new Error('Game not found.');
    (error as any).statusCode = 404;
    throw error;
  }

  if (game.phase !== GamePhase.ROUND_1_ACTIVE) {
    const error = new Error('Game is not in Round 1.');
    (error as any).statusCode = 400;
    throw error;
  }

  game.phase = GamePhase.ROUND_1_COMPLETE;
  game.events.push({
    eventType: GameEventType.ROUND_1_COMPLETED,
    playerId: null,
    eventData: { reason: 'GM_EMERGENCY_STOP' },
    occurredAt: new Date(),
  } as any);

  await game.save();

  emitToGame(String(game._id), SocketEvent.PHASE_CHANGED, {
    from: GamePhase.ROUND_1_ACTIVE,
    to: GamePhase.ROUND_1_COMPLETE,
    reason: 'GM_EMERGENCY_STOP',
  });

  return game;
}

export async function restartGame(gameId: string) {
  const game = await Game.findById(gameId);
  if (!game) {
    const error = new Error('Game not found.');
    (error as any).statusCode = 404;
    throw error;
  }

  if (game.phase !== GamePhase.ROUND_1_ACTIVE && game.phase !== GamePhase.ROUND_1_COMPLETE) {
    const error = new Error('Cannot restart game from current phase.');
    (error as any).statusCode = 400;
    throw error;
  }

  const startingLives = game.configSnapshot?.startingLives ?? GAME_CONSTANTS.STARTING_LIVES;

  for (const player of game.players) {
    player.lives = startingLives;
  }

  game.phase = GamePhase.LOBBY;
  game.result = null;
  game.puzzlePieces = [] as any;
  game.puzzleCompleted = false;
  game.qrMappings = [];
  game.qrMappingsLockedAt = null;
  game.phaseStartedAt = null;
  game.phaseEndsAt = null;
  game.round1StartedAt = null;
  game.round1EndsAt = null;
  game.startedAt = null;
  game.completedAt = null;
  game.answerAttempts = [] as any;

  game.events.push({
    eventType: GameEventType.PHASE_TRANSITION,
    playerId: null,
    eventData: { from: game.phase, to: GamePhase.LOBBY, reason: 'GM_RESTART' },
    occurredAt: new Date(),
  } as any);

  await game.save();

  emitToGame(String(game._id), SocketEvent.PHASE_CHANGED, {
    from: GamePhase.ROUND_1_ACTIVE,
    to: GamePhase.LOBBY,
    reason: 'GM_RESTART',
  });

  emitToGame(String(game._id), SocketEvent.LOBBY_UPDATE, {
    gameId: game._id,
    gameCode: game.gameCode,
    players: game.players.map((p) => ({
      id: p._id,
      playerName: p.playerName,
      status: p.status,
      isClaimed: p.status !== PlayerStatus.REGISTERED,
    })),
  });

  return game;
}

// ─── Phase 3: Transition & Round 2 Deception Gameplay ─────────────────────────

export async function startTransition(gameId: string): Promise<IGame> {
  const game = await Game.findById(gameId);
  if (!game) {
    const error = new Error('Game not found.');
    (error as any).statusCode = 404;
    throw error;
  }

  if (game.phase !== GamePhase.ROUND_1_COMPLETE) {
    const error = new Error(`Cannot start transition: Game is in phase ${game.phase}, expected ROUND_1_COMPLETE.`);
    (error as any).statusCode = 400;
    (error as any).code = 'INVALID_PHASE_TRANSITION';
    throw error;
  }

  const now = new Date();
  const transitionDuration = game.configSnapshot?.transitionDurationSeconds ?? 60;
  const transitionEndsAt = new Date(now.getTime() + transitionDuration * 1000);

  // 1. Assign Roles: Exactly 1 Imposter, remaining Crewmates
  const imposterIndex = Math.floor(Math.random() * game.players.length);

  // 2. Assign Physical Tasks: 5 tasks for 5-player, 6 tasks for 6-player
  const shuffledTasks = shuffle([...GAME_CONSTANTS.DEFAULT_TASKS]);
  const selectedTasks = shuffledTasks.slice(0, game.teamSize);

  game.players.forEach((p, idx) => {
    if (idx === imposterIndex) {
      p.role = PlayerRole.IMPOSTER;
    } else {
      p.role = PlayerRole.CREWMATE;
    }
    p.status = PlayerStatus.ALIVE;
    p.assignedTaskZone = selectedTasks[idx].zoneNumber;
    p.assignedTaskName = selectedTasks[idx].taskName;
    p.roleAssignedAt = now;
  });

  game.phase = GamePhase.TRANSITION;
  game.phaseStartedAt = now;
  game.phaseEndsAt = transitionEndsAt;

  game.events.push({
    eventType: GameEventType.TRANSITION_STARTED,
    playerId: null,
    eventData: { transitionDurationSeconds: transitionDuration, endsAt: transitionEndsAt },
    occurredAt: now,
  } as any);

  await game.save();

  logger.info(`[GameService] Game ${game.gameCode} transitioned to TRANSITION phase. Role/tasks assigned.`);

  // 1. Emit phase change to game room
  emitToGame(String(game._id), SocketEvent.TRANSITION_STARTED, {
    phase: GamePhase.TRANSITION,
    phaseStartedAt: now,
    phaseEndsAt: transitionEndsAt,
  });
  emitToGame(String(game._id), SocketEvent.PHASE_CHANGED, {
    from: GamePhase.ROUND_1_COMPLETE,
    to: GamePhase.TRANSITION,
    phaseStartedAt: now,
    phaseEndsAt: transitionEndsAt,
  });

  // 2. Roles/tasks remain strictly secret server-side during TRANSITION!
  // Players receive their private role/task ONLY when ROUND_2_ACTIVE begins.

  // 3. Emit full state to GM
  emitToGm(String(game._id), SocketEvent.GAME_STATE_UPDATE, {
    phase: GamePhase.TRANSITION,
    players: game.players.map((p) => ({
      id: p._id,
      playerName: p.playerName,
      status: p.status,
      role: p.role,
      assignedTaskZone: p.assignedTaskZone,
      assignedTaskName: p.assignedTaskName,
    })),
  });

  return game;
}

export async function startRound2(gameId: string): Promise<IGame> {
  const game = await Game.findById(gameId);
  if (!game) {
    const error = new Error('Game not found.');
    (error as any).statusCode = 404;
    throw error;
  }

  if (game.phase !== GamePhase.TRANSITION) {
    const error = new Error(`Cannot start Round 2: Game is in phase ${game.phase}, expected TRANSITION.`);
    (error as any).statusCode = 400;
    (error as any).code = 'INVALID_PHASE_TRANSITION';
    throw error;
  }

  return startRound2Internal(game);
}

export async function recordKill(params: {
  gameId: string;
  imposterPlayerId: string;
  victimPlayerId: string;
  clientActionId?: string;
}) {
  const { gameId, imposterPlayerId, victimPlayerId, clientActionId } = params;

  const game = await Game.findById(gameId);
  if (!game) {
    const error = new Error('Game not found.');
    (error as any).statusCode = 404;
    throw error;
  }

  if (game.phase === GamePhase.GAME_COMPLETE) {
    const error = new Error('Cannot record kill: Game is completed and read-only.');
    (error as any).statusCode = 400;
    (error as any).code = 'GAME_COMPLETED';
    throw error;
  }

  // Check timers
  await checkGameTimers(game);
  if (game.phase !== GamePhase.ROUND_2_ACTIVE) {
    const error = new Error(`Cannot record kill: Game is in phase ${game.phase}, expected ROUND_2_ACTIVE.`);
    (error as any).statusCode = 400;
    (error as any).code = 'INVALID_PHASE_FOR_KILL';
    throw error;
  }

  // 1. Imposter validation
  const imposter = game.players.id(imposterPlayerId);
  if (!imposter) {
    const error = new Error('Player not in this game.');
    (error as any).statusCode = 403;
    throw error;
  }
  if (imposter.role !== PlayerRole.IMPOSTER) {
    const error = new Error('Unauthorized: Only the Imposter can perform a kill.');
    (error as any).statusCode = 403;
    (error as any).code = 'NOT_IMPOSTER';
    throw error;
  }
  if (imposter.status !== PlayerStatus.ALIVE) {
    const error = new Error('Cannot record kill: Imposter is already eliminated.');
    (error as any).statusCode = 400;
    (error as any).code = 'IMPOSTER_ELIMINATED';
    throw error;
  }

  // 2. Kill limit check: Max 2 kills! Never 3!
  if (game.killCount >= 2) {
    const error = new Error('Cannot record kill: Maximum kill limit (2) already reached.');
    (error as any).statusCode = 400;
    (error as any).code = 'KILL_LIMIT_REACHED';
    throw error;
  }

  // 3. Victim validation
  if (victimPlayerId === imposterPlayerId) {
    const error = new Error('Cannot kill yourself.');
    (error as any).statusCode = 400;
    throw error;
  }
  const victim = game.players.id(victimPlayerId);
  if (!victim) {
    const error = new Error('Victim player not found in this game.');
    (error as any).statusCode = 404;
    throw error;
  }
  if (victim.status !== PlayerStatus.ALIVE) {
    const error = new Error('Cannot record kill: Victim is already eliminated.');
    (error as any).statusCode = 400;
    (error as any).code = 'VICTIM_ALREADY_ELIMINATED';
    throw error;
  }

  // 4. Idempotency / duplicate check
  if (clientActionId) {
    const dup = game.kills.find((k: any) => k.clientActionId === clientActionId);
    if (dup) {
      return {
        success: true,
        killNumber: dup.killNumber,
        victimPlayerId: dup.victimPlayerId,
        cached: true,
      };
    }
  }

  const now = new Date();
  victim.status = PlayerStatus.ELIMINATED;
  game.killCount = (game.killCount || 0) + 1;

  const killDoc = {
    _id: new Types.ObjectId(),
    imposterPlayerId: imposter._id,
    victimPlayerId: victim._id,
    killNumber: game.killCount as 1 | 2,
    reportedAt: now,
    clientActionId: clientActionId ?? null,
  };
  game.kills.push(killDoc as any);

  const bodyReportDuration = game.configSnapshot?.bodyReportDurationSeconds ?? 20;
  const bodyReportEndsAt = new Date(now.getTime() + bodyReportDuration * 1000);

  const bodyReportDoc = {
    _id: new Types.ObjectId(),
    killId: killDoc._id,
    reporterPlayerId: null,
    status: BodyReportStatus.PENDING,
    reportedAt: now,
  };
  game.bodyReports.push(bodyReportDoc as any);

  game.phase = GamePhase.BODY_REPORT;
  game.phaseStartedAt = now;
  game.phaseEndsAt = bodyReportEndsAt;
  // Master timer round2EndsAt is continuous and untouched!

  game.events.push({
    eventType: GameEventType.KILL_REPORTED,
    playerId: imposter._id,
    eventData: {
      killNumber: game.killCount,
      victimPlayerId: victim._id,
      victimPlayerName: victim.playerName,
    },
    occurredAt: now,
  } as any);

  await game.save();

  logger.info(`[GameService] Kill #${game.killCount} recorded: ${imposter.playerName} eliminated ${victim.playerName}`);

  // Socket emissions
  emitToGm(String(game._id), SocketEvent.KILL_OCCURRED, {
    killNumber: game.killCount,
    victimPlayerId: victim._id,
    victimPlayerName: victim.playerName,
    imposterPlayerId: imposter._id,
    imposterPlayerName: imposter.playerName,
  });

  emitToGame(String(game._id), SocketEvent.PLAYER_STATUS_CHANGED, {
    playerId: victim._id,
    playerName: victim.playerName,
    status: PlayerStatus.ELIMINATED,
  });

  emitToGame(String(game._id), SocketEvent.BODY_REPORT_STARTED, {
    phaseEndsAt: bodyReportEndsAt,
    round2EndsAt: game.round2EndsAt,
    victimPlayerName: victim.playerName,
  });

  emitToGame(String(game._id), SocketEvent.PHASE_CHANGED, {
    from: GamePhase.ROUND_2_ACTIVE,
    to: GamePhase.BODY_REPORT,
    phaseEndsAt: bodyReportEndsAt,
    round2EndsAt: game.round2EndsAt,
  });

  return {
    success: true,
    killNumber: game.killCount,
    victimPlayerId: victim._id,
    phase: game.phase,
    phaseEndsAt: bodyReportEndsAt,
  };
}

export async function reportBody(params: {
  gameId: string;
  reporterPlayerId: string;
  clientActionId?: string;
}) {
  const { gameId, reporterPlayerId } = params;

  const game = await Game.findById(gameId);
  if (!game) {
    const error = new Error('Game not found.');
    (error as any).statusCode = 404;
    throw error;
  }

  if (game.phase === GamePhase.GAME_COMPLETE) {
    const error = new Error('Cannot report body: Game is completed and read-only.');
    (error as any).statusCode = 400;
    throw error;
  }

  await checkGameTimers(game);
  if (game.phase !== GamePhase.BODY_REPORT) {
    const error = new Error(`Cannot report body: Game is in phase ${game.phase}, expected BODY_REPORT.`);
    (error as any).statusCode = 400;
    (error as any).code = 'INVALID_PHASE_FOR_REPORT';
    throw error;
  }

  const reporter = game.players.id(reporterPlayerId);
  if (!reporter) {
    const error = new Error('Player not in this game.');
    (error as any).statusCode = 403;
    throw error;
  }
  if (reporter.status !== PlayerStatus.ALIVE) {
    const error = new Error('Eliminated players cannot report a body.');
    (error as any).statusCode = 403;
    (error as any).code = 'PLAYER_ELIMINATED';
    throw error;
  }

  // Find pending body report
  const pendingReport = game.bodyReports.find((b) => b.status === BodyReportStatus.PENDING);
  if (!pendingReport) {
    return {
      success: true,
      message: 'Body report already handled.',
      phase: game.phase,
    };
  }

  const now = new Date();
  pendingReport.status = BodyReportStatus.ACCEPTED;
  pendingReport.reporterPlayerId = reporter._id;

  const moveDuration = game.configSnapshot?.moveToVotingDurationSeconds ?? 15;
  const moveEndsAt = new Date(now.getTime() + moveDuration * 1000);

  game.phase = GamePhase.MOVE_TO_VOTING;
  game.phaseStartedAt = now;
  game.phaseEndsAt = moveEndsAt;

  game.events.push({
    eventType: GameEventType.BODY_REPORTED,
    playerId: reporter._id,
    eventData: { reporterPlayerId: reporter._id, reporterPlayerName: reporter.playerName },
    occurredAt: now,
  } as any);

  await game.save();

  logger.info(`[GameService] Body reported by ${reporter.playerName}. Moving to voting area.`);

  emitToGame(String(game._id), SocketEvent.BODY_REPORTED, {
    reporterPlayerId: reporter._id,
    reporterPlayerName: reporter.playerName,
  });

  emitToGame(String(game._id), SocketEvent.MOVE_TO_VOTING_STARTED, {
    phaseEndsAt: moveEndsAt,
    round2EndsAt: game.round2EndsAt,
  });

  emitToGame(String(game._id), SocketEvent.PHASE_CHANGED, {
    from: GamePhase.BODY_REPORT,
    to: GamePhase.MOVE_TO_VOTING,
    phaseEndsAt: moveEndsAt,
    round2EndsAt: game.round2EndsAt,
  });

  return {
    success: true,
    phase: game.phase,
    phaseEndsAt: moveEndsAt,
    round2EndsAt: game.round2EndsAt,
  };
}

export async function submitVote(params: {
  gameId: string;
  voterPlayerId: string;
  targetPlayerId: string;
  clientActionId?: string;
}) {
  const { gameId, voterPlayerId, targetPlayerId, clientActionId } = params;

  const game = await Game.findById(gameId);
  if (!game) {
    const error = new Error('Game not found.');
    (error as any).statusCode = 404;
    throw error;
  }

  if (game.phase === GamePhase.GAME_COMPLETE) {
    const error = new Error('Cannot submit vote: Game is completed and read-only.');
    (error as any).statusCode = 400;
    throw error;
  }

  await checkGameTimers(game);
  if (game.phase !== GamePhase.VOTING) {
    const error = new Error(`Cannot submit vote: Game is in phase ${game.phase}, expected VOTING.`);
    (error as any).statusCode = 400;
    (error as any).code = 'INVALID_PHASE_FOR_VOTE';
    throw error;
  }

  // Voter validation
  const voter = game.players.id(voterPlayerId);
  if (!voter) {
    const error = new Error('Voter not in this game.');
    (error as any).statusCode = 403;
    throw error;
  }
  if (voter.status !== PlayerStatus.ALIVE) {
    const error = new Error('Eliminated players cannot vote.');
    (error as any).statusCode = 403;
    (error as any).code = 'PLAYER_ELIMINATED';
    throw error;
  }

  // Self-vote check
  if (!game.configSnapshot?.allowSelfVote && voterPlayerId === targetPlayerId) {
    const error = new Error('Self-voting is not allowed.');
    (error as any).statusCode = 400;
    (error as any).code = 'SELF_VOTE_NOT_ALLOWED';
    throw error;
  }

  // Target validation
  const target = game.players.id(targetPlayerId);
  if (!target) {
    const error = new Error('Vote target player not found.');
    (error as any).statusCode = 404;
    throw error;
  }
  if (target.status !== PlayerStatus.ALIVE) {
    const error = new Error('Cannot vote for an eliminated player.');
    (error as any).statusCode = 400;
    (error as any).code = 'TARGET_ALREADY_ELIMINATED';
    throw error;
  }

  // Duplicate vote check in current votingCycle
  const existingVote = game.votes.find(
    (v) => v.votingCycle === game.votingCycle && String(v.voterPlayerId) === voterPlayerId
  );
  if (existingVote) {
    if (clientActionId && (existingVote as any).clientActionId === clientActionId) {
      const eligibleCount = game.players.filter((p) => p.status === PlayerStatus.ALIVE).length;
      const submittedCount = game.votes.filter((v) => v.votingCycle === game.votingCycle).length;
      return {
        success: true,
        submittedVotesCount: submittedCount,
        eligibleVotersCount: eligibleCount,
        cached: true,
      };
    }
    const error = new Error('You have already voted in this voting cycle. Votes cannot be changed.');
    (error as any).statusCode = 400;
    (error as any).code = 'ALREADY_VOTED';
    throw error;
  }

  const now = new Date();
  game.votes.push({
    _id: new Types.ObjectId(),
    votingCycle: game.votingCycle,
    voterPlayerId: voter._id,
    targetPlayerId: target._id,
    castAt: now,
    clientActionId: clientActionId ?? null,
  } as any);

  game.events.push({
    eventType: GameEventType.VOTE_CAST,
    playerId: voter._id,
    eventData: { cycle: game.votingCycle },
    occurredAt: now,
  } as any);

  const eligibleVotersCount = game.players.filter((p) => p.status === PlayerStatus.ALIVE).length;
  const submittedVotesCount = game.votes.filter((v) => v.votingCycle === game.votingCycle).length;

  emitToGame(String(game._id), SocketEvent.VOTE_CAST, {
    submittedVotesCount,
    eligibleVotersCount,
  });

  // If all eligible voters have voted, resolve immediately!
  if (submittedVotesCount >= eligibleVotersCount) {
    logger.info(`[GameService] All ${eligibleVotersCount} votes submitted for cycle ${game.votingCycle}. Resolving immediately.`);
    await resolveVotingInternal(game);
  } else {
    await game.save();
  }

  return {
    success: true,
    submittedVotesCount,
    eligibleVotersCount,
  };
}

export async function resolveVotingInternal(game: IGame) {
  const now = new Date();
  const cycle = game.votingCycle;
  const cycleVotes = game.votes.filter((v) => v.votingCycle === cycle);

  const alivePlayers = game.players.filter((p) => p.status === PlayerStatus.ALIVE);
  const voteCounts: Record<string, number> = {};
  for (const p of alivePlayers) {
    voteCounts[String(p._id)] = 0;
  }

  for (const v of cycleVotes) {
    const tid = String(v.targetPlayerId);
    if (voteCounts[tid] !== undefined) {
      voteCounts[tid] += 1;
    }
  }

  const maxVotes = Math.max(...Object.values(voteCounts), 0);
  const topCandidateIds = Object.keys(voteCounts).filter((id) => voteCounts[id] === maxVotes && maxVotes > 0);

  let eliminatedPlayer: any = null;
  let isTie = false;

  if (topCandidateIds.length === 1) {
    // Clear winner of the vote
    eliminatedPlayer = game.players.id(topCandidateIds[0]);
  } else {
    // Tie (or 0 votes)
    isTie = true;
    const tieRule = game.configSnapshot?.tieRule ?? TieRule.NO_ELIMINATION;
    if (tieRule === TieRule.RANDOM_PICK && topCandidateIds.length > 0) {
      const pickedId = topCandidateIds[Math.floor(Math.random() * topCandidateIds.length)];
      eliminatedPlayer = game.players.id(pickedId);
    } else if (tieRule === TieRule.REVOTE) {
      // Re-vote: start a new voting cycle immediately without eliminating anyone
      const votingDuration = game.configSnapshot?.votingDurationSeconds ?? 15;
      const votingEndsAt = new Date(now.getTime() + votingDuration * 1000);
      game.votingCycle = (game.votingCycle || 0) + 1;
      game.phase = GamePhase.VOTING;
      game.phaseStartedAt = now;
      game.phaseEndsAt = votingEndsAt;
      // Master timer continuous and untouched!
      game.events.push({
        eventType: GameEventType.VOTING_STARTED,
        playerId: null,
        eventData: { cycle: game.votingCycle, reason: 'REVOTE', endsAt: votingEndsAt },
        occurredAt: now,
      } as any);
      await game.save();

      const tally = Object.entries(voteCounts).map(([pid, count]) => {
        const pl = game.players.id(pid);
        return {
          playerId: pid,
          playerName: pl?.playerName ?? 'Unknown',
          voteCount: count,
        };
      });

      emitToGame(String(game._id), SocketEvent.VOTING_RESULT, {
        votingCycle: cycle,
        tally,
        eliminatedPlayer: null,
        isTie: true,
        gameComplete: false,
        result: null,
        nextPhase: GamePhase.VOTING,
        round2EndsAt: game.round2EndsAt,
      });
      emitToGame(String(game._id), SocketEvent.VOTING_STARTED, {
        votingCycle: game.votingCycle,
        phaseEndsAt: votingEndsAt,
        round2EndsAt: game.round2EndsAt,
      });
      return {
        votingCycle: cycle,
        tally,
        eliminatedPlayer: null,
        isTie: true,
        gameComplete: false,
        result: null,
        nextPhase: GamePhase.VOTING,
      };
    } else {
      // NO_ELIMINATION (default)
      eliminatedPlayer = null;
    }
  }

  const tally = Object.entries(voteCounts).map(([pid, count]) => {
    const pl = game.players.id(pid);
    return {
      playerId: pid,
      playerName: pl?.playerName ?? 'Unknown',
      voteCount: count,
    };
  });

  game.votingRevealedAt = now;

  let gameComplete = false;
  let finalResult: GameResult | null = null;

  if (eliminatedPlayer) {
    eliminatedPlayer.status = PlayerStatus.ELIMINATED;

    game.events.push({
      eventType: GameEventType.PLAYER_ELIMINATED,
      playerId: eliminatedPlayer._id,
      eventData: {
        playerName: eliminatedPlayer.playerName,
        role: eliminatedPlayer.role,
        cycle,
      },
      occurredAt: now,
    } as any);

    if (eliminatedPlayer.role === PlayerRole.IMPOSTER) {
      // 1. CREWMATES WIN when Imposter is successfully voted out!
      gameComplete = true;
      finalResult = GameResult.CREWMATES_WIN;
      game.phase = GamePhase.GAME_COMPLETE;
      game.result = finalResult;
      game.completedAt = now;
      logger.info(`[GameService] Imposter ${eliminatedPlayer.playerName} voted out! Crewmates win!`);
    } else {
      // Crewmate eliminated. Imposter is still alive!
      // Check: "IMPOSTER WINS when: The Imposter reaches 2 valid kills and survives the resulting voting sequence."
      if (game.killCount >= 2) {
        gameComplete = true;
        finalResult = GameResult.IMPOSTER_WIN_KILLS;
        game.phase = GamePhase.GAME_COMPLETE;
        game.result = finalResult;
        game.completedAt = now;
        logger.info(`[GameService] Imposter reached 2 kills and survived voting! Imposter wins!`);
      } else {
        // Return to ROUND_2_ACTIVE with continuous master timer!
        game.phase = GamePhase.ROUND_2_ACTIVE;
        game.phaseStartedAt = now;
        game.phaseEndsAt = game.round2EndsAt;
        logger.info(`[GameService] Crewmate ${eliminatedPlayer.playerName} voted out. Continuing Round 2.`);
      }
    }
  } else {
    // Nobody eliminated (tie). Imposter is still alive!
    if (game.killCount >= 2) {
      gameComplete = true;
      finalResult = GameResult.IMPOSTER_WIN_KILLS;
      game.phase = GamePhase.GAME_COMPLETE;
      game.result = finalResult;
      game.completedAt = now;
      logger.info(`[GameService] Tie in voting with 2 kills. Imposter survived voting and wins!`);
    } else {
      // Return to ROUND_2_ACTIVE with continuous master timer!
      game.phase = GamePhase.ROUND_2_ACTIVE;
      game.phaseStartedAt = now;
      game.phaseEndsAt = game.round2EndsAt;
      logger.info(`[GameService] No player eliminated in voting. Continuing Round 2.`);
    }
  }

  if (gameComplete) {
    game.events.push({
      eventType: GameEventType.GAME_COMPLETED,
      playerId: null,
      eventData: { result: finalResult, votingCycle: cycle },
      occurredAt: now,
    } as any);
  }

  await game.save();

  // Socket emissions
  emitToGame(String(game._id), SocketEvent.VOTING_RESULT, {
    votingCycle: cycle,
    tally,
    eliminatedPlayer: eliminatedPlayer
      ? {
          id: eliminatedPlayer._id,
          playerName: eliminatedPlayer.playerName,
          role: eliminatedPlayer.role,
        }
      : null,
    isTie,
    gameComplete,
    result: finalResult,
    nextPhase: game.phase,
    round2EndsAt: game.round2EndsAt,
  });

  emitToGame(String(game._id), SocketEvent.PHASE_CHANGED, {
    from: GamePhase.VOTING,
    to: game.phase,
    phaseEndsAt: game.phaseEndsAt,
    round2EndsAt: game.round2EndsAt,
    result: game.result,
  });

  if (gameComplete) {
    const imposter = game.players.find((p) => p.role === PlayerRole.IMPOSTER);
    emitToGame(String(game._id), SocketEvent.GAME_COMPLETE, {
      result: finalResult,
      imposterName: imposter?.playerName,
      imposterId: imposter?._id,
    });
  }

  return {
    votingCycle: cycle,
    tally,
    eliminatedPlayer: eliminatedPlayer
      ? { id: eliminatedPlayer._id, playerName: eliminatedPlayer.playerName, role: eliminatedPlayer.role }
      : null,
    isTie,
    gameComplete,
    result: finalResult,
    nextPhase: game.phase,
  };
}

export async function getGameHistory(gameId: string) {
  const game = await Game.findById(gameId);
  if (!game) return null;

  const imposter = game.players.find((p) => p.role === PlayerRole.IMPOSTER);

  return {
    gameId: game._id,
    gameCode: game.gameCode,
    teamName: game.teamName,
    teamSize: game.teamSize,
    phase: game.phase,
    result: game.result,
    startedAt: game.startedAt,
    completedAt: game.completedAt,
    round1: {
      startedAt: game.round1StartedAt,
      endsAt: game.round1EndsAt,
      puzzleCompleted: game.puzzleCompleted,
      puzzlePieces: game.puzzlePieces,
      qrMappings: game.qrMappings,
    },
    round2: {
      startedAt: game.round2StartedAt,
      endsAt: game.round2EndsAt,
      killCount: game.killCount,
      kills: game.kills.map((k) => {
        const victim = game.players.id(k.victimPlayerId);
        return {
          killNumber: k.killNumber,
          victimPlayerId: k.victimPlayerId,
          victimPlayerName: victim?.playerName ?? 'Unknown',
          reportedAt: k.reportedAt,
        };
      }),
      votingCycles: game.votingCycle,
      votesCount: game.votes.length,
      votes: game.votes.map((v) => {
        const voter = game.players.id(v.voterPlayerId);
        const target = game.players.id(v.targetPlayerId);
        return {
          votingCycle: v.votingCycle,
          voterPlayerId: v.voterPlayerId,
          voterPlayerName: voter?.playerName ?? 'Unknown',
          targetPlayerId: v.targetPlayerId,
          targetPlayerName: target?.playerName ?? 'Unknown',
          castAt: v.castAt,
        };
      }),
    },
    imposter: imposter
      ? { id: imposter._id, playerName: imposter.playerName }
      : null,
    players: game.players.map((p) => ({
      id: p._id,
      playerName: p.playerName,
      role: p.role,
      assignedTaskZone: p.assignedTaskZone,
      assignedTaskName: p.assignedTaskName,
      status: p.status,
      lives: p.lives,
    })),
    configSnapshot: game.configSnapshot,
    eventsCount: game.events.length,
    events: game.events,
  };
}

export async function listGameHistory() {
  const games = await Game.find({ phase: GamePhase.GAME_COMPLETE }).sort({ completedAt: -1 }).limit(20);
  return games.map((game) => {
    const imposter = game.players.find((p) => p.role === PlayerRole.IMPOSTER);
    return {
      gameId: game._id,
      gameCode: game.gameCode,
      teamName: game.teamName,
      teamSize: game.teamSize,
      result: game.result,
      startedAt: game.startedAt,
      completedAt: game.completedAt,
      killCount: game.killCount,
      imposterName: imposter?.playerName ?? null,
      playersCount: game.players.length,
    };
  });
}
