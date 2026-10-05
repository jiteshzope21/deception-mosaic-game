/**
 * MOSAIC — Socket.IO Server
 *
 * Handles real-time bidirectional communication between:
 *   - Game Master (desktop browser)
 *   - Players (mobile browsers)
 *
 * SECURITY MODEL:
 * - Every socket connection must present a valid JWT (same token used for REST API)
 * - The server determines which game/player each socket belongs to
 * - The server is authoritative — clients only display what the server sends
 * - Sensitive data (role, Imposter identity) is only emitted to the specific
 *   socket that owns that data — never broadcast to all
 *
 * ROOM ARCHITECTURE:
 * - game:<gameId>          : All participants (GM + players) in a game
 * - gm:<gameId>            : GM-only room (receives confidential events)
 * - player:<gamePlayerId>  : Player-only room (receives private role/task)
 */

import type { Server as HttpServer } from 'http';
import { Server as SocketServer, type Socket } from 'socket.io';
import { config } from '../config/config';
import { verifyToken, isGmPayload, isPlayerPayload } from '../utils/jwt.utils';
import { SocketEvent } from '../types/game.types';
import { logger } from '../utils/logger';

// ─── Socket Metadata ──────────────────────────────────────────────────────────

interface AuthenticatedSocket extends Socket {
  data: {
    role: 'GM' | 'PLAYER';
    gmId?: string;
    playerId?: string;   // game_player _id
    gameId?: string;
    playerName?: string;
  };
}

let ioInstance: SocketServer | null = null;

export function getIo(): SocketServer | null {
  return ioInstance;
}

// ─── Socket.IO Setup ──────────────────────────────────────────────────────────

export function createSocketServer(httpServer: HttpServer): SocketServer {
  const io = new SocketServer(httpServer, {
    cors: {
      origin: config.cors.allowedOrigins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    // Use websocket transport first, fallback to polling
    transports: ['websocket', 'polling'],
  });

  ioInstance = io;

  // ─── Authentication Middleware ───────────────────────────────────────────────

  io.use((socket: Socket, next) => {
    try {
      // Accept token from auth handshake or cookie
      const token =
        (socket.handshake.auth.token as string | undefined) ||
        (socket.handshake.headers.cookie
          ?.split(';')
          .find((c) => c.trim().startsWith('mosaic_token='))
          ?.split('=')[1]);

      if (!token) {
        next(new Error(SocketEvent.AUTH_ERROR + ': No token provided'));
        return;
      }

      const payload = verifyToken(token);
      if (!payload) {
        next(new Error(SocketEvent.AUTH_ERROR + ': Invalid or expired token'));
        return;
      }

      const authedSocket = socket as AuthenticatedSocket;

      if (isGmPayload(payload)) {
        authedSocket.data = {
          role: 'GM',
          gmId: payload.sub,
        };
      } else if (isPlayerPayload(payload)) {
        authedSocket.data = {
          role: 'PLAYER',
          playerId: payload.sub,
          gameId: payload.gameId,
          playerName: payload.playerName,
        };
      } else {
        next(new Error(SocketEvent.AUTH_ERROR + ': Unknown role'));
        return;
      }

      next();
    } catch (err) {
      logger.error('Socket auth error:', err);
      next(new Error(SocketEvent.AUTH_ERROR + ': Authentication failed'));
    }
  });

  // ─── Connection Handler ────────────────────────────────────────────────────

  io.on('connection', (rawSocket: Socket) => {
    const socket = rawSocket as AuthenticatedSocket;
    const { role, gmId, playerId, gameId, playerName } = socket.data;

    logger.debug(`Socket connected: ${role} | ${role === 'GM' ? gmId : playerName}`);

    // ── Join appropriate rooms ───────────────────────────────────────────────

    if (role === 'GM' && gameId) {
      // GM joins the GM-specific room for a game (if gameId is known at connect time)
      // Phase 2: GM will provide gameId after creating lobby
      void socket.join(`gm:${gameId}`);
      void socket.join(`game:${gameId}`);
    } else if (role === 'PLAYER' && gameId) {
      void socket.join(`game:${gameId}`);
      void socket.join(`player:${playerId}`);
      logger.info(`Player "${playerName}" connected to game ${gameId}`);

      // Notify the game room that a player connected
      io.to(`game:${gameId}`).emit(SocketEvent.PLAYER_JOINED, {
        playerId,
        playerName,
      });
    }

    // ── Client Room Join Request ─────────────────────────────────────────────
    // Allows GM to join a specific game room after creating a lobby

    socket.on(SocketEvent.JOIN_ROOM, (data: { gameId: string }) => {
      if (!data.gameId) return;

      if (role === 'GM') {
        void socket.join(`gm:${data.gameId}`);
        void socket.join(`game:${data.gameId}`);
        socket.data.gameId = data.gameId;
        logger.debug(`GM joined game room: ${data.gameId}`);
      }
    });

    // ── Disconnect Handler ───────────────────────────────────────────────────

    socket.on('disconnect', (reason) => {
      logger.debug(`Socket disconnected: ${role} | reason: ${reason}`);

      if (role === 'PLAYER' && gameId) {
        // Notify others in the game room
        io.to(`game:${gameId}`).emit(SocketEvent.PLAYER_LEFT, {
          playerId,
          playerName,
        });
      }
    });
  });

  return io;
}

// ─── Game State Broadcast Helpers ─────────────────────────────────────────────

/**
 * Emit a game state update to ALL participants in a game.
 * Used by game service when phase changes, timer starts, etc.
 */
export function emitToGame(gameId: string, event: string, data: unknown, io?: SocketServer): void {
  const server = io || ioInstance;
  if (server) {
    server.to(`game:${gameId}`).emit(event, data);
  }
}

/**
 * Emit a confidential event to GM only.
 */
export function emitToGm(gameId: string, event: string, data: unknown, io?: SocketServer): void {
  const server = io || ioInstance;
  if (server) {
    server.to(`gm:${gameId}`).emit(event, data);
  }
}

/**
 * Emit private data to a specific player only (role, task).
 * This is how Imposter identity and private tasks are delivered safely.
 */
export function emitToPlayer(playerId: string, event: string, data: unknown, io?: SocketServer): void {
  const server = io || ioInstance;
  if (server) {
    server.to(`player:${playerId}`).emit(event, data);
  }
}
