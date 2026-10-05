/**
 * MOSAIC — General Utilities
 */

// ─── Game Code Generator ──────────────────────────────────────────────────────

const GAME_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Unambiguous chars

/**
 * Generates a random game code in the format MOSAIC-XXXX.
 * NOTE: The server should generate and validate the final code.
 * This client-side generator is for display purposes only.
 */
export function generateGameCode(): string {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += GAME_CODE_CHARS[Math.floor(Math.random() * GAME_CODE_CHARS.length)];
  }
  return `MOSAIC-${code}`;
}

// ─── Timer Utilities ──────────────────────────────────────────────────────────

/**
 * Calculates remaining seconds from a server-authoritative end timestamp.
 * Uses client clock — do not rely on this for server-side enforcement.
 */
export function getRemainingSeconds(endsAt: string): number {
  const now = Date.now();
  const end = new Date(endsAt).getTime();
  return Math.max(0, Math.floor((end - now) / 1000));
}

/**
 * Formats seconds to MM:SS display.
 */
export function formatTimer(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Returns true if the server-reported phase end has passed (client estimate).
 */
export function isTimerExpired(endsAt: string | null): boolean {
  if (!endsAt) return false;
  return new Date(endsAt).getTime() <= Date.now();
}

// ─── String Utilities ─────────────────────────────────────────────────────────

/**
 * Returns initials for a player name.
 */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2);
}

/**
 * Normalizes a game code to the expected format.
 */
export function normalizeGameCode(code: string): string {
  return code.trim().toUpperCase();
}

// ─── Array Utilities ──────────────────────────────────────────────────────────

/**
 * Shuffles an array (Fisher-Yates).
 * Used for randomizing QR assignments, decoy messages, etc.
 */
export function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ─── Environment Utilities ────────────────────────────────────────────────────

export function isDevelopment(): boolean {
  return import.meta.env.DEV === true;
}

export function isProduction(): boolean {
  return import.meta.env.PROD === true;
}

// ─── Safe Logging ─────────────────────────────────────────────────────────────

/**
 * Development-only logger. Silenced in production.
 * Never log: passwords, tokens, private roles, Imposter identity.
 */
export const logger = {
  info: (msg: string, ...args: unknown[]) => {
    if (isDevelopment()) console.info(`[MOSAIC] ${msg}`, ...args);
  },
  warn: (msg: string, ...args: unknown[]) => {
    if (isDevelopment()) console.warn(`[MOSAIC] ${msg}`, ...args);
  },
  error: (msg: string, ...args: unknown[]) => {
    // Errors logged in both environments for monitoring (without secrets)
    console.error(`[MOSAIC ERROR] ${msg}`, ...args);
  },
  debug: (msg: string, ...args: unknown[]) => {
    if (isDevelopment()) console.debug(`[MOSAIC DEBUG] ${msg}`, ...args);
  },
};
