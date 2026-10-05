/**
 * MOSAIC — Backend Tests: Game State Machine
 */

import { describe, it, expect } from 'vitest';
import {
  GamePhase,
  isValidTransition,
  VALID_PHASE_TRANSITIONS,
} from '../../src/types/game.types';

describe('Game State Machine', () => {
  describe('VALID_PHASE_TRANSITIONS', () => {
    it('covers all GamePhase values', () => {
      const allPhases = Object.values(GamePhase);
      for (const phase of allPhases) {
        expect(VALID_PHASE_TRANSITIONS[phase]).toBeDefined();
      }
    });

    it('LOBBY can only transition to ROUND_1_ACTIVE', () => {
      const transitions = VALID_PHASE_TRANSITIONS[GamePhase.LOBBY];
      expect(transitions).toEqual([GamePhase.ROUND_1_ACTIVE]);
    });

    it('GAME_COMPLETE has no further transitions', () => {
      const transitions = VALID_PHASE_TRANSITIONS[GamePhase.GAME_COMPLETE];
      expect(transitions).toEqual([]);
    });

    it('ROUND_2_ACTIVE can go to BODY_REPORT or GAME_COMPLETE', () => {
      const transitions = VALID_PHASE_TRANSITIONS[GamePhase.ROUND_2_ACTIVE];
      expect(transitions).toContain(GamePhase.BODY_REPORT);
      expect(transitions).toContain(GamePhase.GAME_COMPLETE);
    });

    it('VOTING can return to ROUND_2_ACTIVE (cycle) or GAME_COMPLETE', () => {
      const transitions = VALID_PHASE_TRANSITIONS[GamePhase.VOTING];
      expect(transitions).toContain(GamePhase.ROUND_2_ACTIVE);
      expect(transitions).toContain(GamePhase.GAME_COMPLETE);
    });
  });

  describe('isValidTransition()', () => {
    it('returns true for valid LOBBY → ROUND_1_ACTIVE', () => {
      expect(isValidTransition(GamePhase.LOBBY, GamePhase.ROUND_1_ACTIVE)).toBe(true);
    });

    it('returns false for invalid LOBBY → GAME_COMPLETE', () => {
      expect(isValidTransition(GamePhase.LOBBY, GamePhase.GAME_COMPLETE)).toBe(false);
    });

    it('returns false for invalid VOTING → LOBBY', () => {
      expect(isValidTransition(GamePhase.VOTING, GamePhase.LOBBY)).toBe(false);
    });

    it('returns false for any transition FROM GAME_COMPLETE', () => {
      for (const phase of Object.values(GamePhase)) {
        expect(isValidTransition(GamePhase.GAME_COMPLETE, phase)).toBe(false);
      }
    });

    it('enforces sequential Round 1 flow', () => {
      expect(isValidTransition(GamePhase.ROUND_1_ACTIVE, GamePhase.ROUND_1_COMPLETE)).toBe(true);
      expect(isValidTransition(GamePhase.ROUND_1_COMPLETE, GamePhase.TRANSITION)).toBe(true);
      expect(isValidTransition(GamePhase.TRANSITION, GamePhase.ROUND_2_ACTIVE)).toBe(true);
    });
  });
});
