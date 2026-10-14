/**
 * MOSAIC — Transition Page (Player View)
 *
 * Displayed during TRANSITION phase: shows the player their private role
 * and assigned physical task. Listens for phase change to Round 2.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Clock } from 'lucide-react';
import { useAuth } from '@/app/providers/AuthContext';
import { getPlayerGameState, type PlayerGameStateData } from '@/services/gameService';
import { GAME_PHASE } from '@/types/enums';
import { subscribeToEvent } from '@/lib/socket/socketClient';
import { SOCKET_EVENT } from '@/types/enums';

function useCountdown(endsAt: string | null | undefined) {
  const [secsLeft, setSecsLeft] = useState<number>(0);
  useEffect(() => {
    if (!endsAt) return;
    const update = () => {
      const diff = Math.max(0, Math.round((new Date(endsAt).getTime() - Date.now()) / 1000));
      setSecsLeft(diff);
    };
    update();
    const id = setInterval(update, 500);
    return () => clearInterval(id);
  }, [endsAt]);
  return secsLeft;
}

export default function TransitionPage() {
  const { playerContext } = useAuth();
  const navigate = useNavigate();
  const gameId = playerContext?.game_id ?? '';

  const [state, setState] = useState<PlayerGameStateData | null>(null);
  const [loading, setLoading] = useState(true);

  const secsLeft = useCountdown(state?.phaseEndsAt);

  useEffect(() => {
    if (!gameId) return;

    async function load() {
      const res = await getPlayerGameState(gameId);
      if (!res.success) return;
      setState(res.data);
      // Navigate to unified Round 2 page
      if (res.data.phase === GAME_PHASE.GAME_COMPLETE) {
        navigate('/player/complete', { replace: true });
      } else {
        navigate('/player/round2', { replace: true });
      }
      setLoading(false);
    }
    void load();
  }, [gameId, navigate]);

  // Listen for phase changes from server
  useEffect(() => {
    const unsub = subscribeToEvent<{ to: string }>(SOCKET_EVENT.PHASE_CHANGED, (data) => {
      if (
        data.to === GAME_PHASE.ROUND_2_ACTIVE ||
        data.to === GAME_PHASE.BODY_REPORT ||
        data.to === GAME_PHASE.MOVE_TO_VOTING ||
        data.to === GAME_PHASE.VOTING
      ) {
        navigate('/player/round2', { replace: true });
      } else if (data.to === GAME_PHASE.GAME_COMPLETE) {
        navigate('/player/complete', { replace: true });
      }
    });
    return unsub;
  }, [navigate]);

  useEffect(() => {
    const unsub = subscribeToEvent(SOCKET_EVENT.ROUND_2_STARTED, () => {
      navigate('/player/round2', { replace: true });
    });
    return unsub;
  }, [navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-corridor flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-neon-red border-t-transparent rounded-full animate-spin shadow-[0_0_15px_rgba(255,30,66,0.5)]" />
      </div>
    );
  }

  const mins = Math.floor(secsLeft / 60);
  const secs = secsLeft % 60;

  return (
    <div className="min-h-screen arcade-corridor-bg text-bone-cream relative overflow-hidden flex flex-col items-center justify-center p-4">
      <div className="absolute inset-0 arcade-grid opacity-30 pointer-events-none" />

      <div className="w-full max-w-md space-y-5 relative z-10">
        {/* Top ADG X MOSAIC Sub-badge */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-tactical-slate/90 border border-steel-border/80 rounded-full text-[11px] font-arcade tracking-widest text-muted-steel uppercase">
            <span>ADG</span>
            <span className="text-neon-red">✕</span>
            <span>MOSAIC</span>
            <span className="w-1 h-1 rounded-full bg-electric-cyan animate-ping" />
          </div>
        </div>

        {/* Transition Status Card */}
        <div className="arcade-card p-6 sm:p-8 text-center relative overflow-hidden border-glow-red">
          <div className="absolute -top-12 -right-12 w-28 h-28 bg-neon-red/10 rounded-full blur-2xl pointer-events-none" />

          <div className="mb-4 inline-flex p-3 rounded-xl bg-corridor/90 border border-neon-red/40 shadow-[0_0_20px_rgba(255,30,66,0.3)]">
            <Shield className="w-10 h-10 text-neon-red animate-pulse" />
          </div>

          <div className="text-[11px] font-arcade uppercase tracking-[0.25em] text-neon-red mb-1">
            ROUND 2 PREPARATION
          </div>
          <h1 className="text-4xl sm:text-5xl font-display uppercase tracking-wider text-bone-cream drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)] mb-2">
            TRANSITIONING
          </h1>

          <p className="text-muted-steel text-sm sm:text-base leading-relaxed mb-5 font-tech">
            Roles (1 Imposter, remaining Crewmates) and physical task sectors are being encrypted and dispatched.
          </p>

          <div className="p-3 bg-corridor/90 border border-steel-border rounded-xl text-xs sm:text-sm text-electric-cyan font-tech flex items-center justify-center gap-2 shadow-inner">
            <span className="text-neon-red">🔒</span>
            <span className="tracking-wide">Classified dossier remains sealed until Phase 2 initiation.</span>
          </div>
        </div>

        {/* Timer */}
        <div className="arcade-card-elevated p-5 sm:p-6 text-center border-steel-border">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-electric-cyan" />
            <span className="text-xs font-arcade uppercase tracking-widest text-muted-steel">
              ROUND 2 BEGINS IN
            </span>
          </div>
          <div
            className={`text-4xl sm:text-5xl font-arcade font-black tracking-widest ${
              secsLeft <= 10 ? 'text-neon-red glow-text-red animate-pulse' : 'text-bone-cream glow-text-cyan'
            }`}
          >
            {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
          </div>
          <p className="text-xs text-muted-steel/80 font-tech mt-2 uppercase tracking-wider">
            Prepare to authenticate your operative assignment.
          </p>
        </div>
      </div>
    </div>
  );
}

