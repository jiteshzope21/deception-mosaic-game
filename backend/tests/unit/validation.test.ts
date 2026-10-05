/**
 * MOSAIC — Backend Tests: Validation Schemas
 */

import { describe, it, expect } from 'vitest';
import {
  gmLoginSchema,
  joinGameSchema,
  createLobbySchema,
  decoyMessageSchema,
  questionSchema,
} from '../../src/validators/schemas';
import { GAME_CONSTANTS } from '../../src/config/constants';
import { AnswerOption } from '../../src/types/game.types';

describe('Validation Schemas', () => {

  // ─── GM Login ──────────────────────────────────────────────────────────────

  describe('gmLoginSchema', () => {
    it('accepts valid email and password', () => {
      const result = gmLoginSchema.safeParse({
        email: 'gm@event.com',
        password: 'securepass123',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid email', () => {
      const result = gmLoginSchema.safeParse({ email: 'notanemail', password: 'pass1234' });
      expect(result.success).toBe(false);
    });

    it('rejects password shorter than 8 chars', () => {
      const result = gmLoginSchema.safeParse({ email: 'gm@test.com', password: 'short' });
      expect(result.success).toBe(false);
    });

    it('normalizes email to lowercase', () => {
      const result = gmLoginSchema.safeParse({ email: 'GM@EVENT.COM', password: 'securepass' });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.email).toBe('gm@event.com');
    });
  });

  // ─── Player Join ───────────────────────────────────────────────────────────

  describe('joinGameSchema', () => {
    it('accepts valid game code MOSAIC-AB12', () => {
      const result = joinGameSchema.safeParse({ gameCode: 'MOSAIC-AB12', playerName: 'Alice' });
      expect(result.success).toBe(true);
    });

    it('normalizes game code to uppercase', () => {
      const result = joinGameSchema.safeParse({ gameCode: 'mosaic-ab12', playerName: 'Alice' });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.gameCode).toBe('MOSAIC-AB12');
    });

    it('rejects malformed game code', () => {
      const result = joinGameSchema.safeParse({ gameCode: 'WRONG-FORMAT', playerName: 'Alice' });
      expect(result.success).toBe(false);
    });

    it('rejects empty player name', () => {
      const result = joinGameSchema.safeParse({ gameCode: 'MOSAIC-AB12', playerName: '' });
      expect(result.success).toBe(false);
    });
  });

  // ─── Lobby Creation ────────────────────────────────────────────────────────

  describe('createLobbySchema', () => {
    it('accepts valid 5-player team', () => {
      const result = createLobbySchema.safeParse({
        teamName: 'Alpha Squad',
        teamSize: 5,
        playerNames: ['Alice', 'Bob', 'Carol', 'Dave', 'Eve'],
      });
      expect(result.success).toBe(true);
    });

    it('accepts valid 6-player team', () => {
      const result = createLobbySchema.safeParse({
        teamName: 'Beta Team',
        teamSize: 6,
        playerNames: ['Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank'],
      });
      expect(result.success).toBe(true);
    });

    it('rejects team size of 4', () => {
      const result = createLobbySchema.safeParse({
        teamName: 'Small Team',
        teamSize: 4,
        playerNames: ['Alice', 'Bob', 'Carol', 'Dave'],
      });
      expect(result.success).toBe(false);
    });

    it('rejects team size of 7', () => {
      const result = createLobbySchema.safeParse({
        teamName: 'Big Team',
        teamSize: 7,
        playerNames: ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
      });
      expect(result.success).toBe(false);
    });

    it('rejects duplicate player names', () => {
      const result = createLobbySchema.safeParse({
        teamName: 'Dupe Team',
        teamSize: 5,
        playerNames: ['Alice', 'Alice', 'Bob', 'Carol', 'Dave'],
      });
      expect(result.success).toBe(false);
    });

    it('rejects when player count does not match teamSize', () => {
      const result = createLobbySchema.safeParse({
        teamName: 'Mismatch',
        teamSize: 6,
        playerNames: ['Alice', 'Bob', 'Carol', 'Dave', 'Eve'], // 5 instead of 6
      });
      expect(result.success).toBe(false);
    });
  });

  // ─── Decoy Message ─────────────────────────────────────────────────────────

  describe('decoyMessageSchema', () => {
    it('accepts valid decoy message with required phrase', () => {
      const msg = `Nothing here! ${GAME_CONSTANTS.REQUIRED_DECOY_PHRASE}`;
      const result = decoyMessageSchema.safeParse({ message: msg });
      expect(result.success).toBe(true);
    });

    it('rejects message missing required phrase', () => {
      const result = decoyMessageSchema.safeParse({ message: 'Wrong message without the phrase' });
      expect(result.success).toBe(false);
    });

    it('rejects empty message', () => {
      const result = decoyMessageSchema.safeParse({ message: '' });
      expect(result.success).toBe(false);
    });
  });

  // ─── Question ──────────────────────────────────────────────────────────────

  describe('questionSchema', () => {
    const validQ = {
      questionId: 'Q-042',
      category: 'Programming',
      questionText: 'What is the time complexity of quicksort on average?',
      optionA: 'O(n)',
      optionB: 'O(n log n)',
      optionC: 'O(n²)',
      optionD: 'O(log n)',
      correctAnswer: AnswerOption.B,
      technicalExplanation: 'Quicksort has O(n log n) average case due to its divide-and-conquer approach.',
    };

    it('accepts a valid question', () => {
      const result = questionSchema.safeParse(validQ);
      expect(result.success).toBe(true);
    });

    it('rejects invalid question ID format', () => {
      const result = questionSchema.safeParse({ ...validQ, questionId: 'QUEST-042' });
      expect(result.success).toBe(false);
    });

    it('rejects invalid correct answer option', () => {
      const result = questionSchema.safeParse({ ...validQ, correctAnswer: 'E' });
      expect(result.success).toBe(false);
    });
  });
});
