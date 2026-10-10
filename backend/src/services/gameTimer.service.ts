/**
 * MOSAIC — Authoritative Game Timer Service
 *
 * Runs a server-side background interval to evaluate phase and master deadlines
 * for all active games. Guarantees that phase transitions (BODY_REPORT -> MOVE_TO_VOTING,
 * MOVE_TO_VOTING -> VOTING, VOTING -> resolveVoting, ROUND_2_ACTIVE -> TIMEOUT)
 * execute automatically even when no client HTTP requests are incoming.
 */

import { Game } from '../models/Game.model';
import { GamePhase } from '../types/game.types';
import { checkGameTimers } from './game.service';
import { logger } from '../utils/logger';

let timerInterval: NodeJS.Timeout | null = null;
const processingGameIds = new Set<string>();

/**
 * Checks all active games and triggers transitions if phase deadlines have elapsed.
 */
export async function tickActiveGameTimers(): Promise<number> {
  const activePhases = [
    GamePhase.ROUND_1_ACTIVE,
    GamePhase.TRANSITION,
    GamePhase.ROUND_2_ACTIVE,
    GamePhase.BODY_REPORT,
    GamePhase.MOVE_TO_VOTING,
    GamePhase.VOTING,
  ];

  try {
    const activeGames = await Game.find({
      phase: { $in: activePhases },
      isPaused: { $ne: true },
    });

    if (!activeGames.length) return 0;

    const now = Date.now();
    let transitionedCount = 0;

    for (const game of activeGames) {
      const gameId = String(game._id);
      if (processingGameIds.has(gameId)) continue;

      const phaseExpired = game.phaseEndsAt && now >= new Date(game.phaseEndsAt).getTime();
      const masterExpired = game.round2EndsAt && now >= new Date(game.round2EndsAt).getTime();

      if (phaseExpired || masterExpired) {
        processingGameIds.add(gameId);
        try {
          const didTransition = await checkGameTimers(game);
          if (didTransition) {
            transitionedCount++;
          }
        } catch (err) {
          logger.error(`[GameTimerService] Error checking timers for game ${game.gameCode}:`, err);
        } finally {
          processingGameIds.delete(gameId);
        }
      }
    }

    return transitionedCount;
  } catch (err) {
    logger.error('[GameTimerService] Error querying active games for timers:', err);
    return 0;
  }
}

/**
 * Starts the authoritative timer loop.
 */
export function startGameTimerService(intervalMs: number = 500): void {
  if (timerInterval) return;

  timerInterval = setInterval(() => {
    void tickActiveGameTimers();
  }, intervalMs);

  logger.info(`[GameTimerService] Started server-authoritative timer ticker (${intervalMs}ms interval)`);
}

/**
 * Stops the timer loop (useful on shutdown or in test tear-down).
 */
export function stopGameTimerService(): void {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
    logger.info('[GameTimerService] Stopped server-authoritative timer ticker');
  }
}
