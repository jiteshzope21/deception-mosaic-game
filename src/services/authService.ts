/**
 * MOSAIC — Authentication Service
 *
 * Communicates with the Express/MongoDB backend for GM and Player authentication.
 *
 * SECURITY MODEL:
 * - GM: Email/password credentials validated server-side against MongoDB bcrypt hash.
 * - Player: Claim pre-registered slot using Game Code + Player Name.
 *   Backend issues signed JWT with player _id and game _id.
 * - All tokens are stored safely in localStorage/cookies and passed via Authorization headers.
 */

import { apiClient, clearStoredToken, getStoredToken, setStoredToken } from '../lib/api/apiClient';
import { connectSocket, disconnectSocket } from '../lib/socket/socketClient';
import { gmLoginSchema, joinGameSchema } from '../lib/validation/schemas';
import { ERROR_CODE } from '../types/app';
import type { ApiResult, GmAuthUser, PlayerAuthUser } from '../types/app';

export interface GmLoginResponseData {
  token: string;
  gm: {
    id: string;
    email: string;
    displayName: string;
    role: 'GM';
  };
}

export interface PlayerJoinResponseData {
  token: string;
  player: {
    id: string;
    playerName: string;
    gameId: string;
    gameCode: string;
    teamName: string;
    role: 'PLAYER';
  };
}

/**
 * Authenticates the Game Master with email and password.
 */
export async function gmLogin(email: string, password: string): Promise<ApiResult<GmAuthUser>> {
  const parsed = gmLoginSchema.safeParse({ email, password });
  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: ERROR_CODE.VALIDATION_ERROR as any,
        message: parsed.error.issues[0]?.message ?? 'Invalid credentials format',
      },
    };
  }

  const res = await apiClient.post<GmLoginResponseData>('/auth/gm/login', {
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (!res.success) {
    return res;
  }

  // Save JWT
  setStoredToken(res.data.token);
  connectSocket();

  return {
    success: true,
    data: {
      id: res.data.gm.id,
      email: res.data.gm.email,
      displayName: res.data.gm.displayName,
      role: 'GM',
    },
  };
}

/**
 * Logs out the current GM or Player.
 */
export async function logout(): Promise<void> {
  try {
    await apiClient.post('/auth/gm/logout');
  } catch {
    // Ignore network error on logout
  } finally {
    clearStoredToken();
    disconnectSocket();
  }
}

/**
 * Fetches the current GM profile if an active GM token exists.
 */
export async function getGmProfile(): Promise<ApiResult<GmAuthUser>> {
  const token = getStoredToken();
  if (!token) {
    return {
      success: false,
      error: {
        code: ERROR_CODE.UNAUTHORIZED as any,
        message: 'No active session found.',
      },
    };
  }

  const res = await apiClient.get<GmAuthUser>('/auth/gm/me');
  if (res.success) {
    connectSocket();
  }
  return res;
}

/**
 * Fetches the current player profile if an active player token exists.
 */
export async function getPlayerProfile(): Promise<ApiResult<PlayerAuthUser>> {
  const token = getStoredToken();
  if (!token) {
    return {
      success: false,
      error: {
        code: ERROR_CODE.UNAUTHORIZED as any,
        message: 'No active session found.',
      },
    };
  }

  const res = await apiClient.get<{
    id: string;
    playerName: string;
    gameId: string;
    gameCode: string;
    teamName: string;
    phase: string;
    role: 'PLAYER';
  }>('/auth/player/me');

  if (res.success) {
    connectSocket();
    return {
      success: true,
      data: {
        id: res.data.id,
        role: 'PLAYER',
        game_player_id: res.data.id,
        game_id: res.data.gameId,
        player_name: res.data.playerName,
      },
    };
  }

  return {
    success: false,
    error: res.error,
  };
}

/**
 * Allows a player to claim a pre-registered slot in a game lobby.
 */
export async function playerJoin(gameCode: string, playerName: string): Promise<ApiResult<PlayerAuthUser>> {
  const parsed = joinGameSchema.safeParse({ game_code: gameCode, player_name: playerName });
  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: ERROR_CODE.VALIDATION_ERROR,
        message: parsed.error.issues[0]?.message ?? 'Invalid join credentials',
      },
    };
  }

  const res = await apiClient.post<PlayerJoinResponseData>('/auth/player/join', {
    gameCode: parsed.data.game_code,
    playerName: parsed.data.player_name,
  });

  if (!res.success) {
    return res;
  }

  setStoredToken(res.data.token);
  connectSocket();

  return {
    success: true,
    data: {
      id: res.data.player.id,
      role: 'PLAYER',
      game_player_id: res.data.player.id,
      game_id: res.data.player.gameId,
      player_name: res.data.player.playerName,
    },
  };
}

export { logout as signOut };

