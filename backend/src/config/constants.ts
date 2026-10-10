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
  ROUND_2_DURATION: 360,       // 6:00
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
    {
      zoneNumber: 1,
      zoneName: 'Zone 01 — Terminal Alpha',
      taskName: 'Hidden Keyboard Typing Test',
      description: 'Locate the concealed physical keyboard in Zone 01. Transcribe the encrypted system verification passphrase on the offline terminal within 60 seconds without backspacing errors.',
    },
    {
      zoneNumber: 2,
      zoneName: 'Zone 02 — Kinetic Arena',
      taskName: 'Ring Pass Arena',
      description: 'Navigate the conductive copper wand loop through the twisting high-voltage wire maze from Start to Finish without triggering the alarm buzzer.',
    },
    {
      zoneNumber: 3,
      zoneName: 'Zone 03 — Robotics Bay',
      taskName: 'Mechanical Car Assembly',
      description: 'Assemble the 4-wheel gear transmission chassis, mount the battery pack securely, and test wheel alignment on the calibration ramp.',
    },
    {
      zoneNumber: 4,
      zoneName: 'Zone 04 — Hardware Hub',
      taskName: 'Code Debugging + USB Transfer',
      description: 'Identify the syntax error on the offline diagnostic station, patch the binary payload, and flash the patched firmware to the USB key.',
    },
    {
      zoneNumber: 5,
      zoneName: 'Zone 05 — Circuit Workshop',
      taskName: 'Breadboard Circuit Assembly',
      description: 'Wire the 555-timer IC circuit on the breadboard, insert the electrolytic capacitor in correct polarity, and confirm LED oscillation.',
    },
    {
      zoneNumber: 6,
      zoneName: 'Zone 06 — Neural Vault',
      taskName: 'Deep Learning Algorithm Builder',
      description: 'Arrange the physical neural network layer blocks in correct pipeline order (Input -> Conv2D -> BatchNorm -> Dense -> Output) on the magnetic board.',
    },
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
