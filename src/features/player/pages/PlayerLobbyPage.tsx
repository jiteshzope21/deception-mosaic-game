/**
 * MOSAIC — Player Lobby Page (Phase 2: Realtime)
 *
 * Shown after a player successfully joins. Shows team roster in realtime,
 * transitions automatically to Round 1 when GM starts.
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, LogOut, Wifi, WifiOff, CheckCircle, Clock } from 'lucide-react';
import { useAuth } from '@/app/providers/AuthContext';
import { APP_CONFIG } from '@/app/config/constants';
import { getPlayerGameState, type LobbyPlayerData } from '@/services/gameService';
import { getSocket, subscribeToEvent } from '@/lib/socket/socketClient';
import { SOCKET_EVENT, GAME_PHASE } from '@/types/enums';

export default function PlayerLobbyPage() {
  const navigate = useNavigate();
  const { playerContext, logout } = useAuth();

  const [phase, setPhase] = useState<string>(GAME_PHASE.LOBBY);
  const [players, setPlayers] = useState<LobbyPlayerData[]>([]);
  const [teamName, setTeamName] = useState('');
  const [teamSize, setTeamSize] = useState<number>(0);
  const [gameCode, setGameCode] = useState('');
  const [isConnected, setIsConnected] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const hasFetched = useRef(false);

  const gameId = playerContext?.game_id;

  // Initial state load
  useEffect(() => {
    if (!gameId || hasFetched.current) return;
    hasFetched.current = true;

    async function loadState() {
      const res = await getPlayerGameState(gameId!);
      setIsLoading(false);
      if (!res.success) return;

      setTeamName(res.data.teamName);
      setTeamSize(res.data.teamSize);
      setGameCode(res.data.gameCode);
      setPhase(res.data.phase);
      setPlayers(
        res.data.teammates.map((t) => ({
          id: t.id,
          playerName: t.playerName,
          status: t.status,
          isClaimed: t.status !== 'REGISTERED',
        }))
      );

      // Already started — navigate to game
      if (res.data.phase === GAME_PHASE.ROUND_1_ACTIVE) {
        navigate('/player/round1', { replace: true });
      } else if (res.data.phase === GAME_PHASE.ROUND_1_COMPLETE) {
        navigate('/player/round1-complete', { replace: true });
      } else if (res.data.phase === GAME_PHASE.TRANSITION) {
        navigate('/player/transition', { replace: true });
      } else if (
        res.data.phase === GAME_PHASE.ROUND_2_ACTIVE ||
        res.data.phase === GAME_PHASE.BODY_REPORT ||
        res.data.phase === GAME_PHASE.MOVE_TO_VOTING ||
        res.data.phase === GAME_PHASE.VOTING
      ) {
        navigate('/player/round2', { replace: true });
      } else if (res.data.phase === GAME_PHASE.GAME_COMPLETE) {
        navigate('/player/complete', { replace: true });
      }
    }

    void loadState();
  }, [gameId, navigate]);

  // Realtime socket events
  useEffect(() => {
    const socket = getSocket();
    if (socket) {
      setIsConnected(socket.connected);
      socket.on('connect', () => setIsConnected(true));
      socket.on('disconnect', () => setIsConnected(false));
    }

    const unsubLobby = subscribeToEvent<any>(SOCKET_EVENT.LOBBY_UPDATE, (data) => {
      if (data?.players) {
        setPlayers(data.players);
      }
    });

    const unsubJoined = subscribeToEvent<any>(SOCKET_EVENT.PLAYER_JOINED, (data) => {
      if (data?.playerName) {
        setPlayers((prev) =>
          prev.map((p) =>
            p.playerName === data.playerName ? { ...p, isClaimed: true, status: 'JOINED' } : p
          )
        );
      }
    });

    const unsubStarted = subscribeToEvent<any>(SOCKET_EVENT.GAME_STARTED, () => {
      setPhase(GAME_PHASE.ROUND_1_ACTIVE);
      navigate('/player/round1', { replace: true });
    });

    const unsubPhase = subscribeToEvent<any>(SOCKET_EVENT.PHASE_CHANGED, (data) => {
      if (data?.to) {
        setPhase(data.to);
        if (data.to === GAME_PHASE.ROUND_1_ACTIVE) {
          navigate('/player/round1', { replace: true });
        } else if (data.to === GAME_PHASE.ROUND_1_COMPLETE) {
          navigate('/player/round1-complete', { replace: true });
        } else if (data.to === GAME_PHASE.TRANSITION) {
          navigate('/player/transition', { replace: true });
        } else if (
          data.to === GAME_PHASE.ROUND_2_ACTIVE ||
          data.to === GAME_PHASE.BODY_REPORT ||
          data.to === GAME_PHASE.MOVE_TO_VOTING ||
          data.to === GAME_PHASE.VOTING
        ) {
          navigate('/player/round2', { replace: true });
        } else if (data.to === GAME_PHASE.GAME_COMPLETE) {
          navigate('/player/complete', { replace: true });
        }
      }
    });

    return () => {
      unsubLobby();
      unsubJoined();
      unsubStarted();
      unsubPhase();
    };
  }, [navigate]);

  async function handleLeave() {
    await logout();
    navigate('/', { replace: true });
  }

  const myName = playerContext?.player_name ?? '';
  const joinedCount = players.filter((p) => p.isClaimed).length;
  const allJoined = teamSize > 0 && joinedCount >= teamSize;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-mosaic-dark flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-mosaic-accent border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-mosaic-muted text-sm">Loading lobby...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-mosaic-dark flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-mosaic-accent to-mosaic-purple mb-4 shadow-lg shadow-mosaic-accent/20">
            <span className="text-white font-bold text-xl">M</span>
          </div>
          <h1 className="text-2xl font-bold text-white">{APP_CONFIG.name}</h1>
          <p className="text-mosaic-muted text-sm">{teamName}</p>

          <div className="flex items-center justify-center gap-3 mt-3">
            <div className="px-3 py-1 bg-mosaic-accent/10 border border-mosaic-accent/30 rounded-full">
              <span className="text-mosaic-accent text-sm font-mono font-semibold tracking-wider">{gameCode}</span>
            </div>
            <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border ${isConnected ? 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10' : 'text-red-400 border-red-400/30 bg-red-400/10'}`}>
              {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              {isConnected ? 'Live' : 'Reconnecting...'}
            </div>
          </div>
        </div>

        {/* Player name badge */}
        <div className="bg-gradient-to-r from-mosaic-accent/10 to-mosaic-purple/10 border border-mosaic-accent/20 rounded-2xl p-4 mb-4 text-center">
          <p className="text-mosaic-muted text-xs mb-0.5">You are playing as</p>
          <p className="text-2xl font-bold text-white">{myName}</p>
        </div>

        {/* Team roster */}
        <div className="bg-mosaic-surface border border-mosaic-border rounded-2xl p-5 shadow-xl mb-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-mosaic-accent" />
              <h2 className="text-white font-semibold text-sm">Team Roster</h2>
            </div>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${allJoined ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-mosaic-accent/10 text-mosaic-accent border border-mosaic-accent/30'}`}>
              {joinedCount}/{teamSize} joined
            </span>
          </div>

          <div className="space-y-2">
            {players.map((p) => {
              const isMe = p.playerName === myName;
              const isJoined = p.isClaimed;

              return (
                <div
                  key={p.id || p.playerName}
                  className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${
                    isMe
                      ? 'bg-mosaic-accent/10 border-mosaic-accent/40'
                      : isJoined
                      ? 'bg-emerald-500/5 border-emerald-500/20'
                      : 'bg-mosaic-dark border-mosaic-border/50'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${isMe ? 'bg-mosaic-accent text-black' : isJoined ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-500'}`}>
                      {p.playerName.charAt(0).toUpperCase()}
                    </div>
                    <span className={`text-sm font-medium ${isMe ? 'text-white' : isJoined ? 'text-white' : 'text-mosaic-muted'}`}>
                      {p.playerName}
                      {isMe && <span className="ml-1.5 text-xs text-mosaic-accent font-normal">(You)</span>}
                    </span>
                  </div>
                  {isJoined ? (
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <span className="text-xs text-mosaic-muted/50">Waiting...</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Waiting indicator */}
        {phase === GAME_PHASE.LOBBY && (
          <div className="bg-mosaic-surface border border-mosaic-border rounded-2xl p-5 text-center mb-4">
            <div className="relative inline-flex mb-3">
              <div className="w-8 h-8 border-2 border-mosaic-accent/50 border-t-mosaic-accent rounded-full animate-spin" />
            </div>
            <p className="text-white font-semibold text-sm">Waiting for Game Master</p>
            <p className="text-mosaic-muted text-xs mt-1">
              {allJoined ? 'All players ready — game starting soon!' : `Waiting for ${teamSize - joinedCount} more player${teamSize - joinedCount !== 1 ? 's' : ''} to join`}
            </p>
            {allJoined && (
              <div className="mt-2 flex items-center justify-center gap-1.5 text-xs text-emerald-400">
                <CheckCircle className="w-3.5 h-3.5" />
                Team complete!
              </div>
            )}
          </div>
        )}

        {/* Info footer */}
        <div className="flex items-center justify-center gap-1.5 text-xs text-mosaic-muted mb-4">
          <Clock className="w-3.5 h-3.5" />
          <span>Game begins when GM starts • Puzzle Solving Round • 4 minutes</span>
        </div>

        {/* Leave */}
        <button
          id="player-leave-btn"
          onClick={handleLeave}
          className="flex items-center gap-2 text-mosaic-muted hover:text-white transition-colors text-sm mx-auto cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          Leave Game
        </button>
      </div>
    </div>
  );
}
