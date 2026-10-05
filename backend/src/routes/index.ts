/**
 * MOSAIC — Routes Index
 */

import { Router } from 'express';
import { healthCheck } from '../controllers/health.controller';
import authRoutes from './auth.routes';
import gameRoutes from './game.routes';
import gmRoutes from './gm.routes';

const router = Router();

// Health
router.get('/health', healthCheck);

// Auth
router.use('/auth', authRoutes);

// Game (Phase 2)
router.use('/games', gameRoutes);
router.use('/game', gameRoutes); // convenience alias

// GM Management (Phase 2)
router.use('/gm', gmRoutes);

export default router;
