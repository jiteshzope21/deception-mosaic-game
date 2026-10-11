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
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

  // ── Private Network Access & Preflight Headers ────────────────────────────
  // Allows secure browser contexts (e.g. Netlify on HTTPS) to access localhost in dev
  app.use((req, res, next) => {
    if (req.headers['access-control-request-private-network']) {
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
    }
    next();
  });

  // ── CORS ──────────────────────────────────────────────────────────────────
  const corsOptions: cors.CorsOptions = {
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);

      // Check configured origins
      if (config.cors.allowedOrigins.includes(origin) || config.cors.allowedOrigins.includes('*')) {
        return callback(null, true);
      }

      // Allow any Netlify, Vercel domain, or localhost origin
      if (origin.endsWith('.netlify.app') || origin.endsWith('.vercel.app') || origin.startsWith('http://localhost:')) {
        return callback(null, true);
      }

      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Access-Control-Request-Private-Network'],
  };

  app.use(cors(corsOptions));
  app.options('*', cors(corsOptions));

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
