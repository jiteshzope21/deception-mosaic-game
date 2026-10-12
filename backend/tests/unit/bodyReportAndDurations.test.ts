import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';
import { Game } from '../../src/models/Game.model';
import {
  reportBody,
  getGameHistory,
  getGameForGm,
  calculateElapsedSeconds,
  formatElapsedIntoRound2,
  formatDuration,
} from '../../src/services/game.service';
import { GamePhase, PlayerRole, PlayerStatus, SocketEvent, BodyReportStatus } from '../../src/types/game.types';
import * as socketServer from '../../src/sockets/socketServer';

describe('DECEPTION — Report Body & Event Duration Calculations', () => {
  const mockGameId = new Types.ObjectId().toHexString();
  const imposterId = new Types.ObjectId().toHexString();
  const victimId = new Types.ObjectId().toHexString();
  const crewmateId = new Types.ObjectId().toHexString();

  let emitToGameSpy: any;
  let emitToGmSpy: any;

  beforeEach(() => {
    vi.restoreAllMocks();
    emitToGameSpy = vi.spyOn(socketServer, 'emitToGame').mockImplementation(() => {});
    emitToGmSpy = vi.spyOn(socketServer, 'emitToGm').mockImplementation(() => {});
  });

  const createMockGame = (overrides: Record<string, any> = {}) => {
    const round2Start = new Date('2026-10-12T10:00:00.000Z');
    const masterEndsAt = new Date('2026-10-12T10:10:00.000Z');

    const playersList = [
      {
        _id: new Types.ObjectId(imposterId),
        playerName: 'AliceImposter',
        role: PlayerRole.IMPOSTER,
        status: PlayerStatus.ALIVE,
        lives: 2,
        assignedTaskZone: 5,
        assignedTaskName: 'Circuit Assembly',
      },
      {
        _id: new Types.ObjectId(victimId),
        playerName: 'BobVictim',
        role: PlayerRole.CREWMATE,
        status: PlayerStatus.ELIMINATED,
        lives: 0,
        assignedTaskZone: 1,
        assignedTaskName: 'Hidden Keyboard',
      },
      {
        _id: new Types.ObjectId(crewmateId),
        playerName: 'CharlieCrew',
        role: PlayerRole.CREWMATE,
        status: PlayerStatus.ALIVE,
        lives: 2,
        assignedTaskZone: 2,
        assignedTaskName: 'Code Debugging',
      },
    ];

    const gameDoc: any = {
      _id: new Types.ObjectId(mockGameId),
      gameCode: 'MOSAIC-TEST',
      teamName: 'AlphaTeam',
      teamSize: 5,
      phase: GamePhase.ROUND_2_ACTIVE,
      isPaused: false,
      killCount: 1,
      kills: [
        {
          _id: new Types.ObjectId(),
          killNumber: 1,
          imposterPlayerId: new Types.ObjectId(imposterId),
          victimPlayerId: new Types.ObjectId(victimId),
          reportedAt: new Date('2026-10-12T10:02:14.000Z'), // 02:14 into Round 2
        },
      ],
      bodyReports: [],
      events: [],
      votes: [],
      qrMappings: [],
      round2StartedAt: round2Start,
      round2EndsAt: masterEndsAt,
      phaseStartedAt: round2Start,
      phaseEndsAt: masterEndsAt,
      configSnapshot: {
        moveToVotingDurationSeconds: 15,
        votingDurationSeconds: 15,
      },
      players: Object.assign(playersList, {
        id: (id: string) => playersList.find((p) => p._id.toString() === id.toString()) || null,
      }),
      save: vi.fn().mockResolvedValue(true),
      ...overrides,
    };

    return gameDoc;
  };

  describe('Part 1: Elapsed Duration Calculations', () => {
    it('calculates elapsed seconds accurately from authoritative timestamps', () => {
      const start = new Date('2026-10-12T10:00:00.000Z');
      const eventTime = new Date('2026-10-12T10:02:14.000Z'); // 134 seconds
      const seconds = calculateElapsedSeconds(eventTime, start);
      expect(seconds).toBe(134);
    });

    it('formats MM:SS into Round 2 matching required examples (02:14 and 03:43)', () => {
      const start = new Date('2026-10-12T10:00:00.000Z');
      const kill1Time = new Date('2026-10-12T10:02:14.000Z');
      const kill2Time = new Date('2026-10-12T10:03:43.000Z');

      expect(formatElapsedIntoRound2(kill1Time, start)).toBe('02:14 into Round 2');
      expect(formatElapsedIntoRound2(kill2Time, start)).toBe('03:43 into Round 2');
    });

    it('formats HH:MM:SS into Round 2 when duration exceeds 1 hour', () => {
      const start = new Date('2026-10-12T10:00:00.000Z');
      const killTime = new Date('2026-10-12T11:05:22.000Z'); // 1 hour, 5 mins, 22 secs

      expect(formatElapsedIntoRound2(killTime, start)).toBe('01:05:22 into Round 2');
    });

    it('handles missing or invalid timestamps safely without NaN', () => {
      expect(calculateElapsedSeconds(null, new Date())).toBeNull();
      expect(calculateElapsedSeconds(new Date(), null)).toBeNull();
      expect(formatElapsedIntoRound2(null, new Date())).toBeNull();
      expect(formatElapsedIntoRound2(new Date('invalid'), new Date())).toBeNull();
    });

    it('formats operation duration (HH:MM:SS or MM:SS) between genuine start and end', () => {
      const start = new Date('2026-10-12T10:00:00.000Z');
      const end1 = new Date('2026-10-12T10:01:32.000Z');
      const end2 = new Date('2026-10-12T11:02:15.000Z');

      expect(formatDuration(start, end1)).toBe('01:32');
      expect(formatDuration(start, end2)).toBe('01:02:15');
      expect(formatDuration(null, end1)).toBeNull();
    });

    it('getGameHistory returns kills ordered by killNumber with stable elapsedFormatted', async () => {
      const gameDoc = createMockGame({
        kills: [
          {
            _id: new Types.ObjectId(),
            killNumber: 2,
            imposterPlayerId: new Types.ObjectId(imposterId),
            victimPlayerId: new Types.ObjectId(crewmateId),
            reportedAt: new Date('2026-10-12T10:03:43.000Z'),
          },
          {
            _id: new Types.ObjectId(),
            killNumber: 1,
            imposterPlayerId: new Types.ObjectId(imposterId),
            victimPlayerId: new Types.ObjectId(victimId),
            reportedAt: new Date('2026-10-12T10:02:14.000Z'),
          },
        ],
      });
      vi.spyOn(Game, 'findById').mockResolvedValue(gameDoc);

      const history = await getGameHistory(mockGameId);
      expect(history).not.toBeNull();
      expect(history!.round2.kills).toHaveLength(2);
      expect(history!.round2.kills[0].killNumber).toBe(1);
      expect(history!.round2.kills[0].elapsedFormatted).toBe('02:14 into Round 2');
      expect(history!.round2.kills[1].killNumber).toBe(2);
      expect(history!.round2.kills[1].elapsedFormatted).toBe('03:43 into Round 2');
    });

    it('getGameForGm returns kills with calculated elapsedSeconds and elapsedFormatted', async () => {
      const gameDoc = createMockGame();
      vi.spyOn(Game, 'findById').mockResolvedValue(gameDoc);

      const gmData = await getGameForGm(mockGameId);
      expect(gmData).not.toBeNull();
      expect(gmData!.kills[0].elapsedFormatted).toBe('02:14 into Round 2');
      expect(gmData!.kills[0].elapsedSeconds).toBe(134);
    });
  });

  describe('Part 2: Report Body Validation & Error Handling', () => {
    it('a valid Imposter body report succeeds and transitions to MOVE_TO_VOTING', async () => {
      const gameDoc = createMockGame();
      vi.spyOn(Game, 'findById').mockResolvedValue(gameDoc);

      const result = await reportBody({
        gameId: mockGameId,
        reporterPlayerId: imposterId,
        victimPlayerId: victimId,
      });

      expect(result.success).toBe(true);
      expect(result.phase).toBe(GamePhase.MOVE_TO_VOTING);
      expect(gameDoc.phase).toBe(GamePhase.MOVE_TO_VOTING);
      expect(gameDoc.bodyReports).toHaveLength(1);
      expect(gameDoc.bodyReports[0].status).toBe(BodyReportStatus.ACCEPTED);
      expect(gameDoc.bodyReports[0].killId.toString()).toBe(gameDoc.kills[0]._id.toString());
      expect(gameDoc.save).toHaveBeenCalled();
    });

    it('a valid Crewmate body report succeeds', async () => {
      const gameDoc = createMockGame();
      vi.spyOn(Game, 'findById').mockResolvedValue(gameDoc);

      const result = await reportBody({
        gameId: mockGameId,
        reporterPlayerId: crewmateId,
        victimPlayerId: victimId,
      });

      expect(result.success).toBe(true);
      expect(result.phase).toBe(GamePhase.MOVE_TO_VOTING);
      expect(gameDoc.bodyReports[0].reporterPlayerId.toString()).toBe(crewmateId);
    });

    it('reporting a living player is rejected with 400 VICTIM_NOT_ELIMINATED', async () => {
      const gameDoc = createMockGame();
      vi.spyOn(Game, 'findById').mockResolvedValue(gameDoc);

      await expect(
        reportBody({
          gameId: mockGameId,
          reporterPlayerId: imposterId,
          victimPlayerId: crewmateId, // CharlieCrew is ALIVE
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VICTIM_NOT_ELIMINATED',
      });
    });

    it('reporting an already reported body is rejected safely with 400 BODY_ALREADY_REPORTED', async () => {
      const gameDoc = createMockGame({
        bodyReports: [
          {
            _id: new Types.ObjectId(),
            killId: null,
            reporterPlayerId: new Types.ObjectId(crewmateId),
            victimPlayerId: new Types.ObjectId(victimId),
            status: BodyReportStatus.ACCEPTED,
            reportedAt: new Date(),
          },
        ],
      });
      vi.spyOn(Game, 'findById').mockResolvedValue(gameDoc);

      await expect(
        reportBody({
          gameId: mockGameId,
          reporterPlayerId: imposterId,
          victimPlayerId: victimId,
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'BODY_ALREADY_REPORTED',
      });
    });

    it('reporting by an eliminated player is rejected with 403 PLAYER_ELIMINATED', async () => {
      const gameDoc = createMockGame();
      vi.spyOn(Game, 'findById').mockResolvedValue(gameDoc);

      await expect(
        reportBody({
          gameId: mockGameId,
          reporterPlayerId: victimId, // BobVictim is ELIMINATED
          victimPlayerId: victimId,
        })
      ).rejects.toMatchObject({
        statusCode: 403,
        code: 'PLAYER_ELIMINATED',
      });
    });

    it('reporting during an unauthorized phase (e.g. ROUND_1_ACTIVE) is rejected with 400', async () => {
      const gameDoc = createMockGame({ phase: GamePhase.ROUND_1_ACTIVE });
      vi.spyOn(Game, 'findById').mockResolvedValue(gameDoc);

      await expect(
        reportBody({
          gameId: mockGameId,
          reporterPlayerId: imposterId,
          victimPlayerId: victimId,
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_PHASE_FOR_REPORT',
      });
    });

    it('concurrent duplicate requests with clientActionId trigger only one transition', async () => {
      const gameDoc = createMockGame();
      vi.spyOn(Game, 'findById').mockResolvedValue(gameDoc);

      const clientActionId = 'cid-report-1234';

      // First report
      const res1 = await reportBody({
        gameId: mockGameId,
        reporterPlayerId: imposterId,
        victimPlayerId: victimId,
        clientActionId,
      });
      expect(res1.success).toBe(true);

      // Duplicate report with same clientActionId
      const res2 = await reportBody({
        gameId: mockGameId,
        reporterPlayerId: imposterId,
        victimPlayerId: victimId,
        clientActionId,
      });
      expect(res2.success).toBe(true);
      expect(res2.cached).toBe(true);
    });

    it('concurrent submission when game is already in MOVE_TO_VOTING succeeds without re-transitioning', async () => {
      const gameDoc = createMockGame({ phase: GamePhase.MOVE_TO_VOTING });
      vi.spyOn(Game, 'findById').mockResolvedValue(gameDoc);

      const res = await reportBody({
        gameId: mockGameId,
        reporterPlayerId: crewmateId,
        victimPlayerId: victimId,
      });

      expect(res.success).toBe(true);
      expect(res.alreadyTransitioned).toBe(true);
    });

    it('Round 2 master timer remains unchanged across body report', async () => {
      const originalMasterEnd = new Date('2026-10-12T10:10:00.000Z');
      const gameDoc = createMockGame({ round2EndsAt: originalMasterEnd });
      vi.spyOn(Game, 'findById').mockResolvedValue(gameDoc);

      const res = await reportBody({
        gameId: mockGameId,
        reporterPlayerId: imposterId,
        victimPlayerId: victimId,
      });

      expect(gameDoc.round2EndsAt.getTime()).toBe(originalMasterEnd.getTime());
      expect(res.round2EndsAt?.getTime()).toBe(originalMasterEnd.getTime());
    });

    it('successful report emits events to both game room and GM room', async () => {
      const gameDoc = createMockGame();
      vi.spyOn(Game, 'findById').mockResolvedValue(gameDoc);

      await reportBody({
        gameId: mockGameId,
        reporterPlayerId: imposterId,
        victimPlayerId: victimId,
      });

      expect(emitToGameSpy).toHaveBeenCalledWith(
        mockGameId,
        SocketEvent.BODY_REPORTED,
        expect.objectContaining({
          reporterPlayerName: 'AliceImposter',
          victimPlayerName: 'BobVictim',
        })
      );

      expect(emitToGmSpy).toHaveBeenCalledWith(
        mockGameId,
        SocketEvent.BODY_REPORTED,
        expect.objectContaining({
          reporterPlayerName: 'AliceImposter',
          victimPlayerName: 'BobVictim',
        })
      );

      expect(emitToGmSpy).toHaveBeenCalledWith(
        mockGameId,
        SocketEvent.MOVE_TO_VOTING_STARTED,
        expect.anything()
      );
    });

    it('database failure during save throws and does not fake success', async () => {
      const gameDoc = createMockGame();
      gameDoc.save = vi.fn().mockRejectedValue(new Error('DB connection lost'));
      vi.spyOn(Game, 'findById').mockResolvedValue(gameDoc);

      await expect(
        reportBody({
          gameId: mockGameId,
          reporterPlayerId: imposterId,
          victimPlayerId: victimId,
        })
      ).rejects.toThrow('DB connection lost');
    });
  });
});
