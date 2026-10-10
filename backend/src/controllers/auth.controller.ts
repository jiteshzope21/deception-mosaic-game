/**
 * MOSAIC — Auth Controller
 *
 * GM login/logout.
 * Player join (architecture scaffold — full implementation in Phase 2).
 */

import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { GmAccount } from '../models/GmAccount.model';
import { Game } from '../models/Game.model';
import { signGmToken, signPlayerToken } from '../utils/jwt.utils';
import { sendSuccess, sendError, sendUnauthorized, sendInternalError } from '../utils/response.utils';
import { ErrorCode } from '../types/auth.types';
import { PlayerStatus, SocketEvent, GameEventType, GamePhase } from '../types/game.types';
import { emitToGame } from '../sockets/socketServer';
import { logger } from '../utils/logger';

// ─── GM Login ─────────────────────────────────────────────────────────────────

export async function gmLogin(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body as { email: string; password: string };

    // Find GM account
    const gm = await GmAccount.findOne({ email });
    if (!gm) {
      sendUnauthorized(res, 'Invalid email or password.');
      return;
    }

    // Verify password
    const isValid = await bcrypt.compare(password, gm.passwordHash);
    if (!isValid) {
      sendUnauthorized(res, 'Invalid email or password.');
      return;
    }

    // Sign token
    const token = signGmToken(String(gm._id), gm.email);

    // Set as HttpOnly cookie + return in body for flexibility
    res.cookie('mosaic_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 8 * 60 * 60 * 1000, // 8 hours
    });

    logger.info(`GM logged in: ${gm.email}`);

    sendSuccess(res, {
      token,
      gm: {
        id: gm._id,
        email: gm.email,
        displayName: gm.displayName,
        role: 'GM',
      },
    });
  } catch (err) {
    logger.error('GM login error:', err);
    sendInternalError(res);
  }
}

// ─── GM Logout ────────────────────────────────────────────────────────────────

export async function gmLogout(_req: Request, res: Response): Promise<void> {
  res.clearCookie('mosaic_token');
  sendSuccess(res, { message: 'Logged out.' });
}

// ─── GM Profile ───────────────────────────────────────────────────────────────

export async function getGmProfile(req: Request, res: Response): Promise<void> {
  try {
    const gm = await GmAccount.findById(req.gmId);
    if (!gm) {
      sendError(res, ErrorCode.UNAUTHORIZED, 'GM account not found.', 401);
      return;
    }
    sendSuccess(res, {
      id: gm._id,
      email: gm.email,
      displayName: gm.displayName,
      role: 'GM',
    });
  } catch {
    sendInternalError(res);
  }
}

// ─── Player Join (Phase 1 Architecture Scaffold) ──────────────────────────────

/**
 * Players join by entering game code + selecting pre-registered name.
 * Full implementation in Phase 2 (lobby creation, QR mapping, etc.)
 *
 * Flow:
 * 1. Validate game code → find active game in LOBBY phase
 * 2. Find player slot with matching name and status REGISTERED
 * 3. Verify slot not already taken (status !== JOINED)
 * 4. Update player status to JOINED, record joinedAt
 * 5. Sign player JWT containing game_player _id + game_id
 * 6. Return token to client
 */
export async function playerJoin(req: Request, res: Response): Promise<void> {
  try {
    const { gameCode, playerName } = req.body as { gameCode: string; playerName: string };

    // Find game (accepts LOBBY or active in-progress games)
    const game = await Game.findOne({
      gameCode: gameCode.toUpperCase().trim(),
      phase: { $ne: GamePhase.GAME_COMPLETE },
    });
    if (!game) {
      sendError(res, ErrorCode.GAME_NOT_FOUND, 'Game not found or has completed.', 404);
      return;
    }

    // Find matching registered player slot by name
    const playerSlot = game.players.find(
      (p) => p.playerName.toLowerCase() === playerName.toLowerCase()
    );

    if (!playerSlot) {
      sendError(res, ErrorCode.PLAYER_NOT_FOUND, 'Player name not found in this game.', 404);
      return;
    }

    // If initial join in LOBBY, claim the slot
    if (playerSlot.status === PlayerStatus.REGISTERED) {
      playerSlot.status = PlayerStatus.JOINED;
      playerSlot.joinedAt = new Date();

      game.events.push({
        eventType: GameEventType.PLAYER_JOINED,
        playerId: playerSlot._id,
        eventData: { playerName: playerSlot.playerName },
        occurredAt: new Date(),
      } as any);

      await game.save();

      // Emit Realtime updates to GM and waiting players
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

      emitToGame(String(game._id), SocketEvent.PLAYER_JOINED, {
        playerId: playerSlot._id,
        playerName: playerSlot.playerName,
      });
    }

    // Issue player JWT for this specific player slot
    const token = signPlayerToken(
      String(playerSlot._id),
      String(game._id),
      playerSlot.playerName
    );

    res.cookie('mosaic_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 4 * 60 * 60 * 1000, // 4 hours
    });

    logger.info(`Player "${playerSlot.playerName}" joined game ${gameCode}`);

    // Emit Realtime updates to GM and waiting players
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

    emitToGame(String(game._id), SocketEvent.PLAYER_JOINED, {
      playerId: playerSlot._id,
      playerName: playerSlot.playerName,
    });

    sendSuccess(res, {
      token,
      player: {
        id: playerSlot._id,
        playerName: playerSlot.playerName,
        gameId: game._id,
        gameCode: game.gameCode,
        teamName: game.teamName,
        role: 'PLAYER',
      },
    }, 201);
  } catch (err) {
    logger.error('Player join error:', err);
    sendInternalError(res);
  }
}

export async function getPlayerProfile(req: Request, res: Response): Promise<void> {
  try {
    const playerId = req.playerId;
    const gameId = req.gameId;

    if (!playerId || !gameId) {
      sendError(res, ErrorCode.UNAUTHORIZED, 'Player authentication required.', 401);
      return;
    }

    const game = await Game.findById(gameId);
    if (!game) {
      sendError(res, ErrorCode.GAME_NOT_FOUND, 'Game not found.', 404);
      return;
    }

    const player = game.players.id(playerId);
    if (!player) {
      sendError(res, ErrorCode.PLAYER_NOT_FOUND, 'Player not found in game.', 404);
      return;
    }

    sendSuccess(res, {
      id: player._id,
      playerName: player.playerName,
      gameId: game._id,
      gameCode: game.gameCode,
      teamName: game.teamName,
      phase: game.phase,
      role: 'PLAYER',
    });
  } catch (err) {
    logger.error('getPlayerProfile error:', err);
    sendInternalError(res);
  }
}

