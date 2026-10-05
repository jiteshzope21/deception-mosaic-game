import { describe, it, expect } from 'vitest';
import {
  gmLoginSchema,
  joinGameSchema,
  createLobbySchema,
  questionSchema,
  gameConfigSchema,
  decoyMessageSchema,
} from '../../src/lib/validation/schemas';

describe('Frontend Validation Schemas', () => {
  describe('gmLoginSchema', () => {
    it('accepts valid credentials', () => {
      const res = gmLoginSchema.safeParse({
        email: 'organizer@adg.org',
        password: 'SecurePassword123!',
      });
      expect(res.success).toBe(true);
    });

    it('rejects invalid email format', () => {
      const res = gmLoginSchema.safeParse({
        email: 'not-an-email',
        password: 'ValidPassword123!',
      });
      expect(res.success).toBe(false);
    });

    it('rejects too short password', () => {
      const res = gmLoginSchema.safeParse({
        email: 'test@example.com',
        password: 'short',
      });
      expect(res.success).toBe(false);
    });
  });

  describe('joinGameSchema', () => {
    it('accepts valid code and player name', () => {
      const res = joinGameSchema.safeParse({
        game_code: 'MOSAIC-ABCD',
        player_name: 'Player One',
      });
      expect(res.success).toBe(true);
    });

    it('rejects invalid game code format', () => {
      const res = joinGameSchema.safeParse({
        game_code: 'INVALID-CODE',
        player_name: 'Player One',
      });
      expect(res.success).toBe(false);
    });

    it('rejects empty or whitespace player name', () => {
      const res = joinGameSchema.safeParse({
        game_code: 'MOSAIC-ABCD',
        player_name: '   ',
      });
      expect(res.success).toBe(false);
    });
  });

  describe('createLobbySchema', () => {
    it('accepts valid 5-player team', () => {
      const res = createLobbySchema.safeParse({
        team_name: 'Team Alpha',
        team_size: 5,
        player_names: ['Alice', 'Bob', 'Charlie', 'Diana', 'Evan'],
      });
      expect(res.success).toBe(true);
    });

    it('accepts valid 6-player team', () => {
      const res = createLobbySchema.safeParse({
        team_name: 'Team Beta',
        team_size: 6,
        player_names: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'],
      });
      expect(res.success).toBe(true);
    });

    it('rejects teams with fewer than 5 players', () => {
      const res = createLobbySchema.safeParse({
        team_name: 'Too Small',
        team_size: 4,
        player_names: ['P1', 'P2', 'P3', 'P4'],
      });
      expect(res.success).toBe(false);
    });

    it('rejects teams with more than 6 players', () => {
      const res = createLobbySchema.safeParse({
        team_name: 'Too Big',
        team_size: 7,
        player_names: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'],
      });
      expect(res.success).toBe(false);
    });

    it('rejects duplicate player names (case-insensitive)', () => {
      const res = createLobbySchema.safeParse({
        team_name: 'Team Clones',
        team_size: 5,
        player_names: ['Alice', 'alice', 'Bob', 'Charlie', 'Diana'],
      });
      expect(res.success).toBe(false);
    });
  });

  describe('questionSchema', () => {
    it('accepts valid question object', () => {
      const res = questionSchema.safeParse({
        id: 'Q-001',
        category: 'Algorithms',
        question_text: 'What is the time complexity of binary search on a sorted array?',
        option_a: 'O(1)',
        option_b: 'O(log n)',
        option_c: 'O(n)',
        option_d: 'O(n^2)',
        correct_answer: 'B',
        technical_explanation: 'Binary search halves the search space at each step, yielding logarithmic complexity.',
      });
      expect(res.success).toBe(true);
    });

    it('rejects invalid question ID format', () => {
      const res = questionSchema.safeParse({
        id: 'QUESTION-1',
        category: 'Algorithms',
        question_text: 'What is the time complexity?',
        option_a: 'A',
        option_b: 'B',
        option_c: 'C',
        option_d: 'D',
        correct_answer: 'A',
        technical_explanation: 'Valid explanation text here.',
      });
      expect(res.success).toBe(false);
    });
  });

  describe('decoyMessageSchema', () => {
    it('accepts valid decoy message containing Try another QR Buddy!', () => {
      const res = decoyMessageSchema.safeParse({
        message: 'Oops! This clue is empty. Try another QR Buddy!',
      });
      expect(res.success).toBe(true);
    });

    it('rejects decoy message missing required phrase', () => {
      const res = decoyMessageSchema.safeParse({
        message: 'Your teammate gave you false directions.',
      });
      expect(res.success).toBe(false);
    });
  });

  describe('gameConfigSchema', () => {
    it('accepts valid configuration and enforces defaults', () => {
      const res = gameConfigSchema.safeParse({});
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.starting_lives).toBe(2);
        expect(res.data.max_kills).toBe(2);
        expect(res.data.imposter_count).toBe(1);
      }
    });
  });
});
