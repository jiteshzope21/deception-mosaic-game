/**
 * MOSAIC — GM Management Routes (Phase 2)
 */

import { Router } from 'express';
import {
  listQuestions,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  getGameConfig,
  updateGameConfig,
} from '../controllers/gm.controller';
import { requireGm } from '../middleware/auth.middleware';
import { validateBody, questionSchema, gameConfigSchema } from '../validators/schemas';

const router = Router();

// All GM management routes require GM authentication
router.use(requireGm);

// ─── Question Bank CRUD ───────────────────────────────────────────────────────
router.get('/questions', listQuestions);
router.post('/questions', validateBody(questionSchema), createQuestion);
router.put('/questions/:id', updateQuestion);
router.delete('/questions/:id', deleteQuestion);

// ─── Configuration ────────────────────────────────────────────────────────────
router.get('/config', getGameConfig);
router.put('/config', validateBody(gameConfigSchema), updateGameConfig);

export default router;
