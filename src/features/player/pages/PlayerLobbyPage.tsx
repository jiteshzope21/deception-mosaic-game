/**
 * MOSAIC — Player Lobby Page (Phase 2: Realtime)
 *
 * Shown after a player successfully joins. Shows team roster in realtime,
 * transitions automatically to Round 1 when GM starts.
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, LogOut, CheckCircle, Clock } from 'lucide-react';
import { useAuth } from '@/app/providers/AuthContext';
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
      } else if (
        res.data.phase === GAME_PHASE.TRANSITION ||
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
        } else if (
          data.to === GAME_PHASE.TRANSITION ||
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
    <div className="min-h-screen arcade-corridor-bg flex flex-col items-center justify-center p-4 sm:p-6 md:p-8 relative overflow-x-hidden">
      {/* Background arcade grid */}
      <div className="absolute inset-0 arcade-grid opacity-40 pointer-events-none" />

      {/* Ambient Lighting */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-red-600/10 rounded-full blur-[110px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-[110px]" />
      </div>

      <div className="relative w-full max-w-md sm:max-w-lg md:max-w-xl lg:max-w-2xl z-10 space-y-5">
        {/* Header HUD */}
        <div className="text-center space-y-1.5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-black/60 border border-[#1d2536] backdrop-blur-md mb-1">
            <span className="font-arcade text-[10px] sm:text-xs font-bold tracking-widest text-[#8b9bb4]">ADG</span>
            <span className="text-[#ff1e42] glow-text-red font-black text-xs">✕</span>
            <span className="font-arcade text-[10px] sm:text-xs font-bold tracking-widest text-[#fff1e6]">MOSAIC</span>
          </div>

          <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-bold tracking-wider text-[#fff1e6] glow-text-red">
            CREW STAGING DECK
          </h1>
          <p className="font-tech text-xs sm:text-sm tracking-wider text-[#8b9bb4] uppercase">
            SQUADRON: <span className="text-[#fff1e6] font-bold">{teamName || 'CLASSIFIED UNIT'}</span>
          </p>

          <div className="flex items-center justify-center gap-3 pt-1">
            <div className="px-3 py-1 bg-[#06070a] border border-[#00e5ff]/40 rounded-lg">
              <span className="text-[#00e5ff] text-xs sm:text-sm font-arcade font-bold tracking-wider">
                {gameCode}
              </span>
            </div>

            <div className={`flex items-center gap-1.5 text-xs font-tech font-bold uppercase tracking-wider px-3 py-1 rounded-lg border ${
              isConnected
                ? 'text-[#00e5ff] border-[#00e5ff]/40 bg-[#00e5ff]/10'
                : 'text-red-400 border-red-500/40 bg-red-500/10'
            }`}>
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-[#00e5ff] animate-ping' : 'bg-red-500'}`} />
              <span>{isConnected ? 'NODE CONNECTED' : 'RECONNECTING...'}</span>
            </div>
          </div>
        </div>

        {/* Player Codename Badge */}
        <div className="arcade-card bg-gradient-to-r from-red-950/20 via-[#0d1017] to-cyan-950/20 p-4 sm:p-5 border-l-4 border-l-[#ff1e42] relative">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-tech text-xs uppercase tracking-widest text-[#8b9bb4] font-semibold">
                AUTHENTICATED OPERATIVE
              </p>
              <p className="font-arcade text-xl sm:text-2xl font-bold text-[#fff1e6] tracking-wider mt-0.5">
                {myName}
              </p>
            </div>
            <div className="px-2.5 py-1 rounded bg-[#ff1e42]/10 border border-[#ff1e42]/30 text-[#ff1e42] font-arcade text-xs font-bold uppercase">
              ACTIVE
            </div>
          </div>
        </div>

        {/* Team Roster Grid */}
        <div className="arcade-card p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-[#1d2536] pb-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-[#00e5ff]" />
              <h2 className="font-arcade text-xs sm:text-sm font-bold text-[#fff1e6] uppercase tracking-wider">
                SQUADRON MANIFEST
              </h2>
            </div>
            <span className={`font-arcade text-xs font-bold px-2.5 py-0.5 rounded-full border ${
              allJoined
                ? 'bg-cyan-500/10 text-[#00e5ff] border-[#00e5ff]/40'
                : 'bg-red-500/10 text-red-400 border-red-500/40'
            }`}>
              {joinedCount}/{teamSize} SLOTS ENGAGED
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {players.map((p) => {
              const isMe = p.playerName === myName;
              const isJoined = p.isClaimed;

              return (
                <div
                  key={p.id || p.playerName}
                  className={`flex items-center justify-between px-3.5 py-3 rounded-xl border transition-all ${
                    isMe
                      ? 'bg-[#ff1e42]/15 border-[#ff1e42] shadow-sm shadow-[#ff1e42]/20'
                      : isJoined
                      ? 'bg-[#0d1017] border-[#1d2536]'
                      : 'bg-[#06070a]/60 border-[#1d2536]/40 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`w-2.5 h-2.5 rounded-full ${isJoined ? 'bg-[#00e5ff] shadow-[0_0_8px_#00e5ff]' : 'bg-zinc-700'}`} />
                    <span className={`font-tech text-sm sm:text-base font-bold ${isMe ? 'text-[#fff1e6]' : isJoined ? 'text-[#fff1e6]' : 'text-[#8b9bb4]'}`}>
                      {p.playerName}
                      {isMe && <span className="ml-1.5 font-arcade text-[10px] text-[#ff1e42] uppercase font-bold">(YOU)</span>}
                    </span>
                  </div>

                  {isJoined ? (
                    <div className="flex items-center gap-1 font-arcade text-[10px] text-[#00e5ff]">
                      <span>READY</span>
                      <CheckCircle className="w-3.5 h-3.5 text-[#00e5ff]" />
                    </div>
                  ) : (
                    <span className="font-arcade text-[10px] text-zinc-600 uppercase">SYNCING...</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Waiting indicator */}
        {phase === GAME_PHASE.LOBBY && (
          <div className="arcade-card p-5 text-center border-[#1d2536] space-y-2">
            <div className="inline-flex p-2 rounded-full bg-red-950/40 border border-red-500/30 mb-1">
              <div className="w-6 h-6 border-2 border-[#ff1e42] border-t-transparent rounded-full animate-spin" />
            </div>
            <p className="font-arcade text-xs sm:text-sm font-bold text-white uppercase tracking-wider">
              WAITING FOR GAME MASTER LAUNCH
            </p>
            <p className="font-tech text-xs text-[#8b9bb4]">
              {allJoined
                ? 'All operatives synchronized. Stand by for Round 1 blueprint decryption.'
                : `Awaiting ${teamSize - joinedCount} remaining operative${teamSize - joinedCount !== 1 ? 's' : ''} to report.`}
            </p>
          </div>
        )}

        {/* Mission Footer Rules & Leave Button */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-xs font-tech text-[#8b9bb4]">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-[#ff1e42]" />
            <span>ROUND 1: 4-MINUTE BLUEPRINT DECRYPTION</span>
          </div>

          <button
            id="player-leave-btn"
            onClick={handleLeave}
            className="flex items-center gap-1.5 text-[#8b9bb4] hover:text-red-400 transition-colors font-arcade text-xs uppercase cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>ABORT TERMINAL</span>
          </button>
        </div>
      </div>
    </div>
  );
}
