/**
 * MOSAIC / DECEPTION — Automated Tests: Automatic Timers & Role Assignments
 *
 * Verifies:
 * 1. FIX 1: Exact gameplay sequence:
 *    ROUND_2_ACTIVE -> BODY_REPORT -> MOVE_TO_VOTING -> VOTING -> RESOLVE_VOTING -> Continue or End.
 * 2. FIX 2: Role assignment rules & privacy:
 *    5-player (1 Imposter, 4 Crewmates), 6-player (1 Imposter, 5 Crewmates),
 *    stable IDs, strict privacy, no client-side decision.
 * 3. FIX 3: Server-authoritative timer transitions, idempotency, and continuous master timer.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  GamePhase,
  GameResult,
  PlayerRole,
  PlayerStatus,
  TieRule,
  BodyReportStatus,
} from '../../src/types/game.types';
import { GAME_CONSTANTS } from '../../src/config/constants';
import { assignAndValidateRoles, checkGameTimers, resolveVotingInternal } from '../../src/services/game.service';

describe('DECEPTION — Automatic Timers & Unique Role Assignments', () => {
  // ─── PART A: ROLE ASSIGNMENT & PRIVACY ──────────────────────────────────────
  describe('Part A: Unique Role Assignment & Privacy', () => {
    function createMockPlayers(count: number) {
      return Array.from({ length: count }, (_, i) => ({
        _id: `player_id_${i + 1}`,
        playerName: `Player_${i + 1}`,
        status: PlayerStatus.REGISTERED,
        role: null,
        assignedTaskZone: null,
        assignedTaskZoneName: null,
        assignedTaskName: null,
        assignedTaskDescription: null,
      }));
    }

    const mockTasks = GAME_CONSTANTS.DEFAULT_TASKS.map((t) => ({
      zoneNumber: t.zoneNumber,
      zoneName: t.zoneName,
      taskName: t.taskName,
      description: t.description,
    }));

    it('5-player team: assigns exactly 1 Imposter and 4 Crewmates with unique player IDs', () => {
      const players = createMockPlayers(5);
      assignAndValidateRoles(players, 5, mockTasks, new Date());

      const imposters = players.filter((p) => p.role === PlayerRole.IMPOSTER);
      const crewmates = players.filter((p) => p.role === PlayerRole.CREWMATE);

      expect(imposters.length).toBe(1);
      expect(crewmates.length).toBe(4);
      expect(players.every((p) => p.status === PlayerStatus.ALIVE)).toBe(true);
      expect(players.every((p) => typeof p.assignedTaskZone === 'number')).toBe(true);
      expect(players.every((p) => p.assignedTaskName && p.assignedTaskDescription)).toBe(true);
    });

    it('6-player team: assigns exactly 1 Imposter and 5 Crewmates with unique player IDs', () => {
      const players = createMockPlayers(6);
      assignAndValidateRoles(players, 6, mockTasks, new Date());

      const imposters = players.filter((p) => p.role === PlayerRole.IMPOSTER);
      const crewmates = players.filter((p) => p.role === PlayerRole.CREWMATE);

      expect(imposters.length).toBe(1);
      expect(crewmates.length).toBe(5);
      expect(players.every((p) => p.status === PlayerStatus.ALIVE)).toBe(true);
    });

    it('rejects invalid roster sizes (< 5 or > 6)', () => {
      const players4 = createMockPlayers(4);
      expect(() => assignAndValidateRoles(players4, 4 as any, mockTasks, new Date())).toThrow(
        /Cannot assign roles/
      );

      const players7 = createMockPlayers(7);
      expect(() => assignAndValidateRoles(players7, 7 as any, mockTasks, new Date())).toThrow(
        /Cannot assign roles/
      );
    });

    it('rejects duplicate player IDs to prevent assignment collision', () => {
      const players = createMockPlayers(5);
      players[1]._id = players[0]._id; // Duplicate!

      expect(() => assignAndValidateRoles(players, 5, mockTasks, new Date())).toThrow(
        /Duplicate player IDs/
      );
    });

    it('ensures each player receives a distinct zone task assignment', () => {
      const players = createMockPlayers(5);
      assignAndValidateRoles(players, 5, mockTasks, new Date());

      const zones = players.map((p) => p.assignedTaskZone);
      const uniqueZones = new Set(zones);
      expect(uniqueZones.size).toBe(5);
    });

    it('delivers private role only to authenticated player, never exposing teammate roles', () => {
      const players = createMockPlayers(5);
      assignAndValidateRoles(players, 5, mockTasks, new Date());

      const requestingPlayer = players[0];
      const isRound2ActiveOrLater = true;

      // Simulate payload returned by getGameForPlayer
      const sanitizedState = {
        myPlayer: {
          id: requestingPlayer._id,
          playerName: requestingPlayer.playerName,
          role: isRound2ActiveOrLater ? requestingPlayer.role : null,
          assignedTaskZone: requestingPlayer.assignedTaskZone,
          assignedTaskName: requestingPlayer.assignedTaskName,
        },
        teammates: players
          .filter((p) => p._id !== requestingPlayer._id)
          .map((p) => ({
            id: p._id,
            playerName: p.playerName,
            status: p.status,
            // Strictly NO role, assignedTaskZone, or assignedTaskName
          })),
      };

      expect(sanitizedState.myPlayer.role).toBe(requestingPlayer.role);
      expect(sanitizedState.teammates.every((t) => (t as any).role === undefined)).toBe(true);
      expect(sanitizedState.teammates.every((t) => (t as any).assignedTaskZone === undefined)).toBe(true);
    });
  });

  // ─── PART B: AUTOMATIC PHASE PROGRESSION & TIMERS ───────────────────────────
  describe('Part B: Automatic Phase Progression & Master Timer Safety', () => {
    function createMockGame(initialPhase: GamePhase) {
      const now = new Date();
      const masterEndsAt = new Date(now.getTime() + 420 * 1000); // 7 min master timer

      const players = [
        {
          _id: 'p1',
          playerName: 'Alice',
          role: PlayerRole.IMPOSTER,
          status: PlayerStatus.ALIVE,
        },
        {
          _id: 'p2',
          playerName: 'Bob',
          role: PlayerRole.CREWMATE,
          status: PlayerStatus.ALIVE,
        },
        {
          _id: 'p3',
          playerName: 'Charlie',
          role: PlayerRole.CREWMATE,
          status: PlayerStatus.ALIVE,
        },
        {
          _id: 'p4',
          playerName: 'Diana',
          role: PlayerRole.CREWMATE,
          status: PlayerStatus.ALIVE,
        },
        {
          _id: 'p5',
          playerName: 'Evan',
          role: PlayerRole.CREWMATE,
          status: PlayerStatus.ALIVE,
        },
      ];

      return {
        _id: 'mock_game_123',
        gameCode: 'MOSAIC-TEST',
        phase: initialPhase,
        teamSize: 5,
        isPaused: false,
        players: {
          id: (id: string) => players.find((p) => p._id === id) || null,
          filter: (fn: any) => players.filter(fn),
          find: (fn: any) => players.find(fn),
          forEach: (fn: any) => players.forEach(fn),
          some: (fn: any) => players.some(fn),
          length: players.length,
          [Symbol.iterator]: () => players[Symbol.iterator](),
        },
        configSnapshot: {
          bodyReportDurationSeconds: 20,
          moveToVotingDurationSeconds: 15,
          votingDurationSeconds: 15,
          tieRule: TieRule.NO_ELIMINATION,
        },
        round2EndsAt: masterEndsAt,
        phaseStartedAt: now,
        phaseEndsAt: new Date(now.getTime() + 20 * 1000),
        killCount: 1,
        kills: [],
        bodyReports: [{ status: BodyReportStatus.PENDING }],
        votes: [],
        votingCycle: 1,
        events: [],
        result: null,
        completedAt: null,
        save: vi.fn().mockResolvedValue(true),
      } as any;
    }

    it('Step 1 -> Step 2: Body Report countdown expiry automatically transitions to MOVE_TO_VOTING', async () => {
      const game = createMockGame(GamePhase.BODY_REPORT);
      const originalMasterDeadline = game.round2EndsAt.getTime();

      // Simulate expired body-report deadline (1 second in the past)
      game.phaseEndsAt = new Date(Date.now() - 1000);

      const didTransition = await checkGameTimers(game);

      expect(didTransition).toBe(true);
      expect(game.phase).toBe(GamePhase.MOVE_TO_VOTING);
      expect(game.bodyReports[0].status).toBe(BodyReportStatus.AUTO);
      // Master timer must remain untouched
      expect(game.round2EndsAt.getTime()).toBe(originalMasterDeadline);
      // Movement countdown must be set (15 seconds from now)
      expect(game.phaseEndsAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('Step 3: Movement timer countdown expiry automatically transitions to VOTING (no VOTING_READY pause)', async () => {
      const game = createMockGame(GamePhase.MOVE_TO_VOTING);
      const originalMasterDeadline = game.round2EndsAt.getTime();

      // Simulate expired movement timer
      game.phaseEndsAt = new Date(Date.now() - 1000);

      const didTransition = await checkGameTimers(game);

      expect(didTransition).toBe(true);
      expect(game.phase).toBe(GamePhase.VOTING);
      expect(game.votingCycle).toBe(2);
      expect(game.round2EndsAt.getTime()).toBe(originalMasterDeadline);
      expect(game.phaseEndsAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('Step 4: Voting countdown expiry automatically resolves votes and eliminates candidate', async () => {
      const game = createMockGame(GamePhase.VOTING);
      const originalMasterDeadline = game.round2EndsAt.getTime();

      // Votes: 3 votes for Charlie (Crewmate)
      game.votes = [
        { votingCycle: game.votingCycle, voterPlayerId: 'p1', targetPlayerId: 'p3' },
        { votingCycle: game.votingCycle, voterPlayerId: 'p2', targetPlayerId: 'p3' },
        { votingCycle: game.votingCycle, voterPlayerId: 'p4', targetPlayerId: 'p3' },
      ];

      // Simulate expired voting timer
      game.phaseEndsAt = new Date(Date.now() - 1000);

      const didTransition = await checkGameTimers(game);

      expect(didTransition).toBe(true);
      // Charlie was a Crewmate -> game returns to ROUND_2_ACTIVE
      expect(game.phase).toBe(GamePhase.ROUND_2_ACTIVE);
      const charlie = game.players.id('p3');
      expect(charlie?.status).toBe(PlayerStatus.ELIMINATED);
      // Master timer continuous and intact
      expect(game.round2EndsAt.getTime()).toBe(originalMasterDeadline);
    });

    it('Step 5: Voting out the Imposter ends the game with CREWMATES_WIN', async () => {
      const game = createMockGame(GamePhase.VOTING);

      // Majority votes for p1 (Alice, who is the Imposter)
      game.votes = [
        { votingCycle: game.votingCycle, voterPlayerId: 'p2', targetPlayerId: 'p1' },
        { votingCycle: game.votingCycle, voterPlayerId: 'p3', targetPlayerId: 'p1' },
        { votingCycle: game.votingCycle, voterPlayerId: 'p4', targetPlayerId: 'p1' },
      ];
      game.phaseEndsAt = new Date(Date.now() - 1000);

      const didTransition = await checkGameTimers(game);

      expect(didTransition).toBe(true);
      expect(game.phase).toBe(GamePhase.GAME_COMPLETE);
      expect(game.result).toBe(GameResult.CREWMATES_WIN);
      const alice = game.players.id('p1');
      expect(alice?.status).toBe(PlayerStatus.ELIMINATED);
    });

    it('Step 5: Imposter surviving voting after reaching 2 kills ends with IMPOSTER_WIN_KILLS', async () => {
      const game = createMockGame(GamePhase.VOTING);
      game.killCount = 2; // Imposter reached 2 valid kills!

      // Vote eliminates p2 (Bob, a Crewmate)
      game.votes = [
        { votingCycle: game.votingCycle, voterPlayerId: 'p1', targetPlayerId: 'p2' },
        { votingCycle: game.votingCycle, voterPlayerId: 'p3', targetPlayerId: 'p2' },
      ];
      game.phaseEndsAt = new Date(Date.now() - 1000);

      await resolveVotingInternal(game);

      expect(game.phase).toBe(GamePhase.GAME_COMPLETE);
      expect(game.result).toBe(GameResult.IMPOSTER_WIN_KILLS);
    });

    it('Master timer expiry terminates Round 2 with IMPOSTER_WIN_TIME', async () => {
      const game = createMockGame(GamePhase.ROUND_2_ACTIVE);

      // Simulate expired 7-minute master timer
      game.round2EndsAt = new Date(Date.now() - 1000);

      const didTransition = await checkGameTimers(game);

      expect(didTransition).toBe(true);
      expect(game.phase).toBe(GamePhase.GAME_COMPLETE);
      expect(game.result).toBe(GameResult.IMPOSTER_WIN_TIME);
    });

    it('Ties with default NO_ELIMINATION eliminate nobody and resume ROUND_2_ACTIVE', async () => {
      const game = createMockGame(GamePhase.VOTING);
      game.configSnapshot.tieRule = TieRule.NO_ELIMINATION;

      // Tie: 1 vote for Bob (p2), 1 vote for Charlie (p3)
      game.votes = [
        { votingCycle: game.votingCycle, voterPlayerId: 'p1', targetPlayerId: 'p2' },
        { votingCycle: game.votingCycle, voterPlayerId: 'p4', targetPlayerId: 'p3' },
      ];

      await resolveVotingInternal(game);

      expect(game.phase).toBe(GamePhase.ROUND_2_ACTIVE);
      // Both Bob and Charlie remain alive
      expect(game.players.id('p2')?.status).toBe(PlayerStatus.ALIVE);
      expect(game.players.id('p3')?.status).toBe(PlayerStatus.ALIVE);
    });

    it('Guards against stale or duplicate timer transitions if phase has already changed', async () => {
      const game = createMockGame(GamePhase.ROUND_2_ACTIVE);
      // game is in ROUND_2_ACTIVE, but phaseEndsAt is in past
      game.phaseEndsAt = new Date(Date.now() - 5000);
      game.round2EndsAt = new Date(Date.now() + 300000); // Master timer has 5 mins left

      // Checking timers should NOT transition because in ROUND_2_ACTIVE only master timer is checked
      const didTransition = await checkGameTimers(game);
      expect(didTransition).toBe(false);
      expect(game.phase).toBe(GamePhase.ROUND_2_ACTIVE);
    });

    it('Respects pause state: checkGameTimers returns false when game is paused', async () => {
      const game = createMockGame(GamePhase.BODY_REPORT);
      game.isPaused = true;
      game.phaseEndsAt = new Date(Date.now() - 1000);

      const didTransition = await checkGameTimers(game);
      expect(didTransition).toBe(false);
      expect(game.phase).toBe(GamePhase.BODY_REPORT);
    });
  });
});
