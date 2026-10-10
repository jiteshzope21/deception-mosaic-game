/**
 * MOSAIC — Game Controller (Phase 2 + Phase 3)
 */

import { Request, Response } from 'express';
import * as gameService from '../services/game.service';
import { sendSuccess, sendError, sendInternalError } from '../utils/response.utils';
import { ErrorCode } from '../types/auth.types';
import { logger } from '../utils/logger';

// ─── GM Handlers ──────────────────────────────────────────────────────────────

export async function createLobby(req: Request, res: Response): Promise<void> {
  try {
    const { teamName, teamSize, playerNames } = req.body;
    const game = await gameService.createGameLobby({ teamName, teamSize, playerNames });
    sendSuccess(
      res,
      {
        gameId: game._id,
        gameCode: game.gameCode,
        teamName: game.teamName,
        teamSize: game.teamSize,
        phase: game.phase,
      },
      201
    );
  } catch (err: any) {
    if (err.statusCode) {
      sendError(res, err.code || ErrorCode.VALIDATION_ERROR, err.message, err.statusCode);
      return;
    }
    logger.error('createLobby error:', err);
    sendInternalError(res);
  }
}

export async function getActiveGame(_req: Request, res: Response): Promise<void> {
  try {
    const game = await gameService.getActiveGame();
    if (!game) {
      sendSuccess(res, { game: null });
      return;
    }
    const state = await gameService.getGameForGm(String(game._id));
    sendSuccess(res, { game: state });
  } catch (err) {
    logger.error('getActiveGame error:', err);
    sendInternalError(res);
  }
}

export async function getGmGameState(req: Request, res: Response): Promise<void> {
  try {
    const gameId = req.params.gameId as string;
    const state = await gameService.getGameForGm(gameId);
    if (!state) {
      sendError(res, ErrorCode.GAME_NOT_FOUND, 'Game not found.', 404);
      return;
    }
    sendSuccess(res, state);
  } catch (err) {
    logger.error('getGmGameState error:', err);
    sendInternalError(res);
  }
}

export async function startGame(req: Request, res: Response): Promise<void> {
  try {
    const gameId = req.params.gameId as string;
    const game = await gameService.startGame(gameId);
    sendSuccess(res, {
      gameId: game._id,
      gameCode: game.gameCode,
      phase: game.phase,
      phaseStartedAt: game.phaseStartedAt,
      phaseEndsAt: game.phaseEndsAt,
      totalPieces: game.puzzlePieces.length,
    });
  } catch (err: any) {
    if (err.statusCode) {
      sendError(res, err.code || ErrorCode.VALIDATION_ERROR, err.message, err.statusCode);
      return;
    }
    logger.error('startGame error:', err);
    sendInternalError(res);
  }
}

export async function emergencyEndRound(req: Request, res: Response): Promise<void> {
  try {
    const gameId = req.params.gameId as string;
    const game = await gameService.emergencyEndRound1(gameId);
    sendSuccess(res, {
      gameId: game._id,
      phase: game.phase,
      message: 'Round 1 ended by GM.',
    });
  } catch (err: any) {
    if (err.statusCode) {
      sendError(res, err.code || ErrorCode.VALIDATION_ERROR, err.message, err.statusCode);
      return;
    }
    logger.error('emergencyEndRound error:', err);
    sendInternalError(res);
  }
}

export async function restartGame(req: Request, res: Response): Promise<void> {
  try {
    const gameId = req.params.gameId as string;
    const game = await gameService.restartGame(gameId);
    sendSuccess(res, {
      gameId: game._id,
      phase: game.phase,
      message: 'Game restarted to lobby.',
    });
  } catch (err: any) {
    if (err.statusCode) {
      sendError(res, err.code || ErrorCode.VALIDATION_ERROR, err.message, err.statusCode);
      return;
    }
    logger.error('restartGame error:', err);
    sendInternalError(res);
  }
}

export async function pauseGame(req: Request, res: Response): Promise<void> {
  try {
    const gameId = req.params.gameId as string;
    const game = await gameService.pauseGame(gameId);
    sendSuccess(res, {
      gameId: game._id,
      phase: game.phase,
      isPaused: game.isPaused,
      pausedRemainingMs: game.pausedRemainingMs,
      pausedRound2RemainingMs: game.pausedRound2RemainingMs,
      message: 'Game paused.',
    });
  } catch (err: any) {
    if (err.statusCode) {
      sendError(res, err.code || ErrorCode.VALIDATION_ERROR, err.message, err.statusCode);
      return;
    }
    logger.error('pauseGame error:', err);
    sendInternalError(res);
  }
}

export async function resumeGame(req: Request, res: Response): Promise<void> {
  try {
    const gameId = req.params.gameId as string;
    const game = await gameService.resumeGame(gameId);
    sendSuccess(res, {
      gameId: game._id,
      phase: game.phase,
      isPaused: game.isPaused,
      phaseEndsAt: game.phaseEndsAt,
      round2EndsAt: game.round2EndsAt,
      message: 'Game resumed.',
    });
  } catch (err: any) {
    if (err.statusCode) {
      sendError(res, err.code || ErrorCode.VALIDATION_ERROR, err.message, err.statusCode);
      return;
    }
    logger.error('resumeGame error:', err);
    sendInternalError(res);
  }
}

export async function resetRound1(req: Request, res: Response): Promise<void> {
  try {
    const gameId = req.params.gameId as string;
    const game = await gameService.resetRound1(gameId);
    sendSuccess(res, {
      gameId: game._id,
      phase: game.phase,
      roundRevision: game.roundRevision,
      message: 'Round 1 reset successfully.',
    });
  } catch (err: any) {
    if (err.statusCode) {
      sendError(res, err.code || ErrorCode.VALIDATION_ERROR, err.message, err.statusCode);
      return;
    }
    logger.error('resetRound1 error:', err);
    sendInternalError(res);
  }
}

export async function resetRound2(req: Request, res: Response): Promise<void> {
  try {
    const gameId = req.params.gameId as string;
    const game = await gameService.resetRound2(gameId);
    sendSuccess(res, {
      gameId: game._id,
      phase: game.phase,
      roundRevision: game.roundRevision,
      message: 'Round 2 reset successfully.',
    });
  } catch (err: any) {
    if (err.statusCode) {
      sendError(res, err.code || ErrorCode.VALIDATION_ERROR, err.message, err.statusCode);
      return;
    }
    logger.error('resetRound2 error:', err);
    sendInternalError(res);
  }
}

export async function terminateRound1(req: Request, res: Response): Promise<void> {
  try {
    const gameId = req.params.gameId as string;
    const game = await gameService.terminateRound1(gameId);
    sendSuccess(res, {
      gameId: game._id,
      phase: game.phase,
      message: 'Round 1 terminated by GM.',
    });
  } catch (err: any) {
    if (err.statusCode) {
      sendError(res, err.code || ErrorCode.VALIDATION_ERROR, err.message, err.statusCode);
      return;
    }
    logger.error('terminateRound1 error:', err);
    sendInternalError(res);
  }
}

export async function terminateRound2(req: Request, res: Response): Promise<void> {
  try {
    const gameId = req.params.gameId as string;
    const game = await gameService.terminateRound2(gameId);
    sendSuccess(res, {
      gameId: game._id,
      phase: game.phase,
      result: game.result,
      message: 'Round 2 terminated by GM.',
    });
  } catch (err: any) {
    if (err.statusCode) {
      sendError(res, err.code || ErrorCode.VALIDATION_ERROR, err.message, err.statusCode);
      return;
    }
    logger.error('terminateRound2 error:', err);
    sendInternalError(res);
  }
}

// ─── Player & Public Handlers ─────────────────────────────────────────────────

export async function getPublicLobby(req: Request, res: Response): Promise<void> {
  try {
    const code = req.params.code as string;
    const lobby = await gameService.getPublicLobbyByCode(code);
    if (!lobby) {
      sendError(res, ErrorCode.GAME_NOT_FOUND, 'Game not found.', 404);
      return;
    }
    sendSuccess(res, lobby);
  } catch (err) {
    logger.error('getPublicLobby error:', err);
    sendInternalError(res);
  }
}

export async function getPlayerGameState(req: Request, res: Response): Promise<void> {
  try {
    const gameId = req.params.gameId as string;
    const playerId = req.playerId;
    if (!playerId) {
      sendError(res, ErrorCode.UNAUTHORIZED, 'Player authentication required.', 401);
      return;
    }

    if (req.gameId && req.gameId !== gameId) {
      sendError(res, ErrorCode.FORBIDDEN, 'Access denied: You do not belong to this game.', 403);
      return;
    }

    const state = await gameService.getGameForPlayer(gameId, playerId);
    if (!state) {
      sendError(res, ErrorCode.GAME_NOT_FOUND, 'Game or player not found.', 404);
      return;
    }

    sendSuccess(res, state);
  } catch (err) {
    logger.error('getPlayerGameState error:', err);
    sendInternalError(res);
  }
}

export async function scanQr(req: Request, res: Response): Promise<void> {
  try {
    const gameId = req.params.gameId as string;
    const playerId = req.playerId;
    const { qrCodeId } = req.body;

    if (!playerId) {
      sendError(res, ErrorCode.UNAUTHORIZED, 'Player authentication required.', 401);
      return;
    }

    if (req.gameId && req.gameId !== gameId) {
      sendError(res, ErrorCode.FORBIDDEN, 'Access denied: You do not belong to this game.', 403);
      return;
    }

    const result = await gameService.scanQrCode({ gameId, playerId, qrCodeId });
    sendSuccess(res, result);
  } catch (err: any) {
    if (err.statusCode) {
      sendError(res, err.code || ErrorCode.VALIDATION_ERROR, err.message, err.statusCode);
      return;
    }
    logger.error('scanQr error:', err);
    sendInternalError(res);
  }
}

export async function submitAnswer(req: Request, res: Response): Promise<void> {
  try {
    const gameId = req.params.gameId as string;
    const playerId = req.playerId;
    const { qrCodeId, questionId, answer, clientActionId } = req.body;

    if (!playerId) {
      sendError(res, ErrorCode.UNAUTHORIZED, 'Player authentication required.', 401);
      return;
    }

    if (req.gameId && req.gameId !== gameId) {
      sendError(res, ErrorCode.FORBIDDEN, 'Access denied: You do not belong to this game.', 403);
      return;
    }

    const result = await gameService.submitAnswer({
      gameId,
      playerId,
      qrCodeId,
      questionId,
      answer,
      clientActionId,
    });
    sendSuccess(res, result);
  } catch (err: any) {
    if (err.statusCode) {
      sendError(res, err.code || ErrorCode.VALIDATION_ERROR, err.message, err.statusCode);
      return;
    }
    logger.error('submitAnswer error:', err);
    sendInternalError(res);
  }
}

// ─── Phase 3: GM Handlers ─────────────────────────────────────────────────────

export async function startTransition(req: Request, res: Response): Promise<void> {
  try {
    const gameId = req.params.gameId as string;
    const game = await gameService.startTransition(gameId);
    sendSuccess(res, {
      gameId: game._id,
      phase: game.phase,
      phaseStartedAt: game.phaseStartedAt,
      phaseEndsAt: game.phaseEndsAt,
    });
  } catch (err: any) {
    if (err.statusCode) {
      sendError(res, err.code || ErrorCode.VALIDATION_ERROR, err.message, err.statusCode);
      return;
    }
    logger.error('startTransition error:', err);
    sendInternalError(res);
  }
}

export async function startRound2(req: Request, res: Response): Promise<void> {
  try {
    const gameId = req.params.gameId as string;
    const game = await gameService.startRound2(gameId);
    sendSuccess(res, {
      gameId: game._id,
      phase: game.phase,
      phaseStartedAt: game.phaseStartedAt,
      phaseEndsAt: game.phaseEndsAt,
      round2EndsAt: game.round2EndsAt,
    });
  } catch (err: any) {
    if (err.statusCode) {
      sendError(res, err.code || ErrorCode.VALIDATION_ERROR, err.message, err.statusCode);
      return;
    }
    logger.error('startRound2 error:', err);
    sendInternalError(res);
  }
}

export async function listGameHistory(_req: Request, res: Response): Promise<void> {
  try {
    const history = await gameService.listGameHistory();
    sendSuccess(res, { games: history });
  } catch (err) {
    logger.error('listGameHistory error:', err);
    sendInternalError(res);
  }
}

export async function getGameHistory(req: Request, res: Response): Promise<void> {
  try {
    const gameId = req.params.gameId as string;
    const history = await gameService.getGameHistory(gameId);
    if (!history) {
      sendError(res, ErrorCode.GAME_NOT_FOUND, 'Game not found.', 404);
      return;
    }
    sendSuccess(res, history);
  } catch (err) {
    logger.error('getGameHistory error:', err);
    sendInternalError(res);
  }
}

// ─── Phase 3: Player Handlers ─────────────────────────────────────────────────

export async function recordKill(req: Request, res: Response): Promise<void> {
  try {
    const gameId = req.params.gameId as string;
    const imposterPlayerId = req.playerId;
    const { victimPlayerId, clientActionId } = req.body;

    if (!imposterPlayerId) {
      sendError(res, ErrorCode.UNAUTHORIZED, 'Player authentication required.', 401);
      return;
    }
    if (req.gameId && req.gameId !== gameId) {
      sendError(res, ErrorCode.FORBIDDEN, 'Access denied: You do not belong to this game.', 403);
      return;
    }

    const result = await gameService.recordKill({ gameId, imposterPlayerId, victimPlayerId, clientActionId });
    sendSuccess(res, result);
  } catch (err: any) {
    if (err.statusCode) {
      sendError(res, err.code || ErrorCode.VALIDATION_ERROR, err.message, err.statusCode);
      return;
    }
    logger.error('recordKill error:', err);
    sendInternalError(res);
  }
}

export async function reportBody(req: Request, res: Response): Promise<void> {
  try {
    const gameId = req.params.gameId as string;
    const reporterPlayerId = req.playerId;
    const { clientActionId, victimPlayerId } = req.body;

    if (!reporterPlayerId) {
      sendError(res, ErrorCode.UNAUTHORIZED, 'Player authentication required.', 401);
      return;
    }
    if (req.gameId && req.gameId !== gameId) {
      sendError(res, ErrorCode.FORBIDDEN, 'Access denied: You do not belong to this game.', 403);
      return;
    }

    const result = await gameService.reportBody({ gameId, reporterPlayerId, victimPlayerId, clientActionId });
    sendSuccess(res, result);
  } catch (err: any) {
    if (err.statusCode) {
      sendError(res, err.code || ErrorCode.VALIDATION_ERROR, err.message, err.statusCode);
      return;
    }
    logger.error('reportBody error:', err);
    sendInternalError(res);
  }
}

export async function submitVote(req: Request, res: Response): Promise<void> {
  try {
    const gameId = req.params.gameId as string;
    const voterPlayerId = req.playerId;
    const { targetPlayerId, clientActionId } = req.body;

    if (!voterPlayerId) {
      sendError(res, ErrorCode.UNAUTHORIZED, 'Player authentication required.', 401);
      return;
    }
    if (req.gameId && req.gameId !== gameId) {
      sendError(res, ErrorCode.FORBIDDEN, 'Access denied: You do not belong to this game.', 403);
      return;
    }

    const result = await gameService.submitVote({ gameId, voterPlayerId, targetPlayerId, clientActionId });
    sendSuccess(res, result);
  } catch (err: any) {
    if (err.statusCode) {
      sendError(res, err.code || ErrorCode.VALIDATION_ERROR, err.message, err.statusCode);
      return;
    }
    logger.error('submitVote error:', err);
    sendInternalError(res);
  }
}
