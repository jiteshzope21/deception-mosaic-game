/**
 * MOSAIC — Integration Tests: API Routing & Socket.IO Architecture
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { createApp } from '../../src/app';
import { createSocketServer } from '../../src/sockets/socketServer';

describe('API Routing & Socket.IO Architecture Compatibility', () => {
  let server: http.Server;
  let port: number;

  beforeAll(async () => {
    const app = createApp();
    server = http.createServer(app);
    createSocketServer(server);

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const address = server.address();
        if (address && typeof address === 'object') {
          port = address.port;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('serves health check under /api/health with JSON response and preserves query strings', async () => {
    const res = await fetch(`http://localhost:${port}/api/health?test=1&debug=true`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; data: { service: string } };
    expect(json.success).toBe(true);
    expect(json.data.service).toBe('mosaic-backend');
  });

  it('handles CORS preflight OPTIONS requests from .vercel.app origins', async () => {
    const res = await fetch(`http://localhost:${port}/api/auth/gm/login`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://deception-mosaic.vercel.app',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    });

    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://deception-mosaic.vercel.app');
  });

  it('preserves POST request bodies and validates payloads on /api/auth/gm/login', async () => {
    const res = await fetch(`http://localhost:${port}/api/auth/gm/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://deception-mosaic.vercel.app',
      },
      body: JSON.stringify({ email: 'invalid-email', password: 'short' }),
    });

    // Expect 422 Unprocessable Entity or 400 Bad Request from Zod validation
    expect(res.status).toBe(422);
    const json = (await res.json()) as { success: boolean };
    expect(json.success).toBe(false);
  });

  it('rejects unauthenticated Socket.IO polling requests without tokens', async () => {
    const res = await fetch(`http://localhost:${port}/socket.io/?EIO=4&transport=polling`);
    expect(res.status).toBe(200);
    const text = await res.text();
    // Socket.io sends open packet or sid
    expect(text).toContain('0{');
  });
});
