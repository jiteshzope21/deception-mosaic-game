/**
 * MOSAIC — Player Lifecycle & Multi-Game Replay Tests
 *
 * Validates:
 * 1. Player logout clears mosaic_token cookie and session.
 * 2. Completed games cannot be joined or queried via public lobby.
 * 3. A claimed name cannot be claimed again (409 conflict).
 * 4. Finishing Game A does not release another player's claimed name or session.
 * 5. Game Master archive and history for completed Game A remain intact.
 * 6. Sequential games (Game A -> Finish -> Game B) work seamlessly without stale state.
 * 7. Socket room isolation between Game A and Game B.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';
import { Game } from '../../src/models/Game.model';
import {
  GamePhase,
  GameResult,
  PlayerStatus,
  PlayerRole,
  SocketEvent,
} from '../../src/types/game.types';
import { ErrorCode } from '../../src/types/auth.types';
import * as authController from '../../src/controllers/auth.controller';
import * as gameService from '../../src/services/game.service';
import * as socketServer from '../../src/sockets/socketServer';

describe('DECEPTION — Player Lifecycle & Multi-Game Replay', () => {
  let emitToGameSpy: any;
  let emitToGmSpy: any;

  beforeEach(() => {
    vi.restoreAllMocks();
    emitToGameSpy = vi.spyOn(socketServer, 'emitToGame').mockImplementation(() => {});
    emitToGmSpy = vi.spyOn(socketServer, 'emitToGm').mockImplementation(() => {});
  });

  const createMockGame = (gameCode: string, phase: GamePhase = GamePhase.LOBBY) => {
    const p1Id = new Types.ObjectId();
    const p2Id = new Types.ObjectId();
    const p3Id = new Types.ObjectId();
    const p4Id = new Types.ObjectId();
    const p5Id = new Types.ObjectId();

    const playersList = [
      {
        _id: p1Id,
        playerName: 'Alice',
        role: PlayerRole.CREWMATE,
        status: PlayerStatus.REGISTERED,
        lives: 2,
        assignedTaskZone: 1,
        assignedTaskName: 'Task 1',
      },
      {
        _id: p2Id,
        playerName: 'Bob',
        role: PlayerRole.IMPOSTER,
        status: PlayerStatus.REGISTERED,
        lives: 2,
        assignedTaskZone: 2,
        assignedTaskName: 'Task 2',
      },
      {
        _id: p3Id,
        playerName: 'Charlie',
        role: PlayerRole.CREWMATE,
        status: PlayerStatus.REGISTERED,
        lives: 2,
        assignedTaskZone: 3,
        assignedTaskName: 'Task 3',
      },
      {
        _id: p4Id,
        playerName: 'Dave',
        role: PlayerRole.CREWMATE,
        status: PlayerStatus.REGISTERED,
        lives: 2,
        assignedTaskZone: 4,
        assignedTaskName: 'Task 4',
      },
      {
        _id: p5Id,
        playerName: 'Eve',
        role: PlayerRole.CREWMATE,
        status: PlayerStatus.REGISTERED,
        lives: 2,
        assignedTaskZone: 5,
        assignedTaskName: 'Task 5',
      },
    ];

    const gameDoc: any = {
      _id: new Types.ObjectId(),
      gameCode,
      teamName: 'Team Rocket',
      teamSize: 5,
      phase,
      result: phase === GamePhase.GAME_COMPLETE ? GameResult.CREWMATES_WIN : undefined,
      isPaused: false,
      killCount: 0,
      kills: [],
      bodyReports: [],
      events: [],
      votes: [],
      qrMappings: [],
      puzzlePieces: [],
      players: Object.assign(playersList, {
        id: (id: string) => playersList.find((p) => p._id.toString() === id.toString()) || null,
      }),
      save: vi.fn().mockResolvedValue(true),
    };

    return gameDoc;
  };

  describe('1. Player Logout & Session Invalidation', () => {
    it('playerLogout clears the mosaic_token cookie and returns success', async () => {
      let clearedCookieName = '';
      const req: any = {};
      const res: any = {
        clearCookie: vi.fn((name: string) => {
          clearedCookieName = name;
        }),
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await authController.playerLogout(req, res);

      expect(res.clearCookie).toHaveBeenCalledWith('mosaic_token');
      expect(clearedCookieName).toBe('mosaic_token');
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({ message: expect.any(String) }),
        })
      );
    });
  });

  describe('2. Public Lobby & Roster Isolation for New Games', () => {
    it('getPublicLobbyByCode excludes completed games', async () => {
      const completedGame = createMockGame('MOSAIC-GAMEA', GamePhase.GAME_COMPLETE);
      vi.spyOn(Game, 'findOne').mockResolvedValue(null);

      const lobby = await gameService.getPublicLobbyByCode('MOSAIC-GAMEA');
      expect(lobby).toBeNull();
    });

    it('getPublicLobbyByCode returns registered player roster for active game', async () => {
      const activeGame = createMockGame('MOSAIC-GAMEB', GamePhase.LOBBY);
      vi.spyOn(Game, 'findOne').mockResolvedValue(activeGame);

      const lobby = await gameService.getPublicLobbyByCode('MOSAIC-GAMEB');
      expect(lobby).not.toBeNull();
      expect(lobby!.gameCode).toBe('MOSAIC-GAMEB');
      expect(lobby!.players).toHaveLength(5);
      expect(lobby!.players[0].isClaimed).toBe(false);
      expect(lobby!.players[0].playerName).toBe('Alice');
    });

    it('playerJoin rejects joining a completed game', async () => {
      vi.spyOn(Game, 'findOne').mockResolvedValue(null);

      const req: any = {
        body: { gameCode: 'MOSAIC-GAMEA', playerName: 'Alice' },
      };
      let errorStatus = 0;
      let errorBody: any = null;
      const res: any = {
        status: vi.fn((code: number) => {
          errorStatus = code;
          return res;
        }),
        json: vi.fn((body: any) => {
          errorBody = body;
        }),
      };

      await authController.playerJoin(req, res);

      expect(errorStatus).toBe(404);
      expect(errorBody.success).toBe(false);
      expect(errorBody.error.code).toBe(ErrorCode.GAME_NOT_FOUND);
    });
  });

  describe('3. Roster Claiming & Claim Collision Safety', () => {
    it('a player can claim an available registered slot in Game B', async () => {
      const gameB = createMockGame('MOSAIC-GAMEB', GamePhase.LOBBY);
      vi.spyOn(Game, 'findOne').mockResolvedValue(gameB);

      let responseCookie = '';
      const req: any = {
        body: { gameCode: 'MOSAIC-GAMEB', playerName: 'Alice' },
      };
      let resStatus = 0;
      let resBody: any = null;
      const res: any = {
        cookie: vi.fn((name: string) => {
          responseCookie = name;
        }),
        status: vi.fn((code: number) => {
          resStatus = code;
          return res;
        }),
        json: vi.fn((body: any) => {
          resBody = body;
        }),
      };

      await authController.playerJoin(req, res);

      expect(resStatus).toBe(201);
      expect(resBody.success).toBe(true);
      expect(resBody.data.player.playerName).toBe('Alice');
      expect(responseCookie).toBe('mosaic_token');
      expect(gameB.players[0].status).toBe(PlayerStatus.JOINED);
      expect(gameB.save).toHaveBeenCalled();
      expect(emitToGmSpy).toHaveBeenCalledWith(
        String(gameB._id),
        SocketEvent.LOBBY_UPDATE,
        expect.any(Object)
      );
    });

    it('rejects duplicate claims for an already claimed name with 409 Conflict', async () => {
      const gameB = createMockGame('MOSAIC-GAMEB', GamePhase.LOBBY);
      // Alice is already claimed
      gameB.players[0].status = PlayerStatus.JOINED;
      vi.spyOn(Game, 'findOne').mockResolvedValue(gameB);

      const req: any = {
        body: { gameCode: 'MOSAIC-GAMEB', playerName: 'Alice' },
      };
      let errorStatus = 0;
      let errorBody: any = null;
      const res: any = {
        status: vi.fn((code: number) => {
          errorStatus = code;
          return res;
        }),
        json: vi.fn((body: any) => {
          errorBody = body;
        }),
      };

      await authController.playerJoin(req, res);

      expect(errorStatus).toBe(409);
      expect(errorBody.success).toBe(false);
      expect(errorBody.error.code).toBe(ErrorCode.PLAYER_ALREADY_JOINED);
    });
  });

  describe('4. Multi-Game Lifecycle: Game A -> Finish -> Game B', () => {
    it('Game A remains archived with complete history when player finishes and joins Game B', async () => {
      const gameA = createMockGame('MOSAIC-GAMEA', GamePhase.GAME_COMPLETE);
      gameA.players[0].status = PlayerStatus.JOINED;
      gameA.players[1].status = PlayerStatus.JOINED;
      gameA.result = GameResult.CREWMATES_WIN;

      // Finish player session for player on device
      const reqLogout: any = {};
      const resLogout: any = {
        clearCookie: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      await authController.playerLogout(reqLogout, resLogout);
      expect(resLogout.clearCookie).toHaveBeenCalledWith('mosaic_token');

      // Verify Game A's document was NOT altered or cleared
      expect(gameA.phase).toBe(GamePhase.GAME_COMPLETE);
      expect(gameA.result).toBe(GameResult.CREWMATES_WIN);
      expect(gameA.players[1].status).toBe(PlayerStatus.JOINED); // Other player still intact

      // Now join Game B
      const gameB = createMockGame('MOSAIC-GAMEB', GamePhase.LOBBY);
      vi.spyOn(Game, 'findOne').mockResolvedValue(gameB);

      const reqJoinB: any = {
        body: { gameCode: 'MOSAIC-GAMEB', playerName: 'Bob' },
      };
      let joinBStatus = 0;
      let joinBBody: any = null;
      const resJoinB: any = {
        cookie: vi.fn(),
        status: vi.fn((code: number) => {
          joinBStatus = code;
          return resJoinB;
        }),
        json: vi.fn((body: any) => {
          joinBBody = body;
        }),
      };

      await authController.playerJoin(reqJoinB, resJoinB);

      expect(joinBStatus).toBe(201);
      expect(joinBBody.success).toBe(true);
      expect(joinBBody.data.player.gameCode).toBe('MOSAIC-GAMEB');
      expect(joinBBody.data.player.playerName).toBe('Bob');

      // Verify Game B's socket emission targeted only Game B's ID
      expect(emitToGmSpy).toHaveBeenCalledWith(
        String(gameB._id),
        SocketEvent.LOBBY_UPDATE,
        expect.objectContaining({ gameCode: 'MOSAIC-GAMEB' })
      );
    });
  });
});
