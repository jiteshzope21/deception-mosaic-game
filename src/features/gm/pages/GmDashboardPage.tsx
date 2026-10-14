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
  type GmGameStateData, type QuestionBankItem, type GameHistoryEntry, type GmKillRecord
} from '@/services/gameService';
import { joinRoom, getSocket, subscribeToEvent } from '@/lib/socket/socketClient';
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

export function formatKillElapsed(
  reportedAt?: string | Date | null,
  round2StartedAt?: string | Date | null
): string {
  if (!reportedAt) return 'Not reported';
  if (!round2StartedAt) return 'Time recorded';
  const reportTime = new Date(reportedAt).getTime();
  const startTime = new Date(round2StartedAt).getTime();
  if (isNaN(reportTime) || isNaN(startTime)) return 'Not reported';

  const elapsedMs = Math.max(0, reportTime - startTime);
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  if (hours > 0) {
    const hh = String(hours).padStart(2, '0');
    return `${hh}:${mm}:${ss} into Round 2`;
  }
  return `${mm}:${ss} into Round 2`;
}

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

  // Room membership and reconnect synchronization
  useEffect(() => {
    if (activeGame?.id) {
      joinRoom(activeGame.id);
    }
  }, [activeGame?.id]);

  useEffect(() => {
    const socket = getSocket();
    const handleConnect = () => {
      if (activeGame?.id) {
        joinRoom(activeGame.id);
        void loadActiveGame();
      }
    };
    socket.on(SOCKET_EVENT.CONNECT, handleConnect);
    return () => {
      socket.off(SOCKET_EVENT.CONNECT, handleConnect);
    };
  }, [activeGame?.id, loadActiveGame]);

  // Realtime: live updates for lobby, rounds, kills, and phases
  useEffect(() => {
    const unsubLobby = subscribeToEvent<any>(SOCKET_EVENT.LOBBY_UPDATE, (data) => {
      if (data?.players) {
        setActiveGame((g) => {
          if (!g) return g;
          const mergedPlayers = g.players.map((existing) => {
            const incoming = data.players.find(
              (p: any) =>
                String(p.id) === String(existing.id) ||
                p.playerName?.toLowerCase() === existing.playerName?.toLowerCase()
            );
            if (!incoming) return existing;
            return {
              ...existing,
              status: incoming.status ?? existing.status,
              joinedAt: incoming.joinedAt ?? existing.joinedAt,
            };
          });
          return {
            ...g,
            players: mergedPlayers,
          };
        });
      }
    });

    const unsubPlayerJoined = subscribeToEvent<any>(SOCKET_EVENT.PLAYER_JOINED, (data) => {
      if (data?.playerId || data?.playerName) {
        setActiveGame((g) => {
          if (!g) return g;
          return {
            ...g,
            players: g.players.map((p) => {
              if (
                (data.playerId && String(p.id) === String(data.playerId)) ||
                (data.playerName && p.playerName.toLowerCase() === data.playerName.toLowerCase())
              ) {
                return { ...p, status: 'JOINED' };
              }
              return p;
            }),
          };
        });
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
        setActiveGame((g) => g ? { ...g, phase: data.to, phaseEndsAt: data.phaseEndsAt ?? g?.phaseEndsAt, round2EndsAt: data.round2EndsAt ?? g?.round2EndsAt, result: data.result ?? g?.result } : g);
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

    const unsubKillOccurred = subscribeToEvent<any>(SOCKET_EVENT.KILL_OCCURRED, (data) => {
      if (data) {
        setActiveGame((g) => {
          if (!g) return g;
          const newKill: GmKillRecord = data.kill || {
            id: `kill-${data.killNumber}-${Date.now()}`,
            killNumber: data.killNumber,
            victimPlayerId: data.victimPlayerId,
            victimPlayerName: data.victimPlayerName,
            imposterPlayerId: data.imposterPlayerId,
            imposterPlayerName: data.imposterPlayerName,
            reportedAt: data.reportedAt || new Date().toISOString(),
          };

          const existingKills = g.kills || [];
          const kills = existingKills.some(
            (k) => k.killNumber === data.killNumber || (k.id && k.id === newKill.id)
          )
            ? existingKills
            : [...existingKills, newKill];

          const updatedPlayers = g.players.map((p) => {
            if (
              String(p.id) === String(data.victimPlayerId) ||
              (data.victimPlayerName && p.playerName.toLowerCase() === data.victimPlayerName.toLowerCase())
            ) {
              return { ...p, status: 'ELIMINATED' };
            }
            return p;
          });

          const newEvent = {
            _id: `ev-${Date.now()}`,
            eventType: 'KILL_REPORTED',
            playerId: data.imposterPlayerId,
            eventData: {
              killNumber: data.killNumber,
              victimPlayerId: data.victimPlayerId,
              victimPlayerName: data.victimPlayerName,
              imposterPlayerName: data.imposterPlayerName,
            },
            occurredAt: data.reportedAt || new Date().toISOString(),
          };

          return {
            ...g,
            killCount: data.killCount ?? Math.max(g.killCount ?? 0, data.killNumber ?? 1),
            kills,
            players: updatedPlayers,
            phase: data.phase ?? GAME_PHASE.BODY_REPORT,
            phaseEndsAt: data.phaseEndsAt ?? g.phaseEndsAt,
            round2EndsAt: data.round2EndsAt ?? g.round2EndsAt,
            recentEvents: [...(g.recentEvents || []), newEvent],
          };
        });
      }
    });

    const unsubKillRecorded = subscribeToEvent<any>(SOCKET_EVENT.KILL_RECORDED, (data) => {
      if (data) {
        setActiveGame((g) => {
          if (!g) return g;
          const newKill: GmKillRecord = data.kill || {
            id: `kill-${data.killNumber}-${Date.now()}`,
            killNumber: data.killNumber,
            victimPlayerId: data.victimPlayerId,
            victimPlayerName: data.victimPlayerName,
            imposterPlayerId: data.imposterPlayerId,
            imposterPlayerName: data.imposterPlayerName,
            reportedAt: data.reportedAt || new Date().toISOString(),
          };
          const existingKills = g.kills || [];
          const kills = existingKills.some(
            (k) => k.killNumber === data.killNumber || (k.id && k.id === newKill.id)
          )
            ? existingKills
            : [...existingKills, newKill];
          return {
            ...g,
            killCount: data.killCount ?? Math.max(g.killCount ?? 0, data.killNumber ?? 1),
            kills,
            players: g.players.map((p) => {
              if (
                String(p.id) === String(data.victimPlayerId) ||
                (data.victimPlayerName && p.playerName.toLowerCase() === data.victimPlayerName.toLowerCase())
              ) {
                return { ...p, status: 'ELIMINATED' };
              }
              return p;
            }),
            phase: data.phase ?? GAME_PHASE.BODY_REPORT,
            phaseEndsAt: data.phaseEndsAt ?? g.phaseEndsAt,
            round2EndsAt: data.round2EndsAt ?? g.round2EndsAt,
          };
        });
      }
    });

    const unsubPlayerStatus = subscribeToEvent<any>(SOCKET_EVENT.PLAYER_STATUS_CHANGED, (data) => {
      if (data?.playerId || data?.playerName) {
        setActiveGame((g) => {
          if (!g) return g;
          return {
            ...g,
            players: g.players.map((p) => {
              if (
                (data.playerId && String(p.id) === String(data.playerId)) ||
                (data.playerName && p.playerName.toLowerCase() === data.playerName.toLowerCase())
              ) {
                return { ...p, status: data.status };
              }
              return p;
            }),
          };
        });
      }
    });

    const unsubBodyReportStarted = subscribeToEvent<any>(SOCKET_EVENT.BODY_REPORT_STARTED, (data) => {
      if (data) {
        setActiveGame((g) => g ? {
          ...g,
          phase: GAME_PHASE.BODY_REPORT,
          phaseEndsAt: data.phaseEndsAt ?? g.phaseEndsAt,
          round2EndsAt: data.round2EndsAt ?? g.round2EndsAt,
        } : g);
      }
    });

    const unsubBodyReported = subscribeToEvent<any>(SOCKET_EVENT.BODY_REPORTED, (data) => {
      if (data) {
        setActiveGame((g) => {
          if (!g) return g;
          const newEvent = {
            _id: `ev-${Date.now()}`,
            eventType: 'BODY_REPORTED',
            playerId: data.reporterPlayerId,
            eventData: {
              reporterPlayerName: data.reporterPlayerName,
              victimPlayerName: data.victimPlayerName,
            },
            occurredAt: new Date().toISOString(),
          };
          return {
            ...g,
            recentEvents: [...(g.recentEvents || []), newEvent],
          };
        });
      }
    });

    const unsubMoveToVoting = subscribeToEvent<any>(SOCKET_EVENT.MOVE_TO_VOTING_STARTED, (data) => {
      if (data) {
        setActiveGame((g) => g ? {
          ...g,
          phase: GAME_PHASE.MOVE_TO_VOTING,
          phaseEndsAt: data.phaseEndsAt ?? g.phaseEndsAt,
          round2EndsAt: data.round2EndsAt ?? g.round2EndsAt,
        } : g);
      }
    });

    const unsubVotingStarted = subscribeToEvent<any>(SOCKET_EVENT.VOTING_STARTED, (data) => {
      if (data) {
        setActiveGame((g) => g ? {
          ...g,
          phase: GAME_PHASE.VOTING,
          votingCycle: data.votingCycle ?? g.votingCycle,
          phaseEndsAt: data.phaseEndsAt ?? g.phaseEndsAt,
          round2EndsAt: data.round2EndsAt ?? g.round2EndsAt,
        } : g);
      }
    });

    const unsubVoteCast = subscribeToEvent<any>(SOCKET_EVENT.VOTE_CAST, (data) => {
      if (data) {
        setActiveGame((g) => g ? {
          ...g,
          submittedVotesCount: data.submittedVotesCount ?? data.submitted ?? g.submittedVotesCount,
          eligibleVotersCount: data.eligibleVotersCount ?? data.eligible ?? g.eligibleVotersCount,
        } : g);
      }
    });

    const unsubVotingResult = subscribeToEvent<any>(SOCKET_EVENT.VOTING_RESULT, (data) => {
      if (data) {
        setActiveGame((g) => {
          if (!g) return g;
          let updatedPlayers = g.players;
          if (data.eliminatedPlayer?.id) {
            updatedPlayers = g.players.map((p) =>
              String(p.id) === String(data.eliminatedPlayer.id) ? { ...p, status: 'ELIMINATED' } : p
            );
          }
          return {
            ...g,
            players: updatedPlayers,
            phase: data.nextPhase ?? (data.gameComplete ? GAME_PHASE.GAME_COMPLETE : g.phase),
            result: data.result ?? g.result,
            round2EndsAt: data.round2EndsAt ?? g.round2EndsAt,
          };
        });
      }
    });

    const unsubPlayerEliminated = subscribeToEvent<any>(SOCKET_EVENT.PLAYER_ELIMINATED, (data) => {
      if (data?.playerId) {
        setActiveGame((g) => {
          if (!g) return g;
          return {
            ...g,
            players: g.players.map((p) =>
              String(p.id) === String(data.playerId) ? { ...p, status: 'ELIMINATED' } : p
            ),
          };
        });
      }
    });

    const unsubGameComplete = subscribeToEvent<any>(SOCKET_EVENT.GAME_COMPLETE, (data) => {
      if (data) {
        setActiveGame((g) => g ? {
          ...g,
          phase: GAME_PHASE.GAME_COMPLETE,
          result: data.result ?? g.result,
        } : g);
      }
    });

    const unsubGameStateUpdate = subscribeToEvent<any>(SOCKET_EVENT.GAME_STATE_UPDATE, (data) => {
      if (data) {
        setActiveGame((g) => {
          if (!g) return g;
          return {
            ...g,
            ...data,
            players: data.players
              ? g.players.map((p) => {
                  const incoming = data.players.find(
                    (ip: any) => String(ip.id) === String(p.id) || ip.playerName === p.playerName
                  );
                  return incoming ? { ...p, ...incoming } : p;
                })
              : g.players,
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
      unsubPlayerJoined();
      unsubStarted();
      unsubPhase();
      unsubPuzzle();
      unsubLives();
      unsubKillOccurred();
      unsubKillRecorded();
      unsubPlayerStatus();
      unsubBodyReportStarted();
      unsubBodyReported();
      unsubMoveToVoting();
      unsubVotingStarted();
      unsubVoteCast();
      unsubVotingResult();
      unsubPlayerEliminated();
      unsubGameComplete();
      unsubGameStateUpdate();
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
    <div className="min-h-screen arcade-corridor-bg text-bone-cream font-tech selection:bg-neon-red/30 selection:text-white">
      <div className="flex h-screen overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 shrink-0 border-r border-steel-border/80 flex flex-col bg-tactical-slate/95 backdrop-blur-md">
          <div className="px-5 py-4 border-b border-steel-border/60">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-corridor/90 border border-steel-border rounded-full text-[10px] font-arcade tracking-widest text-muted-steel uppercase mb-1.5">
              <span>ADG</span>
              <span className="text-neon-red">✕</span>
              <span>MOSAIC</span>
            </div>
            <div className="flex items-center gap-2">
              <h1 className="font-display font-black text-2xl uppercase tracking-wider text-bone-cream">
                DECEPTION
              </h1>
              <span className="text-[10px] font-arcade font-bold px-2 py-0.5 rounded bg-neon-red/15 text-neon-red border border-neon-red/40 uppercase">
                GM
              </span>
            </div>
            <p className="text-[10px] font-arcade tracking-widest text-electric-cyan uppercase">
              COMMAND CONTROL DECK
            </p>
          </div>

          <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto">
            {[
              { key: 'overview', label: 'OVERVIEW', icon: Activity },
              { key: 'config', label: 'GAME CONFIG', icon: Settings },
              { key: 'create', label: 'CREATE GAME', icon: Plus },
              {
                key: 'lobby',
                label: 'LOBBY RADAR',
                icon: Users,
                disabled: !activeGame || activeGame.phase !== GAME_PHASE.LOBBY,
              },
              {
                key: 'round1',
                label: 'ROUND 1 CIPHER',
                icon: Play,
                disabled:
                  !activeGame ||
                  (activeGame.phase !== GAME_PHASE.ROUND_1_ACTIVE &&
                    activeGame.phase !== GAME_PHASE.ROUND_1_COMPLETE),
              },
              {
                key: 'round2',
                label: 'ROUND 2 DECEPTION',
                icon: Shield,
                disabled:
                  !activeGame ||
                  (!PHASE_3_PHASES.includes(activeGame.phase) &&
                    activeGame.phase !== GAME_PHASE.ROUND_1_COMPLETE),
              },
              { key: 'history', label: 'AUDIT LOGS', icon: History },
              { key: 'questions', label: 'QUESTION BANK', icon: BookOpen },
            ].map(({ key, label, icon: Icon, disabled }) => (
              <button
                key={key}
                type="button"
                disabled={disabled}
                onClick={() => !disabled && setView(key as DashboardView)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-arcade tracking-wider transition-all ${
                  view === key
                    ? 'bg-neon-red/15 text-neon-red border border-neon-red/40 shadow-[0_0_12px_rgba(255,30,66,0.25)] font-bold'
                    : disabled
                    ? 'text-muted-steel/30 cursor-not-allowed'
                    : 'text-muted-steel hover:text-bone-cream hover:bg-elevated-panel border border-transparent hover:border-steel-border cursor-pointer'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </button>
            ))}
          </nav>

          <div className="p-4 border-t border-steel-border/60 bg-corridor/60">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-bone-cream text-xs font-arcade font-bold truncate">
                  {(user as any)?.displayName ?? 'COMMANDER'}
                </p>
                <p className="text-muted-steel text-[11px] truncate font-tech">{(user as any)?.email ?? ''}</p>
              </div>
              <button
                onClick={handleLogout}
                className="text-muted-steel hover:text-neon-red ml-2 shrink-0 cursor-pointer p-1.5 rounded-lg hover:bg-neon-red/10 transition-colors"
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
    <div className="max-w-4xl space-y-6">
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-tactical-slate/90 border border-steel-border/80 rounded-full text-[11px] font-arcade tracking-widest text-muted-steel uppercase mb-2">
          <span>ADG</span>
          <span className="text-neon-red">✕</span>
          <span>MOSAIC</span>
          <span className="w-1.5 h-1.5 rounded-full bg-electric-cyan animate-ping" />
        </div>
        <h1 className="text-4xl sm:text-5xl font-display uppercase tracking-wider text-bone-cream">
          TACTICAL COMMAND DASHBOARD
        </h1>
        <p className="text-xs font-arcade tracking-[0.2em] text-neon-red uppercase">
          GAME MASTER EVENT CONTROL CENTER
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {!activeGame ? (
          <div className="col-span-2 arcade-card p-8 sm:p-12 text-center border-steel-border relative overflow-hidden">
            <div className="w-16 h-16 rounded-2xl bg-corridor border border-steel-border flex items-center justify-center mx-auto mb-4 text-electric-cyan shadow-inner">
              <Plus className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-display uppercase tracking-wider text-bone-cream mb-2">
              NO ACTIVE OPERATION
            </h2>
            <p className="text-muted-steel text-sm font-tech max-w-md mx-auto mb-6">
              Initialize a new tactical session to generate a mission lobby for the operative squadron.
            </p>
            <button
              onClick={onCreateGame}
              className="arcade-btn-primary px-8 py-3.5 text-xs font-arcade uppercase tracking-widest cursor-pointer"
            >
              INITIALIZE NEW MISSION
            </button>
          </div>
        ) : (
          <>
            <div className="arcade-card p-6 border-glow-cyan relative overflow-hidden">
              <p className="text-muted-steel text-xs font-arcade uppercase tracking-wider mb-1">ACTIVE OPERATION</p>
              <p className="text-4xl font-arcade font-black text-electric-cyan glow-text-cyan">{activeGame.gameCode}</p>
              <p className="text-bone-cream font-tech font-bold text-lg mt-1">{activeGame.teamName}</p>
              <div className="mt-4 flex items-center gap-2">
                <span
                  className={`px-3 py-1 text-[11px] font-arcade font-bold rounded-full border uppercase tracking-wider ${
                    activeGame.phase === GAME_PHASE.ROUND_1_ACTIVE
                      ? 'bg-electric-cyan/15 text-electric-cyan border-electric-cyan/40'
                      : activeGame.phase === GAME_PHASE.LOBBY
                      ? 'bg-neon-red/15 text-neon-red border-neon-red/40'
                      : 'bg-tactical-slate text-muted-steel border-steel-border'
                  }`}
                >
                  {activeGame.phase.replace(/_/g, ' ')}
                </span>
              </div>
            </div>

            <div className="arcade-card-elevated p-6 border-steel-border">
              <p className="text-muted-steel text-xs font-arcade uppercase tracking-wider mb-1">SQUADRON MANIFEST</p>
              <p className="text-4xl font-arcade font-black text-bone-cream">
                {activeGame.players.filter((p) => p.status === 'JOINED').length}
                <span className="text-muted-steel text-2xl font-normal font-arcade">/{activeGame.teamSize}</span>
              </p>
              <p className="text-muted-steel text-xs font-arcade uppercase tracking-wider mt-1">OPERATIVES JOINED</p>
              <button
                onClick={onManageGame}
                className="mt-5 flex items-center gap-2 text-electric-cyan text-xs font-arcade uppercase tracking-widest hover:text-white transition-colors cursor-pointer"
              >
                ENTER MISSION DECK <ChevronRight className="w-4 h-4" />
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
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-4xl font-display uppercase tracking-wider text-bone-cream mb-1">
          INITIALIZE OPERATION
        </h1>
        <p className="text-xs font-arcade tracking-[0.2em] text-neon-red uppercase">
          CONFIGURE TEAM ROSTER & DISPATCH MISSION CODE
        </p>
      </div>

      {newGameCode && (
        <div className="arcade-card p-5 border-glow-cyan flex items-center justify-between">
          <div>
            <p className="text-electric-cyan font-arcade font-bold uppercase tracking-wider text-xs">SESSION CREATED</p>
            <p className="text-muted-steel text-xs font-tech">Broadcast this authorization code to operatives:</p>
            <p className="text-4xl font-arcade font-black text-bone-cream glow-text-cyan mt-1">{newGameCode}</p>
          </div>
          <button
            onClick={onViewLobby}
            className="arcade-btn-cyan px-5 py-2.5 text-xs font-arcade uppercase tracking-wider cursor-pointer"
          >
            RADAR LOBBY →
          </button>
        </div>
      )}

      <form onSubmit={onSubmit} className="arcade-card p-6 sm:p-8 space-y-6 border-steel-border">
        <div>
          <label className="block text-xs font-arcade uppercase tracking-wider text-muted-steel mb-2">
            SQUADRON CODENAME
          </label>
          <input
            type="text"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            placeholder="e.g. CYBER VIPERS"
            maxLength={50}
            className="arcade-input text-bone-cream placeholder:text-muted-steel/40"
          />
        </div>

        <div>
          <label className="block text-xs font-arcade uppercase tracking-wider text-muted-steel mb-2">
            OPERATIVES ALLOCATION
          </label>
          <div className="flex gap-4">
            {([5, 6] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onTeamSizeChange(s)}
                className={`flex-1 py-3 rounded-xl border font-arcade font-bold text-base uppercase tracking-wider transition-all cursor-pointer ${
                  teamSize === s
                    ? 'bg-neon-red/20 border-neon-red text-bone-cream shadow-[0_0_15px_rgba(255,30,66,0.3)]'
                    : 'bg-corridor border-steel-border text-muted-steel hover:border-steel-border/80'
                }`}
              >
                {s} OPERATIVES
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-steel/80 font-tech mt-2">
            5 players: 5 puzzle QRs + 5 decoys | 6 players: 6 puzzle QRs + 4 decoys
          </p>
        </div>

        <div>
          <label className="block text-xs font-arcade uppercase tracking-wider text-muted-steel mb-2">
            OPERATIVE CODENAMES
          </label>
          <div className="space-y-2.5">
            {playerNames.map((name: string, idx: number) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="text-muted-steel font-arcade text-xs w-6 text-right shrink-0">{idx + 1}.</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => {
                    const updated = [...playerNames];
                    updated[idx] = e.target.value;
                    setPlayerNames(updated);
                  }}
                  placeholder={`Operative ${idx + 1} codename`}
                  maxLength={30}
                  className="arcade-input text-bone-cream text-xs placeholder:text-muted-steel/40"
                />
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 bg-neon-red/10 border border-neon-red/40 rounded-xl">
            <AlertCircle className="w-4 h-4 text-neon-red shrink-0 mt-0.5" />
            <p className="text-neon-red text-xs font-tech">{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={isCreating}
          className="arcade-btn-primary w-full py-4 text-xs font-arcade uppercase tracking-widest flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
        >
          {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          {isCreating ? 'DISPATCHING SESSION...' : 'CREATE MISSION & GENERATE RADAR CODE'}
        </button>
      </form>
    </div>
  );
}

function LobbyPanel({ game, joinedCount, allJoined, onStartGame, isStarting, startError }: any) {
  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-display uppercase tracking-wider text-bone-cream">
            {game.teamName} — RADAR LOBBY
          </h1>
          <p className="text-xs font-arcade tracking-[0.2em] text-muted-steel uppercase">
            AWAITING OPERATIVES TO CLAIM ENCRYPTED SLOTS
          </p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-muted-steel text-[10px] font-arcade uppercase tracking-wider mb-0.5">MISSION ACCESS CODE</p>
          <p className="text-4xl font-arcade font-black text-neon-red glow-text-red">{game.gameCode}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="arcade-card p-5 border-steel-border">
          <p className="text-muted-steel text-xs font-arcade uppercase tracking-wider mb-1">SLOTS CLAIMED</p>
          <p className="text-4xl font-arcade font-black text-bone-cream">
            {joinedCount}
            <span className="text-muted-steel text-xl font-normal">/{game.teamSize}</span>
          </p>
        </div>
        <div className="arcade-card p-5 border-steel-border">
          <p className="text-muted-steel text-xs font-arcade uppercase tracking-wider mb-1">TEAM ALLOCATION</p>
          <p className="text-4xl font-arcade font-black text-bone-cream">{game.teamSize}</p>
        </div>
        <div className="arcade-card p-5 border-steel-border">
          <p className="text-muted-steel text-xs font-arcade uppercase tracking-wider mb-1">RADAR STATUS</p>
          <p className={`text-base font-arcade font-bold uppercase tracking-wider ${allJoined ? 'text-electric-cyan glow-text-cyan' : 'text-neon-red glow-text-red'}`}>
            {allJoined ? 'RADAR LOCKED — READY' : 'WAITING FOR SQUAD'}
          </p>
        </div>
      </div>

      <div className="arcade-card-elevated p-6 border-steel-border">
        <h2 className="text-bone-cream font-arcade font-bold text-sm uppercase tracking-wider mb-4 flex items-center gap-2">
          <Users className="w-4 h-4 text-electric-cyan" /> SQUADRON ROSTER STATUS
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {game.players.map((p: any) => {
            const joined = p.status === 'JOINED';
            return (
              <div
                key={p.id || p.playerName}
                className={`flex items-center justify-between px-4 py-3 rounded-xl border ${
                  joined
                    ? 'bg-corridor/90 border-electric-cyan/40 text-bone-cream'
                    : 'bg-corridor/40 border-steel-border/50 text-muted-steel/60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-arcade font-bold ${
                      joined ? 'bg-electric-cyan/20 text-electric-cyan border border-electric-cyan/40' : 'bg-corridor text-muted-steel/40 border border-steel-border'
                    }`}
                  >
                    {p.playerName.charAt(0).toUpperCase()}
                  </div>
                  <span className={`font-tech text-sm font-semibold ${joined ? 'text-bone-cream' : 'text-muted-steel'}`}>
                    {p.playerName}
                  </span>
                </div>
                {joined ? (
                  <span className="flex items-center gap-1 text-[11px] font-arcade font-bold uppercase text-electric-cyan">
                    <CheckCircle className="w-3.5 h-3.5" /> READY
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[11px] font-arcade uppercase text-muted-steel/60">
                    <Clock className="w-3.5 h-3.5" /> WAITING
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {startError && (
        <div className="flex items-center gap-2 p-3 bg-neon-red/10 border border-neon-red/40 rounded-xl">
          <AlertCircle className="w-4 h-4 text-neon-red shrink-0" />
          <p className="text-neon-red text-xs font-tech">{startError}</p>
        </div>
      )}

      <button
        onClick={onStartGame}
        disabled={!allJoined || isStarting}
        className="arcade-btn-primary w-full py-4 text-sm font-arcade uppercase tracking-widest flex items-center justify-center gap-3 cursor-pointer disabled:opacity-40"
      >
        {isStarting ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <Play className="w-5 h-5 fill-current" />
        )}
        {isStarting ? 'COMMENCING MISSION...' : 'START GAME — INITIATE ROUND 1'}
      </button>
      {!allJoined && (
        <p className="text-center text-muted-steel text-xs font-tech mt-2">
          Start Game unlocks once all {game.teamSize} registered operatives have confirmed connection.
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
            <h1 className="text-4xl font-display uppercase tracking-wider text-bone-cream">{game.teamName}</h1>
            <span
              className={`px-3 py-1 text-[11px] font-arcade font-bold rounded-full border uppercase tracking-wider ${
                isComplete
                  ? 'bg-tactical-slate text-muted-steel border-steel-border'
                  : game.isPaused
                  ? 'bg-yellow-500/15 text-yellow-400 border-yellow-500/40'
                  : 'bg-electric-cyan/15 text-electric-cyan border-electric-cyan/40 glow-text-cyan'
              }`}
            >
              {isComplete ? 'ROUND 1 COMPLETE' : game.isPaused ? 'ROUND 1 SUSPENDED' : 'CIPHER SOLVING ACTIVE'}
            </span>
          </div>
          <p className="text-muted-steel text-xs font-arcade tracking-widest mt-1 uppercase">
            ROUND 1: BLUEPRINT DECRYPT • AUTHORIZATION CODE:{' '}
            <span className="font-arcade text-neon-red font-bold">{game.gameCode}</span>
          </p>
        </div>

        {/* Round Control Action Bar */}
        <div className="flex flex-wrap items-center gap-2.5">
          {!isComplete && (
            <button
              onClick={handleTogglePause}
              disabled={isActionLoading}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-arcade uppercase tracking-wider transition-all cursor-pointer border ${
                game.isPaused
                  ? 'bg-electric-cyan/20 border-electric-cyan text-bone-cream hover:bg-electric-cyan/30'
                  : 'bg-tactical-slate border-steel-border text-muted-steel hover:text-bone-cream hover:border-steel-border/90'
              }`}
            >
              {game.isPaused ? <Play className="w-3.5 h-3.5 fill-current" /> : <Pause className="w-3.5 h-3.5" />}
              {game.isPaused ? 'RESUME ROUND 1' : 'PAUSE ROUND 1'}
            </button>
          )}

          <button
            onClick={() => setShowResetR1Modal(true)}
            disabled={isActionLoading}
            className="arcade-btn-secondary flex items-center gap-1.5 px-4 py-2 text-xs font-arcade uppercase tracking-wider cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            RESET ROUND 1
          </button>

          {!isComplete && (
            <button
              onClick={() => setShowTerminateR1Modal(true)}
              disabled={isActionLoading}
              className="flex items-center gap-1.5 px-4 py-2 bg-neon-red/10 border border-neon-red/40 rounded-xl text-xs font-arcade font-bold text-neon-red hover:bg-neon-red/20 transition-colors cursor-pointer uppercase tracking-wider"
            >
              <StopCircle className="w-3.5 h-3.5" />
              TERMINATE ROUND 1
            </button>
          )}

          <button
            onClick={onRefresh}
            className="arcade-btn-secondary px-4 py-2 text-xs font-arcade uppercase tracking-wider cursor-pointer"
          >
            REFRESH
          </button>
        </div>
      </div>

      {/* Paused Alert Banner */}
      {game.isPaused && (
        <div className="p-4 bg-yellow-500/15 border border-yellow-500/40 rounded-2xl flex items-center justify-between gap-4 text-yellow-300 font-tech">
          <div className="flex items-center gap-3">
            <Pause className="w-5 h-5 text-yellow-400 shrink-0" />
            <div>
              <p className="font-arcade font-bold text-sm text-bone-cream uppercase">ROUND 1 IS CURRENTLY SUSPENDED</p>
              <p className="text-xs text-yellow-300/80">Authoritative server clock is frozen. Player scanning and answering are rejected until resumed.</p>
            </div>
          </div>
          <button
            onClick={handleTogglePause}
            className="px-4 py-2 bg-yellow-500 text-black font-arcade font-bold text-xs uppercase rounded-xl hover:bg-yellow-400 cursor-pointer whitespace-nowrap tracking-wider"
          >
            RESUME NOW
          </button>
        </div>
      )}

      {actionError && (
        <div className="p-3 bg-neon-red/10 border border-neon-red/40 rounded-xl flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-neon-red shrink-0" />
          <p className="text-neon-red text-xs font-tech">{actionError}</p>
        </div>
      )}

      {isComplete && (
        <div className="arcade-card p-6 border-glow-cyan flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h3 className="text-bone-cream font-display uppercase tracking-wider text-2xl flex items-center gap-2">
              <Shield className="w-5 h-5 text-electric-cyan" /> ROUND 1 BLUEPRINT DECRYPTED!
            </h3>
            <p className="text-muted-steel text-xs font-tech mt-1">
              Advance squadron to the Transition phase to secretly assign roles (1 Imposter) and physical task zones.
            </p>
          </div>
          <button
            onClick={handleStartTransition}
            disabled={isActionLoading}
            className="arcade-btn-primary px-6 py-3.5 text-xs font-arcade uppercase tracking-widest flex items-center gap-2 whitespace-nowrap cursor-pointer disabled:opacity-40"
          >
            {isActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
            INITIATE TRANSITION & ROLE ASSIGNMENT
          </button>
        </div>
      )}

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Large Master Countdown */}
        <div
          className={`arcade-card p-5 ${
            isCritical && !isComplete ? 'border-glow-red' : 'border-steel-border'
          }`}
        >
          <p className="text-muted-steel text-[10px] font-arcade uppercase tracking-widest mb-1">MASTER CHRONOMETER</p>
          {isComplete ? (
            <p className="text-4xl font-arcade font-black text-muted-steel">0:00</p>
          ) : (
            <p
              className={`text-4xl font-arcade font-black tabular-nums ${
                isCritical ? 'text-neon-red glow-text-red animate-pulse' : 'text-bone-cream glow-text-cyan'
              }`}
            >
              {timer}
            </p>
          )}
          <p className="text-[10px] text-muted-steel font-arcade uppercase mt-2">AUTHORITATIVE CLOCK</p>
        </div>

        {/* Puzzle Progress */}
        <div className="arcade-card p-5 border-steel-border">
          <p className="text-muted-steel text-[10px] font-arcade uppercase tracking-widest mb-1">BLUEPRINT SOLVED</p>
          <p className="text-4xl font-arcade font-black text-bone-cream">
            {puzzleUnlocked}
            <span className="text-muted-steel text-xl font-normal font-arcade">/{totalPieces}</span>
          </p>
          <div className="mt-3 h-2 bg-corridor rounded-full overflow-hidden border border-steel-border">
            <div
              className="h-full bg-gradient-to-r from-neon-red to-electric-cyan transition-all duration-500 rounded-full"
              style={{ width: `${puzzlePct}%` }}
            />
          </div>
        </div>

        {/* QR Completed */}
        <div className="arcade-card p-5 border-steel-border">
          <p className="text-muted-steel text-[10px] font-arcade uppercase tracking-widest mb-1">QRS DECRYPTED</p>
          <p className="text-4xl font-arcade font-black text-bone-cream">
            {game.qrMappings?.filter((m) => m.isCompleted).length ?? 0}
            <span className="text-muted-steel text-xl font-normal font-arcade">/{game.qrMappings?.length ?? 10}</span>
          </p>
          <p className="text-[10px] text-muted-steel font-arcade uppercase mt-2">MASTER BEACON POOL</p>
        </div>

        {/* Round Result / Phase */}
        <div
          className={`arcade-card p-5 ${
            isComplete ? 'border-glow-cyan' : 'border-steel-border'
          }`}
        >
          <p className="text-muted-steel text-[10px] font-arcade uppercase tracking-widest mb-1">SECTOR STATUS</p>
          <p className={`text-xl font-arcade font-bold uppercase tracking-wider ${isComplete ? 'text-electric-cyan glow-text-cyan' : 'text-bone-cream'}`}>
            {isComplete ? 'SECTOR SECURED' : 'OPERATIONAL'}
          </p>
          <p className="text-[10px] text-muted-steel font-arcade uppercase mt-2">
            {game.result ? `OUTCOME: ${game.result}` : 'AWAITING COMPLETION'}
          </p>
        </div>
      </div>

      {/* Visual Puzzle Pieces State */}
      <div className="arcade-card-elevated p-6 border-steel-border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-bone-cream font-arcade font-bold text-sm uppercase tracking-wider flex items-center gap-2">
            <Puzzle className="w-4 h-4 text-electric-cyan" /> BLUEPRINT FRAGMENTS
          </h2>
          <span className="text-xs font-arcade text-muted-steel uppercase tracking-wider">
            {puzzleUnlocked === totalPieces && totalPieces > 0
              ? 'FULL BLUEPRINT DECRYPTED'
              : `${totalPieces - puzzleUnlocked} FRAGMENTS SEALED`}
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {game.puzzlePieces.map((piece) => (
            <div
              key={piece.pieceIndex}
              className={`p-4 rounded-xl border text-center transition-all ${
                piece.isUnlocked
                  ? 'bg-electric-cyan/15 border-electric-cyan text-electric-cyan shadow-[0_0_15px_rgba(0,229,255,0.25)]'
                  : 'bg-corridor border-steel-border text-muted-steel/60'
              }`}
            >
              <div className="flex justify-center mb-2">
                {piece.isUnlocked ? (
                  <CheckCircle className="w-5 h-5 text-electric-cyan" />
                ) : (
                  <Lock className="w-5 h-5 text-muted-steel/40" />
                )}
              </div>
              <p className="font-arcade font-bold text-sm text-bone-cream">FRAGMENT {piece.pieceIndex + 1}</p>
              <p className="text-[11px] font-arcade uppercase mt-1">
                {piece.isUnlocked ? (
                  <span className="text-electric-cyan font-bold">UNLOCKED</span>
                ) : (
                  <span className="text-muted-steel/60">SEALED</span>
                )}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* QR Codes Mapping & Status */}
      {game.qrMappings && game.qrMappings.length > 0 && (
        <div className="arcade-card p-6 border-steel-border">
          <h2 className="text-bone-cream font-arcade font-bold text-sm uppercase tracking-wider mb-4">
            PHYSICAL MASTER BEACONS (QR-01 THROUGH QR-10)
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {game.qrMappings.map((m) => (
              <div
                key={m.qrCodeId}
                className={`p-3.5 rounded-xl border transition-all ${
                  m.isCompleted
                    ? m.qrType === 'PUZZLE'
                      ? 'bg-electric-cyan/10 border-electric-cyan/40 text-bone-cream'
                      : 'bg-neon-red/10 border-neon-red/40 text-bone-cream'
                    : 'bg-corridor border-steel-border text-muted-steel'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-arcade font-bold text-sm text-bone-cream">{m.qrCodeId}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-arcade uppercase ${
                      m.qrType === 'PUZZLE'
                        ? 'bg-electric-cyan/20 text-electric-cyan'
                        : 'bg-neon-red/20 text-neon-red'
                    }`}
                  >
                    {m.qrType}
                  </span>
                </div>
                <p className="text-xs text-muted-steel font-tech mt-1">
                  {m.qrType === 'PUZZLE' && m.puzzlePieceIndex !== null
                    ? `Fragment #${m.puzzlePieceIndex + 1}`
                    : 'Decoy Beacon'}
                </p>
                <div className="mt-2 pt-2 border-t border-steel-border/60 flex items-center justify-between text-xs font-arcade">
                  <span className="text-muted-steel">{m.questionsCount} Qs</span>
                  {m.isCompleted ? (
                    <span className="text-electric-cyan font-bold">SOLVED</span>
                  ) : (
                    <span className="text-muted-steel/50">SEALED</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Player Status & Lives */}
      <div className="arcade-card-elevated p-6 border-steel-border">
        <h2 className="text-bone-cream font-arcade font-bold text-sm uppercase tracking-wider mb-4 flex items-center gap-2">
          <Users className="w-4 h-4 text-electric-cyan" /> OPERATIVES STATUS & VITALITY
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {game.players.map((p) => (
            <div
              key={p.id}
              className={`flex items-center justify-between px-4 py-3 rounded-xl border ${
                p.lives === 0
                  ? 'bg-neon-red/10 border-neon-red/40'
                  : p.lives === 1
                  ? 'bg-yellow-500/10 border-yellow-500/30'
                  : 'bg-corridor border-steel-border'
              }`}
            >
              <div>
                <p className="text-sm font-semibold text-bone-cream font-tech">{p.playerName}</p>
                <p className="text-xs text-muted-steel font-arcade uppercase">
                  {p.lives === 0 ? 'TERMINATED' : `${p.lives} / 2 VITALITY`}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-3.5 h-3.5 rounded-full transition-all ${
                      i < p.lives ? 'bg-neon-red shadow-[0_0_8px_rgba(255,30,66,0.6)]' : 'bg-corridor border border-steel-border'
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
        <div className="arcade-card p-6 border-steel-border">
          <h2 className="text-bone-cream font-arcade font-bold text-sm uppercase tracking-wider mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-electric-cyan" /> LIVE TACTICAL LOG
          </h2>
          <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
            {game.recentEvents.slice().reverse().map((ev) => (
              <div
                key={ev._id}
                className="flex items-center justify-between text-xs px-3.5 py-2.5 rounded-xl bg-corridor border border-steel-border"
              >
                <div className="flex items-center gap-2">
                  <span className="font-arcade text-neon-red font-bold text-[11px]">{ev.eventType}</span>
                  <span className="text-muted-steel truncate max-w-xs font-tech">
                    {ev.eventData ? JSON.stringify(ev.eventData) : ''}
                  </span>
                </div>
                <span className="text-muted-steel/60 shrink-0 ml-4 font-arcade text-[10px]">
                  {new Date(ev.occurredAt).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Confirmation Modal: Emergency End */}
      {showEndModal && (
        <div className="fixed inset-0 z-50 bg-corridor/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="arcade-card p-6 max-w-md w-full border-glow-red shadow-2xl">
            <div className="flex items-center gap-3 text-neon-red mb-3">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-xl font-display uppercase tracking-wider text-bone-cream">EMERGENCY END ROUND 1?</h3>
            </div>
            <p className="text-muted-steel text-sm font-tech leading-relaxed mb-6">
              This will immediately freeze all puzzle progress, stop new QR scans, and terminate Round 1 for all operatives. This action cannot be reversed.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                disabled={isActionLoading}
                onClick={() => setShowEndModal(false)}
                className="arcade-btn-secondary px-4 py-2 text-xs font-arcade uppercase cursor-pointer"
              >
                CANCEL
              </button>
              <button
                type="button"
                disabled={isActionLoading}
                onClick={handleEmergencyEnd}
                className="arcade-btn-primary px-4 py-2 text-xs font-arcade uppercase flex items-center gap-2 cursor-pointer"
              >
                {isActionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                CONFIRM END
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Restart Game */}
      {showRestartModal && (
        <div className="fixed inset-0 z-50 bg-corridor/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="arcade-card p-6 max-w-md w-full border-steel-border shadow-2xl">
            <div className="flex items-center gap-3 text-yellow-400 mb-3">
              <RotateCcw className="w-6 h-6" />
              <h3 className="text-xl font-display uppercase tracking-wider text-bone-cream">RESTART TO RADAR LOBBY?</h3>
            </div>
            <p className="text-muted-steel text-sm font-tech leading-relaxed mb-6">
              This will reset blueprint pieces, restore all operative vitality to 2, and return the session to LOBBY status. Operatives remain connected.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                disabled={isActionLoading}
                onClick={() => setShowRestartModal(false)}
                className="arcade-btn-secondary px-4 py-2 text-xs font-arcade uppercase cursor-pointer"
              >
                CANCEL
              </button>
              <button
                type="button"
                disabled={isActionLoading}
                onClick={handleRestart}
                className="arcade-btn-primary px-4 py-2 text-xs font-arcade uppercase flex items-center gap-2 cursor-pointer"
              >
                {isActionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                CONFIRM RESTART
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Reset Round 1 */}
      {showResetR1Modal && (
        <div className="fixed inset-0 z-50 bg-corridor/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="arcade-card p-6 max-w-md w-full border-steel-border shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-yellow-400">
              <RotateCcw className="w-6 h-6" />
              <h3 className="text-xl font-display uppercase tracking-wider text-bone-cream">RESET ROUND 1?</h3>
            </div>
            <p className="text-muted-steel text-sm font-tech leading-relaxed">
              This resets Round 1 specific state: the master chronometer restarts to 4 minutes, operative vitality is restored to 2, and blueprint fragments are locked again. Connected operatives remain authenticated.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isActionLoading}
                onClick={() => setShowResetR1Modal(false)}
                className="arcade-btn-secondary px-4 py-2 text-xs font-arcade uppercase cursor-pointer"
              >
                CANCEL
              </button>
              <button
                type="button"
                disabled={isActionLoading}
                onClick={handleResetRound1}
                className="arcade-btn-primary px-4 py-2 text-xs font-arcade uppercase flex items-center gap-2 cursor-pointer"
              >
                {isActionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                CONFIRM RESET
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Terminate Round 1 */}
      {showTerminateR1Modal && (
        <div className="fixed inset-0 z-50 bg-corridor/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="arcade-card p-6 max-w-md w-full border-glow-red shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-neon-red">
              <StopCircle className="w-6 h-6" />
              <h3 className="text-xl font-display uppercase tracking-wider text-bone-cream">TERMINATE ROUND 1?</h3>
            </div>
            <p className="text-muted-steel text-sm font-tech leading-relaxed">
              This will immediately halt Round 1, stop all timers, mark Round 1 complete, and reject any further answer attempts.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isActionLoading}
                onClick={() => setShowTerminateR1Modal(false)}
                className="arcade-btn-secondary px-4 py-2 text-xs font-arcade uppercase cursor-pointer"
              >
                CANCEL
              </button>
              <button
                type="button"
                disabled={isActionLoading}
                onClick={handleTerminateRound1}
                className="arcade-btn-primary px-4 py-2 text-xs font-arcade uppercase flex items-center gap-2 cursor-pointer"
              >
                {isActionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                CONFIRM TERMINATE
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
    ROUND_1_COMPLETE: 'ROUND 1 COMPLETE — START TRANSITION',
    TRANSITION: 'TRANSITION (ROLE ASSIGNMENT)',
    ROUND_2_ACTIVE: 'ROUND 2 ACTIVE DECEPTION',
    BODY_REPORT: 'BODY REPORT WINDOW',
    MOVE_TO_VOTING: 'MOVING TO VOTING ROOM',
    VOTING: 'SECRET BALLOT IN PROGRESS',
    GAME_COMPLETE: 'OPERATION CONCLUDED',
  };

  const aliveCount = game.players.filter(p => p.status === 'ALIVE').length;
  const eliminatedCount = game.players.filter(p => p.status === 'ELIMINATED').length;

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-display uppercase tracking-wider text-bone-cream">{game.teamName}</h1>
          <p className="text-muted-steel text-xs font-arcade tracking-widest mt-1 uppercase">
            PHASE 3: DECEPTION • ACCESS CODE: <span className="text-neon-red font-bold font-arcade">{game.gameCode}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1 text-xs font-arcade font-bold rounded-full border uppercase tracking-wider ${
            isComplete ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
            : isRound2 ? 'bg-electric-cyan/15 text-electric-cyan border-electric-cyan/40 glow-text-cyan'
            : isTransition ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30'
            : 'bg-neon-red/15 text-neon-red border-neon-red/40 glow-text-red'
          }`}>
            {phaseLabel[phase] ?? phase.replace(/_/g, ' ')}
          </span>
          <button onClick={onRefresh} className="arcade-btn-secondary px-3.5 py-2 text-xs font-arcade uppercase cursor-pointer">
            REFRESH
          </button>
        </div>
      </div>

      {actionError && (
        <div className="p-3 bg-neon-red/10 border border-neon-red/40 rounded-xl flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-neon-red shrink-0" />
          <p className="text-neon-red text-xs font-tech">{actionError}</p>
        </div>
      )}

      {/* Paused Banner */}
      {game.isPaused && (
        <div className="p-4 bg-yellow-500/15 border border-yellow-500/40 rounded-2xl flex items-center justify-between gap-3 text-yellow-300">
          <div className="flex items-center gap-3">
            <Pause className="w-6 h-6 shrink-0 text-yellow-400 animate-pulse" />
            <div>
              <p className="font-arcade font-bold text-sm uppercase tracking-wide">ROUND 2 SUSPENDED BY GAME MASTER</p>
              <p className="text-xs text-yellow-300/80 font-tech">
                All timers are authoritatively frozen on the server. Operative tactical actions are blocked until resumed.
              </p>
            </div>
          </div>
          <button
            onClick={handleTogglePauseR2}
            disabled={isActionLoading}
            className="px-4 py-2 bg-yellow-400 text-black font-arcade font-bold text-xs uppercase rounded-xl hover:bg-yellow-300 transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer tracking-wider"
          >
            {isActionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
            RESUME SESSION
          </button>
        </div>
      )}

      {/* GM Round 2 Controls Bar (Pause, Reset Round 2, Terminate Round 2) */}
      {!isComplete && phase !== GAME_PHASE.ROUND_1_COMPLETE && (
        <div className="arcade-card p-4 flex flex-wrap items-center justify-between gap-3 border-steel-border">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-electric-cyan" />
            <span className="text-xs font-arcade font-bold text-bone-cream uppercase tracking-wider">ROUND 2 COMMAND CENTER</span>
            {game.roundRevision ? (
              <span className="text-[10px] bg-corridor px-2 py-0.5 rounded font-arcade text-muted-steel border border-steel-border">
                REV #{game.roundRevision}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleTogglePauseR2}
              disabled={isActionLoading}
              className={`px-3.5 py-1.5 text-xs font-arcade font-bold uppercase rounded-xl border flex items-center gap-1.5 transition-colors cursor-pointer ${
                game.isPaused
                  ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40 hover:bg-yellow-500/30'
                  : 'bg-corridor text-muted-steel border-steel-border hover:text-bone-cream'
              }`}
            >
              {isActionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : game.isPaused ? <PlayCircle className="w-3.5 h-3.5 text-yellow-400" /> : <Pause className="w-3.5 h-3.5" />}
              {game.isPaused ? 'RESUME ROUND 2' : 'PAUSE ROUND 2'}
            </button>
            <button
              onClick={() => setShowResetR2Modal(true)}
              disabled={isActionLoading}
              className="arcade-btn-secondary px-3.5 py-1.5 text-xs font-arcade uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              RESET ROUND 2
            </button>
            <button
              onClick={() => setShowTerminateR2Modal(true)}
              disabled={isActionLoading}
              className="px-3.5 py-1.5 text-xs font-arcade font-bold uppercase rounded-xl border border-neon-red/40 text-neon-red bg-neon-red/10 hover:bg-neon-red/20 transition-colors flex items-center gap-1.5 cursor-pointer tracking-wider"
            >
              <StopCircle className="w-3.5 h-3.5" />
              TERMINATE ROUND 2
            </button>
          </div>
        </div>
      )}

      {/* GM Action Controls */}
      {phase === GAME_PHASE.ROUND_1_COMPLETE && (
        <div className="arcade-card p-6 border-steel-border">
          <h2 className="text-bone-cream font-arcade font-bold text-sm uppercase tracking-wider mb-2 flex items-center gap-2">
            <Shield className="w-4 h-4 text-electric-cyan" /> START TRANSITION PHASE
          </h2>
          <p className="text-muted-steel text-xs font-tech mb-4">
            This will randomly assign secret roles (1 Imposter, rest Crewmates) and physical tasks. Each operative receives their private dossier securely.
          </p>
          <button
            onClick={handleStartTransition}
            disabled={isTransitioning}
            className="arcade-btn-primary px-6 py-3 text-xs font-arcade uppercase tracking-widest flex items-center gap-2 cursor-pointer disabled:opacity-40"
          >
            {isTransitioning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
            BEGIN TRANSITION
          </button>
        </div>
      )}

      {isTransition && (
        <div className="arcade-card p-6 border-glow-cyan">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-bone-cream font-arcade font-bold text-sm uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4 text-electric-cyan" /> TRANSITION CHRONOMETER
            </h2>
            <div className="text-3xl font-arcade font-black text-electric-cyan glow-text-cyan">{phaseTimer}</div>
          </div>
          <p className="text-muted-steel text-xs font-tech mb-4">
            Operatives are committing their assignments to memory. When ready, manually launch Round 2 or allow the timer to expire.
          </p>
          <button
            onClick={handleStartRound2}
            disabled={isStartingR2}
            className="arcade-btn-primary px-6 py-3.5 text-xs font-arcade uppercase tracking-widest flex items-center gap-2 cursor-pointer disabled:opacity-40"
          >
            {isStartingR2 ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
            START ROUND 2 NOW
          </button>
        </div>
      )}

      {/* Status KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="arcade-card p-5 border-steel-border">
          <p className="text-muted-steel text-[10px] font-arcade uppercase tracking-widest mb-1">R2 MASTER CLOCK</p>
          <p className="text-3xl sm:text-4xl font-arcade font-black text-bone-cream tabular-nums">{r2Timer || '—'}</p>
          <p className="text-[10px] text-muted-steel font-arcade uppercase mt-1">CONTINUOUS</p>
        </div>
        <div className="arcade-card p-5 border-steel-border">
          <p className="text-muted-steel text-[10px] font-arcade uppercase tracking-widest mb-1">CASUALTIES</p>
          <p className="text-3xl sm:text-4xl font-arcade font-black text-neon-red glow-text-red">
            {game.killCount ?? 0}<span className="text-muted-steel text-xl font-normal font-arcade">/2</span>
          </p>
        </div>
        <div className="arcade-card p-5 border-steel-border">
          <p className="text-muted-steel text-[10px] font-arcade uppercase tracking-widest mb-1">ALIVE / KIA</p>
          <p className="text-3xl sm:text-4xl font-arcade font-black text-electric-cyan glow-text-cyan">
            {aliveCount} <span className="text-muted-steel text-xl font-normal font-arcade">/ {eliminatedCount}</span>
          </p>
        </div>
        <div className="arcade-card p-5 border-steel-border">
          <p className="text-muted-steel text-[10px] font-arcade uppercase tracking-widest mb-1">BALLOT CYCLES</p>
          <p className="text-3xl sm:text-4xl font-arcade font-black text-bone-cream">{game.votingCycle ?? 0}</p>
        </div>
      </div>

      {/* Phase status card */}
      {(isBodyReport || isMoveToVoting || isVoting) && (
        <div className={`arcade-card p-5 ${
          isBodyReport ? 'border-glow-red' : isMoveToVoting ? 'border-2 border-neon-red/70 animate-pulse' : 'border-glow-cyan'
        }`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-arcade uppercase tracking-widest text-muted-steel mb-1">CURRENT OPERATIONAL PHASE</p>
              <p className={`text-xl font-display uppercase tracking-wider ${
                isBodyReport ? 'text-neon-red glow-text-red' : isMoveToVoting ? 'text-yellow-300' : 'text-electric-cyan glow-text-cyan'
              }`}>
                {isBodyReport ? 'BODY REPORT WINDOW' : isMoveToVoting ? 'MOVE TO VOTING ROOM' : 'BALLOT IN PROGRESS'}
              </p>
            </div>
            <div className={`text-4xl font-arcade font-black tabular-nums ${
              isBodyReport ? 'text-neon-red glow-text-red' : isMoveToVoting ? 'text-yellow-400' : 'text-electric-cyan glow-text-cyan'
            }`}>
              {phaseTimer}
            </div>
          </div>
        </div>
      )}

      {/* Result card */}
      {isComplete && (
        <div className="arcade-card p-6 text-center border-glow-cyan">
          <CheckCircle className="w-12 h-12 text-electric-cyan mx-auto mb-2 drop-shadow-[0_0_15px_rgba(0,229,255,0.6)]" />
          <h2 className="text-3xl font-display uppercase tracking-wider text-bone-cream mb-1">OPERATION COMPLETE</h2>
          <p className={`text-xl font-arcade font-bold uppercase tracking-wider ${
            game.result === 'CREWMATES_WIN' ? 'text-electric-cyan glow-text-cyan'
            : game.result?.includes('IMPOSTER') ? 'text-neon-red glow-text-red'
            : 'text-muted-steel'
          }`}>
            {game.result?.replace(/_/g, ' ') ?? 'Game ended'}
          </p>
        </div>
      )}

      {/* Kill History (Authorized GM View) */}
      {game.kills && game.kills.length > 0 && (
        <div className="arcade-card p-6 border-glow-red">
          <h2 className="text-bone-cream font-arcade font-bold text-sm uppercase tracking-wider mb-4 flex items-center gap-2">
            <Skull className="w-4 h-4 text-neon-red" /> CASUALTY LOG ({game.kills.length}/2)
          </h2>
          <div className="space-y-3">
            {game.kills.map((k) => (
              <div
                key={k.id || k.killNumber}
                className="flex items-center justify-between p-3.5 bg-corridor/90 border border-neon-red/30 rounded-xl"
              >
                <div className="flex items-center gap-3">
                  <span className="px-2.5 py-1 text-xs font-arcade font-bold rounded-lg bg-neon-red/20 text-neon-red uppercase">
                    KILL #{k.killNumber}
                  </span>
                  <div>
                    <p className="text-sm font-tech font-semibold text-bone-cream">
                      Victim: <span className="text-neon-red font-bold">{k.victimPlayerName}</span>
                      <span className="text-xs text-muted-steel ml-2 font-arcade">(ELIMINATED)</span>
                    </p>
                    <p className="text-xs text-muted-steel mt-0.5 font-tech">
                      Imposter: <span className="text-bone-cream font-medium">{k.imposterPlayerName}</span>
                    </p>
                  </div>
                </div>
                <span
                  className="text-xs font-arcade text-muted-steel"
                  title={k.reportedAt ? new Date(k.reportedAt).toLocaleTimeString() : undefined}
                >
                  {(k as any).elapsedFormatted || formatKillElapsed(k.reportedAt, game.round2StartedAt)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Players with roles */}
      <div className="arcade-card-elevated p-6 border-steel-border">
        <h2 className="text-bone-cream font-arcade font-bold text-sm uppercase tracking-wider mb-4 flex items-center gap-2">
          <Users className="w-4 h-4 text-electric-cyan" /> OPERATIVES MANIFEST (GM AUTHORIZED VIEW)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {game.players.map(p => (
            <div key={p.id} className={`flex items-center justify-between px-4 py-3 rounded-xl border ${
              p.status === 'ELIMINATED'
                ? 'bg-corridor/40 border-steel-border/50 text-muted-steel/60'
                : p.role === 'IMPOSTER'
                ? 'bg-corridor border-neon-red/50 shadow-[0_0_12px_rgba(255,30,66,0.15)]'
                : 'bg-corridor border-steel-border'
            }`}>
              <div className="flex items-center gap-2.5">
                {p.role === 'IMPOSTER'
                  ? <Skull className="w-4 h-4 text-neon-red" />
                  : <Shield className="w-4 h-4 text-electric-cyan" />
                }
                <div>
                  <p className={`text-sm font-semibold font-tech ${p.status === 'ELIMINATED' ? 'line-through text-muted-steel/60' : 'text-bone-cream'}`}>
                    {p.playerName}
                  </p>
                  {p.assignedTaskName && (
                    <p className="text-xs text-muted-steel font-tech">Zone 0{p.assignedTaskZone}: {p.assignedTaskName}</p>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className={`text-[10px] font-arcade font-bold uppercase px-2 py-0.5 rounded-full border ${
                  p.role === 'IMPOSTER'
                    ? 'bg-neon-red/15 text-neon-red border-neon-red/30'
                    : 'bg-electric-cyan/15 text-electric-cyan border-electric-cyan/30'
                }`}>
                  {p.role ?? 'UNASSIGNED'}
                </span>
                <span className={`text-[10px] font-arcade font-bold uppercase ${
                  p.status === 'ELIMINATED' ? 'text-neon-red' :
                  p.status === 'ALIVE' ? 'text-electric-cyan' : 'text-muted-steel'
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
        <div className="arcade-card p-6 border-steel-border">
          <h2 className="text-bone-cream font-arcade font-bold text-sm uppercase tracking-wider mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-electric-cyan" /> TACTICAL EVENT FEED
          </h2>
          <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
            {game.recentEvents.slice().reverse().map((ev) => (
              <div key={ev._id} className="flex items-center justify-between text-xs px-3.5 py-2.5 rounded-xl bg-corridor border border-steel-border">
                <div className="flex items-center gap-2">
                  <span className="font-arcade text-neon-red font-bold text-[11px]">{ev.eventType}</span>
                  <span className="text-muted-steel truncate max-w-xs font-tech">{ev.eventData ? JSON.stringify(ev.eventData) : ''}</span>
                </div>
                <span className="text-muted-steel/60 shrink-0 ml-4 font-arcade text-[10px]">{new Date(ev.occurredAt).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Confirmation Modal: Reset Round 2 */}
      {showResetR2Modal && (
        <div className="fixed inset-0 z-50 bg-corridor/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="arcade-card p-6 max-w-md w-full border-steel-border shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-yellow-400">
              <RotateCcw className="w-6 h-6" />
              <h3 className="text-xl font-display uppercase tracking-wider text-bone-cream">RESET ROUND 2?</h3>
            </div>
            <p className="text-muted-steel text-sm font-tech leading-relaxed">
              This will restart Round 2, regenerate secret roles and physical task assignments, restore operative vitality, reset casualties to 0, and reset the chronometer. Round 1 progress is preserved.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isActionLoading}
                onClick={() => setShowResetR2Modal(false)}
                className="arcade-btn-secondary px-4 py-2 text-xs font-arcade uppercase cursor-pointer"
              >
                CANCEL
              </button>
              <button
                type="button"
                disabled={isActionLoading}
                onClick={handleResetRound2}
                className="arcade-btn-primary px-4 py-2 text-xs font-arcade uppercase flex items-center gap-2 cursor-pointer"
              >
                {isActionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                CONFIRM RESET
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Terminate Round 2 */}
      {showTerminateR2Modal && (
        <div className="fixed inset-0 z-50 bg-corridor/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="arcade-card p-6 max-w-md w-full border-glow-red shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-neon-red">
              <StopCircle className="w-6 h-6" />
              <h3 className="text-xl font-display uppercase tracking-wider text-bone-cream">TERMINATE ROUND 2?</h3>
            </div>
            <p className="text-muted-steel text-sm font-tech leading-relaxed">
              This will immediately halt Round 2, mark the operation complete with status ROUND_TERMINATED, stop all timers, and freeze operative access.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isActionLoading}
                onClick={() => setShowTerminateR2Modal(false)}
                className="arcade-btn-secondary px-4 py-2 text-xs font-arcade uppercase cursor-pointer"
              >
                CANCEL
              </button>
              <button
                type="button"
                disabled={isActionLoading}
                onClick={handleTerminateRound2}
                className="arcade-btn-primary px-4 py-2 text-xs font-arcade uppercase flex items-center gap-2 cursor-pointer"
              >
                {isActionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                CONFIRM TERMINATE
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
          <h1 className="text-3xl font-display uppercase tracking-widest text-bone-cream">Question Bank Management</h1>
          <p className="text-muted-steel text-sm mt-0.5 font-arcade">
            {questions.length} QUESTIONS CONFIGURED • ACTIVE POOL Q-001 THROUGH Q-050
          </p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-neon-red text-white font-bold rounded-xl hover:brightness-110 active:scale-95 transition-all shadow-[0_0_12px_rgba(255,30,66,0.35)] cursor-pointer text-xs font-arcade tracking-wider uppercase"
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
            className="w-full arcade-input text-white text-sm"
          />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <Filter className="w-4 h-4 text-muted-steel shrink-0" />
          {QUESTION_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-neon-red text-white shadow-[0_0_10px_rgba(255,30,66,0.3)]'
                  : 'bg-tactical-slate border border-mosaic-border text-muted-steel hover:text-white'
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
          <h2 className="text-3xl font-display uppercase tracking-widest text-bone-cream flex items-center gap-2">
            <History className="w-6 h-6 text-neon-red" />
            Game History // Audit Logs
          </h2>
          <p className="text-xs text-muted-steel mt-1 font-arcade uppercase tracking-wider">
            Archived records of completed event games
          </p>
        </div>
        <button
          onClick={fetchHistory}
          className="px-3 py-1.5 border border-mosaic-border rounded-xl text-xs font-arcade tracking-wider text-muted-steel hover:text-white flex items-center gap-1.5 cursor-pointer hover:border-neon-red/40 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5 text-neon-red" />
          REFRESH
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
                        {detailGame.round2.kills.map((k: any, i: number) => {
                          const elapsedText = k.elapsedFormatted || formatKillElapsed(k.reportedAt, detailGame.round2?.startedAt);
                          return (
                            <li key={i} className="flex justify-between items-center text-xs">
                              <span>Kill #{k.killNumber}: {k.victimPlayerName}</span>
                              <span
                                className="font-mono text-[10px] text-mosaic-muted"
                                title={k.reportedAt ? new Date(k.reportedAt).toLocaleTimeString() : undefined}
                              >
                                {elapsedText}
                              </span>
                            </li>
                          );
                        })}
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
                            <p className="text-[10px] text-mosaic-muted mt-0.5 flex items-center gap-1.5">
                              <span>Zone {p.assignedTaskZone}: {p.assignedTaskName}</span>
                              <span className="text-[9px] px-1.5 py-0.5 bg-mosaic-dark/80 border border-mosaic-border/40 rounded text-mosaic-muted font-medium">Task assigned</span>
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
                <div className="bg-mosaic-dark/30 p-3 rounded-xl border border-mosaic-border/20 flex justify-between items-center text-mosaic-muted text-xs">
                  <span>Round 1 Puzzle Status</span>
                  <span className={detailGame.round1?.puzzleCompleted ? 'text-green-400 font-bold' : 'text-mosaic-muted'}>
                    {detailGame.round1?.puzzleCompleted
                      ? (detailGame.round1?.puzzleDurationFormatted
                          ? `Completed (Duration: ${detailGame.round1.puzzleDurationFormatted})`
                          : 'Completed')
                      : 'Incomplete'}
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
