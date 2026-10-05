/**
 * MOSAIC — Zod Validation Schemas
 *
 * All input validation happens here.
 * Never trust raw client input — validate at the boundary.
 */

import { z } from 'zod';
import { ANSWER_OPTION, TIE_RULE } from '@/types/enums';

// ─── Constants ────────────────────────────────────────────────────────────────

export const GAME_CODE_REGEX = /^MOSAIC-[A-Z0-9]{4}$/;
export const QUESTION_ID_REGEX = /^Q-\d{3}$/;
export const QR_ID_REGEX = /^QR-\d{2}$/;

// Team sizes allowed
export const ALLOWED_TEAM_SIZES = [5, 6] as const;

// Game defaults — single source of truth for the frontend
export const GAME_DEFAULTS = {
  round_1_duration_seconds: 240,
  transition_duration_seconds: 60,
  round_2_duration_seconds: 420,
  body_report_duration_seconds: 20,
  move_to_voting_duration_seconds: 15,
  voting_duration_seconds: 15,
  starting_lives: 2,
  max_kills: 2,
  allow_self_vote: false,
  tie_rule: TIE_RULE.NO_ELIMINATION,
  min_questions_per_qr: 1,
  max_questions_per_qr: 2,
  imposter_count: 1,
} as const;

// ─── Game Configuration Schema ────────────────────────────────────────────────

export const gameConfigSchema = z.object({
  round_1_duration_seconds: z
    .number()
    .int()
    .min(60, 'Round 1 must be at least 60 seconds')
    .max(600, 'Round 1 must be at most 600 seconds')
    .default(GAME_DEFAULTS.round_1_duration_seconds),

  transition_duration_seconds: z
    .number()
    .int()
    .min(10, 'Transition must be at least 10 seconds')
    .max(300, 'Transition must be at most 300 seconds')
    .default(GAME_DEFAULTS.transition_duration_seconds),

  round_2_duration_seconds: z
    .number()
    .int()
    .min(120, 'Round 2 must be at least 120 seconds')
    .max(1200, 'Round 2 must be at most 1200 seconds')
    .default(GAME_DEFAULTS.round_2_duration_seconds),

  body_report_duration_seconds: z
    .number()
    .int()
    .min(10, 'Body report window must be at least 10 seconds')
    .max(60, 'Body report window must be at most 60 seconds')
    .default(GAME_DEFAULTS.body_report_duration_seconds),

  move_to_voting_duration_seconds: z
    .number()
    .int()
    .min(5, 'Move to voting must be at least 5 seconds')
    .max(60, 'Move to voting must be at most 60 seconds')
    .default(GAME_DEFAULTS.move_to_voting_duration_seconds),

  voting_duration_seconds: z
    .number()
    .int()
    .min(10, 'Voting must be at least 10 seconds')
    .max(120, 'Voting must be at most 120 seconds')
    .default(GAME_DEFAULTS.voting_duration_seconds),

  starting_lives: z
    .number()
    .int()
    .min(1, 'Starting lives must be at least 1')
    .max(5, 'Starting lives must be at most 5')
    .default(GAME_DEFAULTS.starting_lives),

  // max_kills is fixed at 2 and must not be configurable beyond that
  max_kills: z
    .literal(2)
    .default(2),

  allow_self_vote: z
    .boolean()
    .default(GAME_DEFAULTS.allow_self_vote),

  tie_rule: z
    .enum([TIE_RULE.NO_ELIMINATION, TIE_RULE.REVOTE, TIE_RULE.RANDOM_PICK])
    .default(GAME_DEFAULTS.tie_rule),

  min_questions_per_qr: z
    .number()
    .int()
    .min(1)
    .max(2)
    .default(GAME_DEFAULTS.min_questions_per_qr),

  max_questions_per_qr: z
    .number()
    .int()
    .min(1)
    .max(2)
    .default(GAME_DEFAULTS.max_questions_per_qr),

  // imposter_count is fixed at 1 — not configurable
  imposter_count: z
    .literal(1)
    .default(1),
}).refine(
  (cfg) => cfg.min_questions_per_qr <= cfg.max_questions_per_qr,
  { message: 'min_questions_per_qr must be ≤ max_questions_per_qr' }
);

export type GameConfigInput = z.input<typeof gameConfigSchema>;
export type GameConfigOutput = z.output<typeof gameConfigSchema>;

// ─── Lobby / Game Creation Schema ─────────────────────────────────────────────

export const createLobbySchema = z.object({
  team_name: z
    .string()
    .min(1, 'Team name is required')
    .max(50, 'Team name must be at most 50 characters')
    .trim(),

  team_size: z
    .number()
    .int()
    .refine((n) => ALLOWED_TEAM_SIZES.includes(n as 5 | 6), {
      message: 'Team size must be 5 or 6',
    }),

  player_names: z
    .array(z.string().min(1, 'Player name cannot be empty').max(30, 'Player name too long').trim())
    .min(5, 'Minimum 5 players required')
    .max(6, 'Maximum 6 players allowed')
    .refine(
      (names) => new Set(names.map((n) => n.toLowerCase())).size === names.length,
      { message: 'Player names must be unique' }
    ),
}).refine(
  (data) => data.player_names.length === data.team_size,
  { message: 'Number of player names must match team size' }
);

export type CreateLobbyInput = z.infer<typeof createLobbySchema>;

// ─── Player Join Schema ───────────────────────────────────────────────────────

export const joinGameSchema = z.object({
  game_code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(GAME_CODE_REGEX, 'Invalid game code format. Expected: MOSAIC-XXXX'),

  player_name: z
    .string()
    .trim()
    .min(1, 'Player name is required')
    .max(30, 'Player name too long'),
});

export type JoinGameInput = z.infer<typeof joinGameSchema>;

// ─── GM Login Schema ──────────────────────────────────────────────────────────

export const gmLoginSchema = z.object({
  email: z
    .string()
    .email('Invalid email address')
    .toLowerCase()
    .trim(),

  password: z
    .string()
    .min(8, 'Password must be at least 8 characters'),
});

export type GmLoginInput = z.infer<typeof gmLoginSchema>;

// ─── Question Schema ──────────────────────────────────────────────────────────

export const questionSchema = z.object({
  id: z
    .string()
    .regex(QUESTION_ID_REGEX, 'Question ID must be in format Q-001 to Q-050'),

  category: z
    .string()
    .min(1, 'Category is required')
    .max(50, 'Category too long')
    .trim(),

  question_text: z
    .string()
    .min(5, 'Question text too short')
    .max(1000, 'Question text too long')
    .trim(),

  option_a: z.string().min(1, 'Option A is required').max(300).trim(),
  option_b: z.string().min(1, 'Option B is required').max(300).trim(),
  option_c: z.string().min(1, 'Option C is required').max(300).trim(),
  option_d: z.string().min(1, 'Option D is required').max(300).trim(),

  correct_answer: z.enum([
    ANSWER_OPTION.A,
    ANSWER_OPTION.B,
    ANSWER_OPTION.C,
    ANSWER_OPTION.D,
  ]),

  technical_explanation: z
    .string()
    .min(5, 'Explanation too short')
    .max(2000, 'Explanation too long')
    .trim(),

  is_active: z.boolean().default(true),
});

export type QuestionInput = z.infer<typeof questionSchema>;

// ─── Decoy Message Schema ─────────────────────────────────────────────────────

const REQUIRED_DECOY_PHRASE = 'Try another QR Buddy!';

export const decoyMessageSchema = z.object({
  message: z
    .string()
    .min(1, 'Decoy message cannot be empty')
    .max(500, 'Decoy message too long')
    .trim()
    .refine(
      (msg) => msg.includes(REQUIRED_DECOY_PHRASE),
      {
        message: `Decoy message MUST contain the phrase: "${REQUIRED_DECOY_PHRASE}"`,
      }
    ),

  image_path: z
    .string()
    .nullable()
    .optional()
    .default(null),

  is_active: z.boolean().default(true),
});

export type DecoyMessageInput = z.infer<typeof decoyMessageSchema>;

// ─── Task Schema ──────────────────────────────────────────────────────────────

export const physicalTaskSchema = z.object({
  zone_number: z
    .number()
    .int()
    .min(1, 'Zone number must be at least 1')
    .max(6, 'Zone number must be at most 6'),

  task_name: z
    .string()
    .min(1, 'Task name is required')
    .max(100, 'Task name too long')
    .trim(),

  description: z
    .string()
    .max(500, 'Description too long')
    .trim()
    .nullable()
    .optional()
    .default(null),

  instructions: z
    .string()
    .max(1000, 'Instructions too long')
    .trim()
    .nullable()
    .optional()
    .default(null),

  is_active: z.boolean().default(true),
});

export type PhysicalTaskInput = z.infer<typeof physicalTaskSchema>;

// ─── Answer Submission Schema ─────────────────────────────────────────────────

export const answerSubmissionSchema = z.object({
  game_id: z.string().uuid('Invalid game ID'),
  qr_code_id: z
    .string()
    .regex(QR_ID_REGEX, 'Invalid QR code ID format'),
  question_id: z
    .string()
    .regex(QUESTION_ID_REGEX, 'Invalid question ID format'),
  answer: z.enum([
    ANSWER_OPTION.A,
    ANSWER_OPTION.B,
    ANSWER_OPTION.C,
    ANSWER_OPTION.D,
  ]),
});

export type AnswerSubmissionInput = z.infer<typeof answerSubmissionSchema>;

// ─── Game Code Validation ─────────────────────────────────────────────────────

export function validateGameCode(code: string): boolean {
  return GAME_CODE_REGEX.test(code.trim().toUpperCase());
}

// ─── Team Size Validation ─────────────────────────────────────────────────────

export function validateTeamSize(size: number): size is 5 | 6 {
  return size === 5 || size === 6;
}

// ─── Decoy Phrase Validation ──────────────────────────────────────────────────

export function validateDecoyMessage(message: string): boolean {
  return message.includes(REQUIRED_DECOY_PHRASE);
}

export { REQUIRED_DECOY_PHRASE };
