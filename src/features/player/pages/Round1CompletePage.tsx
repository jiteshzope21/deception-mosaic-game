/**
 * MOSAIC — Round 1 Complete Page (Player View)
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle, Puzzle } from 'lucide-react';
import { useAuth } from '@/app/providers/AuthContext';
import { getPlayerGameState } from '@/services/gameService';
import { GAME_PHASE } from '@/types/enums';

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
      setUnlockedCount(res.data.puzzlePieces.filter((p) => p.isUnlocked).length);
      setTotalPieces(res.data.puzzlePieces.length);
      setResult(res.data.result);
      setIsLoaded(true);
      // Redirect back if game hasn't even started
      if (res.data.phase === GAME_PHASE.LOBBY) navigate('/player/lobby', { replace: true });
    }
    void load();
  }, [gameId, navigate]);

  const puzzleSuccess = unlockedCount === totalPieces && totalPieces > 0;

  return (
    <div className="min-h-screen bg-mosaic-dark flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center">
        <div className="bg-mosaic-surface border border-mosaic-border rounded-2xl p-8 shadow-xl">
          {!isLoaded ? (
            <div className="py-8">
              <div className="w-8 h-8 border-2 border-mosaic-accent border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          ) : (
            <>
              {puzzleSuccess ? (
                <CheckCircle className="w-16 h-16 text-emerald-400 mx-auto mb-4" />
              ) : (
                <XCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
              )}

              <h1 className="text-2xl font-bold text-white mb-2">
                {puzzleSuccess ? 'Puzzle Solved!' : 'Round 1 Over'}
              </h1>

              <div className="flex items-center justify-center gap-2 mb-4">
                <Puzzle className="w-4 h-4 text-mosaic-accent" />
                <span className="text-mosaic-muted text-sm">
                  {unlockedCount}/{totalPieces} pieces unlocked
                </span>
              </div>

              {result === 'ROUND_1_FAILED' && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-300 mb-4">
                  A player ran out of lives. Round 1 ended.
                </div>
              )}

              <p className="text-mosaic-muted text-sm mt-4">
                Waiting for the Game Master to continue...
              </p>
              <div className="mt-3 w-6 h-6 border-2 border-mosaic-accent/50 border-t-mosaic-accent rounded-full animate-spin mx-auto" />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
