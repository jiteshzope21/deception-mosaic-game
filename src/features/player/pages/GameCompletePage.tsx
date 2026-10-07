/**
 * MOSAIC — Game Complete Page (Player View)
 *
 * Shown when the game ends. Reveals:
 * - Win/Loss result
 * - Who the Imposter was
 * - Player roles revealed
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, Skull, Shield, AlertTriangle, CheckCircle } from 'lucide-react';
import { useAuth } from '@/app/providers/AuthContext';
import { getPlayerGameState, type PlayerGameStateData } from '@/services/gameService';
import { GAME_PHASE, GAME_RESULT } from '@/types/enums';

export default function GameCompletePage() {
  const { playerContext } = useAuth();
  const navigate = useNavigate();
  const gameId = playerContext?.game_id ?? '';

  const [state, setState] = useState<PlayerGameStateData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!gameId) { navigate('/', { replace: true }); return; }
    async function load() {
      const res = await getPlayerGameState(gameId);
      if (res.success) {
        setState(res.data);
        if (res.data.phase !== GAME_PHASE.GAME_COMPLETE) {
          // Not complete yet, redirect to appropriate phase
          const phase = res.data.phase;
          if (phase === GAME_PHASE.LOBBY) navigate('/player/lobby', { replace: true });
          else if (phase === GAME_PHASE.ROUND_1_ACTIVE) navigate('/player/round1', { replace: true });
          else if (phase === GAME_PHASE.ROUND_1_COMPLETE) navigate('/player/round1-complete', { replace: true });
          else if (phase === GAME_PHASE.TRANSITION) navigate('/player/transition', { replace: true });
          else navigate('/player/round2', { replace: true });
        }
      }
      setLoading(false);
    }
    void load();
  }, [gameId, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-mosaic-dark flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-mosaic-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!state) return null;

  const result = state.result;
  const summary = (state as any).completedSummary;
  const isCrewmatesWin = result === GAME_RESULT.CREWMATES_WIN;
  const isImposterWin = result === GAME_RESULT.IMPOSTER_WIN_KILLS || result === GAME_RESULT.IMPOSTER_WIN_TIME;

  const resultLabel: Record<string, string> = {
    CREWMATES_WIN: 'Crewmates Win! 🎉',
    IMPOSTER_WIN_KILLS: 'Imposter Wins!',
    IMPOSTER_WIN_TIME: 'Imposter Wins by Time!',
    ROUND_1_FAILED: 'Round 1 Failed',
  };
  const resultDesc: Record<string, string> = {
    CREWMATES_WIN: 'The Imposter was correctly identified and voted out. Well played, crew!',
    IMPOSTER_WIN_KILLS: 'The Imposter successfully eliminated 2 crewmates and survived the vote.',
    IMPOSTER_WIN_TIME: 'The Imposter survived all 7 minutes without being caught.',
    ROUND_1_FAILED: 'The team ran out of lives or time in Round 1.',
  };

  return (
    <div className="min-h-screen bg-mosaic-dark flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-4">
        {/* Result Card */}
        <div
          className={`rounded-2xl p-8 border-2 text-center shadow-2xl ${
            isCrewmatesWin
              ? 'bg-gradient-to-br from-emerald-950 to-mosaic-surface border-emerald-500/60 shadow-emerald-900/30'
              : isImposterWin
              ? 'bg-gradient-to-br from-red-950 to-mosaic-surface border-red-500/60 shadow-red-900/30'
              : 'bg-mosaic-surface border-mosaic-border'
          }`}
        >
          <div className="mb-4">
            {isCrewmatesWin ? (
              <Trophy className="w-20 h-20 text-yellow-400 mx-auto" />
            ) : isImposterWin ? (
              <Skull className="w-20 h-20 text-red-400 mx-auto" />
            ) : (
              <CheckCircle className="w-20 h-20 text-mosaic-muted mx-auto" />
            )}
          </div>
          <h1 className={`text-3xl font-black mb-3 ${
            isCrewmatesWin ? 'text-emerald-300' : isImposterWin ? 'text-red-300' : 'text-white'
          }`}>
            {resultLabel[result ?? ''] ?? 'Game Over'}
          </h1>
          <p className="text-mosaic-muted text-sm">
            {resultDesc[result ?? ''] ?? ''}
          </p>
        </div>

        {/* Imposter Reveal */}
        {summary?.imposterName && (
          <div className="bg-mosaic-surface border border-red-700/40 rounded-xl p-5 text-center">
            <div className="flex items-center justify-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <span className="text-xs font-semibold uppercase tracking-widest text-red-400">The Imposter Was</span>
            </div>
            <div className="text-2xl font-black text-red-300">{summary.imposterName}</div>
          </div>
        )}

        {/* Player Roles */}
        {summary?.players && summary.players.length > 0 && (
          <div className="bg-mosaic-surface border border-mosaic-border rounded-xl p-4">
            <div className="text-xs font-semibold uppercase tracking-widest text-mosaic-muted mb-3">Player Roles</div>
            <div className="space-y-2">
              {summary.players.map((p: { id: string; playerName: string; role: string; status: string }) => (
                <div key={p.id} className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-2">
                    {p.role === 'IMPOSTER' ? (
                      <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                    ) : (
                      <Shield className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    )}
                    <span className={`font-medium text-sm ${p.status === 'ELIMINATED' ? 'line-through text-mosaic-muted' : 'text-white'}`}>
                      {p.playerName}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                      p.role === 'IMPOSTER'
                        ? 'bg-red-500/10 text-red-400 border-red-500/30'
                        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    }`}>
                      {p.role === 'IMPOSTER' ? 'Imposter' : 'Crewmate'}
                    </span>
                    {p.status === 'ELIMINATED' && (
                      <span className="text-xs text-mosaic-muted">✗</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-center text-mosaic-muted text-xs">
          Wait for the Game Master to announce the results.
        </p>
      </div>
    </div>
  );
}
