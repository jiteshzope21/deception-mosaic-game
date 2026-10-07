/**
 * MOSAIC — Game Routes (Phase 2 + Phase 3)
 */

import { Router } from 'express';
import {
  createLobby,
  getActiveGame,
  getGmGameState,
  startGame,
  emergencyEndRound,
  restartGame,
  getPublicLobby,
  getPlayerGameState,
  scanQr,
  submitAnswer,
  // Phase 3: GM
  startTransition,
  startRound2,
  listGameHistory,
  getGameHistory,
  // Phase 3: Player
  recordKill,
  reportBody,
  submitVote,
} from '../controllers/game.controller';
import { requireGm, requirePlayer } from '../middleware/auth.middleware';
import {
  validateBody,
  createLobbySchema,
  qrScanSchema,
  answerSubmissionSchema,
  killSubmissionSchema,
  bodyReportSubmissionSchema,
  voteSubmissionSchema,
} from '../validators/schemas';

const router = Router();

// ─── Public Routes ────────────────────────────────────────────────────────────
router.get('/by-code/:code', getPublicLobby);

// ─── GM Routes (Phase 2) ──────────────────────────────────────────────────────
router.post('/', requireGm, validateBody(createLobbySchema), createLobby);
router.get('/active', requireGm, getActiveGame);
router.get('/history', requireGm, listGameHistory);
router.get('/:gameId/gm-state', requireGm, getGmGameState);
router.get('/:gameId/history', requireGm, getGameHistory);
router.post('/:gameId/start', requireGm, startGame);
router.post('/:gameId/end-round', requireGm, emergencyEndRound);
router.post('/:gameId/restart', requireGm, restartGame);

// ─── GM Routes (Phase 3) ──────────────────────────────────────────────────────
router.post('/:gameId/transition', requireGm, startTransition);
router.post('/:gameId/start-round2', requireGm, startRound2);

// ─── Player Routes (Phase 2) ──────────────────────────────────────────────────
router.get('/:gameId/player-state', requirePlayer, getPlayerGameState);
router.post('/:gameId/qr-scan', requirePlayer, validateBody(qrScanSchema), scanQr);
router.post('/:gameId/answer', requirePlayer, validateBody(answerSubmissionSchema), submitAnswer);

// ─── Player Routes (Phase 3) ──────────────────────────────────────────────────
router.post('/:gameId/kill', requirePlayer, validateBody(killSubmissionSchema), recordKill);
router.post('/:gameId/body-report', requirePlayer, validateBody(bodyReportSubmissionSchema), reportBody);
router.post('/:gameId/vote', requirePlayer, validateBody(voteSubmissionSchema), submitVote);

export default router;
