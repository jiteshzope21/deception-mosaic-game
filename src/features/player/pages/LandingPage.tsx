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
    <div className="min-h-screen arcade-corridor-bg flex flex-col items-center justify-center p-4 sm:p-6 md:p-8 relative overflow-x-hidden">
      {/* Background arcade grid */}
      <div className="absolute inset-0 arcade-grid opacity-40 pointer-events-none" />

      {/* Corridor glow lights */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-72 bg-red-600/15 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-10 w-96 h-96 bg-cyan-500/10 rounded-full blur-[140px]" />
      </div>

      <div className="relative w-full max-w-md sm:max-w-lg md:max-w-xl text-center z-10 space-y-6">
        {/* Poster Brand Header */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-black/60 border border-[#1d2536] backdrop-blur-md">
            <span className="font-arcade text-xs sm:text-sm tracking-[0.3em] font-bold text-[#8b9bb4]">ADG</span>
            <span className="text-[#ff1e42] glow-text-red font-black text-sm">✕</span>
            <span className="font-arcade text-xs sm:text-sm tracking-[0.3em] font-bold text-[#fff1e6]">MOSAIC</span>
          </div>
          <p className="font-tech text-xs tracking-[0.35em] text-[#8b9bb4] uppercase font-semibold">
            AI DEVELOPERS GROUP PRESENTS
          </p>
        </div>

        {/* Hero Title & Slogans matching poster */}
        <div className="space-y-1">
          <p className="font-tech text-xs sm:text-sm tracking-[0.25em] text-[#8b9bb4] uppercase font-bold">
            ONE OF YOU ISN'T WHO THEY SEEM.
          </p>
          <h1 className="font-display text-7xl sm:text-8xl md:text-9xl font-bold tracking-wider text-[#fff1e6] glow-text-red leading-none select-none">
            DECEPTION
          </h1>
          <p className="font-tech text-sm sm:text-base tracking-[0.35em] text-[#ff1e42] glow-text-red font-bold uppercase">
            TRUST NO ONE.
          </p>
        </div>

        {/* Poster Mission Ticker */}
        <div className="py-1 px-3 inline-flex items-center gap-2 rounded-lg bg-[#0d1017]/80 border border-[#1d2536] text-[11px] sm:text-xs font-tech text-[#8b9bb4] tracking-wider uppercase">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00e5ff] animate-ping" />
          <span>COMPLETE TASKS</span>
          <span className="text-[#ff1e42]">•</span>
          <span>WATCH CLOSELY</span>
          <span className="text-[#ff1e42]">•</span>
          <span>FIND THE IMPOSTER</span>
          <span className="text-[#ff1e42]">•</span>
          <span>VOTE</span>
        </div>

        {/* Terminal Access Card */}
        <div className="arcade-card p-6 sm:p-8 relative">
          {/* Top highlight bar */}
          <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-[#ff1e42] to-transparent opacity-80" />

          <div className="flex items-center justify-between mb-4 border-b border-[#1d2536] pb-3">
            <span className="font-tech text-xs uppercase tracking-widest text-[#8b9bb4] font-bold">
              FACILITY GATEWAY
            </span>
            <span className="font-arcade text-[10px] text-[#00e5ff] tracking-wider uppercase px-2 py-0.5 rounded bg-[#00e5ff]/10 border border-[#00e5ff]/30">
              LIVE DECK
            </span>
          </div>

          <h2 className="font-arcade text-sm sm:text-base font-bold text-[#fff1e6] uppercase tracking-wider mb-2">
            ENTER GAME ACCESS CODE
          </h2>
          <p className="font-tech text-xs text-[#8b9bb4] mb-5">
            Type the 4-digit code provided on the main facility display.
          </p>

          <form onSubmit={handleNext} id="player-join-form" className="space-y-4">
            <div>
              <input
                id="game-code-input"
                type="text"
                value={gameCode}
                onChange={handleCodeChange}
                placeholder="MOSAIC-XXXX"
                maxLength={11}
                className="w-full px-4 py-4 bg-[#06070a] border-2 border-[#1d2536] rounded-xl text-[#fff1e6] text-center text-2xl sm:text-3xl font-arcade tracking-[0.2em] placeholder-[#8b9bb4]/30 focus:border-[#00e5ff] focus:shadow-[0_0_20px_rgba(0,229,255,0.35)] focus:outline-none transition-all uppercase"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
              />
              {error && (
                <div className="mt-2.5 p-2 rounded-lg bg-red-950/40 border border-red-500/50 text-xs font-tech text-red-300">
                  {error}
                </div>
              )}
            </div>

            <button
              id="player-join-next-btn"
              type="submit"
              disabled={isChecking || gameCode.length === 0}
              className="arcade-btn-primary w-full py-4 rounded-xl flex items-center justify-center gap-3 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed text-sm sm:text-base"
            >
              {isChecking ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>SYNCHRONIZING...</span>
                </>
              ) : (
                <>
                  <span>INITIALIZE MISSION</span>
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* GM Gateway Override */}
        <div className="pt-2">
          <a
            href="/gm/login"
            className="inline-flex items-center gap-1.5 font-tech text-xs sm:text-sm text-[#8b9bb4] hover:text-[#00e5ff] transition-colors uppercase tracking-wider"
          >
            <span>GAME MASTER LEVEL 5 ACCESS OVERRIDE</span>
            <span className="text-[#00e5ff]">→</span>
          </a>
        </div>
      </div>
    </div>
  );
}
