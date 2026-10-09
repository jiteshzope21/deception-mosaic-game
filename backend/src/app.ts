/**
 * MOSAIC — Express Application
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { config } from './config/config';
import routes from './routes/index';
import { errorHandler, notFoundHandler } from './middleware/auth.middleware';

export function createApp() {
  const app = express();

  // ── Security headers ──────────────────────────────────────────────────────
  app.use(helmet());

  // ── CORS ──────────────────────────────────────────────────────────────────
  app.use(
    cors({
      origin: config.cors.allowedOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  // ── Rate limiting ─────────────────────────────────────────────────────────
  // Dedicated auth limiter for login endpoint (brute-force defense)
  const authLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.authMax,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true, // Legitimate successful logins do not count against lockout
    message: {
      success: false,
      error: { code: 'RATE_LIMITED', message: 'Too many authentication attempts. Please try again later.' },
    },
  });
  app.use('/api/auth/gm/login', authLimiter);

  // General API rate limiter for gameplay and operational endpoints
  const apiLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.originalUrl.includes('/auth/gm/login'),
    message: {
      success: false,
      error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' },
    },
  });
  app.use('/api', apiLimiter);

  // ── Body parsing ──────────────────────────────────────────────────────────
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());

  // ── Routes ────────────────────────────────────────────────────────────────
  app.use('/api', routes);

  // ── Error handling ────────────────────────────────────────────────────────
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
