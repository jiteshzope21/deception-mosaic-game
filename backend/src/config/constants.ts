/**
 * MOSAIC — Game Constants
 *
 * Central source of truth for all game rules.
 * Do NOT duplicate these values elsewhere in the backend.
 * The frontend should receive these from the API, not hard-code them.
 */

export const GAME_CONSTANTS = {
  // Team
  ALLOWED_TEAM_SIZES: [5, 6] as const,
  MIN_TEAM_SIZE: 5,
  MAX_TEAM_SIZE: 6,

  // QR
  TOTAL_QR_CODES: 10,
  QR_IDS: ['QR-01', 'QR-02', 'QR-03', 'QR-04', 'QR-05', 'QR-06', 'QR-07', 'QR-08', 'QR-09', 'QR-10'] as const,

  // QR distribution per team size
  QR_DISTRIBUTION: {
    5: { puzzle: 5, decoy: 5 },
    6: { puzzle: 6, decoy: 4 },
  } as const,

  // Questions
  TOTAL_QUESTIONS: 50,
  MIN_QUESTIONS_PER_QR: 1,
  MAX_QUESTIONS_PER_QR: 2,

  // Timers (all in seconds)
  ROUND_1_DURATION: 240,       // 4:00
  TRANSITION_DURATION: 60,     // 1:00
  ROUND_2_DURATION: 420,       // 7:00
  BODY_REPORT_DURATION: 20,    // 0:20
  MOVE_TO_VOTING_DURATION: 15, // 0:15
  VOTING_DURATION: 15,         // 0:15

  // Lives
  STARTING_LIVES: 2,
  MIN_LIVES: 0,

  // Round 2
  IMPOSTER_COUNT: 1,  // Always exactly 1 — not configurable
  MAX_KILLS: 2,       // Never 3

  // Voting
  ALLOW_SELF_VOTE_DEFAULT: false,

  // Decoy validation
  REQUIRED_DECOY_PHRASE: 'Try another QR Buddy!',

  // Game code
  GAME_CODE_PREFIX: 'MOSAIC-',
  GAME_CODE_CHARS: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
  GAME_CODE_SUFFIX_LENGTH: 4,

  // Default physical tasks
  DEFAULT_TASKS: [
    { zoneNumber: 1, taskName: 'Hidden Keyboard Typing Test' },
    { zoneNumber: 2, taskName: 'Ring Pass Arena' },
    { zoneNumber: 3, taskName: 'Mechanical Car Assembly' },
    { zoneNumber: 4, taskName: 'Code Debugging + USB Transfer' },
    { zoneNumber: 5, taskName: 'Breadboard Circuit Assembly' },
    { zoneNumber: 6, taskName: 'Deep Learning Algorithm Builder' },
  ] as const,
} as const;

export type AllowedTeamSize = 5 | 6;

export function isAllowedTeamSize(n: number): n is AllowedTeamSize {
  return n === 5 || n === 6;
}

/**
 * Generate a random game code (server-side only).
 */
export function generateGameCode(): string {
  const chars = GAME_CONSTANTS.GAME_CODE_CHARS;
  let suffix = '';
  for (let i = 0; i < GAME_CONSTANTS.GAME_CODE_SUFFIX_LENGTH; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${GAME_CONSTANTS.GAME_CODE_PREFIX}${suffix}`;
}
