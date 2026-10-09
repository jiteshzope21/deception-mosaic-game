/**
 * MOSAIC — Backend Configuration
 *
 * All configuration is loaded from environment variables.
 * NEVER hard-code credentials here.
 *
 * Required env vars are documented in .env.example at project root.
 */

import dotenv from 'dotenv';
import path from 'path';

// Load .env from backend directory or project root
dotenv.config({ path: path.resolve(__dirname, '../../backend/.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

// ─── Environment validation helper ───────────────────────────────────────────

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `[MOSAIC] Missing required environment variable: ${key}\n` +
      `See .env.example in the project root for setup instructions.`
    );
  }
  return value;
}

function optionalEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

// ─── Config Object ────────────────────────────────────────────────────────────

export const config = {
  env: optionalEnv('NODE_ENV', 'development'),
  port: parseInt(optionalEnv('PORT', '3001'), 10),
  isProduction: process.env.NODE_ENV === 'production',
  isDevelopment: process.env.NODE_ENV !== 'production',

  mongodb: {
    uri: requireEnv('MONGODB_URI'),
    dbName: optionalEnv('MONGODB_DB_NAME', 'mosaic'),
  },

  jwt: {
    secret: requireEnv('JWT_SECRET'),
    gmExpiry: optionalEnv('JWT_GM_EXPIRY', '8h'),
    playerExpiry: optionalEnv('JWT_PLAYER_EXPIRY', '4h'),
  },

  cors: {
    allowedOrigins: optionalEnv('CORS_ALLOWED_ORIGINS', 'http://localhost:5173').split(','),
  },

  rateLimit: {
    windowMs: parseInt(optionalEnv('RATE_LIMIT_WINDOW_MS', String(15 * 60 * 1000)), 10),
    max: parseInt(
      optionalEnv('RATE_LIMIT_MAX', process.env.NODE_ENV === 'production' ? '1000' : '5000'),
      10
    ),
    authMax: parseInt(
      optionalEnv('RATE_LIMIT_AUTH_MAX', process.env.NODE_ENV === 'production' ? '20' : '100'),
      10
    ),
  },
} as const;

export type Config = typeof config;
