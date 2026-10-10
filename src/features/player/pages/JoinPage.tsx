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
import { APP_CONFIG } from '@/app/config/constants';
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
    <div className="min-h-screen bg-mosaic-dark flex flex-col items-center justify-center p-4">
      <div className="relative w-full max-w-md">
        {/* Back button */}
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-mosaic-muted hover:text-white transition-colors mb-6 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Back</span>
        </button>

        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-mosaic-accent to-mosaic-purple mb-3 shadow-lg shadow-mosaic-accent/20">
            <span className="text-white font-bold text-lg">D</span>
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">{APP_CONFIG.name}</h1>
          {teamName && (
            <p className="text-mosaic-muted text-sm font-medium">Team: <span className="text-white">{teamName}</span></p>
          )}
          <div className="inline-flex items-center gap-2 mt-2 px-3 py-1 bg-mosaic-accent/10 border border-mosaic-accent/30 rounded-full">
            <span className="text-mosaic-accent text-sm font-mono font-semibold tracking-wider">{gameCode}</span>
          </div>
        </div>

        {/* Name selection card */}
        <div className="bg-mosaic-surface border border-mosaic-border rounded-2xl p-6 shadow-xl">
          <h2 className="text-white font-semibold text-lg mb-1">Select Your Name</h2>
          <p className="text-mosaic-muted text-xs mb-5">
            Choose your assigned name to join or resume your active game.
          </p>

          {isLoading ? (
            <div className="py-12 text-center">
              <Loader2 className="w-8 h-8 text-mosaic-accent animate-spin mx-auto mb-3" />
              <p className="text-mosaic-muted text-sm">Fetching team roster...</p>
            </div>
          ) : players.length === 0 ? (
            <div className="py-8 text-center">
              <User className="w-12 h-12 text-mosaic-muted mx-auto mb-3 opacity-50" />
              <p className="text-mosaic-muted text-sm">No registered player slots found for this code.</p>
            </div>
          ) : (
            <form onSubmit={handleJoin} id="player-name-form">
              <div className="space-y-2.5 mb-5 max-h-72 overflow-y-auto pr-1">
                {players.map((p) => {
                  const isClaimed = p.isClaimed;
                  const isSelected = selectedName === p.playerName;

                  return (
                    <button
                      key={p.id || p.playerName}
                      type="button"
                      onClick={() => {
                        setSelectedName(p.playerName);
                        setError(null);
                      }}
                      className={`w-full px-4 py-3.5 rounded-xl border text-left font-medium transition-all flex items-center justify-between cursor-pointer ${
                        isSelected
                          ? 'bg-mosaic-accent/15 border-mosaic-accent text-white shadow-sm shadow-mosaic-accent/10'
                          : isClaimed
                          ? 'bg-mosaic-dark/80 border-mosaic-border/70 text-zinc-300 hover:border-mosaic-accent/40'
                          : 'bg-mosaic-dark border-mosaic-border text-mosaic-muted hover:border-mosaic-accent/40 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <User className={`w-4 h-4 shrink-0 ${isSelected ? 'text-mosaic-accent' : 'text-mosaic-muted'}`} />
                        <span className={isSelected ? 'text-white font-semibold' : ''}>{p.playerName}</span>
                      </div>
                      {isClaimed ? (
                        <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700">
                          <Lock className="w-3 h-3 text-mosaic-accent" /> Resume
                        </span>
                      ) : isSelected ? (
                        <CheckCircle2 className="w-4 h-4 text-mosaic-accent" />
                      ) : null}
                    </button>
                  );
                })}
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              <button
                id="player-join-btn"
                type="submit"
                disabled={isJoining || !selectedName}
                className="w-full py-3.5 bg-gradient-to-r from-mosaic-accent to-mosaic-purple text-white font-semibold rounded-xl hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-mosaic-accent/20"
              >
                {isJoining ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Connecting...</span>
                  </>
                ) : selectedPlayer?.isClaimed ? (
                  'Resume Game'
                ) : (
                  'Join Game'
                )}
              </button>
            </form>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-mosaic-muted">
          No passwords required. Select your registered name to enter or resume your game.
        </p>
      </div>
    </div>
  );
}
