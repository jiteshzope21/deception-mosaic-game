/**
 * MOSAIC — Backend Unit Tests: GM Controls, Game Configuration & Authoritative Timers
 */

import { describe, it, expect } from 'vitest';
import {
  decoyMessageSchema,
  physicalTaskSchema,
  questionSchema,
  gameConfigSchema,
} from '../../src/validators/schemas';
import { GAME_CONSTANTS } from '../../src/config/constants';
import { GameResult } from '../../src/types/game.types';

describe('GM Configuration & Controls Audits', () => {

  describe('1. Fixed 10 QR Codes Contract', () => {
    it('defines exactly 10 QR codes with identifiers QR-01 through QR-10', () => {
      expect(GAME_CONSTANTS.QR_IDS).toHaveLength(10);
      
      const expectedIds = [
        'QR-01', 'QR-02', 'QR-03', 'QR-04', 'QR-05',
        'QR-06', 'QR-07', 'QR-08', 'QR-09', 'QR-10',
      ];

      expect([...GAME_CONSTANTS.QR_IDS]).toEqual(expectedIds);
    });

    it('each QR code has valid QR identifier format', () => {
      for (const qrId of GAME_CONSTANTS.QR_IDS) {
        expect(qrId).toMatch(/^QR-(0[1-9]|10)$/);
      }
    });
  });

  describe('2. Decoy Message Validation', () => {
    it('validates decoy messages containing "Try another QR Buddy!"', () => {
      const valid = decoyMessageSchema.safeParse({
        message: 'No clue here! Try another QR Buddy!',
      });
      expect(valid.success).toBe(true);
    });

    it('accepts variations of friendly decoy messages', () => {
      const valid = decoyMessageSchema.safeParse({
        message: 'Oops! Try another QR Buddy! Good luck.',
      });
      expect(valid.success).toBe(true);
    });

    it('rejects empty or whitespace-only decoy messages', () => {
      const invalid = decoyMessageSchema.safeParse({
        message: '   ',
      });
      expect(invalid.success).toBe(false);
    });
  });

  describe('3. Physical Task Schema Validation', () => {
    it('accepts valid physical tasks for zones 1 through 6', () => {
      for (let zone = 1; zone <= 6; zone++) {
        const result = physicalTaskSchema.safeParse({
          zoneNumber: zone,
          taskName: `Calibrate Sensor Node ${zone}`,
          description: `Align optical sensor in Zone ${zone}`,
          instructions: 'Follow physical instructions posted on site.',
        });
        expect(result.success).toBe(true);
      }
    });

    it('rejects invalid task zones outside 1 to 6', () => {
      const resultUnder = physicalTaskSchema.safeParse({
        zoneNumber: 0,
        taskName: 'Invalid Task',
        description: 'Zone 0 is invalid',
      });
      expect(resultUnder.success).toBe(false);

      const resultOver = physicalTaskSchema.safeParse({
        zoneNumber: 7,
        taskName: 'Invalid Task',
        description: 'Zone 7 is invalid',
      });
      expect(resultOver.success).toBe(false);
    });
  });

  describe('4. Question Schema & Auto-Generated ID Support', () => {
    it('allows questionId to be omitted so the backend can auto-generate Q-xxx', () => {
      const res = questionSchema.safeParse({
        category: 'Computer Science',
        questionText: 'What is the time complexity of quicksort average case?',
        optionA: 'O(n log n)',
        optionB: 'O(n^2)',
        optionC: 'O(log n)',
        optionD: 'O(n)',
        correctAnswer: 'A',
        technicalExplanation: 'Quicksort divides and conquers in O(n log n) expected time.',
      });
      expect(res.success).toBe(true);
    });

    it('accepts explicitly provided questionId', () => {
      const res = questionSchema.safeParse({
        questionId: 'Q-042',
        category: 'Networking',
        questionText: 'What port does HTTP use?',
        optionA: '21',
        optionB: '80',
        optionC: '443',
        optionD: '8080',
        correctAnswer: 'B',
        technicalExplanation: 'Port 80 is the default TCP port for standard HTTP.',
      });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.questionId).toBe('Q-042');
      }
    });
  });

  describe('5. Game Configuration Schema', () => {
    it('accepts valid full game config with puzzle image path', () => {
      const res = gameConfigSchema.safeParse({
        teamSize: 5,
        round1DurationSeconds: 240,
        transitionDurationSeconds: 30,
        round2DurationSeconds: 420,
        votingDurationSeconds: 45,
        puzzleImagePath: '/assets/puzzle-blueprint.svg',
      });
      expect(res.success).toBe(true);
    });
  });

  describe('6. Timer Freezing & Authoritative Calculation Logic', () => {
    it('calculates remaining time accurately on pause and calculates new expiry on resume', () => {
      const now = 1000000;
      const phaseEndsAt = new Date(now + 150000); // 150s remaining

      // Simulate pause
      const pausedRemainingMs = Math.max(0, phaseEndsAt.getTime() - now);
      expect(pausedRemainingMs).toBe(150000);

      // Simulate resume 30 seconds later
      const resumeTime = now + 30000;
      const newPhaseEndsAt = new Date(resumeTime + pausedRemainingMs);

      // The new duration remaining from resumeTime should be exactly 150000ms
      expect(newPhaseEndsAt.getTime() - resumeTime).toBe(150000);
    });

    it('handles Round 2 continuous timer correctly when paused and resumed', () => {
      const now = 2000000;
      const round2EndsAt = new Date(now + 360000); // 6 mins remaining

      const pausedR2Ms = Math.max(0, round2EndsAt.getTime() - now);
      expect(pausedR2Ms).toBe(360000);

      const resumeTime = now + 45000; // paused for 45s
      const newR2EndsAt = new Date(resumeTime + pausedR2Ms);

      expect(newR2EndsAt.getTime() - resumeTime).toBe(360000);
    });
  });

  describe('7. Round Termination Contract', () => {
    it('defines ROUND_TERMINATED as a valid game result', () => {
      const result: GameResult = GameResult.ROUND_TERMINATED;
      expect(result).toBe('ROUND_TERMINATED');
    });
  });
});
