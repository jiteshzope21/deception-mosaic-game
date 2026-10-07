/**
 * MOSAIC — Player Landing Page
 *
 * Entry point for players. They enter the game code here.
 * Players do NOT create accounts — they just enter the game code,
 * then select their pre-registered name on the next screen.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Loader2 } from 'lucide-react';
import { joinGameSchema } from '../../../lib/validation/schemas';
import { normalizeGameCode } from '../../../lib/utils/helpers';
import { APP_CONFIG } from '../../../app/config/constants';

export default function LandingPage() {
  const navigate = useNavigate();
  const [gameCode, setGameCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  function handleCodeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    setGameCode(value);
    setError(null);
  }

  async function handleNext(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const normalized = normalizeGameCode(gameCode);

    // Quick format check
    const parseResult = joinGameSchema.pick({ game_code: true }).safeParse({ game_code: normalized });
    if (!parseResult.success) {
      setError(parseResult.error.issues[0]?.message ?? 'Invalid game code');
      return;
    }

    setIsChecking(true);
    // Pass the code to the join page for player name selection
    navigate(`/join?code=${encodeURIComponent(normalized)}`);
    setIsChecking(false);
  }

  return (
    <div className="min-h-screen bg-mosaic-dark flex flex-col items-center justify-center p-4">
      {/* Background accents */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/4 w-64 h-64 bg-mosaic-accent/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-1/4 w-64 h-64 bg-mosaic-purple/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm text-center">
        {/* Logo */}
        <div className="mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-mosaic-accent to-mosaic-purple shadow-2xl shadow-mosaic-accent/30 mb-6">
            <span className="text-white font-bold text-3xl">D</span>
          </div>
          <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">{APP_CONFIG.name}</h1>
          <p className="text-mosaic-accent text-sm font-medium uppercase tracking-widest mb-2">
            {APP_CONFIG.theme}
          </p>
          <p className="text-mosaic-muted text-sm">{APP_CONFIG.tagline}</p>
        </div>

        {/* Game code entry */}
        <div className="bg-mosaic-surface border border-mosaic-border rounded-2xl p-6 shadow-xl">
          <h2 className="text-white font-semibold mb-4">Enter Game Code</h2>

          <form onSubmit={handleNext} id="player-join-form">
            <div className="mb-4">
              <input
                id="game-code-input"
                type="text"
                value={gameCode}
                onChange={handleCodeChange}
                placeholder="MOSAIC-XXXX"
                maxLength={11}
                className="w-full px-4 py-4 bg-mosaic-dark border border-mosaic-border rounded-xl text-white text-center text-xl font-mono tracking-widest placeholder-mosaic-muted/30 focus:outline-none focus:ring-2 focus:ring-mosaic-accent focus:border-transparent transition-all uppercase"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
              />
              {error && (
                <p className="mt-2 text-sm text-red-400">{error}</p>
              )}
            </div>

            <button
              id="player-join-next-btn"
              type="submit"
              disabled={isChecking || gameCode.length === 0}
              className="w-full py-4 bg-gradient-to-r from-mosaic-accent to-mosaic-purple text-white font-semibold rounded-xl hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-lg shadow-mosaic-accent/20"
            >
              {isChecking ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Next
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* GM link */}
        <p className="mt-6 text-xs text-mosaic-muted">
          Game Master?{' '}
          <a
            href="/gm/login"
            className="text-mosaic-accent hover:underline"
          >
            Sign in here
          </a>
        </p>
      </div>
    </div>
  );
}
