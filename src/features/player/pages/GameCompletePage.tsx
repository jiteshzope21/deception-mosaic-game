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
import { Trophy, Skull, Shield, AlertTriangle, CheckCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useAuth } from '@/app/providers/AuthContext';
import { getPlayerGameState, type PlayerGameStateData } from '@/services/gameService';
import { GAME_PHASE, GAME_RESULT } from '@/types/enums';

export default function GameCompletePage() {
  const { playerContext, finishPlayerSession } = useAuth();
  const navigate = useNavigate();
  const gameId = playerContext?.game_id ?? '';

  const [state, setState] = useState<PlayerGameStateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFinishing, setIsFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);

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

  async function handleFinish() {
    if (isFinishing) return;
    setIsFinishing(true);
    setFinishError(null);

    try {
      await finishPlayerSession();
      navigate('/', { replace: true });
    } catch (err: any) {
      console.error('Error finishing player session:', err);
      setFinishError('Session cleanup encountered an issue. You can still return to login safely.');
      // Safe fallback navigation
      navigate('/', { replace: true });
    } finally {
      setIsFinishing(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-corridor flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-neon-red border-t-transparent rounded-full animate-spin shadow-[0_0_15px_rgba(255,30,66,0.5)]" />
      </div>
    );
  }

  if (!state) return null;

  const result = state.result;
  const summary = (state as any).completedSummary;
  const isCrewmatesWin = result === GAME_RESULT.CREWMATES_WIN;
  const isImposterWin = result === GAME_RESULT.IMPOSTER_WIN_KILLS || result === GAME_RESULT.IMPOSTER_WIN_TIME;

  const resultTitle = isCrewmatesWin
    ? 'CREWMATES WIN'
    : isImposterWin
    ? 'IMPOSTER WINS'
    : result === 'ROUND_1_FAILED'
    ? 'ROUND 1 FAILED'
    : 'GAME OVER';

  const resultDesc: Record<string, string> = {
    CREWMATES_WIN: 'The Imposter was uncovered and neutralized. Sector secured, crewmates.',
    IMPOSTER_WIN_KILLS: 'The Imposter executed lethal sabotage, eliminating 2 crewmates and evading justice.',
    IMPOSTER_WIN_TIME: 'The Imposter evaded capture across all operational cycles.',
    ROUND_1_FAILED: 'Operational lives exhausted in Sector 1 decrypt phase.',
  };

  const isGameComplete = state.phase === GAME_PHASE.GAME_COMPLETE;

  return (
    <div className="min-h-screen arcade-corridor-bg text-bone-cream relative overflow-hidden flex flex-col items-center justify-center p-4">
      <div className="absolute inset-0 arcade-grid opacity-30 pointer-events-none" />

      <div className="w-full max-w-md space-y-4 relative z-10">
        {/* Top ADG X MOSAIC Sub-badge */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-tactical-slate/90 border border-steel-border/80 rounded-full text-[11px] font-arcade tracking-widest text-muted-steel uppercase">
            <span>ADG</span>
            <span className="text-neon-red">✕</span>
            <span>MOSAIC</span>
            <span className="w-1 h-1 rounded-full bg-neon-red animate-ping" />
          </div>
        </div>

        {/* Result Card */}
        <div
          className={`arcade-card p-6 sm:p-8 text-center relative overflow-hidden ${
            isCrewmatesWin
              ? 'border-glow-cyan'
              : isImposterWin
              ? 'border-glow-red'
              : 'border-steel-border'
          }`}
        >
          <div className="mb-3 inline-flex p-4 rounded-2xl bg-corridor/90 border border-steel-border shadow-inner">
            {isCrewmatesWin ? (
              <Trophy className="w-16 h-16 text-electric-cyan drop-shadow-[0_0_15px_rgba(0,229,255,0.6)]" />
            ) : isImposterWin ? (
              <Skull className="w-16 h-16 text-neon-red drop-shadow-[0_0_15px_rgba(255,30,66,0.7)] animate-pulse" />
            ) : (
              <CheckCircle className="w-16 h-16 text-muted-steel" />
            )}
          </div>
          <h1
            className={`text-5xl sm:text-6xl font-display uppercase tracking-wider mb-2 ${
              isCrewmatesWin ? 'text-electric-cyan glow-text-cyan' : isImposterWin ? 'text-neon-red glow-text-red' : 'text-bone-cream'
            }`}
          >
            {resultTitle}
          </h1>
          <p className="text-muted-steel text-sm sm:text-base font-tech leading-relaxed">
            {resultDesc[result ?? ''] ?? ''}
          </p>
        </div>

        {/* Imposter Reveal */}
        {summary?.imposterName && (
          <div className="arcade-card p-5 text-center border-glow-red relative overflow-hidden">
            <div className="flex items-center justify-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-neon-red" />
              <span className="text-xs font-arcade font-bold uppercase tracking-widest text-neon-red">
                IMPOSTER IDENTITY REVEALED
              </span>
            </div>
            <div className="text-3xl sm:text-4xl font-display uppercase tracking-wider text-bone-cream glow-text-red">
              {summary.imposterName}
            </div>
            <p className="text-[11px] font-arcade text-muted-steel uppercase tracking-widest mt-1">
              TRUST NO ONE
            </p>
          </div>
        )}

        {/* Player Roles */}
        {summary?.players && summary.players.length > 0 && (
          <div className="arcade-card-elevated p-4 sm:p-5 border-steel-border">
            <div className="text-xs font-arcade font-bold uppercase tracking-widest text-muted-steel mb-3 flex items-center justify-between">
              <span>SQUADRON DOSSIER REVELATION</span>
              <span>{summary.players.length} OPERATIVES</span>
            </div>
            <div className="space-y-2">
              {summary.players.map((p: { id: string; playerName: string; role: string; status: string }) => (
                <div key={p.id} className="flex items-center justify-between p-2 rounded-xl bg-corridor/90 border border-steel-border/60">
                  <div className="flex items-center gap-2">
                    {p.role === 'IMPOSTER' ? (
                      <AlertTriangle className="w-4 h-4 text-neon-red flex-shrink-0" />
                    ) : (
                      <Shield className="w-4 h-4 text-electric-cyan flex-shrink-0" />
                    )}
                    <span className={`font-tech font-semibold text-sm ${p.status === 'ELIMINATED' ? 'line-through text-muted-steel/60' : 'text-bone-cream'}`}>
                      {p.playerName}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-arcade font-bold uppercase px-2 py-0.5 rounded-full border ${
                      p.role === 'IMPOSTER'
                        ? 'bg-neon-red/10 text-neon-red border-neon-red/30'
                        : 'bg-electric-cyan/10 text-electric-cyan border-electric-cyan/30'
                    }`}>
                      {p.role === 'IMPOSTER' ? 'IMPOSTER' : 'CREWMATE'}
                    </span>
                    {p.status === 'ELIMINATED' && (
                      <span className="text-[10px] text-neon-red font-arcade font-bold">KIA</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Finish Button - Only visible when game is genuinely complete */}
        {isGameComplete && (
          <div className="pt-2">
            {finishError && (
              <div className="mb-3 p-3 bg-neon-red/10 border border-neon-red/40 rounded-xl text-center">
                <p className="text-xs text-neon-red font-tech mb-2">{finishError}</p>
                <button
                  type="button"
                  onClick={() => navigate('/', { replace: true })}
                  className="text-xs text-electric-cyan underline font-arcade uppercase cursor-pointer"
                >
                  RETURN TO LOGIN
                </button>
              </div>
            )}

            <button
              id="player-finish-btn"
              type="button"
              disabled={isFinishing}
              onClick={handleFinish}
              className="arcade-btn-primary w-full py-4 text-base font-arcade uppercase tracking-widest flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isFinishing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>TERMINATING SESSION...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  <span>FINISH & RETURN TO HUB</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
