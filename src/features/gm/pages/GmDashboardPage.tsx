/**
 * MOSAIC — GM Dashboard (Phase 2)
 *
 * Desktop-first event-control dashboard. Shows:
 * - Lobby creation form (5 or 6 players, unique names)
 * - Active game lobby with realtime player join status
 * - GM start game button (validated, idempotent)
 * - Round 1 control / live dashboard (master timer, puzzle pieces, QRs, players, events)
 * - GM Emergency Controls (Emergency End Round, Restart Round 1) with modal confirmation
 * - Question bank CRUD (list, search, category filter, add, edit, delete)
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, Play, Plus, Settings, BookOpen, LogOut,
  CheckCircle, Clock, Loader2, AlertCircle, ChevronRight,
  RotateCcw, AlertTriangle, Trash2, Edit2, X, Filter, Activity, Lock, Puzzle,
  Shield, Skull, History, Eye, Pause, PlayCircle, StopCircle
} from 'lucide-react';
import { useAuth } from '@/app/providers/AuthContext';
import {
  createLobby, getActiveGame, startGame, emergencyEndRound, restartGame,
  pauseGame, resumeGame, resetRound1, resetRound2, terminateRound1, terminateRound2,
  listQuestions, createQuestion, updateQuestion, deleteQuestion,
  gmStartTransition, gmStartRound2, listGameHistory, getGameHistory,
  type GmGameStateData, type QuestionBankItem, type GameHistoryEntry
} from '@/services/gameService';
import { subscribeToEvent } from '@/lib/socket/socketClient';
import { SOCKET_EVENT, GAME_PHASE, type AnswerOption } from '@/types/enums';
import GameConfigurationPanel from '../components/GameConfigurationPanel';

type DashboardView = 'overview' | 'config' | 'create' | 'lobby' | 'round1' | 'round2' | 'history' | 'questions';

const PHASE_3_PHASES = [
  GAME_PHASE.TRANSITION,
  GAME_PHASE.ROUND_2_ACTIVE,
  GAME_PHASE.BODY_REPORT,
  GAME_PHASE.MOVE_TO_VOTING,
  GAME_PHASE.VOTING,
  GAME_PHASE.GAME_COMPLETE,
] as string[];

const QUESTION_CATEGORIES = [
  'ALL',
  'Computer Science',
  'Networking',
  'Programming',
  'Electronics',
  'Operating Systems',
];

export default function GmDashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [activeGame, setActiveGame] = useState<GmGameStateData | null>(null);
  const [view, setView] = useState<DashboardView>('overview');
  const [isLoadingGame, setIsLoadingGame] = useState(true);

  // Create form state
  const [teamName, setTeamName] = useState('');
  const [teamSize, setTeamSize] = useState<5 | 6>(5);
  const [playerNames, setPlayerNames] = useState<string[]>(Array(5).fill(''));
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [newGameCode, setNewGameCode] = useState<string | null>(null);

  const loadActiveGame = useCallback(async () => {
    const res = await getActiveGame();
    if (res.success && res.data.game) {
      setActiveGame(res.data.game);
      const p = res.data.game.phase;
      if (p === GAME_PHASE.ROUND_1_ACTIVE || p === GAME_PHASE.ROUND_1_COMPLETE) {
        setView('round1');
      } else if (p === GAME_PHASE.LOBBY) {
        setView('lobby');
      } else if (PHASE_3_PHASES.includes(p)) {
        setView('round2');
      }
    } else {
      setActiveGame(null);
    }
    setIsLoadingGame(false);
  }, []);

  useEffect(() => {
    void loadActiveGame();
  }, [loadActiveGame]);

  // Realtime: lobby updates
  useEffect(() => {
    const unsubLobby = subscribeToEvent<any>(SOCKET_EVENT.LOBBY_UPDATE, (data) => {
      if (data?.players) {
        setActiveGame((g) => g ? {
          ...g,
          players: data.players.map((p: any) => ({
            ...p,
            lives: p.lives ?? 2,
            joinedAt: p.joinedAt ?? null,
          })),
        } : g);
      }
    });

    const unsubStarted = subscribeToEvent<any>(SOCKET_EVENT.GAME_STARTED, (data) => {
      if (data) {
        setActiveGame((g) => g ? {
          ...g,
          phase: GAME_PHASE.ROUND_1_ACTIVE,
          phaseStartedAt: data.phaseStartedAt,
          phaseEndsAt: data.phaseEndsAt,
        } : g);
        setView('round1');
      }
    });

    const unsubPhase = subscribeToEvent<any>(SOCKET_EVENT.PHASE_CHANGED, (data) => {
      if (data?.to) {
        setActiveGame((g) => g ? { ...g, phase: data.to, phaseEndsAt: data.phaseEndsAt ?? g?.phaseEndsAt, round2EndsAt: data.round2EndsAt ?? g?.round2EndsAt } : g);
        if (data.to === GAME_PHASE.ROUND_1_ACTIVE || data.to === GAME_PHASE.ROUND_1_COMPLETE) {
          setView('round1');
        } else if (data.to === GAME_PHASE.LOBBY) {
          setView('lobby');
        } else if (PHASE_3_PHASES.includes(data.to)) {
          setView('round2');
        }
      }
    });

    const unsubPuzzle = subscribeToEvent<any>(SOCKET_EVENT.PUZZLE_UPDATE, (data) => {
      if (data?.pieces) {
        setActiveGame((g) => g ? { ...g, puzzlePieces: data.pieces } : g);
      }
    });

    const unsubLives = subscribeToEvent<any>(SOCKET_EVENT.LIVES_UPDATE, (data) => {
      if (data?.playerId) {
        setActiveGame((g) => {
          if (!g) return g;
          return {
            ...g,
            players: g.players.map((p) =>
              p.id === data.playerId ? { ...p, lives: data.lives } : p
            ),
          };
        });
      }
    });

    const unsubPaused = subscribeToEvent<any>(SOCKET_EVENT.GAME_PAUSED, (data) => {
      setActiveGame((g) => g ? {
        ...g,
        isPaused: true,
        pausedRemainingMs: data.pausedRemainingMs,
        pausedRound2RemainingMs: data.pausedRound2RemainingMs,
      } : g);
    });

    const unsubResumed = subscribeToEvent<any>(SOCKET_EVENT.GAME_RESUMED, (data) => {
      setActiveGame((g) => g ? {
        ...g,
        isPaused: false,
        phaseEndsAt: data.phaseEndsAt ?? g.phaseEndsAt,
        round2EndsAt: data.round2EndsAt ?? g.round2EndsAt,
      } : g);
    });

    const unsubReset = subscribeToEvent<any>(SOCKET_EVENT.ROUND_RESET, () => {
      void loadActiveGame();
    });

    const unsubTerminated = subscribeToEvent<any>(SOCKET_EVENT.ROUND_TERMINATED, () => {
      void loadActiveGame();
    });

    return () => {
      unsubLobby();
      unsubStarted();
      unsubPhase();
      unsubPuzzle();
      unsubLives();
      unsubPaused();
      unsubResumed();
      unsubReset();
      unsubTerminated();
    };
  }, [loadActiveGame]);

  function handleTeamSizeChange(size: 5 | 6) {
    setTeamSize(size);
    setPlayerNames((prev) => {
      if (size > prev.length) return [...prev, ...Array(size - prev.length).fill('')];
      return prev.slice(0, size);
    });
  }

  async function handleCreateGame(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);

    const trimmedNames = playerNames.map((n) => n.trim()).filter(Boolean);
    if (trimmedNames.length !== teamSize) {
      setCreateError(`Please fill in all ${teamSize} player names.`);
      return;
    }
    const uniqueNames = new Set(trimmedNames.map((n) => n.toLowerCase()));
    if (uniqueNames.size !== trimmedNames.length) {
      setCreateError('Player names must be unique within a team.');
      return;
    }
    if (!teamName.trim()) {
      setCreateError('Team name is required.');
      return;
    }

    setIsCreating(true);
    const res = await createLobby(teamName.trim(), teamSize, trimmedNames);
    setIsCreating(false);

    if (!res.success) {
      setCreateError(res.error?.message || 'Failed to create game.');
      return;
    }

    setNewGameCode(res.data.gameCode);
    await loadActiveGame();
    setView('lobby');
  }

  async function handleStartGame() {
    if (!activeGame?.id) return;
    setIsStarting(true);
    setStartError(null);

    const res = await startGame(activeGame.id);
    setIsStarting(false);

    if (!res.success) {
      setStartError(res.error?.message || 'Could not start game.');
      return;
    }

    await loadActiveGame();
    setView('round1');
  }

  async function handleLogout() {
    await logout();
    navigate('/gm/login', { replace: true });
  }

  const joinedCount = activeGame?.players.filter((p) => p.status === 'JOINED').length ?? 0;
  const allJoined = !!activeGame && joinedCount >= (activeGame.teamSize ?? 0);

  return (
    <div className="min-h-screen bg-mosaic-dark text-white">
      <div className="flex h-screen overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 shrink-0 border-r border-mosaic-border/60 flex flex-col bg-mosaic-surface/50">
          <div className="px-6 py-5 border-b border-mosaic-border/40">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-mosaic-accent to-mosaic-purple flex items-center justify-center font-bold text-black text-lg">
                M
              </div>
              <div>
                <p className="font-bold text-white text-sm">MOSAIC</p>
                <p className="text-mosaic-muted text-xs">Game Master</p>
              </div>
            </div>
          </div>

          <nav className="flex-1 p-4 space-y-1">
            {[
              { key: 'overview', label: 'Overview', icon: Activity },
              { key: 'config', label: 'Game Configuration', icon: Settings },
              { key: 'create', label: 'Create Game', icon: Plus },
              {
                key: 'lobby',
                label: 'Lobby',
                icon: Users,
                disabled: !activeGame || activeGame.phase !== GAME_PHASE.LOBBY,
              },
              {
                key: 'round1',
                label: 'Round 1',
                icon: Play,
                disabled:
                  !activeGame ||
                  (activeGame.phase !== GAME_PHASE.ROUND_1_ACTIVE &&
                    activeGame.phase !== GAME_PHASE.ROUND_1_COMPLETE),
              },
              {
                key: 'round2',
                label: 'Round 2 / Deception',
                icon: Shield,
                disabled:
                  !activeGame ||
                  (!PHASE_3_PHASES.includes(activeGame.phase) &&
                    activeGame.phase !== GAME_PHASE.ROUND_1_COMPLETE),
              },
              { key: 'history', label: 'History', icon: History },
              { key: 'questions', label: 'Question Bank', icon: BookOpen },
            ].map(({ key, label, icon: Icon, disabled }) => (
              <button
                key={key}
                type="button"
                disabled={disabled}
                onClick={() => !disabled && setView(key as DashboardView)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  view === key
                    ? 'bg-mosaic-accent/15 text-mosaic-accent border border-mosaic-accent/20'
                    : disabled
                    ? 'text-mosaic-muted/40 cursor-not-allowed'
                    : 'text-mosaic-muted hover:text-white hover:bg-mosaic-dark/70 cursor-pointer'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </button>
            ))}
          </nav>

          <div className="p-4 border-t border-mosaic-border/40">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-white text-xs font-medium truncate">
                  {(user as any)?.displayName ?? 'Game Master'}
                </p>
                <p className="text-mosaic-muted text-xs truncate">{(user as any)?.email ?? ''}</p>
              </div>
              <button
                onClick={handleLogout}
                className="text-mosaic-muted hover:text-white ml-2 shrink-0 cursor-pointer"
                title="Log out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto bg-mosaic-dark p-8">
          {isLoadingGame && (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-8 h-8 animate-spin text-mosaic-accent" />
            </div>
          )}

          {!isLoadingGame && view === 'overview' && (
            <OverviewPanel
              activeGame={activeGame}
              onCreateGame={() => setView('create')}
              onManageGame={() => setView(activeGame?.phase === GAME_PHASE.LOBBY ? 'lobby' : 'round1')}
            />
          )}

          {!isLoadingGame && view === 'config' && (
            <GameConfigurationPanel />
          )}

          {!isLoadingGame && view === 'create' && (
            <CreateGamePanel
              teamName={teamName}
              setTeamName={setTeamName}
              teamSize={teamSize}
              onTeamSizeChange={handleTeamSizeChange}
              playerNames={playerNames}
              setPlayerNames={setPlayerNames}
              onSubmit={handleCreateGame}
              isCreating={isCreating}
              error={createError}
              newGameCode={newGameCode}
              onViewLobby={() => setView('lobby')}
            />
          )}

          {!isLoadingGame && view === 'lobby' && activeGame && (
            <LobbyPanel
              game={activeGame}
              joinedCount={joinedCount}
              allJoined={allJoined}
              onStartGame={handleStartGame}
              isStarting={isStarting}
              startError={startError}
            />
          )}

          {!isLoadingGame && view === 'round1' && activeGame && (
            <Round1Panel game={activeGame} onRefresh={loadActiveGame} />
          )}

          {!isLoadingGame && view === 'round2' && activeGame && (
            <Round2Panel game={activeGame} onRefresh={loadActiveGame} />
          )}

          {!isLoadingGame && view === 'history' && <HistoryPanel />}

          {!isLoadingGame && view === 'questions' && <QuestionsPanel />}
        </main>
      </div>
    </div>
  );
}

// ─── Panels ───────────────────────────────────────────────────────────────────

function OverviewPanel({
  activeGame,
  onCreateGame,
  onManageGame,
}: {
  activeGame: GmGameStateData | null;
  onCreateGame: () => void;
  onManageGame: () => void;
}) {
  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-bold text-white mb-1">MOSAIC Dashboard</h1>
      <p className="text-mosaic-muted mb-8">Game Master Event Control Center</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {!activeGame ? (
          <div className="col-span-2 bg-mosaic-surface border border-mosaic-border rounded-2xl p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-mosaic-accent/10 flex items-center justify-center mx-auto mb-4">
              <Plus className="w-8 h-8 text-mosaic-accent" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">No Active Game</h2>
            <p className="text-mosaic-muted mb-6">Create a new game to generate a lobby for your team.</p>
            <button
              onClick={onCreateGame}
              className="px-6 py-3 bg-gradient-to-r from-mosaic-accent to-mosaic-purple text-black font-semibold rounded-xl hover:opacity-90 transition-all cursor-pointer"
            >
              Create New Game
            </button>
          </div>
        ) : (
          <>
            <div className="bg-mosaic-surface border border-mosaic-border rounded-2xl p-6">
              <p className="text-mosaic-muted text-sm mb-1">Active Game</p>
              <p className="text-2xl font-bold font-mono text-mosaic-accent">{activeGame.gameCode}</p>
              <p className="text-white font-medium mt-1">{activeGame.teamName}</p>
              <div className="mt-3 flex items-center gap-2">
                <span
                  className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${
                    activeGame.phase === GAME_PHASE.ROUND_1_ACTIVE
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : activeGame.phase === GAME_PHASE.LOBBY
                      ? 'bg-mosaic-accent/10 text-mosaic-accent border-mosaic-accent/30'
                      : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30'
                  }`}
                >
                  {activeGame.phase.replace(/_/g, ' ')}
                </span>
              </div>
            </div>

            <div className="bg-mosaic-surface border border-mosaic-border rounded-2xl p-6">
              <p className="text-mosaic-muted text-sm mb-1">Team</p>
              <p className="text-2xl font-bold text-white">
                {activeGame.players.filter((p) => p.status === 'JOINED').length}/{activeGame.teamSize}
              </p>
              <p className="text-mosaic-muted text-sm mt-1">players joined</p>
              <button
                onClick={onManageGame}
                className="mt-4 flex items-center gap-2 text-mosaic-accent text-sm font-medium hover:underline cursor-pointer"
              >
                Manage Game <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CreateGamePanel({
  teamName,
  setTeamName,
  teamSize,
  onTeamSizeChange,
  playerNames,
  setPlayerNames,
  onSubmit,
  isCreating,
  error,
  newGameCode,
  onViewLobby,
}: any) {
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-white mb-1">Create New Game</h1>
      <p className="text-mosaic-muted mb-6">Enter team roster to generate unique lobby code.</p>

      {newGameCode && (
        <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-between">
          <div>
            <p className="text-emerald-400 font-semibold">Game Created! 🎉</p>
            <p className="text-emerald-200/70 text-sm">Share this code with players:</p>
            <p className="text-3xl font-mono font-bold text-white mt-1">{newGameCode}</p>
          </div>
          <button
            onClick={onViewLobby}
            className="px-4 py-2 bg-emerald-500 text-black font-semibold rounded-xl hover:bg-emerald-400 transition-colors cursor-pointer"
          >
            View Lobby →
          </button>
        </div>
      )}

      <form onSubmit={onSubmit} className="bg-mosaic-surface border border-mosaic-border rounded-2xl p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-mosaic-muted mb-1.5">Team Name</label>
          <input
            type="text"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            placeholder="e.g. Cyber Ravens"
            maxLength={50}
            className="w-full bg-mosaic-dark border border-mosaic-border rounded-xl px-4 py-3 text-white focus:outline-none focus:border-mosaic-accent transition-colors"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-mosaic-muted mb-2">Team Size</label>
          <div className="flex gap-3">
            {([5, 6] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onTeamSizeChange(s)}
                className={`flex-1 py-3 rounded-xl border font-semibold text-lg transition-all cursor-pointer ${
                  teamSize === s
                    ? 'bg-mosaic-accent/20 border-mosaic-accent text-white'
                    : 'bg-mosaic-dark border-mosaic-border text-mosaic-muted hover:border-mosaic-accent/40'
                }`}
              >
                {s} Players
              </button>
            ))}
          </div>
          <p className="text-xs text-mosaic-muted mt-2">
            5 players: 5 puzzle QRs + 5 decoys | 6 players: 6 puzzle QRs + 4 decoys
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-mosaic-muted mb-2">Player Roster Names</label>
          <div className="space-y-2">
            {playerNames.map((name: string, idx: number) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="text-mosaic-muted text-sm w-6 text-right shrink-0">{idx + 1}.</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => {
                    const updated = [...playerNames];
                    updated[idx] = e.target.value;
                    setPlayerNames(updated);
                  }}
                  placeholder={`Player ${idx + 1} name`}
                  maxLength={30}
                  className="flex-1 bg-mosaic-dark border border-mosaic-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-mosaic-accent transition-colors"
                />
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={isCreating}
          className="w-full py-3.5 bg-gradient-to-r from-mosaic-accent to-mosaic-purple text-black font-bold rounded-xl hover:opacity-90 disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          {isCreating ? 'Creating...' : 'Create Game & Generate Code'}
        </button>
      </form>
    </div>
  );
}

function LobbyPanel({ game, joinedCount, allJoined, onStartGame, isStarting, startError }: any) {
  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">{game.teamName} — Lobby</h1>
          <p className="text-mosaic-muted text-sm mt-0.5">Waiting for players to claim their roster slots</p>
        </div>
        <div className="text-right">
          <p className="text-mosaic-muted text-xs mb-0.5">Game Code</p>
          <p className="text-3xl font-mono font-bold text-mosaic-accent">{game.gameCode}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-mosaic-surface border border-mosaic-border rounded-2xl p-5">
          <p className="text-mosaic-muted text-xs mb-1">Joined</p>
          <p className="text-3xl font-bold text-white">
            {joinedCount}
            <span className="text-mosaic-muted text-lg">/{game.teamSize}</span>
          </p>
        </div>
        <div className="bg-mosaic-surface border border-mosaic-border rounded-2xl p-5">
          <p className="text-mosaic-muted text-xs mb-1">Team Size</p>
          <p className="text-3xl font-bold text-white">{game.teamSize}</p>
        </div>
        <div className="bg-mosaic-surface border border-mosaic-border rounded-2xl p-5">
          <p className="text-mosaic-muted text-xs mb-1">Status</p>
          <p className={`text-lg font-bold ${allJoined ? 'text-emerald-400' : 'text-yellow-400'}`}>
            {allJoined ? '✅ All Joined — Ready' : '⏳ Waiting for Players'}
          </p>
        </div>
      </div>

      <div className="bg-mosaic-surface border border-mosaic-border rounded-2xl p-5 mb-6">
        <h2 className="text-white font-semibold mb-4 flex items-center gap-2">
          <Users className="w-4 h-4 text-mosaic-accent" /> Player Roster
        </h2>
        <div className="space-y-2">
          {game.players.map((p: any) => {
            const joined = p.status === 'JOINED';
            return (
              <div
                key={p.id || p.playerName}
                className={`flex items-center justify-between px-4 py-3 rounded-xl border ${
                  joined
                    ? 'bg-emerald-500/5 border-emerald-500/20'
                    : 'bg-mosaic-dark border-mosaic-border/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      joined ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-500'
                    }`}
                  >
                    {p.playerName.charAt(0).toUpperCase()}
                  </div>
                  <span className={`font-medium ${joined ? 'text-white' : 'text-mosaic-muted'}`}>
                    {p.playerName}
                  </span>
                </div>
                {joined ? (
                  <span className="flex items-center gap-1 text-xs text-emerald-400">
                    <CheckCircle className="w-3.5 h-3.5" /> Joined
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-mosaic-muted">
                    <Clock className="w-3.5 h-3.5" /> Waiting
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {startError && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl mb-4">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <p className="text-red-400 text-sm">{startError}</p>
        </div>
      )}

      <button
        onClick={onStartGame}
        disabled={!allJoined || isStarting}
        className="w-full py-4 bg-gradient-to-r from-mosaic-accent to-mosaic-purple text-black font-bold text-lg rounded-2xl hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-3 cursor-pointer shadow-lg shadow-mosaic-accent/20"
      >
        {isStarting ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <Play className="w-5 h-5 fill-black" />
        )}
        {isStarting ? 'Starting Round 1...' : 'START GAME'}
      </button>
      {!allJoined && (
        <p className="text-center text-mosaic-muted text-xs mt-2">
          Start Game unlocks once all {game.teamSize} registered players have claimed their names
        </p>
      )}
    </div>
  );
}

function Round1Panel({ game, onRefresh }: { game: GmGameStateData; onRefresh: () => void }) {
  const [timer, setTimer] = useState('4:00');
  const [isCritical, setIsCritical] = useState(false);
  const [showEndModal, setShowEndModal] = useState(false);
  const [showRestartModal, setShowRestartModal] = useState(false);
  const [showResetR1Modal, setShowResetR1Modal] = useState(false);
  const [showTerminateR1Modal, setShowTerminateR1Modal] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (game.isPaused && game.pausedRemainingMs !== undefined && game.pausedRemainingMs !== null) {
      const rem = Math.max(0, game.pausedRemainingMs);
      const m = Math.floor(rem / 60000);
      const s = Math.floor((rem % 60000) / 1000);
      setTimer(`${m}:${s.toString().padStart(2, '0')}`);
      setIsCritical(rem < 60000);
      return;
    }
    if (!game.phaseEndsAt) return;
    const tick = () => {
      const rem = Math.max(0, new Date(game.phaseEndsAt!).getTime() - Date.now());
      const m = Math.floor(rem / 60000);
      const s = Math.floor((rem % 60000) / 1000);
      setTimer(`${m}:${s.toString().padStart(2, '0')}`);
      setIsCritical(rem < 60000);
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [game.phaseEndsAt, game.isPaused, game.pausedRemainingMs]);

  const puzzleUnlocked = game.puzzlePieces.filter((p) => p.isUnlocked).length;
  const totalPieces = game.puzzlePieces.length;
  const puzzlePct = totalPieces > 0 ? (puzzleUnlocked / totalPieces) * 100 : 0;
  const isComplete = game.phase === GAME_PHASE.ROUND_1_COMPLETE;

  async function handleTogglePause() {
    setIsActionLoading(true);
    setActionError(null);
    const res = game.isPaused ? await resumeGame(game.id) : await pauseGame(game.id);
    setIsActionLoading(false);
    if (!res.success) {
      setActionError(res.error?.message || 'Failed to toggle pause.');
      return;
    }
    onRefresh();
  }

  async function handleResetRound1() {
    setIsActionLoading(true);
    setActionError(null);
    const res = await resetRound1(game.id);
    setIsActionLoading(false);
    if (!res.success) {
      setActionError(res.error?.message || 'Failed to reset Round 1.');
      return;
    }
    setShowResetR1Modal(false);
    onRefresh();
  }

  async function handleTerminateRound1() {
    setIsActionLoading(true);
    setActionError(null);
    const res = await terminateRound1(game.id);
    setIsActionLoading(false);
    if (!res.success) {
      setActionError(res.error?.message || 'Failed to terminate Round 1.');
      return;
    }
    setShowTerminateR1Modal(false);
    onRefresh();
  }

  async function handleEmergencyEnd() {
    setIsActionLoading(true);
    setActionError(null);
    const res = await emergencyEndRound(game.id);
    setIsActionLoading(false);
    if (!res.success) {
      setActionError(res.error?.message || 'Failed to end round.');
      return;
    }
    setShowEndModal(false);
    onRefresh();
  }

  async function handleRestart() {
    setIsActionLoading(true);
    setActionError(null);
    const res = await restartGame(game.id);
    setIsActionLoading(false);
    if (!res.success) {
      setActionError(res.error?.message || 'Failed to restart game.');
      return;
    }
    setShowRestartModal(false);
    onRefresh();
  }

  async function handleStartTransition() {
    setIsActionLoading(true);
    setActionError(null);
    const res = await gmStartTransition(game.id);
    setIsActionLoading(false);
    if (!res.success) {
      setActionError(res.error?.message || 'Failed to start transition.');
      return;
    }
    onRefresh();
  }

  return (
    <div className="max-w-5xl space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-white">{game.teamName}</h1>
            <span
              className={`px-3 py-1 text-xs font-semibold rounded-full border ${
                isComplete
                  ? 'bg-zinc-800 text-zinc-300 border-zinc-700'
                  : game.isPaused
                  ? 'bg-amber-500/15 text-amber-400 border-amber-500/40'
                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
              }`}
            >
              {isComplete ? 'ROUND 1 COMPLETE' : game.isPaused ? 'ROUND 1 PAUSED' : 'PUZZLE SOLVING ACTIVE'}
            </span>
          </div>
          <p className="text-mosaic-muted text-sm mt-1">
            Round 1: Puzzle Solving • Code: <span className="font-mono text-mosaic-accent font-semibold">{game.gameCode}</span>
          </p>
        </div>

        {/* Round Control Action Bar */}
        <div className="flex flex-wrap items-center gap-2.5">
          {!isComplete && (
            <button
              onClick={handleTogglePause}
              disabled={isActionLoading}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                game.isPaused
                  ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/30'
                  : 'bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25'
              }`}
            >
              {game.isPaused ? <Play className="w-3.5 h-3.5 fill-current" /> : <Pause className="w-3.5 h-3.5" />}
              {game.isPaused ? 'Resume Round 1' : 'Pause Round 1'}
            </button>
          )}

          <button
            onClick={() => setShowResetR1Modal(true)}
            disabled={isActionLoading}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-mosaic-surface border border-mosaic-border rounded-xl text-xs font-medium text-mosaic-muted hover:text-white transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Round 1
          </button>

          {!isComplete && (
            <button
              onClick={() => setShowTerminateR1Modal(true)}
              disabled={isActionLoading}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-red-500/10 border border-red-500/30 rounded-xl text-xs font-medium text-red-400 hover:bg-red-500/20 transition-colors cursor-pointer"
            >
              <StopCircle className="w-3.5 h-3.5" />
              Terminate Round 1
            </button>
          )}

          <button
            onClick={onRefresh}
            className="px-3.5 py-2 bg-mosaic-surface border border-mosaic-border rounded-xl text-xs font-medium text-mosaic-muted hover:text-white transition-colors cursor-pointer"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Paused Alert Banner */}
      {game.isPaused && (
        <div className="p-4 bg-amber-500/15 border border-amber-500/40 rounded-2xl flex items-center justify-between gap-4 text-amber-300">
          <div className="flex items-center gap-3">
            <Pause className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <p className="font-bold text-sm text-white">ROUND 1 IS CURRENTLY PAUSED</p>
              <p className="text-xs text-amber-300/80">Authoritative server timer is frozen. Player scanning and answering are rejected until resumed.</p>
            </div>
          </div>
          <button
            onClick={handleTogglePause}
            className="px-4 py-2 bg-amber-500 text-black font-bold text-xs rounded-xl hover:bg-amber-400 cursor-pointer whitespace-nowrap"
          >
            Resume Now
          </button>
        </div>
      )}

      {actionError && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <p className="text-red-400 text-sm">{actionError}</p>
        </div>
      )}

      {isComplete && (
        <div className="bg-gradient-to-r from-yellow-500/15 via-mosaic-surface to-mosaic-surface border border-yellow-500/50 rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl shadow-yellow-500/5">
          <div>
            <h3 className="text-white font-bold text-lg flex items-center gap-2">
              <Shield className="w-5 h-5 text-yellow-400" /> Round 1 is Complete!
            </h3>
            <p className="text-mosaic-muted text-sm mt-1">
              Advance all players to the Transition phase to secretly assign roles (1 Imposter) and physical task zones.
            </p>
          </div>
          <button
            onClick={handleStartTransition}
            disabled={isActionLoading}
            className="px-6 py-3 bg-gradient-to-r from-yellow-400 to-amber-500 text-black font-bold rounded-xl hover:opacity-90 transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer shadow-lg shadow-yellow-500/20 disabled:opacity-50"
          >
            {isActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
            START TRANSITION & ROLE ASSIGNMENT
          </button>
        </div>
      )}

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Large Master Countdown */}
        <div
          className={`bg-mosaic-surface border rounded-2xl p-5 ${
            isCritical && !isComplete ? 'border-red-500/50 bg-red-500/5' : 'border-mosaic-border'
          }`}
        >
          <p className="text-mosaic-muted text-xs font-medium mb-1 uppercase tracking-wider">Master Timer</p>
          {isComplete ? (
            <p className="text-3xl font-bold text-zinc-400">0:00</p>
          ) : (
            <p
              className={`text-4xl font-mono font-bold tabular-nums ${
                isCritical ? 'text-red-400 animate-pulse' : 'text-white'
              }`}
            >
              {timer}
            </p>
          )}
          <p className="text-xs text-mosaic-muted mt-2">Authoritative server sync</p>
        </div>

        {/* Puzzle Progress */}
        <div className="bg-mosaic-surface border border-mosaic-border rounded-2xl p-5">
          <p className="text-mosaic-muted text-xs font-medium mb-1 uppercase tracking-wider">Puzzle Solved</p>
          <p className="text-4xl font-bold text-white">
            {puzzleUnlocked}
            <span className="text-mosaic-muted text-2xl font-normal">/{totalPieces}</span>
          </p>
          <div className="mt-3 h-2 bg-mosaic-dark rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-mosaic-accent to-mosaic-purple transition-all duration-500 rounded-full"
              style={{ width: `${puzzlePct}%` }}
            />
          </div>
        </div>

        {/* QR Completed */}
        <div className="bg-mosaic-surface border border-mosaic-border rounded-2xl p-5">
          <p className="text-mosaic-muted text-xs font-medium mb-1 uppercase tracking-wider">QRs Solved</p>
          <p className="text-4xl font-bold text-white">
            {game.qrMappings?.filter((m) => m.isCompleted).length ?? 0}
            <span className="text-mosaic-muted text-2xl font-normal">/{game.qrMappings?.length ?? 10}</span>
          </p>
          <p className="text-xs text-mosaic-muted mt-2">Fixed physical QR pool</p>
        </div>

        {/* Round Result / Phase */}
        <div
          className={`bg-mosaic-surface border rounded-2xl p-5 ${
            isComplete ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-mosaic-border'
          }`}
        >
          <p className="text-mosaic-muted text-xs font-medium mb-1 uppercase tracking-wider">Round Status</p>
          <p className={`text-2xl font-bold ${isComplete ? 'text-emerald-400' : 'text-white'}`}>
            {isComplete ? 'ROUND COMPLETE' : 'IN PROGRESS'}
          </p>
          <p className="text-xs text-mosaic-muted mt-2">
            {game.result ? `Result: ${game.result}` : 'Awaiting completion'}
          </p>
        </div>
      </div>

      {/* Visual Puzzle Pieces State */}
      <div className="bg-mosaic-surface border border-mosaic-border rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-semibold flex items-center gap-2">
            <Puzzle className="w-4 h-4 text-mosaic-accent" /> Puzzle Blueprint Pieces
          </h2>
          <span className="text-xs text-mosaic-muted">
            {puzzleUnlocked === totalPieces && totalPieces > 0
              ? '🎉 Full Blueprint Unlocked!'
              : `${totalPieces - puzzleUnlocked} pieces remaining`}
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {game.puzzlePieces.map((piece) => (
            <div
              key={piece.pieceIndex}
              className={`p-4 rounded-xl border text-center transition-all ${
                piece.isUnlocked
                  ? 'bg-cyan-500/10 border-cyan-400/40 text-cyan-300 shadow-[0_0_15px_rgba(0,242,254,0.15)]'
                  : 'bg-mosaic-dark/80 border-mosaic-border/60 text-mosaic-muted'
              }`}
            >
              <div className="flex justify-center mb-2">
                {piece.isUnlocked ? (
                  <CheckCircle className="w-5 h-5 text-cyan-400" />
                ) : (
                  <Lock className="w-5 h-5 text-mosaic-muted/50" />
                )}
              </div>
              <p className="font-mono font-bold text-sm text-white">Piece {piece.pieceIndex + 1}</p>
              <p className="text-[11px] mt-1">
                {piece.isUnlocked ? (
                  <span className="text-cyan-400 font-medium">✓ Unlocked</span>
                ) : (
                  <span className="text-mosaic-muted/60">Locked</span>
                )}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* QR Codes Mapping & Status */}
      {game.qrMappings && game.qrMappings.length > 0 && (
        <div className="bg-mosaic-surface border border-mosaic-border rounded-2xl p-6">
          <h2 className="text-white font-semibold mb-4">Physical QR Codes Status (QR-01 through QR-10)</h2>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {game.qrMappings.map((m) => (
              <div
                key={m.qrCodeId}
                className={`p-4 rounded-xl border transition-all ${
                  m.isCompleted
                    ? m.qrType === 'PUZZLE'
                      ? 'bg-cyan-500/10 border-cyan-400/40'
                      : 'bg-purple-500/10 border-purple-400/40'
                    : 'bg-mosaic-dark border-mosaic-border/50'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono font-bold text-sm text-white">{m.qrCodeId}</span>
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded font-mono ${
                      m.qrType === 'PUZZLE'
                        ? 'bg-cyan-500/20 text-cyan-300'
                        : 'bg-purple-500/20 text-purple-300'
                    }`}
                  >
                    {m.qrType}
                  </span>
                </div>
                <p className="text-xs text-mosaic-muted mt-1">
                  {m.qrType === 'PUZZLE' && m.puzzlePieceIndex !== null
                    ? `Piece #${m.puzzlePieceIndex + 1}`
                    : 'Decoy QR'}
                </p>
                <div className="mt-2 pt-2 border-t border-mosaic-border/40 flex items-center justify-between text-xs">
                  <span className="text-mosaic-muted">{m.questionsCount} Qs</span>
                  {m.isCompleted ? (
                    <span className="text-emerald-400 font-medium">✓ Solved</span>
                  ) : (
                    <span className="text-zinc-500">Unsolved</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Player Status & Lives */}
      <div className="bg-mosaic-surface border border-mosaic-border rounded-2xl p-6">
        <h2 className="text-white font-semibold mb-4 flex items-center gap-2">
          <Users className="w-4 h-4 text-mosaic-accent" /> Player Lives & Status
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {game.players.map((p) => (
            <div
              key={p.id}
              className={`flex items-center justify-between px-4 py-3 rounded-xl border ${
                p.lives === 0
                  ? 'bg-red-500/10 border-red-500/40'
                  : p.lives === 1
                  ? 'bg-yellow-500/10 border-yellow-500/30'
                  : 'bg-mosaic-dark border-mosaic-border/50'
              }`}
            >
              <div>
                <p className="text-sm font-semibold text-white">{p.playerName}</p>
                <p className="text-xs text-mosaic-muted">
                  {p.lives === 0 ? '❌ 0 lives (Round Over)' : `${p.lives} / 2 lives`}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-3.5 h-3.5 rounded-full transition-all ${
                      i < p.lives ? 'bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.5)]' : 'bg-zinc-700'
                    }`}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Activity Log */}
      {game.recentEvents && game.recentEvents.length > 0 && (
        <div className="bg-mosaic-surface border border-mosaic-border rounded-2xl p-6">
          <h2 className="text-white font-semibold mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-mosaic-accent" /> Recent Activity Log
          </h2>
          <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
            {game.recentEvents.slice().reverse().map((ev) => (
              <div
                key={ev._id}
                className="flex items-center justify-between text-xs px-3.5 py-2.5 rounded-lg bg-mosaic-dark/80 border border-mosaic-border/40"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-mosaic-accent font-semibold">{ev.eventType}</span>
                  <span className="text-mosaic-muted truncate max-w-xs">
                    {ev.eventData ? JSON.stringify(ev.eventData) : ''}
                  </span>
                </div>
                <span className="text-mosaic-muted/60 shrink-0 ml-4 font-mono">
                  {new Date(ev.occurredAt).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Confirmation Modal: Emergency End */}
      {showEndModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-mosaic-surface border border-red-500/40 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-3 text-red-400 mb-3">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-lg font-bold text-white">Emergency End Round 1?</h3>
            </div>
            <p className="text-mosaic-muted text-sm leading-relaxed mb-6">
              This will immediately freeze all puzzle progress, stop new QR scans, and end Round 1 for all players. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                disabled={isActionLoading}
                onClick={() => setShowEndModal(false)}
                className="px-4 py-2.5 rounded-xl border border-mosaic-border text-mosaic-muted hover:text-white text-sm cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isActionLoading}
                onClick={handleEmergencyEnd}
                className="px-4 py-2.5 rounded-xl bg-red-500 text-white font-semibold text-sm hover:bg-red-400 transition-colors flex items-center gap-2 cursor-pointer"
              >
                {isActionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                Confirm End Round
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Restart Game */}
      {showRestartModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-mosaic-surface border border-yellow-500/40 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-3 text-yellow-400 mb-3">
              <RotateCcw className="w-6 h-6" />
              <h3 className="text-lg font-bold text-white">Restart Game to Lobby?</h3>
            </div>
            <p className="text-mosaic-muted text-sm leading-relaxed mb-6">
              This will reset puzzle pieces, restore all player lives to 2, and return the game to LOBBY status. Existing players will remain connected.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                disabled={isActionLoading}
                onClick={() => setShowRestartModal(false)}
                className="px-4 py-2.5 rounded-xl border border-mosaic-border text-mosaic-muted hover:text-white text-sm cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isActionLoading}
                onClick={handleRestart}
                className="px-4 py-2.5 rounded-xl bg-yellow-500 text-black font-semibold text-sm hover:bg-yellow-400 transition-colors flex items-center gap-2 cursor-pointer"
              >
                {isActionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                Confirm Restart
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Confirmation Modal: Reset Round 1 */}
      {showResetR1Modal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-mosaic-surface border border-yellow-500/40 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-yellow-400">
              <RotateCcw className="w-6 h-6" />
              <h3 className="text-lg font-bold text-white">Reset Round 1?</h3>
            </div>
            <p className="text-mosaic-muted text-sm leading-relaxed">
              This resets Round 1 specific state: the master timer restarts to the configured duration (4 minutes), player lives are restored to starting lives, and unlocked puzzle pieces are locked again. Round 2 state, configuration snapshots, and connected players remain unchanged.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isActionLoading}
                onClick={() => setShowResetR1Modal(false)}
                className="px-4 py-2.5 rounded-xl border border-mosaic-border text-mosaic-muted hover:text-white text-sm cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isActionLoading}
                onClick={handleResetRound1}
                className="px-4 py-2.5 rounded-xl bg-yellow-500 text-black font-semibold text-sm hover:bg-yellow-400 transition-colors flex items-center gap-2 cursor-pointer"
              >
                {isActionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                Confirm Reset Round 1
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Terminate Round 1 */}
      {showTerminateR1Modal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-mosaic-surface border border-red-500/40 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-400">
              <StopCircle className="w-6 h-6" />
              <h3 className="text-lg font-bold text-white">Terminate Round 1?</h3>
            </div>
            <p className="text-mosaic-muted text-sm leading-relaxed">
              This will immediately stop Round 1, stop its timers, mark Round 1 complete, and reject any further answer attempts.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isActionLoading}
                onClick={() => setShowTerminateR1Modal(false)}
                className="px-4 py-2.5 rounded-xl border border-mosaic-border text-mosaic-muted hover:text-white text-sm cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isActionLoading}
                onClick={handleTerminateRound1}
                className="px-4 py-2.5 rounded-xl bg-red-500 text-white font-semibold text-sm hover:bg-red-400 transition-colors flex items-center gap-2 cursor-pointer"
              >
                {isActionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                Confirm Terminate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Phase 3: Round 2 Panel ───────────────────────────────────────────────────

function Round2Panel({ game, onRefresh }: { game: GmGameStateData; onRefresh: () => void }) {
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isStartingR2, setIsStartingR2] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [r2Timer, setR2Timer] = useState('');
  const [phaseTimer, setPhaseTimer] = useState('');
  const [showResetR2Modal, setShowResetR2Modal] = useState(false);
  const [showTerminateR2Modal, setShowTerminateR2Modal] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);

  useEffect(() => {
    const tick = () => {
      if (game.isPaused) {
        if (typeof game.pausedRound2RemainingMs === 'number') {
          const rem = Math.max(0, game.pausedRound2RemainingMs);
          const m = Math.floor(rem / 60000);
          const s = Math.floor((rem % 60000) / 1000);
          setR2Timer(`${m}:${s.toString().padStart(2, '0')}`);
        }
        if (typeof game.pausedRemainingMs === 'number') {
          const rem2 = Math.max(0, game.pausedRemainingMs);
          setPhaseTimer(`${Math.floor(rem2 / 1000)}s`);
        }
        return;
      }

      if (game.round2EndsAt) {
        const rem = Math.max(0, new Date(game.round2EndsAt).getTime() - Date.now());
        const m = Math.floor(rem / 60000);
        const s = Math.floor((rem % 60000) / 1000);
        setR2Timer(`${m}:${s.toString().padStart(2, '0')}`);
      }
      if (game.phaseEndsAt && game.phase !== GAME_PHASE.ROUND_2_ACTIVE) {
        const rem2 = Math.max(0, new Date(game.phaseEndsAt).getTime() - Date.now());
        setPhaseTimer(`${Math.floor(rem2 / 1000)}s`);
      }
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [game.round2EndsAt, game.phaseEndsAt, game.phase, game.isPaused, game.pausedRound2RemainingMs, game.pausedRemainingMs]);

  async function handleStartTransition() {
    setIsTransitioning(true);
    setActionError(null);
    const res = await gmStartTransition(game.id);
    setIsTransitioning(false);
    if (!res.success) {
      setActionError(res.error?.message || 'Failed to start transition.');
      return;
    }
    onRefresh();
  }

  async function handleStartRound2() {
    setIsStartingR2(true);
    setActionError(null);
    const res = await gmStartRound2(game.id);
    setIsStartingR2(false);
    if (!res.success) {
      setActionError(res.error?.message || 'Failed to start Round 2.');
      return;
    }
    onRefresh();
  }

  async function handleTogglePauseR2() {
    setIsActionLoading(true);
    setActionError(null);
    const res = game.isPaused ? await resumeGame(game.id) : await pauseGame(game.id);
    setIsActionLoading(false);
    if (!res.success) {
      setActionError(res.error?.message || 'Failed to toggle pause state.');
      return;
    }
    onRefresh();
  }

  async function handleResetRound2() {
    setIsActionLoading(true);
    setActionError(null);
    const res = await resetRound2(game.id);
    setIsActionLoading(false);
    setShowResetR2Modal(false);
    if (!res.success) {
      setActionError(res.error?.message || 'Failed to reset Round 2.');
      return;
    }
    onRefresh();
  }

  async function handleTerminateRound2() {
    setIsActionLoading(true);
    setActionError(null);
    const res = await terminateRound2(game.id);
    setIsActionLoading(false);
    setShowTerminateR2Modal(false);
    if (!res.success) {
      setActionError(res.error?.message || 'Failed to terminate Round 2.');
      return;
    }
    onRefresh();
  }

  const phase = game.phase;
  const isTransition = phase === GAME_PHASE.TRANSITION;
  const isRound2 = phase === GAME_PHASE.ROUND_2_ACTIVE;
  const isBodyReport = phase === GAME_PHASE.BODY_REPORT;
  const isMoveToVoting = phase === GAME_PHASE.MOVE_TO_VOTING;
  const isVoting = phase === GAME_PHASE.VOTING;
  const isComplete = phase === GAME_PHASE.GAME_COMPLETE;

  const phaseLabel: Record<string, string> = {
    ROUND_1_COMPLETE: 'Round 1 Complete — Start Transition',
    TRANSITION: 'Transition (Role Assignment)',
    ROUND_2_ACTIVE: 'Round 2 Active',
    BODY_REPORT: 'Body Report Window',
    MOVE_TO_VOTING: 'Moving to Voting',
    VOTING: 'Voting in Progress',
    GAME_COMPLETE: 'Game Complete',
  };

  const aliveCount = game.players.filter(p => p.status === 'ALIVE').length;
  const eliminatedCount = game.players.filter(p => p.status === 'ELIMINATED').length;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">{game.teamName}</h1>
          <p className="text-mosaic-muted text-sm mt-1">
            Phase 3: Deception • <span className="font-mono text-mosaic-accent">{game.gameCode}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1 text-xs font-semibold rounded-full border ${
            isComplete ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
            : isRound2 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
            : isTransition ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30'
            : 'bg-red-500/10 text-red-400 border-red-500/30'
          }`}>
            {phaseLabel[phase] ?? phase.replace(/_/g, ' ')}
          </span>
          <button onClick={onRefresh} className="px-3 py-2 bg-mosaic-surface border border-mosaic-border rounded-xl text-xs text-mosaic-muted hover:text-white transition-colors cursor-pointer">
            Refresh
          </button>
        </div>
      </div>

      {actionError && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <p className="text-red-400 text-sm">{actionError}</p>
        </div>
      )}

      {/* Paused Banner */}
      {game.isPaused && (
        <div className="p-4 bg-yellow-500/15 border border-yellow-500/40 rounded-2xl flex items-center justify-between gap-3 text-yellow-300">
          <div className="flex items-center gap-3">
            <Pause className="w-6 h-6 shrink-0 text-yellow-400 animate-pulse" />
            <div>
              <p className="font-bold text-sm tracking-wide">ROUND 2 PAUSED BY GAME MASTER</p>
              <p className="text-xs text-yellow-300/80">
                All timers are authoritatively frozen on the server. Player actions (kills, reports, votes) are blocked until resumed.
              </p>
            </div>
          </div>
          <button
            onClick={handleTogglePauseR2}
            disabled={isActionLoading}
            className="px-4 py-2 bg-yellow-400 text-black font-bold text-xs rounded-xl hover:bg-yellow-300 transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer"
          >
            {isActionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
            Resume Game
          </button>
        </div>
      )}

      {/* GM Round 2 Controls Bar (Pause, Reset Round 2, Terminate Round 2) */}
      {!isComplete && phase !== GAME_PHASE.ROUND_1_COMPLETE && (
        <div className="bg-mosaic-surface/90 border border-mosaic-border rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-mosaic-accent" />
            <span className="text-xs font-semibold text-white uppercase tracking-wider">Round 2 Control Center</span>
            {game.roundRevision ? (
              <span className="text-[10px] bg-mosaic-dark px-2 py-0.5 rounded font-mono text-mosaic-muted">
                rev #{game.roundRevision}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleTogglePauseR2}
              disabled={isActionLoading}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl border flex items-center gap-1.5 transition-colors cursor-pointer ${
                game.isPaused
                  ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40 hover:bg-yellow-500/30'
                  : 'bg-mosaic-dark text-mosaic-muted border-mosaic-border hover:text-white'
              }`}
            >
              {isActionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : game.isPaused ? <PlayCircle className="w-3.5 h-3.5 text-yellow-400" /> : <Pause className="w-3.5 h-3.5" />}
              {game.isPaused ? 'Resume Round 2' : 'Pause Round 2'}
            </button>
            <button
              onClick={() => setShowResetR2Modal(true)}
              disabled={isActionLoading}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-xl border border-yellow-500/30 text-yellow-400 bg-yellow-500/10 hover:bg-yellow-500/20 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Round 2
            </button>
            <button
              onClick={() => setShowTerminateR2Modal(true)}
              disabled={isActionLoading}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-xl border border-red-500/30 text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <StopCircle className="w-3.5 h-3.5" />
              Terminate Round 2
            </button>
          </div>
        </div>
      )}

      {/* GM Action Controls */}
      {phase === GAME_PHASE.ROUND_1_COMPLETE && (
        <div className="bg-mosaic-surface border border-yellow-500/40 rounded-2xl p-6">
          <h2 className="text-white font-semibold mb-3 flex items-center gap-2">
            <Shield className="w-4 h-4 text-yellow-400" /> Start Transition Phase
          </h2>
          <p className="text-mosaic-muted text-sm mb-4">
            This will randomly assign roles (1 Imposter, rest Crewmates) and physical tasks. Each player receives their secret role privately.
          </p>
          <button
            onClick={handleStartTransition}
            disabled={isTransitioning}
            className="px-6 py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-xl transition-all disabled:opacity-50 flex items-center gap-2 cursor-pointer"
          >
            {isTransitioning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-black" />}
            Begin Transition
          </button>
        </div>
      )}

      {isTransition && (
        <div className="bg-mosaic-surface border border-yellow-500/40 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-semibold flex items-center gap-2">
              <Clock className="w-4 h-4 text-yellow-400" /> Transition Timer
            </h2>
            <div className="text-2xl font-mono font-bold text-yellow-300">{phaseTimer}</div>
          </div>
          <p className="text-mosaic-muted text-sm mb-4">
            Players are reading their secret roles and task assignments. When ready, manually start Round 2 (or it auto-starts when timer expires).
          </p>
          <button
            onClick={handleStartRound2}
            disabled={isStartingR2}
            className="px-6 py-3 bg-gradient-to-r from-mosaic-accent to-mosaic-purple text-black font-bold rounded-xl transition-all disabled:opacity-50 flex items-center gap-2 cursor-pointer shadow-lg shadow-mosaic-accent/20"
          >
            {isStartingR2 ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-black" />}
            START ROUND 2 NOW
          </button>
        </div>
      )}

      {/* Status KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-mosaic-surface border border-mosaic-border rounded-2xl p-5">
          <p className="text-mosaic-muted text-xs font-medium mb-1 uppercase tracking-wider">R2 Master Timer</p>
          <p className="text-3xl font-mono font-bold text-white">{r2Timer || '—'}</p>
          <p className="text-xs text-mosaic-muted mt-1">Continuous</p>
        </div>
        <div className="bg-mosaic-surface border border-mosaic-border rounded-2xl p-5">
          <p className="text-mosaic-muted text-xs font-medium mb-1 uppercase tracking-wider">Kills</p>
          <p className="text-3xl font-bold text-red-400">{game.killCount ?? 0}<span className="text-mosaic-muted text-xl font-normal">/2</span></p>
        </div>
        <div className="bg-mosaic-surface border border-mosaic-border rounded-2xl p-5">
          <p className="text-mosaic-muted text-xs font-medium mb-1 uppercase tracking-wider">Alive / Dead</p>
          <p className="text-3xl font-bold text-emerald-400">{aliveCount} <span className="text-mosaic-muted text-xl font-normal">/ {eliminatedCount}</span></p>
        </div>
        <div className="bg-mosaic-surface border border-mosaic-border rounded-2xl p-5">
          <p className="text-mosaic-muted text-xs font-medium mb-1 uppercase tracking-wider">Voting Cycles</p>
          <p className="text-3xl font-bold text-purple-400">{game.votingCycle ?? 0}</p>
        </div>
      </div>

      {/* Phase status card */}
      {(isBodyReport || isMoveToVoting || isVoting) && (
        <div className={`bg-mosaic-surface border rounded-2xl p-5 ${
          isBodyReport ? 'border-red-500/40' : isMoveToVoting ? 'border-yellow-500/40' : 'border-purple-500/40'
        }`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-mosaic-muted mb-1">Current Sub-Phase</p>
              <p className={`text-xl font-bold ${
                isBodyReport ? 'text-red-300' : isMoveToVoting ? 'text-yellow-300' : 'text-purple-300'
              }`}>
                {isBodyReport ? 'Body Report Window' : isMoveToVoting ? 'Move to Voting' : 'Voting'}
              </p>
            </div>
            <div className={`text-3xl font-mono font-bold ${
              isBodyReport ? 'text-red-400' : isMoveToVoting ? 'text-yellow-400' : 'text-purple-400'
            }`}>
              {phaseTimer}
            </div>
          </div>
        </div>
      )}

      {/* Result card */}
      {isComplete && (
        <div className="bg-mosaic-surface border border-emerald-500/30 rounded-2xl p-6 text-center">
          <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
          <h2 className="text-2xl font-bold text-white mb-1">Game Complete!</h2>
          <p className={`text-lg font-semibold ${
            game.result === 'CREWMATES_WIN' ? 'text-emerald-400'
            : game.result?.includes('IMPOSTER') ? 'text-red-400'
            : 'text-mosaic-muted'
          }`}>
            {game.result?.replace(/_/g, ' ') ?? 'Game ended'}
          </p>
        </div>
      )}

      {/* Players with roles */}
      <div className="bg-mosaic-surface border border-mosaic-border rounded-2xl p-6">
        <h2 className="text-white font-semibold mb-4 flex items-center gap-2">
          <Users className="w-4 h-4 text-mosaic-accent" /> Players (Roles visible to GM only)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {game.players.map(p => (
            <div key={p.id} className={`flex items-center justify-between px-4 py-3 rounded-xl border ${
              p.status === 'ELIMINATED'
                ? 'bg-red-500/5 border-red-500/20'
                : p.role === 'IMPOSTER'
                ? 'bg-red-950/30 border-red-700/40'
                : 'bg-mosaic-dark border-mosaic-border/50'
            }`}>
              <div className="flex items-center gap-2">
                {p.role === 'IMPOSTER'
                  ? <Skull className="w-4 h-4 text-red-400" />
                  : <Shield className="w-4 h-4 text-emerald-400" />
                }
                <div>
                  <p className={`text-sm font-semibold ${p.status === 'ELIMINATED' ? 'line-through text-mosaic-muted' : 'text-white'}`}>
                    {p.playerName}
                  </p>
                  {p.assignedTaskName && (
                    <p className="text-xs text-mosaic-muted">Zone {p.assignedTaskZone}: {p.assignedTaskName}</p>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                  p.role === 'IMPOSTER'
                    ? 'bg-red-500/10 text-red-400 border-red-500/30'
                    : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                }`}>
                  {p.role ?? 'Unassigned'}
                </span>
                <span className={`text-xs ${
                  p.status === 'ELIMINATED' ? 'text-red-400' :
                  p.status === 'ALIVE' ? 'text-emerald-400' : 'text-mosaic-muted'
                }`}>
                  {p.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Events */}
      {game.recentEvents && game.recentEvents.length > 0 && (
        <div className="bg-mosaic-surface border border-mosaic-border rounded-2xl p-6">
          <h2 className="text-white font-semibold mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-mosaic-accent" /> Recent Activity
          </h2>
          <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
            {game.recentEvents.slice().reverse().map((ev) => (
              <div key={ev._id} className="flex items-center justify-between text-xs px-3.5 py-2.5 rounded-lg bg-mosaic-dark/80 border border-mosaic-border/40">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-mosaic-accent font-semibold">{ev.eventType}</span>
                  <span className="text-mosaic-muted truncate max-w-xs">{ev.eventData ? JSON.stringify(ev.eventData) : ''}</span>
                </div>
                <span className="text-mosaic-muted/60 shrink-0 ml-4 font-mono">{new Date(ev.occurredAt).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Confirmation Modal: Reset Round 2 */}
      {showResetR2Modal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-mosaic-surface border border-yellow-500/40 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-yellow-400">
              <RotateCcw className="w-6 h-6" />
              <h3 className="text-lg font-bold text-white">Reset Round 2?</h3>
            </div>
            <p className="text-mosaic-muted text-sm leading-relaxed">
              This will restart Round 2, regenerate secret roles and physical task assignments, restore player statuses to alive, reset kills to 0, reset voting cycles, and restart the Round 2 timer to full duration. Round 1 progress remains preserved.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isActionLoading}
                onClick={() => setShowResetR2Modal(false)}
                className="px-4 py-2.5 rounded-xl border border-mosaic-border text-mosaic-muted hover:text-white text-sm cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isActionLoading}
                onClick={handleResetRound2}
                className="px-4 py-2.5 rounded-xl bg-yellow-500 text-black font-semibold text-sm hover:bg-yellow-400 transition-colors flex items-center gap-2 cursor-pointer"
              >
                {isActionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                Confirm Reset Round 2
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Terminate Round 2 */}
      {showTerminateR2Modal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-mosaic-surface border border-red-500/40 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-400">
              <StopCircle className="w-6 h-6" />
              <h3 className="text-lg font-bold text-white">Terminate Round 2?</h3>
            </div>
            <p className="text-mosaic-muted text-sm leading-relaxed">
              This will immediately stop Round 2, mark the game complete with status ROUND_TERMINATED, stop all master and sub-phase timers, and freeze the dashboard.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isActionLoading}
                onClick={() => setShowTerminateR2Modal(false)}
                className="px-4 py-2.5 rounded-xl border border-mosaic-border text-mosaic-muted hover:text-white text-sm cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isActionLoading}
                onClick={handleTerminateRound2}
                className="px-4 py-2.5 rounded-xl bg-red-500 text-white font-semibold text-sm hover:bg-red-400 transition-colors flex items-center gap-2 cursor-pointer"
              >
                {isActionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                Confirm Terminate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function QuestionsPanel() {
  const [questions, setQuestions] = useState<QuestionBankItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<QuestionBankItem | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Form fields
  const [questionId, setQuestionId] = useState('');
  const [category, setCategory] = useState('Computer Science');
  const [questionText, setQuestionText] = useState('');
  const [optionA, setOptionA] = useState('');
  const [optionB, setOptionB] = useState('');
  const [optionC, setOptionC] = useState('');
  const [optionD, setOptionD] = useState('');
  const [correctAnswer, setCorrectAnswer] = useState<AnswerOption>('A' as AnswerOption);
  const [technicalExplanation, setTechnicalExplanation] = useState('');

  // Delete modal state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadQuestions = useCallback(async () => {
    setIsLoading(true);
    const res = await listQuestions(search || undefined, selectedCategory !== 'ALL' ? selectedCategory : undefined);
    setIsLoading(false);
    if (res.success) {
      setQuestions(res.data.questions);
    }
  }, [search, selectedCategory]);

  useEffect(() => {
    void loadQuestions();
  }, [loadQuestions]);

  function handleOpenCreate() {
    setEditingQuestion(null);
    setQuestionId(`Q-${String(questions.length + 1).padStart(3, '0')}`);
    setCategory('Computer Science');
    setQuestionText('');
    setOptionA('');
    setOptionB('');
    setOptionC('');
    setOptionD('');
    setCorrectAnswer('A' as AnswerOption);
    setTechnicalExplanation('');
    setModalError(null);
    setIsModalOpen(true);
  }

  function handleOpenEdit(q: QuestionBankItem) {
    setEditingQuestion(q);
    setQuestionId(q.questionId);
    setCategory(q.category);
    setQuestionText(q.questionText);
    setOptionA(q.optionA);
    setOptionB(q.optionB);
    setOptionC(q.optionC);
    setOptionD(q.optionD);
    setCorrectAnswer(q.correctAnswer);
    setTechnicalExplanation(q.technicalExplanation);
    setModalError(null);
    setIsModalOpen(true);
  }

  async function handleSaveQuestion(e: React.FormEvent) {
    e.preventDefault();
    setModalError(null);

    if (!questionText.trim() || !optionA.trim() || !optionB.trim() || !optionC.trim() || !optionD.trim() || !technicalExplanation.trim()) {
      setModalError('Please fill in all fields.');
      return;
    }

    setIsSaving(true);

    if (editingQuestion) {
      // Update
      const res = await updateQuestion(editingQuestion.questionId, {
        category,
        questionText: questionText.trim(),
        optionA: optionA.trim(),
        optionB: optionB.trim(),
        optionC: optionC.trim(),
        optionD: optionD.trim(),
        correctAnswer,
        technicalExplanation: technicalExplanation.trim(),
      });
      setIsSaving(false);
      if (!res.success) {
        setModalError(res.error?.message || 'Failed to update question.');
        return;
      }
    } else {
      // Create
      const res = await createQuestion({
        questionId: questionId.trim(),
        category,
        questionText: questionText.trim(),
        optionA: optionA.trim(),
        optionB: optionB.trim(),
        optionC: optionC.trim(),
        optionD: optionD.trim(),
        correctAnswer,
        technicalExplanation: technicalExplanation.trim(),
        isActive: true,
      });
      setIsSaving(false);
      if (!res.success) {
        setModalError(res.error?.message || 'Failed to create question.');
        return;
      }
    }

    setIsModalOpen(false);
    void loadQuestions();
  }

  async function handleDeleteConfirm() {
    if (!deletingId) return;
    setIsDeleting(true);
    const res = await deleteQuestion(deletingId);
    setIsDeleting(false);
    setDeletingId(null);
    if (res.success) {
      void loadQuestions();
    }
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Question Bank Management</h1>
          <p className="text-mosaic-muted text-sm mt-0.5">
            {questions.length} Questions Configured • Active Pool Q-001 through Q-050
          </p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-mosaic-accent text-black font-semibold rounded-xl hover:bg-mosaic-accent/90 transition-colors cursor-pointer text-sm"
        >
          <Plus className="w-4 h-4" />
          Add Question
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search questions or keywords..."
            className="w-full bg-mosaic-surface border border-mosaic-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-mosaic-accent transition-colors"
          />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <Filter className="w-4 h-4 text-mosaic-muted shrink-0" />
          {QUESTION_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-mosaic-accent text-black font-semibold'
                  : 'bg-mosaic-surface border border-mosaic-border text-mosaic-muted hover:text-white'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Questions List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-mosaic-accent" />
        </div>
      ) : (
        <div className="bg-mosaic-surface border border-mosaic-border rounded-2xl overflow-hidden divide-y divide-mosaic-border/50">
          {questions.length === 0 ? (
            <div className="py-16 text-center">
              <BookOpen className="w-12 h-12 text-mosaic-muted/40 mx-auto mb-3" />
              <p className="text-mosaic-muted">No questions found matching your filter.</p>
            </div>
          ) : (
            questions.map((q) => (
              <div key={q.questionId} className="p-5 hover:bg-mosaic-dark/40 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-mono text-xs font-bold text-mosaic-accent bg-mosaic-accent/10 border border-mosaic-accent/20 px-2 py-0.5 rounded">
                        {q.questionId}
                      </span>
                      <span className="text-xs text-mosaic-muted bg-mosaic-dark border border-mosaic-border px-2 py-0.5 rounded">
                        {q.category}
                      </span>
                    </div>
                    <p className="text-white font-medium text-sm leading-relaxed mb-3">{q.questionText}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs mb-3">
                      {(['A', 'B', 'C', 'D'] as const).map((opt) => {
                        const isCorrect = q.correctAnswer === opt;
                        const optText = q[`option${opt}` as 'optionA' | 'optionB' | 'optionC' | 'optionD'];
                        return (
                          <div
                            key={opt}
                            className={`p-2 rounded-lg border ${
                              isCorrect
                                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                                : 'bg-mosaic-dark/50 border-mosaic-border/40 text-mosaic-muted'
                            }`}
                          >
                            <span className="font-bold mr-1.5">{opt}.</span>
                            <span>{optText}</span>
                            {isCorrect && <span className="ml-2 font-bold text-emerald-400">✓ Correct</span>}
                          </div>
                        );
                      })}
                    </div>
                    {q.technicalExplanation && (
                      <div className="text-xs text-mosaic-muted bg-mosaic-dark/80 p-2.5 rounded-lg border border-mosaic-border/40">
                        <span className="text-mosaic-accent font-semibold mr-1">Explanation:</span>
                        {q.technicalExplanation}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleOpenEdit(q)}
                      className="p-2 text-mosaic-muted hover:text-white rounded-lg hover:bg-mosaic-dark transition-colors cursor-pointer"
                      title="Edit question"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeletingId(q.questionId)}
                      className="p-2 text-mosaic-muted hover:text-red-400 rounded-lg hover:bg-mosaic-dark transition-colors cursor-pointer"
                      title="Delete question"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Reminder Banner */}
      {questions.length < 50 && (
        <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-yellow-400 font-semibold text-sm">Question Bank Setup Reminder</p>
            <p className="text-yellow-300/80 text-xs mt-0.5 leading-relaxed">
              Currently {questions.length} demo questions (Q-001 through Q-010) are seeded. Questions Q-011 through Q-050 require the real event content before the official tournament.
            </p>
          </div>
        </div>
      )}

      {/* Create / Edit Question Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-mosaic-surface border border-mosaic-border rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">
                {editingQuestion ? `Edit ${editingQuestion.questionId}` : 'Add New Question'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-mosaic-muted hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveQuestion} className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-mosaic-muted mb-1">Question ID</label>
                  <input
                    type="text"
                    value={questionId}
                    disabled={!!editingQuestion}
                    onChange={(e) => setQuestionId(e.target.value.toUpperCase())}
                    placeholder="Q-011"
                    maxLength={5}
                    className="w-full bg-mosaic-dark border border-mosaic-border rounded-xl px-3 py-2 text-white font-mono disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-mosaic-muted mb-1">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-mosaic-dark border border-mosaic-border rounded-xl px-3 py-2 text-white"
                  >
                    {QUESTION_CATEGORIES.filter((c) => c !== 'ALL').map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs text-mosaic-muted mb-1">Question Text</label>
                <textarea
                  value={questionText}
                  onChange={(e) => setQuestionText(e.target.value)}
                  placeholder="Enter the question..."
                  rows={3}
                  className="w-full bg-mosaic-dark border border-mosaic-border rounded-xl px-3 py-2 text-white resize-none"
                />
              </div>

              {(['A', 'B', 'C', 'D'] as const).map((opt) => {
                const val = opt === 'A' ? optionA : opt === 'B' ? optionB : opt === 'C' ? optionC : optionD;
                const setVal = opt === 'A' ? setOptionA : opt === 'B' ? setOptionB : opt === 'C' ? setOptionC : setOptionD;
                return (
                  <div key={opt} className="flex items-center gap-2">
                    <span className="font-bold text-xs text-mosaic-accent w-4 text-center">{opt}.</span>
                    <input
                      type="text"
                      value={val}
                      onChange={(e) => setVal(e.target.value)}
                      placeholder={`Option ${opt} text`}
                      className="flex-1 bg-mosaic-dark border border-mosaic-border rounded-xl px-3 py-2 text-white text-xs"
                    />
                    <label className="flex items-center gap-1 text-xs text-mosaic-muted cursor-pointer">
                      <input
                        type="radio"
                        name="correctAnswerRadio"
                        checked={correctAnswer === opt}
                        onChange={() => setCorrectAnswer(opt as AnswerOption)}
                        className="accent-cyan-400"
                      />
                      Correct
                    </label>
                  </div>
                );
              })}

              <div>
                <label className="block text-xs text-mosaic-muted mb-1">Technical Explanation</label>
                <textarea
                  value={technicalExplanation}
                  onChange={(e) => setTechnicalExplanation(e.target.value)}
                  placeholder="Shown to player after answer is processed..."
                  rows={2}
                  className="w-full bg-mosaic-dark border border-mosaic-border rounded-xl px-3 py-2 text-white resize-none text-xs"
                />
              </div>

              {modalError && (
                <div className="p-2.5 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-400">
                  {modalError}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-mosaic-border rounded-xl text-mosaic-muted hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 bg-mosaic-accent text-black font-bold rounded-xl hover:bg-mosaic-accent/90 transition-colors flex items-center gap-2 cursor-pointer"
                >
                  {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editingQuestion ? 'Update Question' : 'Save Question'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingId && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-mosaic-surface border border-red-500/40 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2">Delete {deletingId}?</h3>
            <p className="text-mosaic-muted text-xs leading-relaxed mb-6">
              Are you sure you want to remove this question from the question bank?
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeletingId(null)}
                className="px-4 py-2 border border-mosaic-border rounded-xl text-mosaic-muted hover:text-white text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDeleteConfirm}
                className="px-4 py-2 bg-red-500 text-white font-semibold text-xs rounded-xl hover:bg-red-400 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── History Panel ────────────────────────────────────────────────────────────

function HistoryPanel() {
  const [games, setGames] = useState<GameHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [detailGame, setDetailGame] = useState<any | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await listGameHistory();
      if (res.success) {
        setGames(res.data.games ?? (res.data as any));
      } else {
        setError(res.error?.message || 'Failed to load game history.');
      }
    } catch {
      setError('Network error loading history.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleViewDetail = async (gameId: string) => {
    setSelectedGameId(gameId);
    setIsLoadingDetail(true);
    try {
      const res = await getGameHistory(gameId);
      if (res.success) {
        setDetailGame(res.data);
      }
    } catch {
      // ignore
    } finally {
      setIsLoadingDetail(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <History className="w-5 h-5 text-mosaic-accent" />
            Game History (Read-Only)
          </h2>
          <p className="text-xs text-mosaic-muted mt-1">
            Archived records of completed event games.
          </p>
        </div>
        <button
          onClick={fetchHistory}
          className="px-3 py-1.5 border border-mosaic-border rounded-xl text-xs text-mosaic-muted hover:text-white flex items-center gap-1.5 cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-400">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-mosaic-accent" />
        </div>
      ) : games.length === 0 ? (
        <div className="bg-mosaic-surface border border-mosaic-border/40 rounded-2xl p-12 text-center">
          <History className="w-10 h-10 text-mosaic-muted/40 mx-auto mb-3" />
          <p className="text-sm text-mosaic-muted font-medium">No completed games yet.</p>
          <p className="text-xs text-mosaic-muted/60 mt-1">
            Games will appear here once they reach the GAME_COMPLETE phase.
          </p>
        </div>
      ) : (
        <div className="bg-mosaic-surface border border-mosaic-border/40 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-mosaic-dark/80 text-mosaic-muted border-b border-mosaic-border/40 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="px-5 py-3.5">Game Code</th>
                  <th className="px-5 py-3.5">Team</th>
                  <th className="px-5 py-3.5">Result</th>
                  <th className="px-5 py-3.5">Imposter</th>
                  <th className="px-5 py-3.5">Kills</th>
                  <th className="px-5 py-3.5">Completed</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-mosaic-border/20 text-white">
                {games.map((g) => {
                  const isCrewWon = g.result === 'CREWMATES_WIN';
                  return (
                    <tr key={g.gameId} className="hover:bg-mosaic-dark/40 transition-colors">
                      <td className="px-5 py-4 font-mono font-bold text-mosaic-accent">
                        {g.gameCode}
                      </td>
                      <td className="px-5 py-4 font-medium">
                        {g.teamName} <span className="text-mosaic-muted font-normal">({g.teamSize}p)</span>
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full font-bold text-[10px] ${
                            isCrewWon
                              ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                              : 'bg-red-500/20 text-red-400 border border-red-500/30'
                          }`}
                        >
                          {g.result ?? 'COMPLETE'}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-mosaic-muted">
                        {g.imposterName ? (
                          <span className="text-red-400 font-semibold">{g.imposterName}</span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span className="font-mono">{g.killCount ?? 0}</span> / 2
                      </td>
                      <td className="px-5 py-4 text-mosaic-muted font-mono text-[11px]">
                        {g.completedAt ? new Date(g.completedAt).toLocaleString() : '—'}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleViewDetail(g.gameId)}
                          className="px-3 py-1.5 bg-mosaic-dark hover:bg-mosaic-border/40 text-mosaic-accent rounded-lg font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Details
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Game Detail Modal */}
      {selectedGameId && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-mosaic-surface border border-mosaic-border rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto shadow-2xl p-6">
            <div className="flex items-center justify-between pb-4 border-b border-mosaic-border/40">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-mosaic-accent/20 text-mosaic-accent font-mono font-bold rounded text-xs">
                  {detailGame?.gameCode ?? 'ARCHIVE'}
                </span>
                <h3 className="text-lg font-bold text-white">
                  {detailGame?.teamName ?? 'Game Record'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedGameId(null);
                  setDetailGame(null);
                }}
                className="text-mosaic-muted hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isLoadingDetail ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-mosaic-accent" />
              </div>
            ) : detailGame ? (
              <div className="mt-4 space-y-5 text-xs">
                {/* Result banner */}
                <div
                  className={`p-3 rounded-xl border flex items-center justify-between ${
                    detailGame.result === 'CREWMATES_WIN'
                      ? 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                      : 'bg-red-500/10 border-red-500/30 text-red-300'
                  }`}
                >
                  <span className="font-bold uppercase tracking-wider">
                    Result: {detailGame.result}
                  </span>
                  <span className="text-[11px] opacity-80">
                    Archived — Read Only
                  </span>
                </div>

                {/* Imposter & Kills */}
                <div className="bg-mosaic-dark/60 p-4 rounded-xl border border-mosaic-border/30 space-y-2">
                  <div className="flex justify-between items-center text-white">
                    <span className="font-semibold text-mosaic-muted uppercase tracking-wider text-[10px]">
                      Imposter
                    </span>
                    <span className="text-red-400 font-bold">
                      {detailGame.imposter?.playerName ?? 'Unknown'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-white">
                    <span className="font-semibold text-mosaic-muted uppercase tracking-wider text-[10px]">
                      Kills Executed
                    </span>
                    <span className="font-mono">{detailGame.round2?.killCount ?? 0} / 2</span>
                  </div>
                  {detailGame.round2?.kills?.length > 0 && (
                    <div className="pt-2 border-t border-mosaic-border/20">
                      <p className="text-mosaic-muted text-[10px] uppercase font-bold mb-1">Victims:</p>
                      <ul className="space-y-1 text-mosaic-muted">
                        {detailGame.round2.kills.map((k: any, i: number) => (
                          <li key={i} className="flex justify-between">
                            <span>Kill #{k.killNumber}: {k.victimPlayerName}</span>
                            <span className="font-mono text-[10px]">
                              {k.reportedAt ? new Date(k.reportedAt).toLocaleTimeString() : 'Not reported'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Players & Task Assignments */}
                <div>
                  <h4 className="font-bold text-white mb-2 uppercase text-[10px] tracking-wider text-mosaic-muted">
                    Player Roster & Task Assignments
                  </h4>
                  <div className="space-y-1.5">
                    {detailGame.players?.map((p: any) => (
                      <div
                        key={p.id}
                        className="bg-mosaic-dark/40 border border-mosaic-border/20 rounded-lg p-2.5 flex items-center justify-between"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-white">{p.playerName}</span>
                            <span
                              className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                p.role === 'IMPOSTER'
                                  ? 'bg-red-500/20 text-red-400'
                                  : 'bg-blue-500/20 text-blue-400'
                              }`}
                            >
                              {p.role}
                            </span>
                            <span
                              className={`text-[9px] px-1.5 py-0.5 rounded ${
                                p.status === 'ALIVE'
                                  ? 'bg-green-500/20 text-green-400'
                                  : 'bg-neutral-500/20 text-neutral-400 line-through'
                              }`}
                            >
                              {p.status}
                            </span>
                          </div>
                          {p.assignedTaskName && (
                            <p className="text-[10px] text-mosaic-muted mt-0.5">
                              Zone {p.assignedTaskZone}: {p.assignedTaskName}
                            </p>
                          )}
                        </div>
                        <span className="font-mono text-mosaic-muted text-[10px]">
                          Lives: {p.lives}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Round 1 Summary */}
                <div className="bg-mosaic-dark/30 p-3 rounded-xl border border-mosaic-border/20 flex justify-between items-center text-mosaic-muted">
                  <span>Round 1 Puzzle Status</span>
                  <span className={detailGame.round1?.puzzleCompleted ? 'text-green-400 font-bold' : 'text-mosaic-muted'}>
                    {detailGame.round1?.puzzleCompleted ? 'Completed' : 'Incomplete'}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-center text-mosaic-muted py-8">Unable to load details.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
