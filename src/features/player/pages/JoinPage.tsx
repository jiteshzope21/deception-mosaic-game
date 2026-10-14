/**
 * MOSAIC — Player Name Selection (Join) Page
 *
 * Players join using game code + selecting their pre-registered name.
 * Roster is fetched from the backend lobby. Claimed names are disabled.
 * Realtime updates dynamically update claimed statuses.
 */

import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, User, Loader2, CheckCircle2, Lock } from 'lucide-react';
import { validateGameCode } from '@/lib/validation/schemas';
import { useAuth } from '@/app/providers/AuthContext';
import { getPublicLobby, type LobbyPlayerData } from '@/services/gameService';
import { subscribeToEvent } from '@/lib/socket/socketClient';
import { SocketEvent, GAME_PHASE, type GamePhase } from '@/types/enums';

export default function JoinPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { joinPlayerSession } = useAuth();
  const gameCode = (searchParams.get('code') ?? '').toUpperCase().trim();

  const [players, setPlayers] = useState<LobbyPlayerData[]>([]);
  const [teamName, setTeamName] = useState<string>('');
  const [currentPhase, setCurrentPhase] = useState<GamePhase | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Validate code format
  useEffect(() => {
    if (!validateGameCode(gameCode)) {
      navigate('/', { replace: true });
    }
  }, [gameCode, navigate]);

  // Load public lobby
  useEffect(() => {
    let mounted = true;

    async function loadLobby() {
      setIsLoading(true);
      setError(null);
      const res = await getPublicLobby(gameCode);
      if (!mounted) return;

      if (!res.success) {
        setError(res.error.message || 'Game not found.');
        setIsLoading(false);
        return;
      }

      setTeamName(res.data.teamName);
      setPlayers(res.data.players);
      setCurrentPhase(res.data.phase);
      setIsLoading(false);
    }

    if (validateGameCode(gameCode)) {
      void loadLobby();
    }

    // Realtime lobby updates
    const unsub = subscribeToEvent<any>(SocketEvent.LOBBY_UPDATE, (data) => {
      if (!mounted) return;
      if (data && Array.isArray(data.players)) {
        setPlayers(data.players);
      }
      if (data && data.phase) {
        setCurrentPhase(data.phase);
      }
    });

    const unsubPhase = subscribeToEvent<{ to: GamePhase }>(SocketEvent.PHASE_CHANGED, (data) => {
      if (!mounted) return;
      if (data && data.to) {
        setCurrentPhase(data.to);
      }
    });

    return () => {
      mounted = false;
      unsub();
      unsubPhase();
    };
  }, [gameCode]);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedName) {
      setError('Please select your name.');
      return;
    }

    setIsJoining(true);
    setError(null);

    const result = await joinPlayerSession(gameCode, selectedName);

    if (result.success) {
      if (
        currentPhase === GAME_PHASE.TRANSITION ||
        currentPhase === GAME_PHASE.ROUND_2_ACTIVE ||
        currentPhase === GAME_PHASE.BODY_REPORT ||
        currentPhase === GAME_PHASE.MOVE_TO_VOTING ||
        currentPhase === GAME_PHASE.VOTING
      ) {
        navigate('/player/round2', { replace: true });
      } else if (currentPhase === GAME_PHASE.ROUND_1_ACTIVE) {
        navigate('/player/round1', { replace: true });
      } else if (currentPhase === GAME_PHASE.ROUND_1_COMPLETE) {
        navigate('/player/round1-complete', { replace: true });
      } else if (currentPhase === GAME_PHASE.GAME_COMPLETE) {
        navigate('/player/complete', { replace: true });
      } else {
        navigate('/player/lobby', { replace: true });
      }
    } else {
      setError(result.error || 'Failed to join game.');
      setIsJoining(false);
    }
  }

  const selectedPlayer = players.find((p) => p.playerName === selectedName);

  return (
    <div className="min-h-screen arcade-corridor-bg flex flex-col items-center justify-center p-4 sm:p-6 md:p-8 relative overflow-x-hidden">
      {/* Background arcade grid */}
      <div className="absolute inset-0 arcade-grid opacity-40 pointer-events-none" />

      {/* Corridor ambient glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 right-1/4 w-96 h-80 bg-red-600/10 rounded-full blur-[110px]" />
        <div className="absolute bottom-0 left-1/4 w-96 h-80 bg-cyan-500/10 rounded-full blur-[110px]" />
      </div>

      <div className="relative w-full max-w-md sm:max-w-lg md:max-w-xl z-10 space-y-5">
        {/* Top Navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1.5 text-xs font-arcade font-bold tracking-wider text-[#8b9bb4] hover:text-[#fff1e6] transition-colors cursor-pointer px-3 py-1.5 rounded-lg bg-[#0d1017] border border-[#1d2536] hover:border-[#8b9bb4]"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-[#ff1e42]" />
            <span>TERMINAL HUB</span>
          </button>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/60 border border-[#1d2536]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00e5ff] animate-ping" />
            <span className="font-arcade text-[10px] text-[#00e5ff] tracking-widest uppercase">
              NODE ACTIVE
            </span>
          </div>
        </div>

        {/* Header HUD */}
        <div className="text-center space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-black/60 border border-[#1d2536] backdrop-blur-md mb-1">
            <span className="font-arcade text-xs font-bold tracking-widest text-[#8b9bb4]">ADG</span>
            <span className="text-[#ff1e42] glow-text-red font-black text-xs">✕</span>
            <span className="font-arcade text-xs font-bold tracking-widest text-[#fff1e6]">MOSAIC</span>
          </div>

          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-wider text-[#fff1e6] glow-text-red leading-tight">
            OPERATIVE IDENTIFICATION
          </h1>

          <div className="flex items-center justify-center gap-2 pt-1">
            {teamName && (
              <span className="font-tech text-xs sm:text-sm font-bold uppercase tracking-wider text-[#8b9bb4]">
                SQUADRON: <span className="text-[#fff1e6]">{teamName}</span>
              </span>
            )}
            <span className="font-arcade text-xs font-bold px-2.5 py-0.5 rounded-md bg-[#06070a] border border-[#00e5ff]/40 text-[#00e5ff] tracking-wider">
              {gameCode}
            </span>
          </div>
        </div>

        {/* Operative selection card */}
        <div className="arcade-card p-6 sm:p-7 relative">
          <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-[#00e5ff] to-transparent opacity-80" />

          <div className="flex items-center justify-between mb-4 border-b border-[#1d2536] pb-3">
            <h2 className="font-arcade text-xs sm:text-sm font-bold text-[#fff1e6] uppercase tracking-wider">
              SELECT YOUR OPERATIVE PROFILE
            </h2>
            <span className="font-tech text-xs text-[#8b9bb4]">
              {players.filter((p) => !p.isClaimed).length} SLOTS OPEN
            </span>
          </div>

          {isLoading ? (
            <div className="py-12 text-center space-y-3">
              <Loader2 className="w-8 h-8 text-[#00e5ff] animate-spin mx-auto" />
              <p className="font-tech text-xs uppercase tracking-widest text-[#8b9bb4]">
                ACCESSING SQUADRON MANIFEST...
              </p>
            </div>
          ) : players.length === 0 ? (
            <div className="py-8 text-center space-y-2">
              <User className="w-12 h-12 text-[#8b9bb4] mx-auto opacity-40" />
              <p className="font-tech text-sm text-[#8b9bb4]">
                No registered operative slots detected for this mission code.
              </p>
            </div>
          ) : (
            <form onSubmit={handleJoin} id="player-name-form" className="space-y-4">
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {players.map((p) => {
                  const isClaimed = p.isClaimed;
                  const isSelected = selectedName === p.playerName;

                  return (
                    <button
                      key={p.id || p.playerName}
                      type="button"
                      disabled={isClaimed}
                      onClick={() => {
                        if (!isClaimed) {
                          setSelectedName(p.playerName);
                          setError(null);
                        }
                      }}
                      className={`w-full px-4 py-3 sm:py-3.5 rounded-xl border text-left font-tech text-sm sm:text-base font-bold transition-all flex items-center justify-between ${
                        isClaimed
                          ? 'bg-[#06070a]/60 border-[#1d2536]/40 text-[#8b9bb4]/40 cursor-not-allowed opacity-50'
                          : isSelected
                          ? 'bg-[#ff1e42]/15 border-[#ff1e42] text-[#fff1e6] shadow-md shadow-[#ff1e42]/20 cursor-pointer'
                          : 'bg-[#06070a] border-[#1d2536] text-[#8b9bb4] hover:border-[#00e5ff]/60 hover:text-[#fff1e6] cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-2 h-2 rounded-full ${
                            isClaimed
                              ? 'bg-zinc-700'
                              : isSelected
                              ? 'bg-[#ff1e42] shadow-[0_0_8px_#ff1e42]'
                              : 'bg-[#00e5ff]'
                          }`}
                        />
                        <span className="tracking-wide">{p.playerName}</span>
                      </div>

                      {isClaimed ? (
                        <span className="flex items-center gap-1 font-arcade text-[10px] px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-500 uppercase">
                          <Lock className="w-2.5 h-2.5" /> CLAIMED
                        </span>
                      ) : isSelected ? (
                        <div className="flex items-center gap-1 font-arcade text-[10px] text-[#ff1e42] tracking-wider uppercase">
                          <span>ENGAGED</span>
                          <CheckCircle2 className="w-4 h-4 text-[#ff1e42]" />
                        </div>
                      ) : (
                        <span className="font-arcade text-[10px] text-zinc-600 uppercase">READY</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {error && (
                <div className="p-3 bg-red-950/40 border border-red-500/50 rounded-xl text-xs font-tech text-red-300">
                  {error}
                </div>
              )}

              <button
                id="player-join-btn"
                type="submit"
                disabled={isJoining || !selectedName || selectedPlayer?.isClaimed}
                className="arcade-btn-primary w-full py-4 rounded-xl flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed text-sm sm:text-base tracking-wider"
              >
                {isJoining ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>AUTHENTICATING OPERATIVE...</span>
                  </>
                ) : (
                  <span>
                    {selectedName ? `ENGAGE AS ${selectedName.toUpperCase()}` : 'SELECT AN OPERATIVE TO ENGAGE'}
                  </span>
                )}
              </button>
            </form>
          )}
        </div>

        <p className="text-center font-tech text-xs text-[#8b9bb4]">
          Zero passwords required. Select your registered operative designation to claim your slot.
        </p>
      </div>
    </div>
  );
}
