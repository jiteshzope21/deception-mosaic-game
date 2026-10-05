/**
 * MOSAIC — Server Entry Point
 */

import http from 'http';
import { createApp } from './app';
import { connectDatabase } from './config/database';
import { createSocketServer } from './sockets/socketServer';
import { config } from './config/config';
import { logger } from './utils/logger';

async function bootstrap() {
  // Connect to MongoDB first
  await connectDatabase();

  const app = createApp();
  const httpServer = http.createServer(app);

  // Attach Socket.IO
  createSocketServer(httpServer);

  httpServer.listen(config.port, () => {
    logger.info(`MOSAIC backend running on port ${config.port} [${config.env}]`);
    logger.info(`Health: http://localhost:${config.port}/api/health`);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received. Shutting down gracefully...');
    httpServer.close(() => {
      logger.info('HTTP server closed.');
      process.exit(0);
    });
  });
}

bootstrap().catch((err) => {
  logger.error('Bootstrap failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
