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
  RotateCcw, AlertTriangle, Trash2, Edit2, X, Filter, Activity, Lock, Puzzle
} from 'lucide-react';
import { useAuth } from '@/app/providers/AuthContext';
import {
  createLobby, getActiveGame, startGame, emergencyEndRound, restartGame,
  listQuestions, createQuestion, updateQuestion, deleteQuestion,
  type GmGameStateData, type QuestionBankItem
} from '@/services/gameService';
import { subscribeToEvent } from '@/lib/socket/socketClient';
import { SOCKET_EVENT, GAME_PHASE, type AnswerOption } from '@/types/enums';

type DashboardView = 'overview' | 'create' | 'lobby' | 'round1' | 'questions';

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
      if (res.data.game.phase === GAME_PHASE.ROUND_1_ACTIVE || res.data.game.phase === GAME_PHASE.ROUND_1_COMPLETE) {
        setView('round1');
      } else if (res.data.game.phase === GAME_PHASE.LOBBY) {
        setView('lobby');
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
        setActiveGame((g) => g ? { ...g, phase: data.to } : g);
        if (data.to === GAME_PHASE.ROUND_1_ACTIVE || data.to === GAME_PHASE.ROUND_1_COMPLETE) {
          setView('round1');
        } else if (data.to === GAME_PHASE.LOBBY) {
          setView('lobby');
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

    return () => {
      unsubLobby();
      unsubStarted();
      unsubPhase();
      unsubPuzzle();
      unsubLives();
    };
  }, []);

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
              { key: 'overview', label: 'Overview', icon: Settings },
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
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
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
  }, [game.phaseEndsAt]);

  const puzzleUnlocked = game.puzzlePieces.filter((p) => p.isUnlocked).length;
  const totalPieces = game.puzzlePieces.length;
  const puzzlePct = totalPieces > 0 ? (puzzleUnlocked / totalPieces) * 100 : 0;
  const isComplete = game.phase === GAME_PHASE.ROUND_1_COMPLETE;

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

  return (
    <div className="max-w-5xl space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-white">{game.teamName}</h1>
            <span
              className={`px-3 py-1 text-xs font-semibold rounded-full border ${
                isComplete
                  ? 'bg-zinc-800 text-zinc-300 border-zinc-700'
                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
              }`}
            >
              {isComplete ? 'ROUND 1 COMPLETE' : 'PUZZLE SOLVING ACTIVE'}
            </span>
          </div>
          <p className="text-mosaic-muted text-sm mt-1">
            Round 1: Puzzle Solving • Code: <span className="font-mono text-mosaic-accent font-semibold">{game.gameCode}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowRestartModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-mosaic-surface border border-mosaic-border rounded-xl text-xs font-medium text-mosaic-muted hover:text-white transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Restart Round 1
          </button>
          {!isComplete && (
            <button
              onClick={() => setShowEndModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-red-500/10 border border-red-500/30 rounded-xl text-xs font-medium text-red-400 hover:bg-red-500/20 transition-colors cursor-pointer"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              Emergency End Round
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

      {actionError && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <p className="text-red-400 text-sm">{actionError}</p>
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
