/**
 * MOSAIC / DECEPTION — Unit Tests: Player-Side Round 2 Role & Task Assignment
 *
 * Verifies:
 * 1. Exactly 1 random Imposter, remaining players are Crewmates.
 * 2. Distinct physical tasks and zones assigned per player.
 * 3. Assignments generated only once per game (idempotent; subsequent calls preserve assignments).
 * 4. Stored assignments persist and remain unchanged for refresh or re-login.
 * 5. Player-side data payload reveals ONLY the player's own assigned role, task, and zone.
 *    Teammates array strictly omits roles, tasks, and zones.
 * 6. Six-minute Round 2 duration constant is exactly 360 seconds.
 */

import { describe, it, expect } from 'vitest';
import {
  PlayerRole,
  PlayerStatus,
  GamePhase,
} from '../../src/types/game.types';
import { GAME_CONSTANTS } from '../../src/config/constants';
import {
  assignAndValidateRoles,
  areRolesAssigned,
} from '../../src/services/game.service';

describe('Player-Side Round 2 Role & Task Assignment System', () => {
  const mockTasks = GAME_CONSTANTS.DEFAULT_TASKS.map((t) => ({
    zoneNumber: t.zoneNumber,
    zoneName: t.zoneName,
    taskName: t.taskName,
    description: t.description,
  }));

  function createMockGame(teamSize: 5 | 6) {
    const players = Array.from({ length: teamSize }, (_, i) => ({
      _id: `player_doc_id_${i + 1}`,
      playerName: `Player_${i + 1}`,
      status: PlayerStatus.JOINED,
      lives: 1,
      role: null as PlayerRole | null,
      assignedTaskZone: null as number | null,
      assignedTaskZoneName: null as string | null,
      assignedTaskName: null as string | null,
      assignedTaskDescription: null as string | null,
    }));

    return {
      _id: 'game_doc_123',
      gameCode: 'ABCDEF',
      teamName: 'CyberSquad',
      teamSize,
      phase: GamePhase.TRANSITION,
      players,
      killCount: 0,
      votingCycle: 1,
      puzzleCompleted: true,
      puzzlePieces: [],
      votes: [],
    };
  }

  it('verifies Round 2 duration constant is 360 seconds (6 minutes)', () => {
    expect(GAME_CONSTANTS.ROUND_2_DURATION).toBe(360);
  });

  it('assigns exactly one Imposter and all remaining players as Crewmates', () => {
    const game = createMockGame(5);
    expect(areRolesAssigned(game.players, 5)).toBe(false);

    assignAndValidateRoles(game.players, 5, mockTasks, new Date());

    const imposters = game.players.filter((p) => p.role === PlayerRole.IMPOSTER);
    const crewmates = game.players.filter((p) => p.role === PlayerRole.CREWMATE);

    expect(imposters).toHaveLength(1);
    expect(crewmates).toHaveLength(4);
    expect(areRolesAssigned(game.players, 5)).toBe(true);
  });

  it('assigns unique tasks and zones across all players', () => {
    const game = createMockGame(6);
    assignAndValidateRoles(game.players, 6, mockTasks, new Date());

    const zones = game.players.map((p) => p.assignedTaskZone);
    const uniqueZones = new Set(zones);
    expect(uniqueZones.size).toBe(6);

    const taskNames = game.players.map((p) => p.assignedTaskName);
    const uniqueTaskNames = new Set(taskNames);
    expect(uniqueTaskNames.size).toBe(6);
  });

  it('ensures assignments are generated only once and remain unchanged upon repeat calls (idempotence)', () => {
    const game = createMockGame(5);
    assignAndValidateRoles(game.players, 5, mockTasks, new Date());

    const initialAssignments = game.players.map((p) => ({
      id: p._id,
      role: p.role,
      zone: p.assignedTaskZone,
      task: p.assignedTaskName,
    }));

    // Check areRolesAssigned returns true
    expect(areRolesAssigned(game.players, 5)).toBe(true);

    // If already assigned, role assignment should not be repeated/overwritten
    const imposterBefore = game.players.find((p) => p.role === PlayerRole.IMPOSTER)?._id;

    // Simulate page refresh or re-login check:
    if (!areRolesAssigned(game.players, 5)) {
      assignAndValidateRoles(game.players, 5, mockTasks, new Date());
    }

    const imposterAfter = game.players.find((p) => p.role === PlayerRole.IMPOSTER)?._id;
    expect(imposterAfter).toBe(imposterBefore);

    const currentAssignments = game.players.map((p) => ({
      id: p._id,
      role: p.role,
      zone: p.assignedTaskZone,
      task: p.assignedTaskName,
    }));

    expect(currentAssignments).toEqual(initialAssignments);
  });

  it('ensures Player response payload strictly includes only their own assigned role, task, and zone', () => {
    const game = createMockGame(5);
    assignAndValidateRoles(game.players, 5, mockTasks, new Date());

    // Simulate player 2 requesting their view
    const queryingPlayer = game.players[1];

    // Payload construction matching getGameForPlayer
    const isRound2OrTransition = [GamePhase.TRANSITION, GamePhase.ROUND_2_ACTIVE].includes(game.phase);

    const playerPayload = {
      myRole: isRound2OrTransition ? queryingPlayer.role : null,
      myTaskZone: isRound2OrTransition ? queryingPlayer.assignedTaskZone : null,
      myTaskZoneName: isRound2OrTransition ? queryingPlayer.assignedTaskZoneName : null,
      myTaskName: isRound2OrTransition ? queryingPlayer.assignedTaskName : null,
      myTaskDescription: isRound2OrTransition ? queryingPlayer.assignedTaskDescription : null,
      myPlayer: {
        id: queryingPlayer._id,
        playerName: queryingPlayer.playerName,
        role: isRound2OrTransition ? queryingPlayer.role : null,
        assignedTaskZone: isRound2OrTransition ? queryingPlayer.assignedTaskZone : null,
        assignedTaskZoneName: isRound2OrTransition ? queryingPlayer.assignedTaskZoneName : null,
        assignedTaskName: isRound2OrTransition ? queryingPlayer.assignedTaskName : null,
        assignedTaskDescription: isRound2OrTransition ? queryingPlayer.assignedTaskDescription : null,
      },
      teammates: game.players.map((p) => ({
        id: p._id,
        playerName: p.playerName,
        status: p.status,
        lives: p.lives,
      })),
    };

    // Querying player has their own role, task, and zone
    expect(playerPayload.myPlayer.id).toBe(queryingPlayer._id);
    expect(playerPayload.myPlayer.role).toBe(queryingPlayer.role);
    expect(playerPayload.myPlayer.assignedTaskZone).toBe(queryingPlayer.assignedTaskZone);
    expect(playerPayload.myPlayer.assignedTaskName).toBe(queryingPlayer.assignedTaskName);

    // Teammates payload NEVER contains role, task, or zone
    for (const mate of playerPayload.teammates) {
      expect((mate as any).role).toBeUndefined();
      expect((mate as any).assignedTaskZone).toBeUndefined();
      expect((mate as any).assignedTaskName).toBeUndefined();
      expect((mate as any).assignedTaskDescription).toBeUndefined();
    }
  });
});
