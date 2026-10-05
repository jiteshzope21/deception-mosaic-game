/**
 * MOSAIC — App Configuration
 *
 * Single source of truth for all frontend constants.
 * Never hard-code game defaults elsewhere — import from here.
 */

import { TIE_RULE } from '../../types/enums';
import type { GameConfigDefaults } from '../../types/app';

// ─── Game Defaults ────────────────────────────────────────────────────────────

export const GAME_DEFAULTS: GameConfigDefaults = {
  round_1_duration_seconds: 240,       // 4:00
  transition_duration_seconds: 60,     // 1:00
  round_2_duration_seconds: 420,       // 7:00
  body_report_duration_seconds: 20,    // 0:20
  move_to_voting_duration_seconds: 15, // 0:15
  voting_duration_seconds: 15,         // 0:15
  starting_lives: 2,
  max_kills: 2,
  allow_self_vote: false,
  tie_rule: TIE_RULE.NO_ELIMINATION,
  min_questions_per_qr: 1,
  max_questions_per_qr: 2,
  imposter_count: 1,
  allowed_team_sizes: [5, 6],
} as const;

// ─── QR Configuration ─────────────────────────────────────────────────────────

export const TOTAL_QR_CODES = 10;

/** QR distribution per team size */
export const QR_DISTRIBUTION = {
  5: { puzzle: 5, decoy: 5 },
  6: { puzzle: 6, decoy: 4 },
} as const;

// ─── Game Code Config ─────────────────────────────────────────────────────────

export const GAME_CODE_PREFIX = 'MOSAIC-';
export const GAME_CODE_LENGTH = 4; // chars after prefix

// ─── Event Application Metadata ──────────────────────────────────────────────

export const APP_CONFIG = {
  name: 'MOSAIC',
  tagline: 'Find the Clues. Complete the Tasks. Trust No One.',
  eventName: 'ADG Technical Event',
  theme: 'DECEPTION',
  version: '1.0.0',
} as const;

// ─── Socket Rooms ─────────────────────────────────────────────────────────────

export const SOCKET_ROOMS = {
  game: (gameId: string) => `game:${gameId}`,
  gm: (gameId: string) => `game:${gameId}:gm`,
  player: (playerId: string) => `player:${playerId}`,
} as const;

