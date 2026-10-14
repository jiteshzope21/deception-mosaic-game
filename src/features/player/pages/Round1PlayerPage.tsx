/**
 * MOSAIC — Round 1 Player Screen (Puzzle Solving)
 *
 * Mobile-first. Minimal. Touch-friendly.
 * Shows: team, name, timer (server-authoritative), lives, puzzle progress,
 * QR scanner, question interaction, feedback.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, Puzzle, AlertCircle, CheckCircle, XCircle, LogOut, Lock } from 'lucide-react';
import { useAuth } from '@/app/providers/AuthContext';
import { getPlayerGameState, scanQr, submitAnswer } from '@/services/gameService';
import { subscribeToEvent } from '@/lib/socket/socketClient';
import { SOCKET_EVENT, GAME_PHASE } from '@/types/enums';
import type { AnswerOption } from '@/types/enums';
import type { QuestionDetails, PuzzlePieceState } from '@/services/gameService';
import QrScanner from '../components/QrScanner';

type UIState =
  | { mode: 'scanning' }
  | { mode: 'question'; qrCodeId: string; question: QuestionDetails }
  | { mode: 'feedback'; correct: boolean; message: string; nextQuestion?: QuestionDetails; qrCodeId?: string }
  | { mode: 'decoy'; message: string }
  | { mode: 'already_complete'; qrCodeId: string };

function formatTimer(endsAt: string | null): string {
  if (!endsAt) return '0:00';
  const remaining = Math.max(0, new Date(endsAt).getTime() - Date.now());
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export default function Round1PlayerPage() {
  const navigate = useNavigate();
  const { playerContext, logout } = useAuth();

  const gameId = playerContext?.game_id ?? '';
  const myPlayerId = playerContext?.game_player_id ?? '';

  const [lives, setLives] = useState(2);
  const [puzzlePieces, setPuzzlePieces] = useState<PuzzlePieceState[]>([]);
  const [phaseEndsAt, setPhaseEndsAt] = useState<string | null>(null);
  const [teamName, setTeamName] = useState('');
  const [timerDisplay, setTimerDisplay] = useState('4:00');
  const [isTimerCritical, setIsTimerCritical] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [pausedRemainingMs, setPausedRemainingMs] = useState<number | null>(null);
  const [uiState, setUiState] = useState<UIState>({ mode: 'scanning' });
  const [isProcessing, setIsProcessing] = useState(false);
  const [phase, setPhase] = useState<string>(GAME_PHASE.ROUND_1_ACTIVE);

  const loadGameState = useCallback(async () => {
    if (!gameId) return;
    const res = await getPlayerGameState(gameId);
    if (!res.success) return;

    const d = res.data;
    setTeamName(d.teamName);
    setPhaseEndsAt(d.phaseEndsAt);
    setPuzzlePieces(d.puzzlePieces);
    setPhase(d.phase);
    setIsPaused(!!d.isPaused);
    setPausedRemainingMs(d.pausedRemainingMs ?? null);

    const me = d.myPlayer;
    if (me) setLives(me.lives);

    if (
      d.phase === GAME_PHASE.TRANSITION ||
      d.phase === GAME_PHASE.ROUND_2_ACTIVE ||
      d.phase === GAME_PHASE.BODY_REPORT ||
      d.phase === GAME_PHASE.MOVE_TO_VOTING ||
      d.phase === GAME_PHASE.VOTING
    ) {
      navigate('/player/round2', { replace: true });
      return;
    }
    if (d.phase === GAME_PHASE.GAME_COMPLETE) {
      navigate('/player/complete', { replace: true });
      return;
    }
    if (d.phase !== GAME_PHASE.ROUND_1_ACTIVE) {
      navigate('/player/round1-complete', { replace: true });
    }
  }, [gameId, navigate]);

  // Initial load
  useEffect(() => {
    void loadGameState();
  }, [loadGameState]);

  // Server-authoritative timer
  useEffect(() => {
    if (isPaused) {
      if (typeof pausedRemainingMs === 'number') {
        const rem = Math.max(0, pausedRemainingMs);
        const minutes = Math.floor(rem / 60000);
        const seconds = Math.floor((rem % 60000) / 1000);
        setTimerDisplay(`${minutes}:${seconds.toString().padStart(2, '0')}`);
        setIsTimerCritical(rem < 60000);
      }
      return;
    }

    if (!phaseEndsAt) return;
    const interval = setInterval(() => {
      const display = formatTimer(phaseEndsAt);
      setTimerDisplay(display);
      const remaining = Math.max(0, new Date(phaseEndsAt).getTime() - Date.now());
      setIsTimerCritical(remaining < 60000);
    }, 500);
    return () => clearInterval(interval);
  }, [phaseEndsAt, isPaused, pausedRemainingMs]);

  // Socket events
  useEffect(() => {
    const unsubLives = subscribeToEvent<any>(SOCKET_EVENT.LIVES_UPDATE, (data) => {
      if (data?.playerId === myPlayerId || data?.playerName === playerContext?.player_name) {
        setLives(data.lives);
      }
    });

    const unsubPuzzle = subscribeToEvent<any>(SOCKET_EVENT.PUZZLE_UPDATE, (data) => {
      if (data?.pieces) {
        setPuzzlePieces(data.pieces);
      }
    });

    const unsubPhase = subscribeToEvent<any>(SOCKET_EVENT.PHASE_CHANGED, (data) => {
      if (
        data?.to === GAME_PHASE.TRANSITION ||
        data?.to === GAME_PHASE.ROUND_2_ACTIVE ||
        data?.to === GAME_PHASE.BODY_REPORT ||
        data?.to === GAME_PHASE.MOVE_TO_VOTING ||
        data?.to === GAME_PHASE.VOTING
      ) {
        navigate('/player/round2', { replace: true });
      } else if (data?.to === GAME_PHASE.GAME_COMPLETE) {
        navigate('/player/complete', { replace: true });
      } else if (data?.to === GAME_PHASE.ROUND_1_COMPLETE) {
        setPhase(GAME_PHASE.ROUND_1_COMPLETE);
        setTimeout(() => navigate('/player/round1-complete', { replace: true }), 1500);
      }
    });

    const unsubPaused = subscribeToEvent<any>(SOCKET_EVENT.GAME_PAUSED, (data) => {
      setIsPaused(true);
      if (typeof data?.pausedRemainingMs === 'number') {
        setPausedRemainingMs(data.pausedRemainingMs);
      }
    });

    const unsubResumed = subscribeToEvent<any>(SOCKET_EVENT.GAME_RESUMED, (data) => {
      setIsPaused(false);
      if (data?.phaseEndsAt) {
        setPhaseEndsAt(data.phaseEndsAt);
      }
    });

    const unsubReset = subscribeToEvent<any>(SOCKET_EVENT.ROUND_RESET, () => {
      setUiState({ mode: 'scanning' });
      void loadGameState();
    });

    const unsubTerminated = subscribeToEvent<any>(SOCKET_EVENT.ROUND_TERMINATED, () => {
      setPhase(GAME_PHASE.ROUND_1_COMPLETE);
      navigate('/player/round1-complete', { replace: true });
    });

    return () => {
      unsubLives();
      unsubPuzzle();
      unsubPhase();
      unsubPaused();
      unsubResumed();
      unsubReset();
      unsubTerminated();
    };
  }, [myPlayerId, playerContext?.player_name, navigate, loadGameState]);

  const handleScan = useCallback(async (qrCodeId: string) => {
    if (isProcessing || phase !== GAME_PHASE.ROUND_1_ACTIVE || isPaused) return;
    setIsProcessing(true);

    const res = await scanQr(gameId, qrCodeId);
    setIsProcessing(false);

    if (!res.success) {
      setUiState({ mode: 'feedback', correct: false, message: res.error?.message || 'Invalid QR code.' });
      return;
    }

    const d = res.data;
    if (d.status === 'ROUND_ENDED') {
      setPhase(GAME_PHASE.ROUND_1_COMPLETE);
      return;
    }
    if (d.status === 'ALREADY_COMPLETED') {
      setUiState({ mode: 'already_complete', qrCodeId });
      return;
    }
    if (d.status === 'QUESTION' && d.question) {
      setUiState({ mode: 'question', qrCodeId, question: d.question });
    }
  }, [gameId, isProcessing, phase, isPaused]);

  const handleAnswer = useCallback(async (answer: AnswerOption) => {
    const state = uiState;
    if (state.mode !== 'question' || isProcessing || isPaused) return;
    setIsProcessing(true);

    const { qrCodeId, question } = state;
    const actionId = `${myPlayerId}-${qrCodeId}-${question.questionId}-${Date.now()}`;
    const res = await submitAnswer(gameId, qrCodeId, question.questionId, answer, actionId);
    setIsProcessing(false);

    if (!res.success) {
      setUiState({ mode: 'feedback', correct: false, message: res.error?.message || 'Submission failed.' });
      return;
    }

    const d = res.data;
    if (d.isCorrect) {
      if (d.decoyMessage) {
        setUiState({ mode: 'decoy', message: d.decoyMessage });
      } else if (d.nextQuestion) {
        setUiState({ mode: 'question', qrCodeId, question: d.nextQuestion });
      } else if (d.qrCompleted) {
        setUiState({
          mode: 'feedback',
          correct: true,
          message: d.puzzleCompleted
            ? '🎉 Puzzle complete! Incredible work!'
            : `✅ QR completed! Puzzle piece ${(d.pieceIndex ?? 0) + 1} unlocked!`,
          qrCodeId,
        });
        if (d.roundEnded) {
          setTimeout(() => navigate('/player/round1-complete', { replace: true }), 2500);
        }
      }
    } else {
      setUiState({
        mode: 'feedback',
        correct: false,
        message: '❌ Wrong answer! -1 life.',
        qrCodeId,
      });
      if (d.roundEnded) {
        setTimeout(() => navigate('/player/round1-complete', { replace: true }), 2500);
      }
    }
  }, [uiState, gameId, myPlayerId, isProcessing, navigate, isPaused]);

  const unlockedCount = puzzlePieces.filter((p) => p.isUnlocked).length;
  const totalPieces = puzzlePieces.length;
  const progressPct = totalPieces > 0 ? (unlockedCount / totalPieces) * 100 : 0;
  const isRoundEnded = phase !== GAME_PHASE.ROUND_1_ACTIVE;

  return (
    <div className="min-h-screen arcade-corridor-bg flex flex-col relative overflow-x-hidden">
      {/* Top bar HUD */}
      <div className="sticky top-0 z-20 px-4 py-3 border-b border-[#1d2536] bg-[#06070a]/95 backdrop-blur-md shadow-lg shadow-black/60">
        <div className="max-w-md sm:max-w-xl md:max-w-2xl lg:max-w-3xl mx-auto flex items-center justify-between">
          {/* Team/Round info */}
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <span className="font-tech text-xs tracking-wider text-[#8b9bb4] uppercase">{teamName || 'SQUADRON'}</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#0d1017] border border-[#1d2536] text-[#00e5ff] font-arcade font-bold">R1</span>
            </div>
            <p className="font-tech text-sm sm:text-base font-bold text-[#fff1e6] tracking-wide uppercase">CIPHER DECRYPTION</p>
          </div>

          {/* Server-authoritative timer */}
          <div className={`text-center px-4 py-1.5 rounded-xl border transition-colors ${
            isTimerCritical
              ? 'bg-red-500/15 border-red-500/60 text-red-400 border-glow-red'
              : 'bg-[#0d1017] border-[#1d2536] text-[#fff1e6]'
          }`}>
            <p className={`text-xl sm:text-2xl font-arcade font-black tabular-nums tracking-wider ${isTimerCritical ? 'animate-pulse text-[#ff1e42] glow-text-red' : 'text-[#fff1e6]'}`}>
              {timerDisplay}
            </p>
          </div>

          {/* Lives */}
          <div className="flex items-center gap-1.5 bg-[#0d1017] px-2.5 py-1.5 rounded-xl border border-[#1d2536]">
            <span className="font-tech text-[10px] font-bold uppercase text-[#8b9bb4] mr-0.5 hidden xs:inline">LIVES</span>
            {Array.from({ length: 2 }).map((_, i) => (
              <Heart
                key={i}
                className={`w-5 h-5 transition-all ${
                  i < lives ? 'text-[#ff1e42] fill-[#ff1e42] filter drop-shadow-[0_0_6px_rgba(255,30,66,0.6)]' : 'text-zinc-700'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-md sm:max-w-xl md:max-w-2xl lg:max-w-3xl mx-auto p-4 sm:p-6 space-y-4 sm:space-y-5 pb-8">
          {isPaused && (
            <div className="bg-yellow-500/15 border border-yellow-500/40 rounded-xl p-3 text-center text-yellow-300 animate-pulse">
              <p className="font-tech text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-1.5">
                <span>⏸</span> MISSION PAUSED BY GAME MASTER
              </p>
              <p className="font-tech text-xs text-yellow-300/80 mt-0.5">
                Timer and optical scanner systems are temporarily frozen.
              </p>
            </div>
          )}

          {/* Player name badge */}
          <div className="flex items-center justify-center">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#0d1017] border border-[#1d2536] text-xs">
              <span className="w-2 h-2 rounded-full bg-[#00e5ff] animate-pulse" />
              <span className="font-tech text-[#8b9bb4] tracking-wider uppercase font-bold">OPERATIVE:</span>
              <span className="font-tech font-bold text-[#fff1e6] tracking-wide text-sm">{playerContext?.player_name}</span>
            </div>
          </div>

          {/* Puzzle board & progress */}
          <div className="arcade-card p-4 sm:p-5 shadow-xl space-y-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Puzzle className="w-4 h-4 text-[#00e5ff]" />
                <span className="font-tech text-sm sm:text-base font-bold text-[#fff1e6] tracking-wider uppercase">CORE BLUEPRINT MATRIX</span>
              </div>
              <span className="font-arcade text-xs sm:text-sm font-bold text-[#00e5ff] tracking-wider">
                {unlockedCount}/{totalPieces} UNLOCKED
              </span>
            </div>

            {/* Visual Puzzle Blueprint Grid */}
            <div className="relative rounded-xl overflow-hidden border border-[#00e5ff]/30 mb-3 bg-[#05070c] aspect-[4/3] shadow-inner shadow-black p-1.5">
              {/* Tile overlays for 5 or 6 pieces */}
              <div className={`w-full h-full grid gap-1.5 ${
                totalPieces === 5 ? 'grid-cols-3 grid-rows-2' : 'grid-cols-3 grid-rows-2'
              }`}>
                {puzzlePieces.map((piece, idx) => {
                  const isLastOf5 = totalPieces === 5 && idx === 4;
                  return (
                    <div
                      key={piece.pieceIndex}
                      className={`relative rounded-lg flex flex-col items-center justify-center transition-all duration-500 overflow-hidden ${
                        isLastOf5 ? 'col-span-2' : ''
                      } ${
                        piece.isUnlocked
                          ? 'border border-[#00e5ff]/60 bg-[#00e5ff]/15 shadow-[0_0_12px_rgba(0,229,255,0.35)]'
                          : 'bg-[#06070a]/90 backdrop-blur-sm border border-[#1d2536]'
                      }`}
                    >
                      {piece.isUnlocked ? (
                        <div className="absolute top-1 right-1.5 flex items-center gap-1 bg-black/70 px-1.5 py-0.5 rounded text-[10px] text-[#00e5ff] font-arcade">
                          <CheckCircle className="w-2.5 h-2.5 text-[#00e5ff]" />
                          <span>P{piece.pieceIndex + 1}</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center p-2 text-center">
                          <Lock className="w-4 h-4 text-[#8b9bb4]/50 mb-1" />
                          <span className="text-[10px] font-arcade text-[#8b9bb4]/60">PIECE {piece.pieceIndex + 1}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Progress bar */}
            <div className="h-2 bg-[#06070a] rounded-full overflow-hidden border border-[#1d2536]">
              <div
                className="h-full bg-gradient-to-r from-[#00e5ff] to-[#ff1e42] rounded-full transition-all duration-700 shadow-[0_0_10px_rgba(0,229,255,0.5)]"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {/* Lives warning */}
          {lives === 1 && (
            <div className="flex items-center gap-2 p-3 bg-red-950/40 border border-red-500/50 rounded-xl">
              <AlertCircle className="w-4 h-4 text-[#ff1e42] shrink-0 animate-pulse" />
              <p className="font-tech text-[#ff1e42] text-sm font-bold uppercase tracking-wider">
                CRITICAL ALERT: Last life remaining! Next incorrect response triggers total cipher collapse.
              </p>
            </div>
          )}

          {/* Round Ended overlay */}
          {isRoundEnded && (
            <div className="arcade-card p-6 text-center space-y-2">
              <p className="font-display text-4xl font-bold text-[#fff1e6] tracking-wider">ROUND CONCLUDED</p>
              <p className="font-tech text-[#8b9bb4] text-sm uppercase tracking-widest">Awaiting transition to Round 2...</p>
              <div className="mt-3 w-6 h-6 border-2 border-[#00e5ff] border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          )}

          {/* Main interaction area */}
          {!isRoundEnded && (
            <>
              {uiState.mode === 'scanning' && (
                <div className="arcade-card p-4 sm:p-5 shadow-xl space-y-3">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <span className="w-2 h-2 rounded-full bg-[#00e5ff] animate-ping" />
                    <h2 className="font-arcade text-[#fff1e6] font-bold text-xs sm:text-sm tracking-wider uppercase">
                      OPTICAL TARGET ALIGNMENT
                    </h2>
                  </div>
                  <QrScanner onScan={handleScan} disabled={isRoundEnded} />
                  {isProcessing && (
                    <div className="mt-3 text-center">
                      <div className="w-5 h-5 border-2 border-[#00e5ff] border-t-transparent rounded-full animate-spin mx-auto" />
                      <p className="font-tech text-xs text-[#8b9bb4] mt-1 uppercase tracking-wider">DECRYPTING TRANSMISSION...</p>
                    </div>
                  )}
                </div>
              )}

              {uiState.mode === 'question' && (
                <div className="arcade-card p-5 sm:p-6 space-y-4 shadow-xl border-[#00e5ff]/40">
                  {/* QR label + question progress */}
                  <div className="flex items-center justify-between border-b border-[#1d2536] pb-3">
                    <span className="font-arcade text-xs text-[#00e5ff] bg-[#00e5ff]/10 border border-[#00e5ff]/30 px-2.5 py-1 rounded-md font-bold">
                      {uiState.qrCodeId}
                    </span>
                    <span className="font-tech text-xs text-[#8b9bb4] font-bold tracking-wider uppercase">
                      QUERY {uiState.question.questionOrder} OF {uiState.question.totalQuestionsOnQr}
                    </span>
                  </div>
                  <div>
                    <p className="font-tech text-xs text-[#00e5ff] uppercase tracking-widest mb-1.5 font-bold">{uiState.question.category}</p>
                    <p className="font-tech text-[#fff1e6] text-base sm:text-lg font-bold leading-relaxed">{uiState.question.questionText}</p>
                  </div>
                  <div className="grid grid-cols-1 gap-2.5">
                    {(['A', 'B', 'C', 'D'] as AnswerOption[]).map((opt) => {
                      const label = opt as 'A' | 'B' | 'C' | 'D';
                      const optText = uiState.question[`option${label}` as 'optionA' | 'optionB' | 'optionC' | 'optionD'];
                      return (
                        <button
                          key={opt}
                          type="button"
                          disabled={isProcessing}
                          onClick={() => handleAnswer(opt)}
                          className="w-full text-left px-4 py-3 sm:py-3.5 rounded-xl border border-[#1d2536] bg-[#06070a] text-[#fff1e6] hover:border-[#00e5ff]/60 hover:bg-[#00e5ff]/10 transition-all flex items-start gap-3 disabled:opacity-50 cursor-pointer group"
                        >
                          <span className="font-arcade text-[#00e5ff] group-hover:text-[#5df0ff] font-bold text-sm w-5 shrink-0 mt-0.5">{opt}.</span>
                          <span className="font-tech text-sm sm:text-base leading-snug">{optText}</span>
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => setUiState({ mode: 'scanning' })}
                    className="font-tech text-[#8b9bb4] hover:text-[#fff1e6] text-xs uppercase tracking-wider underline w-full text-center cursor-pointer pt-2"
                  >
                    ← ABORT & RETURN TO SCANNER
                  </button>
                </div>
              )}

              {uiState.mode === 'feedback' && (
                <div className={`arcade-card p-6 sm:p-8 text-center shadow-xl ${
                  uiState.correct
                    ? 'bg-cyan-950/30 border-[#00e5ff]/60 border-glow-cyan'
                    : 'bg-red-950/30 border-[#ff1e42]/60 border-glow-red'
                }`}>
                  {uiState.correct ? (
                    <CheckCircle className="w-12 h-12 text-[#00e5ff] mx-auto mb-3 animate-bounce" />
                  ) : (
                    <XCircle className="w-12 h-12 text-[#ff1e42] mx-auto mb-3 animate-pulse" />
                  )}
                  <p className={`font-display text-3xl sm:text-4xl tracking-wider ${uiState.correct ? 'text-[#00e5ff] glow-text-cyan' : 'text-[#ff1e42] glow-text-red'}`}>
                    {uiState.correct ? 'CIPHER VERIFIED' : 'ACCESS DENIED'}
                  </p>
                  <p className="font-tech text-sm sm:text-base text-[#8b9bb4] mt-2 max-w-sm mx-auto">
                    {uiState.message}
                  </p>
                  {lives > 0 && (
                    <button
                      type="button"
                      onClick={() => setUiState({ mode: 'scanning' })}
                      className="arcade-btn-cyan mt-5 px-8 py-3 text-black font-arcade font-bold rounded-xl text-xs sm:text-sm cursor-pointer shadow-lg tracking-wider"
                    >
                      SCAN NEXT TARGET
                    </button>
                  )}
                </div>
              )}

              {uiState.mode === 'decoy' && (
                <div className="arcade-card p-6 border-yellow-500/50 bg-yellow-950/30 text-center shadow-xl">
                  <div className="text-4xl mb-3 animate-pulse">🕵️</div>
                  <p className="font-display text-3xl text-yellow-400 tracking-wider mb-1">DECOY DETECTED!</p>
                  <p className="font-tech text-yellow-200/80 text-sm max-w-sm mx-auto">{uiState.message}</p>
                  <button
                    type="button"
                    onClick={() => setUiState({ mode: 'scanning' })}
                    className="mt-5 px-8 py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-arcade font-bold rounded-xl text-xs sm:text-sm transition-all cursor-pointer shadow-lg tracking-wider"
                  >
                    SCAN ANOTHER TARGET
                  </button>
                </div>
              )}

              {uiState.mode === 'already_complete' && (
                <div className="arcade-card p-6 text-center shadow-xl">
                  <CheckCircle className="w-10 h-10 text-[#8b9bb4] mx-auto mb-3" />
                  <p className="font-tech text-[#fff1e6] font-bold text-base uppercase tracking-wider">{uiState.qrCodeId} ALREADY COMPLETED</p>
                  <p className="font-tech text-[#8b9bb4] text-xs sm:text-sm mt-1">This terminal node data has already been decrypted.</p>
                  <button
                    type="button"
                    onClick={() => setUiState({ mode: 'scanning' })}
                    className="mt-4 px-6 py-2.5 bg-[#06070a] border border-[#1d2536] text-[#fff1e6] font-tech font-bold uppercase tracking-wider rounded-xl text-xs hover:border-[#00e5ff]/50 transition-colors cursor-pointer"
                  >
                    ← BACK TO SCANNER
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Leave */}
      <div className="border-t border-[#1d2536] py-3 px-4 bg-black/60 backdrop-blur-md">
        <div className="max-w-md sm:max-w-xl md:max-w-2xl lg:max-w-3xl mx-auto flex justify-center">
          <button
            onClick={async () => { await logout(); navigate('/', { replace: true }); }}
            className="flex items-center gap-1.5 font-tech uppercase tracking-widest text-[#8b9bb4] hover:text-[#ff1e42] text-xs transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>DISENGAGE FROM SESSION</span>
          </button>
        </div>
      </div>
    </div>
  );
}
