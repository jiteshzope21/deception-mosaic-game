/**
 * MOSAIC — Backend Validation Schemas (Zod)
 *
 * These validate incoming request bodies.
 * Shared game rules are imported from constants.
 */

import { z } from 'zod';
import { TieRule, AnswerOption } from '../types/game.types';
import { GAME_CONSTANTS } from '../config/constants';

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const gmLoginSchema = z.object({
  email: z.string().email('Invalid email').toLowerCase().trim(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const joinGameSchema = z.object({
  gameCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^MOSAIC-[A-Z0-9]{4}$/, 'Invalid game code format. Expected: MOSAIC-XXXX'),
  playerName: z
    .string()
    .min(1, 'Player name required')
    .max(30, 'Player name too long')
    .trim(),
});

// ─── Lobby Creation ───────────────────────────────────────────────────────────

export const createLobbySchema = z.object({
  teamName: z.string().min(1).max(50).trim(),
  teamSize: z.number().int().refine(
    (n) => GAME_CONSTANTS.ALLOWED_TEAM_SIZES.includes(n as 5 | 6),
    { message: 'Team size must be 5 or 6' }
  ),
  playerNames: z
    .array(z.string().min(1).max(30).trim())
    .min(5)
    .max(6)
    .refine(
      (names) => new Set(names.map((n) => n.toLowerCase())).size === names.length,
      { message: 'Player names must be unique' }
    ),
}).refine(
  (d) => d.playerNames.length === d.teamSize,
  { message: 'Number of player names must match team size' }
);

// ─── Game Configuration ───────────────────────────────────────────────────────

export const gameConfigSchema = z.object({
  round1DurationSeconds: z.number().int().min(60).max(600).optional(),
  transitionDurationSeconds: z.number().int().min(10).max(300).optional(),
  round2DurationSeconds: z.number().int().min(120).max(1200).optional(),
  bodyReportDurationSeconds: z.number().int().min(10).max(60).optional(),
  moveToVotingDurationSeconds: z.number().int().min(5).max(60).optional(),
  votingDurationSeconds: z.number().int().min(10).max(120).optional(),
  startingLives: z.number().int().min(1).max(5).optional(),
  allowSelfVote: z.boolean().optional(),
  tieRule: z.enum([TieRule.NO_ELIMINATION, TieRule.REVOTE, TieRule.RANDOM_PICK]).optional(),
  minQuestionsPerQr: z.number().int().min(1).max(2).optional(),
  maxQuestionsPerQr: z.number().int().min(1).max(2).optional(),
}).refine(
  (d) => {
    if (d.minQuestionsPerQr !== undefined && d.maxQuestionsPerQr !== undefined) {
      return d.minQuestionsPerQr <= d.maxQuestionsPerQr;
    }
    return true;
  },
  { message: 'minQuestionsPerQr must be ≤ maxQuestionsPerQr' }
);

// ─── Question ─────────────────────────────────────────────────────────────────

export const questionSchema = z.object({
  questionId: z.string().regex(/^Q-\d{3}$/, 'Question ID must be Q-001 to Q-050'),
  category: z.string().min(1).max(50).trim(),
  questionText: z.string().min(5).max(1000).trim(),
  optionA: z.string().min(1).max(300).trim(),
  optionB: z.string().min(1).max(300).trim(),
  optionC: z.string().min(1).max(300).trim(),
  optionD: z.string().min(1).max(300).trim(),
  correctAnswer: z.enum([AnswerOption.A, AnswerOption.B, AnswerOption.C, AnswerOption.D]),
  technicalExplanation: z.string().min(5).max(2000).trim(),
  isActive: z.boolean().optional().default(true),
});

// ─── Decoy ────────────────────────────────────────────────────────────────────

export const decoyMessageSchema = z.object({
  message: z
    .string()
    .min(1)
    .max(500)
    .trim()
    .refine(
      (msg) => msg.includes(GAME_CONSTANTS.REQUIRED_DECOY_PHRASE),
      { message: `Decoy message MUST contain: "${GAME_CONSTANTS.REQUIRED_DECOY_PHRASE}"` }
    ),
  imagePath: z.string().nullable().optional().default(null),
  isActive: z.boolean().optional().default(true),
});

// ─── QR Scan ──────────────────────────────────────────────────────────────────

export const qrScanSchema = z.object({
  qrCodeId: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^QR-(0[1-9]|10)$/, 'Invalid QR code ID format. Expected: QR-01 through QR-10'),
});

// ─── Answer Submission ────────────────────────────────────────────────────────

export const answerSubmissionSchema = z.object({
  qrCodeId: z.string().trim().toUpperCase().regex(/^QR-(0[1-9]|10)$/),
  questionId: z.string().trim().regex(/^Q-\d{3}$/),
  answer: z.enum([AnswerOption.A, AnswerOption.B, AnswerOption.C, AnswerOption.D]),
  clientActionId: z.string().optional(),
});

// ─── Phase 3 Schemas ──────────────────────────────────────────────────────────

export const killSubmissionSchema = z.object({
  victimPlayerId: z.string().trim().min(1, 'Victim player ID is required'),
  clientActionId: z.string().optional(),
});

export const bodyReportSubmissionSchema = z.object({
  clientActionId: z.string().optional(),
});

export const voteSubmissionSchema = z.object({
  targetPlayerId: z.string().trim().min(1, 'Target player ID is required'),
  clientActionId: z.string().optional(),
});

// ─── Middleware helper ────────────────────────────────────────────────────────

import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema, ZodError } from 'zod';

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const zodErr = result.error as ZodError;
      const firstMessage = zodErr.issues[0]?.message ?? 'Validation failed';
      res.status(422).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: firstMessage },
      });
      return;
    }
    req.body = result.data;
    next();
  };
}
