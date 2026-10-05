import { describe, it, expect } from 'vitest';
import {
  generateGameCode,
  formatTimer,
  getInitials,
  getRemainingSeconds,
  isTimerExpired,
  normalizeGameCode,
  shuffleArray,
} from '../../src/lib/utils/helpers';
import { GAME_CODE_REGEX } from '../../src/lib/validation/schemas';

describe('Frontend Helpers & Utilities', () => {
  describe('generateGameCode', () => {
    it('generates a valid MOSAIC-XXXX format code', () => {
      const code = generateGameCode();
      expect(code).toMatch(GAME_CODE_REGEX);
      expect(code.startsWith('MOSAIC-')).toBe(true);
      expect(code.length).toBe(11);
    });
  });

  describe('formatTimer', () => {
    it('formats 0 seconds as 00:00', () => {
      expect(formatTimer(0)).toBe('00:00');
    });

    it('formats 65 seconds as 01:05', () => {
      expect(formatTimer(65)).toBe('01:05');
    });

    it('formats 420 seconds as 07:00', () => {
      expect(formatTimer(420)).toBe('07:00');
    });
  });

  describe('getInitials', () => {
    it('extracts two letters from first and last name', () => {
      expect(getInitials('John Doe')).toBe('JD');
    });

    it('handles single word names', () => {
      expect(getInitials('Player1')).toBe('P');
    });

    it('truncates to at most 2 characters', () => {
      expect(getInitials('Alpha Beta Gamma')).toBe('AB');
    });
  });

  describe('normalizeGameCode', () => {
    it('trims whitespace and converts to uppercase', () => {
      expect(normalizeGameCode('  mosaic-1234  ')).toBe('MOSAIC-1234');
    });
  });

  describe('timer calculations', () => {
    it('calculates remaining seconds correctly', () => {
      const future = new Date(Date.now() + 30000).toISOString();
      const remaining = getRemainingSeconds(future);
      expect(remaining).toBeGreaterThanOrEqual(28);
      expect(remaining).toBeLessThanOrEqual(31);
    });

    it('detects expired timers', () => {
      const past = new Date(Date.now() - 5000).toISOString();
      expect(isTimerExpired(past)).toBe(true);
    });

    it('returns false for null or future timer', () => {
      expect(isTimerExpired(null)).toBe(false);
      const future = new Date(Date.now() + 50000).toISOString();
      expect(isTimerExpired(future)).toBe(false);
    });
  });

  describe('shuffleArray', () => {
    it('preserves array length and elements', () => {
      const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const shuffled = shuffleArray(original);
      expect(shuffled).toHaveLength(original.length);
      expect(shuffled.slice().sort((a, b) => a - b)).toEqual(original);
      // Ensures original array was not mutated
      expect(original).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });
  });
});
