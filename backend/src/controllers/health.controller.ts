/**
 * MOSAIC — Health Check Controller
 */

import type { Request, Response } from 'express';
import { getConnectionState } from '../config/database';
import { sendSuccess } from '../utils/response.utils';

export function healthCheck(_req: Request, res: Response): void {
  sendSuccess(res, {
    status: 'ok',
    service: 'mosaic-backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    database: {
      status: getConnectionState(),
    },
  });
}
