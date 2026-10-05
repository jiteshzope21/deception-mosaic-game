/**
 * MOSAIC — Safe Logger
 *
 * Never log: passwords, tokens, player roles, imposter identities.
 */

const isDev = process.env.NODE_ENV !== 'production';

export const logger = {
  info: (msg: string, ...args: unknown[]) => {
    console.info(`[MOSAIC] ${msg}`, ...args);
  },
  warn: (msg: string, ...args: unknown[]) => {
    console.warn(`[MOSAIC WARN] ${msg}`, ...args);
  },
  error: (msg: string, ...args: unknown[]) => {
    console.error(`[MOSAIC ERROR] ${msg}`, ...args);
  },
  debug: (msg: string, ...args: unknown[]) => {
    if (isDev) console.debug(`[MOSAIC DEBUG] ${msg}`, ...args);
  },
};
