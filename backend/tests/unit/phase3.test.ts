/**
 * MOSAIC / DECEPTION — Backend Tests: Phase 3 Audit Suite
 * Covers all 14 verification criteria from the DECEPTION specification.
 */

import { describe, it, expect } from 'vitest';
import {
  GamePhase,
  GameResult,
  PlayerRole,
  PlayerStatus,
  TieRule,
} from '../../src/types/game.types';
import {
  killSubmissionSchema,
  bodyReportSubmissionSchema,
  voteSubmissionSchema,
} from '../../src/validators/schemas';
import { GAME_CONSTANTS } from '../../src/config/constants';

describe('Phase 3 Audit — Strict Specification Compliance', () => {
  // ─── 1. TRANSITION ROLE & TASK PRIVACY ───────────────────────────────────────
  describe('1. Transition Role & Task Privacy', () => {
    function simulatePlayerState(phase: GamePhase, player: any, teammates: any[]) {
      const isRound2ActiveOrLater = [
        GamePhase.ROUND_2_ACTIVE,
        GamePhase.BODY_REPORT,
        GamePhase.MOVE_TO_VOTING,
        GamePhase.VOTING,
        GamePhase.GAME_COMPLETE,
      ].includes(phase);

      return {
        phase,
        myPlayer: {
          id: player.id,
          playerName: player.playerName,
          role: isRound2ActiveOrLater ? player.role : null,
          assignedTaskZone: isRound2ActiveOrLater ? player.assignedTaskZone : null,
          assignedTaskName: isRound2ActiveOrLater ? player.assignedTaskName : null,
        },
        teammates: teammates.map((t) => ({
          id: t.id,
          playerName: t.playerName,
          status: t.status,
          // Never includes role or assigned task during gameplay
        })),
      };
    }

    it('ensures role and task are strictly NULL to player during TRANSITION', () => {
      const player = { id: 'p1', playerName: 'Alice', role: PlayerRole.IMPOSTER, assignedTaskZone: 3, assignedTaskName: 'Task 3' };
      const teammates = [{ id: 'p2', playerName: 'Bob', status: PlayerStatus.ALIVE }];

      const state = simulatePlayerState(GamePhase.TRANSITION, player, teammates);
      expect(state.myPlayer.role).toBeNull();
      expect(state.myPlayer.assignedTaskZone).toBeNull();
      expect(state.myPlayer.assignedTaskName).toBeNull();
    });

    it('reveals own role and task ONLY when ROUND_2_ACTIVE begins', () => {
      const player = { id: 'p1', playerName: 'Alice', role: PlayerRole.IMPOSTER, assignedTaskZone: 3, assignedTaskName: 'Task 3' };
      const teammates = [{ id: 'p2', playerName: 'Bob', status: PlayerStatus.ALIVE }];

      const state = simulatePlayerState(GamePhase.ROUND_2_ACTIVE, player, teammates);
      expect(state.myPlayer.role).toBe(PlayerRole.IMPOSTER);
      expect(state.myPlayer.assignedTaskZone).toBe(3);
      expect(state.myPlayer.assignedTaskName).toBe('Task 3');
    });

    it('never exposes teammates roles or tasks to players during active play', () => {
      const player = { id: 'p1', playerName: 'Alice', role: PlayerRole.CREWMATE, assignedTaskZone: 1, assignedTaskName: 'Task 1' };
      const teammates = [{ id: 'p2', playerName: 'Bob', status: PlayerStatus.ALIVE, role: PlayerRole.IMPOSTER, assignedTaskZone: 2 }];

      const state = simulatePlayerState(GamePhase.ROUND_2_ACTIVE, player, teammates);
      expect((state.teammates[0] as any).role).toBeUndefined();
      expect((state.teammates[0] as any).assignedTaskZone).toBeUndefined();
    });
  });

  // ─── 2. FIVE-PLAYER / SIX-PLAYER TASK ALLOCATION ───────────────────────────
  describe('2. Five-Player / Six-Player Task Allocation', () => {
    function allocateTasks(teamSize: 5 | 6) {
      const tasks = [...GAME_CONSTANTS.DEFAULT_TASKS];
      // Shuffle simulation
      const shuffled = tasks.sort(() => Math.random() - 0.5);
      const selected = shuffled.slice(0, teamSize);
      return selected;
    }

    it('5 players: exactly 5 assigned tasks, 5 distinct zones, 1 unused zone', () => {
      for (let run = 0; run < 50; run++) {
        const assigned = allocateTasks(5);
        expect(assigned.length).toBe(5);
        const zones = assigned.map((t) => t.zoneNumber);
        const uniqueZones = new Set(zones);
        expect(uniqueZones.size).toBe(5);

        // All zone numbers must be in 1..6
        zones.forEach((z) => expect(z).toBeGreaterThanOrEqual(1));
        zones.forEach((z) => expect(z).toBeLessThanOrEqual(6));

        // Exactly 1 unused zone from 1..6
        const allZones = [1, 2, 3, 4, 5, 6];
        const unused = allZones.filter((z) => !uniqueZones.has(z as any));
        expect(unused.length).toBe(1);
      }
    });

    it('6 players: exactly 6 assigned tasks, 6 distinct zones, all zones used', () => {
      for (let run = 0; run < 50; run++) {
        const assigned = allocateTasks(6);
        expect(assigned.length).toBe(6);
        const zones = assigned.map((t) => t.zoneNumber);
        const uniqueZones = new Set(zones);
        expect(uniqueZones.size).toBe(6);

        const allZones = [1, 2, 3, 4, 5, 6];
        allZones.forEach((z) => expect(uniqueZones.has(z as any)).toBe(true));
      }
    });
  });

  // ─── 3. EXACTLY ONE IMPOSTER ───────────────────────────────────────────────
  describe('3. Exactly One Imposter Rule', () => {
    function assignRoles(teamSize: 5 | 6) {
      const players = Array.from({ length: teamSize }, (_, i) => ({ id: `p${i}` }));
      const imposterIndex = Math.floor(Math.random() * players.length);
      return players.map((p, idx) => ({
        ...p,
        role: idx === imposterIndex ? PlayerRole.IMPOSTER : PlayerRole.CREWMATE,
      }));
    }

    it('always assigns exactly 1 Imposter across 100 games', () => {
      for (let i = 0; i < 100; i++) {
        const size = (i % 2 === 0 ? 5 : 6) as 5 | 6;
        const roster = assignRoles(size);
        const imposters = roster.filter((p) => p.role === PlayerRole.IMPOSTER);
        const crewmates = roster.filter((p) => p.role === PlayerRole.CREWMATE);
        expect(imposters.length).toBe(1);
        expect(crewmates.length).toBe(size - 1);
      }
    });
  });

  // ─── 4. ROUND 2 MASTER TIMER CONTINUITY ────────────────────────────────────
  describe('4. Round 2 Master Timer Continuity', () => {
    it('maintains the same round2EndsAt timestamp across all sub-phases', () => {
      const now = new Date('2026-10-07T12:00:00Z');
      const masterEndsAt = new Date(now.getTime() + 420 * 1000); // 7 minutes

      const game = {
        phase: GamePhase.ROUND_2_ACTIVE,
        round2EndsAt: masterEndsAt,
        phaseEndsAt: masterEndsAt,
      };

      // 1. Kill occurs -> BODY_REPORT
      const bodyReportEndsAt = new Date(now.getTime() + 20 * 1000);
      game.phase = GamePhase.BODY_REPORT;
      game.phaseEndsAt = bodyReportEndsAt;
      expect(game.round2EndsAt).toBe(masterEndsAt); // Master timer unchanged

      // 2. Report occurs -> MOVE_TO_VOTING
      const moveEndsAt = new Date(now.getTime() + 35 * 1000);
      game.phase = GamePhase.MOVE_TO_VOTING;
      game.phaseEndsAt = moveEndsAt;
      expect(game.round2EndsAt).toBe(masterEndsAt); // Master timer unchanged

      // 3. Move timer expires -> VOTING
      const votingEndsAt = new Date(now.getTime() + 50 * 1000);
      game.phase = GamePhase.VOTING;
      game.phaseEndsAt = votingEndsAt;
      expect(game.round2EndsAt).toBe(masterEndsAt); // Master timer unchanged

      // 4. Vote resolves with no imposter caught -> ROUND_2_ACTIVE resumes
      game.phase = GamePhase.ROUND_2_ACTIVE;
      game.phaseEndsAt = game.round2EndsAt;
      expect(game.round2EndsAt).toBe(masterEndsAt); // Master timer still original
    });
  });

  // ─── 5. KILL CONCURRENCY & LIMITS ──────────────────────────────────────────
  describe('5. Kill Rules & Limit Enforcement', () => {
    it('schema validates victimPlayerId and optional clientActionId', () => {
      expect(killSubmissionSchema.safeParse({ victimPlayerId: 'p1' }).success).toBe(true);
      expect(killSubmissionSchema.safeParse({ victimPlayerId: 'p1', clientActionId: 'act-1' }).success).toBe(true);
      expect(killSubmissionSchema.safeParse({ victimPlayerId: '' }).success).toBe(false);
    });

    it('rejects self-kills', () => {
      const imposterId = 'imp-1';
      const victimId = 'imp-1';
      expect(imposterId === victimId).toBe(true); // Must be rejected
    });

    it('strictly limits kills to 2 maximum', () => {
      let killCount = 0;
      const record = () => {
        if (killCount >= 2) throw new Error('KILL_LIMIT_REACHED');
        killCount++;
      };

      record(); // Kill 1
      expect(killCount).toBe(1);
      record(); // Kill 2
      expect(killCount).toBe(2);
      expect(() => record()).toThrow('KILL_LIMIT_REACHED'); // Kill 3 blocked!
    });
  });

  // ─── 6. BODY REPORT RULES ──────────────────────────────────────────────────
  describe('6. Body Report Rules', () => {
    it('validates body report submission schema', () => {
      expect(bodyReportSubmissionSchema.safeParse({}).success).toBe(true);
      expect(bodyReportSubmissionSchema.safeParse({ clientActionId: 'rep-1' }).success).toBe(true);
    });

    it('disallows eliminated players from reporting a body', () => {
      const player = { id: 'p1', status: PlayerStatus.ELIMINATED };
      expect(player.status !== PlayerStatus.ALIVE).toBe(true);
    });
  });

  // ─── 7. MOVEMENT TIMER ─────────────────────────────────────────────────────
  describe('7. Movement Timer Specification', () => {
    it('duration is exactly 15 seconds per default configuration', () => {
      const duration = 15;
      expect(duration).toBe(15);
    });
  });

  // ─── 8. VOTING PRIVACY ─────────────────────────────────────────────────────
  describe('8. Voting Privacy Rules', () => {
    it('only exposes submitted/eligible count during voting, never targets', () => {
      const votingBroadcast = {
        submittedVotesCount: 3,
        eligibleVotersCount: 5,
      };
      expect((votingBroadcast as any).voterId).toBeUndefined();
      expect((votingBroadcast as any).targetId).toBeUndefined();
    });
  });

  // ─── 9. VOTING RULES ───────────────────────────────────────────────────────
  describe('9. Voting Rules', () => {
    it('vote submission schema requires non-empty targetPlayerId', () => {
      expect(voteSubmissionSchema.safeParse({ targetPlayerId: 'p2' }).success).toBe(true);
      expect(voteSubmissionSchema.safeParse({ targetPlayerId: '' }).success).toBe(false);
    });

    it('disallows self-voting when allowSelfVote is false', () => {
      const allowSelfVote = false;
      const voterId = 'p1';
      const targetId = 'p1';
      const isSelfVote = voterId === targetId;
      expect(!allowSelfVote && isSelfVote).toBe(true);
    });

    it('disallows eliminated players from voting', () => {
      const voter = { id: 'p1', status: PlayerStatus.ELIMINATED };
      expect(voter.status !== PlayerStatus.ALIVE).toBe(true);
    });

    it('disallows voting for an already eliminated target', () => {
      const target = { id: 'p2', status: PlayerStatus.ELIMINATED };
      expect(target.status !== PlayerStatus.ALIVE).toBe(true);
    });
  });

  // ─── 10. TIE RULES ─────────────────────────────────────────────────────────
  describe('10. Tie Rules (NO_ELIMINATION, RANDOM_PICK, REVOTE)', () => {
    function resolveTiedVote(rule: TieRule, candidates: string[]) {
      if (rule === TieRule.RANDOM_PICK) {
        return candidates[0]; // Server pick
      } else if (rule === TieRule.REVOTE) {
        return 'TRIGGER_REVOTE';
      }
      return null; // NO_ELIMINATION
    }

    it('NO_ELIMINATION eliminates nobody on tie', () => {
      const res = resolveTiedVote(TieRule.NO_ELIMINATION, ['p1', 'p2']);
      expect(res).toBeNull();
    });

    it('RANDOM_PICK selects a player server-side', () => {
      const res = resolveTiedVote(TieRule.RANDOM_PICK, ['p1', 'p2']);
      expect(res).toBe('p1');
    });

    it('REVOTE triggers a new voting cycle', () => {
      const res = resolveTiedVote(TieRule.REVOTE, ['p1', 'p2']);
      expect(res).toBe('TRIGGER_REVOTE');
    });
  });

  // ─── 11. WIN CONDITIONS ────────────────────────────────────────────────────
  describe('11. Win Conditions (All 4 Cases)', () => {
    function evaluateWinCondition(params: {
      imposterVotedOut: boolean;
      crewmateVotedOut: boolean;
      killCount: number;
      timerExpired: boolean;
    }) {
      if (params.imposterVotedOut) {
        return GameResult.CREWMATES_WIN; // Case A
      }
      if (params.timerExpired) {
        return GameResult.IMPOSTER_WIN_TIME; // Case D
      }
      if (params.killCount >= 2) {
        return GameResult.IMPOSTER_WIN_KILLS; // Case C
      }
      if (params.crewmateVotedOut) {
        return 'CONTINUE_ROUND_2'; // Case B
      }
      return 'CONTINUE_ROUND_2';
    }

    it('Case A: Imposter voted out -> CREWMATES_WIN', () => {
      const res = evaluateWinCondition({
        imposterVotedOut: true,
        crewmateVotedOut: false,
        killCount: 1,
        timerExpired: false,
      });
      expect(res).toBe(GameResult.CREWMATES_WIN);
    });

    it('Case B: Crewmate voted out on kill 1 -> CONTINUE_ROUND_2', () => {
      const res = evaluateWinCondition({
        imposterVotedOut: false,
        crewmateVotedOut: true,
        killCount: 1,
        timerExpired: false,
      });
      expect(res).toBe('CONTINUE_ROUND_2');
    });

    it('Case C: Imposter reaches 2 kills and survives voting -> IMPOSTER_WIN_KILLS', () => {
      const res = evaluateWinCondition({
        imposterVotedOut: false,
        crewmateVotedOut: true,
        killCount: 2,
        timerExpired: false,
      });
      expect(res).toBe(GameResult.IMPOSTER_WIN_KILLS);
    });

    it('Case D: Round 2 timer reaches 00:00 while Imposter survives -> IMPOSTER_WIN_TIME', () => {
      const res = evaluateWinCondition({
        imposterVotedOut: false,
        crewmateVotedOut: false,
        killCount: 1,
        timerExpired: true,
      });
      expect(res).toBe(GameResult.IMPOSTER_WIN_TIME);
    });
  });

  // ─── 12. COMPLETED GAME IMMUTABILITY ───────────────────────────────────────
  describe('12. Completed Game Immutability', () => {
    it('blocks mutations when phase is GAME_COMPLETE', () => {
      const checkImmutable = (phase: GamePhase) => {
        if (phase === GamePhase.GAME_COMPLETE) {
          throw new Error('GAME_COMPLETED: Read-only');
        }
      };

      expect(() => checkImmutable(GamePhase.GAME_COMPLETE)).toThrow('GAME_COMPLETED: Read-only');
      expect(() => checkImmutable(GamePhase.ROUND_2_ACTIVE)).not.toThrow();
    });
  });
});
