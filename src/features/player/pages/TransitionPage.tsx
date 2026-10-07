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
      // Navigate if already past transition
      if (
        res.data.phase === GAME_PHASE.ROUND_2_ACTIVE ||
        res.data.phase === GAME_PHASE.BODY_REPORT ||
        res.data.phase === GAME_PHASE.MOVE_TO_VOTING ||
        res.data.phase === GAME_PHASE.VOTING
      ) {
        navigate('/player/round2', { replace: true });
      } else if (res.data.phase === GAME_PHASE.GAME_COMPLETE) {
        navigate('/player/complete', { replace: true });
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
      <div className="min-h-screen bg-mosaic-dark flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-mosaic-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const mins = Math.floor(secsLeft / 60);
  const secs = secsLeft % 60;

  return (
    <div className="min-h-screen bg-mosaic-dark flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Transition Status Card */}
        <div className="rounded-2xl p-8 border-2 border-mosaic-accent/40 bg-gradient-to-br from-mosaic-surface via-mosaic-dark to-mosaic-surface shadow-2xl text-center">
          <div className="mb-4">
            <Shield className="w-16 h-16 text-mosaic-accent mx-auto animate-pulse" />
          </div>

          <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-mosaic-muted">
            Round 2 Preparation
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight mb-3">
            Transitioning to Round 2
          </h1>

          <p className="text-mosaic-muted text-sm leading-relaxed mb-4">
            Roles (1 Imposter, remaining Crewmates) and physical task zones are being assigned server-side.
          </p>

          <div className="p-3 bg-mosaic-dark/80 border border-mosaic-border/60 rounded-xl text-xs text-mosaic-accent font-medium">
            🔒 Roles and tasks remain secret until Round 2 begins.
          </div>
        </div>

        {/* Timer */}
        <div className="bg-mosaic-surface/60 border border-mosaic-border rounded-2xl p-5 text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-mosaic-muted" />
            <span className="text-xs font-semibold uppercase tracking-widest text-mosaic-muted">
              Round 2 Begins In
            </span>
          </div>
          <div className={`text-4xl font-mono font-black ${secsLeft <= 10 ? 'text-red-400 animate-pulse' : 'text-white'}`}>
            {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
          </div>
          <p className="text-xs text-mosaic-muted mt-2">Get ready to receive your secret assignment.</p>
        </div>
      </div>
    </div>
  );
}
