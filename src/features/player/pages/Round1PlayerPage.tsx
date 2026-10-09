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

    if (d.phase === GAME_PHASE.TRANSITION) {
      navigate('/player/transition', { replace: true });
      return;
    }
    if (
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
      if (data?.to === GAME_PHASE.TRANSITION) {
        navigate('/player/transition', { replace: true });
      } else if (
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
    <div className="min-h-screen bg-mosaic-dark flex flex-col">
      {/* Top bar */}
      <div className={`sticky top-0 z-10 px-4 py-3 border-b border-mosaic-border/50 bg-mosaic-dark/95 backdrop-blur-sm`}>
        <div className="max-w-md mx-auto flex items-center justify-between">
          {/* Team/Round info */}
          <div>
            <p className="text-xs text-mosaic-muted">{teamName}</p>
            <p className="text-sm font-semibold text-white">Puzzle Solving</p>
          </div>

          {/* Server-authoritative timer */}
          <div className={`text-center px-4 py-1.5 rounded-xl border transition-colors ${
            isTimerCritical
              ? 'bg-red-500/10 border-red-500/40 text-red-400'
              : 'bg-mosaic-surface border-mosaic-border text-white'
          }`}>
            <p className={`text-2xl font-mono font-bold tabular-nums ${isTimerCritical ? 'animate-pulse' : ''}`}>
              {timerDisplay}
            </p>
          </div>

          {/* Lives */}
          <div className="flex items-center gap-1.5">
            {Array.from({ length: 2 }).map((_, i) => (
              <Heart
                key={i}
                className={`w-5 h-5 transition-all ${
                  i < lives ? 'text-red-400 fill-red-400' : 'text-mosaic-muted/30'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-md mx-auto p-4 space-y-4 pb-6">
          {isPaused && (
            <div className="bg-yellow-500/15 border border-yellow-500/40 rounded-xl p-3 text-center text-yellow-300 animate-pulse">
              <p className="text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-1.5">
                <span>⏸</span> Game Paused by Game Master
              </p>
              <p className="text-[11px] text-yellow-300/80 mt-0.5">
                Timer and QR interactions are temporarily frozen.
              </p>
            </div>
          )}

          {/* Player name */}
          <p className="text-mosaic-muted text-xs text-center">
            Playing as <span className="text-white font-semibold">{playerContext?.player_name}</span>
          </p>

          {/* Puzzle board & progress */}
          <div className="bg-mosaic-surface border border-mosaic-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2">
                <Puzzle className="w-4 h-4 text-mosaic-accent" />
                <span className="text-sm font-medium text-white">Puzzle Progress</span>
              </div>
              <span className="text-sm font-bold text-mosaic-accent">
                {unlockedCount}/{totalPieces} Unlocked
              </span>
            </div>

            {/* Visual Puzzle Blueprint Grid */}
            <div className="relative rounded-xl overflow-hidden border border-mosaic-border/70 mb-3 bg-[#070b14] aspect-[4/3]">
              <img
                src="/assets/puzzle-blueprint.svg"
                alt="MOSAIC Core Blueprint"
                className="absolute inset-0 w-full h-full object-cover opacity-90"
              />
              {/* Tile overlays for 5 or 6 pieces */}
              <div className={`absolute inset-0 grid gap-1 p-1 ${
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
                          ? 'border border-cyan-400/50 bg-cyan-400/10 shadow-[0_0_12px_rgba(0,242,254,0.3)]'
                          : 'bg-[#060913]/90 backdrop-blur-sm border border-mosaic-border/40'
                      }`}
                    >
                      {piece.isUnlocked ? (
                        <div className="absolute top-1 right-1.5 flex items-center gap-1 bg-black/60 px-1.5 py-0.5 rounded text-[10px] text-cyan-300 font-mono">
                          <CheckCircle className="w-2.5 h-2.5 text-cyan-400" />
                          <span>P{piece.pieceIndex + 1}</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center p-2 text-center">
                          <Lock className="w-4 h-4 text-mosaic-muted/50 mb-1" />
                          <span className="text-[10px] font-mono text-mosaic-muted/60">PIECE {piece.pieceIndex + 1}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Progress bar */}
            <div className="h-2 bg-mosaic-dark rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-mosaic-accent to-mosaic-purple rounded-full transition-all duration-700"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {/* Lives warning */}
          {lives === 1 && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <p className="text-red-400 text-sm font-medium">Last life! One more wrong answer ends the round for everyone.</p>
            </div>
          )}

          {/* Round Ended overlay */}
          {isRoundEnded && (
            <div className="p-6 bg-mosaic-surface border border-mosaic-accent/30 rounded-2xl text-center">
              <p className="text-2xl font-bold text-white mb-2">Round Ended</p>
              <p className="text-mosaic-muted text-sm">Transitioning...</p>
              <div className="mt-3 w-6 h-6 border-2 border-mosaic-accent border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          )}

          {/* Main interaction area */}
          {!isRoundEnded && (
            <>
              {uiState.mode === 'scanning' && (
                <div className="bg-mosaic-surface border border-mosaic-border rounded-2xl p-4">
                  <h2 className="text-white font-semibold text-sm mb-3 text-center">Scan a QR Code</h2>
                  <QrScanner onScan={handleScan} disabled={isRoundEnded} />
                  {isProcessing && (
                    <div className="mt-3 text-center">
                      <div className="w-5 h-5 border-2 border-mosaic-accent border-t-transparent rounded-full animate-spin mx-auto" />
                      <p className="text-xs text-mosaic-muted mt-1">Processing...</p>
                    </div>
                  )}
                </div>
              )}

              {uiState.mode === 'question' && (
                <div className="bg-mosaic-surface border border-mosaic-border rounded-2xl p-5 space-y-4">
                  {/* QR label + question progress */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-mosaic-accent bg-mosaic-accent/10 border border-mosaic-accent/20 px-2 py-0.5 rounded-md">
                      {uiState.qrCodeId}
                    </span>
                    <span className="text-xs text-mosaic-muted">
                      Question {uiState.question.questionOrder} of {uiState.question.totalQuestionsOnQr}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs text-mosaic-muted/60 mb-1">{uiState.question.category}</p>
                    <p className="text-white font-medium leading-relaxed">{uiState.question.questionText}</p>
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
                          className="w-full text-left px-4 py-3.5 rounded-xl border border-mosaic-border bg-mosaic-dark text-white hover:border-mosaic-accent/50 hover:bg-mosaic-accent/5 transition-all flex items-start gap-3 disabled:opacity-50 cursor-pointer"
                        >
                          <span className="text-mosaic-accent font-bold text-sm w-5 shrink-0 mt-0.5">{opt}.</span>
                          <span className="text-sm leading-snug">{optText}</span>
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => setUiState({ mode: 'scanning' })}
                    className="text-mosaic-muted text-xs underline w-full text-center"
                  >
                    ← Back to scanner
                  </button>
                </div>
              )}

              {uiState.mode === 'feedback' && (
                <div className={`p-5 rounded-2xl border text-center ${
                  uiState.correct
                    ? 'bg-emerald-500/10 border-emerald-500/30'
                    : 'bg-red-500/10 border-red-500/30'
                }`}>
                  {uiState.correct ? (
                    <CheckCircle className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
                  ) : (
                    <XCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
                  )}
                  <p className={`font-semibold text-lg ${uiState.correct ? 'text-emerald-300' : 'text-red-300'}`}>
                    {uiState.message}
                  </p>
                  {lives > 0 && (
                    <button
                      type="button"
                      onClick={() => setUiState({ mode: 'scanning' })}
                      className="mt-4 px-6 py-2.5 bg-mosaic-accent text-black font-semibold rounded-xl text-sm hover:bg-mosaic-accent/90 transition-colors"
                    >
                      Scan Next QR
                    </button>
                  )}
                </div>
              )}

              {uiState.mode === 'decoy' && (
                <div className="p-5 rounded-2xl border border-yellow-500/30 bg-yellow-500/10 text-center">
                  <div className="text-4xl mb-3">🕵️</div>
                  <p className="font-bold text-yellow-300 text-lg mb-1">Nice try, Detective!</p>
                  <p className="text-yellow-200/80 text-sm">{uiState.message}</p>
                  <button
                    type="button"
                    onClick={() => setUiState({ mode: 'scanning' })}
                    className="mt-4 px-6 py-2.5 bg-mosaic-accent text-black font-semibold rounded-xl text-sm hover:bg-mosaic-accent/90 transition-colors"
                  >
                    Scan Another QR
                  </button>
                </div>
              )}

              {uiState.mode === 'already_complete' && (
                <div className="p-5 rounded-2xl border border-mosaic-border bg-mosaic-surface text-center">
                  <CheckCircle className="w-10 h-10 text-mosaic-muted mx-auto mb-3" />
                  <p className="text-white font-semibold">{uiState.qrCodeId} Already Done</p>
                  <p className="text-mosaic-muted text-sm mt-1">This QR has already been completed.</p>
                  <button
                    type="button"
                    onClick={() => setUiState({ mode: 'scanning' })}
                    className="mt-4 px-6 py-2.5 bg-mosaic-surface border border-mosaic-border text-white font-semibold rounded-xl text-sm hover:border-mosaic-accent/50 transition-colors"
                  >
                    ← Back to Scanner
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Leave */}
      <div className="border-t border-mosaic-border/40 py-3 px-4">
        <div className="max-w-md mx-auto flex justify-center">
          <button
            onClick={async () => { await logout(); navigate('/', { replace: true }); }}
            className="flex items-center gap-1.5 text-mosaic-muted/60 hover:text-mosaic-muted text-xs transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Leave game
          </button>
        </div>
      </div>
    </div>
  );
}
