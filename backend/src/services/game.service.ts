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
  QrType,
  GameEventType,
  AnswerOption,
  SocketEvent,
} from '../types/game.types';
import { GAME_CONSTANTS } from '../config/constants';
import { emitToGame } from '../sockets/socketServer';
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

  // Auto-check timer expiry if active
  await checkRound1TimerExpiry(game);

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
    puzzleCompleted: game.puzzleCompleted,
    puzzlePieces: game.puzzlePieces,
    players: game.players.map((p) => ({
      id: p._id,
      playerName: p.playerName,
      status: p.status,
      lives: p.lives,
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
    recentEvents: game.events.slice(-20),
  };
}

export async function getGameForPlayer(gameId: string, playerId: string) {
  const game = await Game.findById(gameId);
  if (!game) return null;

  await checkRound1TimerExpiry(game);

  const player = game.players.id(playerId);
  if (!player) return null;

  // Sanitize: Player only sees public puzzle pieces, public team members, their own lives
  // NEVER send correctAnswer or full QR mapping!
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
    },
    teammates: game.players.map((p) => ({
      id: p._id,
      playerName: p.playerName,
      status: p.status,
      lives: p.lives,
    })),
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

// ─── Timer Expiry Utility ─────────────────────────────────────────────────────

export async function checkRound1TimerExpiry(game: IGame): Promise<boolean> {
  if (game.phase !== GamePhase.ROUND_1_ACTIVE || !game.phaseEndsAt) {
    return false;
  }

  if (Date.now() >= game.phaseEndsAt.getTime()) {
    logger.info(`[GameService] Round 1 timer expired for game ${game.gameCode}`);
    game.phase = GamePhase.ROUND_1_COMPLETE;
    game.events.push({
      eventType: GameEventType.TIMER_EXPIRED,
      playerId: null,
      eventData: { round: 'ROUND_1' },
      occurredAt: new Date(),
    } as any);
    game.events.push({
      eventType: GameEventType.ROUND_1_COMPLETED,
      playerId: null,
      eventData: { reason: 'TIMER_EXPIRED' },
      occurredAt: new Date(),
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
