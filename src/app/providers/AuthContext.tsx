/**
 * MOSAIC — Auth Context
 *
 * Provides current authentication state (GM or Player) across the React tree.
 * Interacts with the Express/MongoDB backend via authService and apiClient.
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getGmProfile, getPlayerProfile, gmLogin, logout as authLogout, playerJoin } from '@/services/authService';
import { getStoredToken, clearStoredToken } from '@/lib/api/apiClient';
import { connectSocket } from '@/lib/socket/socketClient';
import type { GmAuthUser, PlayerAuthUser } from '@/types/app';
import { logger } from '@/lib/utils/helpers';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AuthStatus = 'loading' | 'unauthenticated' | 'gm' | 'player';

export interface PlayerContext {
  game_player_id: string;
  game_id: string;
  player_name: string;
}

export interface AuthState {
  status: AuthStatus;
  user: GmAuthUser | PlayerAuthUser | null;
  isGm: boolean;
  isPlayer: boolean;
  isLoading: boolean;
  playerContext: PlayerContext | null;
}

interface AuthContextValue extends AuthState {
  loginGm: (email: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  joinPlayerSession: (code: string, name: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  setPlayerContext: (ctx: PlayerContext | null) => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

const PLAYER_CTX_KEY = 'mosaic_player_ctx';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<GmAuthUser | PlayerAuthUser | null>(null);
  const [playerContext, setPlayerContextState] = useState<PlayerContext | null>(() => {
    try {
      const saved = localStorage.getItem(PLAYER_CTX_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const setPlayerContext = useCallback((ctx: PlayerContext | null) => {
    setPlayerContextState(ctx);
    if (ctx) {
      localStorage.setItem(PLAYER_CTX_KEY, JSON.stringify(ctx));
    } else {
      localStorage.removeItem(PLAYER_CTX_KEY);
    }
  }, []);

  const refreshSession = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setStatus('unauthenticated');
      setUser(null);
      return;
    }

    // Check if GM
    const gmRes = await getGmProfile();
    if (gmRes.success) {
      setUser(gmRes.data);
      setStatus('gm');
      connectSocket();
      return;
    }

    // Check if Player
    const playerRes = await getPlayerProfile();
    if (playerRes.success) {
      const ctx: PlayerContext = {
        game_player_id: playerRes.data.game_player_id,
        game_id: playerRes.data.game_id,
        player_name: playerRes.data.player_name,
      };
      setPlayerContext(ctx);
      setUser(playerRes.data);
      setStatus('player');
      connectSocket();
      return;
    }

    // Otherwise token is invalid / expired
    clearStoredToken();
    setPlayerContext(null);
    setStatus('unauthenticated');
    setUser(null);
  }, [setPlayerContext]);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const loginGm = useCallback(async (email: string, pass: string) => {
    const res = await gmLogin(email, pass);
    if (res.success) {
      setUser(res.data);
      setStatus('gm');
      return { success: true };
    }
    return { success: false, error: res.error.message };
  }, []);

  const joinPlayerSession = useCallback(async (code: string, name: string) => {
    const res = await playerJoin(code, name);
    if (res.success) {
      const ctx: PlayerContext = {
        game_player_id: res.data.game_player_id,
        game_id: res.data.game_id,
        player_name: res.data.player_name,
      };
      setPlayerContext(ctx);
      setUser(res.data);
      setStatus('player');
      return { success: true };
    }
    return { success: false, error: res.error.message };
  }, [setPlayerContext]);

  const logout = useCallback(async () => {
    await authLogout();
    setPlayerContext(null);
    setUser(null);
    setStatus('unauthenticated');
    logger.info('Logged out successfully.');
  }, [setPlayerContext]);

  const value: AuthContextValue = {
    status,
    user,
    isGm: status === 'gm',
    isPlayer: status === 'player',
    isLoading: status === 'loading',
    playerContext,
    loginGm,
    joinPlayerSession,
    logout,
    refreshSession,
    setPlayerContext,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within <AuthProvider>');
  }
  return context;
}
