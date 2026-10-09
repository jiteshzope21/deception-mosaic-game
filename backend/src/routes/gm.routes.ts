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
  listFixedQrs,
  listDecoys,
  createDecoy,
  updateDecoy,
  deleteDecoy,
  listTasks,
  createTask,
  updateTask,
  deleteTask,
  updatePuzzleImage,
} from '../controllers/gm.controller';
import { requireGm } from '../middleware/auth.middleware';
import {
  validateBody,
  questionSchema,
  gameConfigSchema,
  decoyMessageSchema,
  physicalTaskSchema,
} from '../validators/schemas';

const router = Router();

// All GM management routes require GM authentication
router.use(requireGm);

// ─── Fixed Master QR Codes ───────────────────────────────────────────────────
router.get('/fixed-qrs', listFixedQrs);

// ─── Question Bank CRUD ───────────────────────────────────────────────────────
router.get('/questions', listQuestions);
router.post('/questions', validateBody(questionSchema), createQuestion);
router.put('/questions/:id', updateQuestion);
router.delete('/questions/:id', deleteQuestion);

// ─── Configuration ────────────────────────────────────────────────────────────
router.get('/config', getGameConfig);
router.put('/config', validateBody(gameConfigSchema), updateGameConfig);
router.post('/puzzle-image', updatePuzzleImage);

// ─── Decoy Messages CRUD ──────────────────────────────────────────────────────
router.get('/decoys', listDecoys);
router.post('/decoys', validateBody(decoyMessageSchema), createDecoy);
router.put('/decoys/:id', updateDecoy);
router.delete('/decoys/:id', deleteDecoy);

// ─── Physical Tasks CRUD ──────────────────────────────────────────────────────
router.get('/tasks', listTasks);
router.post('/tasks', validateBody(physicalTaskSchema), createTask);
router.put('/tasks/:id', updateTask);
router.delete('/tasks/:id', deleteTask);

export default router;
