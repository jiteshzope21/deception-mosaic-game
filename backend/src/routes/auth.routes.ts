/**
 * MOSAIC — Auth Routes
 */

import { Router } from 'express';
import { gmLogin, gmLogout, getGmProfile, playerJoin, getPlayerProfile } from '../controllers/auth.controller';
import { requireGm, requirePlayer } from '../middleware/auth.middleware';
import { validateBody, gmLoginSchema, joinGameSchema } from '../validators/schemas';

const router = Router();

// GM auth
router.post('/gm/login', validateBody(gmLoginSchema), gmLogin);
router.post('/gm/logout', requireGm, gmLogout);
router.get('/gm/me', requireGm, getGmProfile);

// Player auth
router.post('/player/join', validateBody(joinGameSchema), playerJoin);
router.get('/player/me', requirePlayer, getPlayerProfile);

export default router;
