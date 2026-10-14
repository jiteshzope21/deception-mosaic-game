/**
 * MOSAIC — Round 1 Complete Page (Player View)
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle, Puzzle } from 'lucide-react';
import { useAuth } from '@/app/providers/AuthContext';
import { getPlayerGameState } from '@/services/gameService';
import { GAME_PHASE } from '@/types/enums';
import { subscribeToEvent } from '@/lib/socket/socketClient';
import { SOCKET_EVENT } from '@/types/enums';

export default function Round1CompletePage() {
  const { playerContext } = useAuth();
  const navigate = useNavigate();
  const gameId = playerContext?.game_id ?? '';

  const [unlockedCount, setUnlockedCount] = useState(0);
  const [totalPieces, setTotalPieces] = useState(0);
  const [result, setResult] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!gameId) return;
    async function load() {
      const res = await getPlayerGameState(gameId);
      if (!res.success) return;
      const data = res.data;
      setUnlockedCount(data.puzzlePieces.filter((p) => p.isUnlocked).length);
      setTotalPieces(data.puzzlePieces.length);
      setResult(data.result);
      setIsLoaded(true);
      // Navigate to correct current phase
      if (data.phase === GAME_PHASE.LOBBY) navigate('/player/lobby', { replace: true });
      else if (
        data.phase === GAME_PHASE.TRANSITION ||
        data.phase === GAME_PHASE.ROUND_2_ACTIVE ||
        data.phase === GAME_PHASE.BODY_REPORT ||
        data.phase === GAME_PHASE.MOVE_TO_VOTING ||
        data.phase === GAME_PHASE.VOTING
      ) {
        navigate('/player/round2', { replace: true });
      } else if (data.phase === GAME_PHASE.GAME_COMPLETE) {
        navigate('/player/complete', { replace: true });
      }
    }
    void load();
  }, [gameId, navigate]);

  // Listen for GM triggering transition to Phase 3
  useEffect(() => {
    const unsub = subscribeToEvent<{ to: string }>(SOCKET_EVENT.PHASE_CHANGED, (data) => {
      if (data.to === GAME_PHASE.TRANSITION || data.to === GAME_PHASE.ROUND_2_ACTIVE) {
        navigate('/player/round2', { replace: true });
      } else if (data.to === GAME_PHASE.GAME_COMPLETE) {
        navigate('/player/complete', { replace: true });
      }
    });
    return unsub;
  }, [navigate]);

  const puzzleSuccess = unlockedCount === totalPieces && totalPieces > 0;

  return (
    <div className="min-h-screen arcade-corridor-bg flex flex-col items-center justify-center p-4 sm:p-6 md:p-8 relative overflow-x-hidden">
      {/* Background arcade grid */}
      <div className="absolute inset-0 arcade-grid opacity-40 pointer-events-none" />

      <div className="w-full max-w-md sm:max-w-lg md:max-w-xl text-center space-y-4 relative z-10">
        {/* Event Header Brand */}
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full border border-[#1d2536] bg-black/60 backdrop-blur-md">
            <span className="font-arcade text-xs tracking-[0.25em] text-[#8b9bb4] font-bold">ADG</span>
            <span className="text-[#ff1e42] font-black text-xs">✕</span>
            <span className="font-arcade text-xs tracking-[0.25em] text-[#fff1e6] font-bold">MOSAIC</span>
          </div>
        </div>

        <div className="arcade-card p-6 sm:p-8 relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-[#00e5ff] to-transparent opacity-80" />

          {!isLoaded ? (
            <div className="py-12">
              <div className="w-10 h-10 border-2 border-[#00e5ff] border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="font-tech text-xs text-[#8b9bb4] uppercase tracking-widest mt-3">SYNCING CIPHER MATRIX...</p>
            </div>
          ) : (
            <>
              <div className="mb-4">
                {puzzleSuccess ? (
                  <div className="w-20 h-20 rounded-2xl bg-cyan-950/60 border border-[#00e5ff]/40 flex items-center justify-center mx-auto shadow-lg shadow-cyan-500/20">
                    <CheckCircle className="w-12 h-12 text-[#00e5ff] animate-bounce" />
                  </div>
                ) : (
                  <div className="w-20 h-20 rounded-2xl bg-red-950/60 border border-[#ff1e42]/40 flex items-center justify-center mx-auto shadow-lg shadow-red-500/20">
                    <XCircle className="w-12 h-12 text-[#ff1e42] animate-pulse" />
                  </div>
                )}
              </div>

              <h1 className={`font-display text-4xl sm:text-5xl font-black mb-2 tracking-wider ${
                puzzleSuccess ? 'text-[#00e5ff] glow-text-cyan' : 'text-[#ff1e42] glow-text-red'
              }`}>
                {puzzleSuccess ? 'BLUEPRINT DECRYPTED!' : 'ROUND 1 CONCLUDED'}
              </h1>

              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#06070a] border border-[#1d2536] mb-4">
                <Puzzle className="w-4 h-4 text-[#00e5ff]" />
                <span className="font-tech text-xs sm:text-sm text-[#8b9bb4] font-bold tracking-wider uppercase">
                  {unlockedCount}/{totalPieces} PIECES UNLOCKED
                </span>
              </div>

              {result === 'ROUND_1_FAILED' && (
                <div className="p-3 bg-red-950/40 border border-red-500/50 rounded-xl text-xs sm:text-sm text-red-300 mb-4 font-tech">
                  An operative exhausted all lives. Round 1 terminated.
                </div>
              )}

              <p className="font-tech text-xs sm:text-sm text-[#8b9bb4] mt-2 tracking-wide uppercase">
                Waiting for the Game Master to initiate Round 2 transition...
              </p>
              <div className="mt-4 w-6 h-6 border-2 border-[#00e5ff]/30 border-t-[#00e5ff] rounded-full animate-spin mx-auto" />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
