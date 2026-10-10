/**
 * MOSAIC — Round 2 Player Page (Deception Gameplay)
 *
 * Requirements:
 * 1. Unified Theme: Crewmate and Imposter share the EXACT same dark mosaic UI design, colors, and layout
 *    so observers peeking at screens cannot distinguish roles.
 * 2. Role & Task Dossier: Popup card revealing Role, Objective, Task Name, Zone Name, and detailed Work To Do.
 * 3. Review Task Info: Accessible button on the main page to re-open and recite task info anytime.
 * 4. Active/Alive Players: Full manifest showing alive vs eliminated players.
 * 5. Bottom Action Bar:
 *    - Small circular "Report" button for all players (opens modal asking who was eliminated, starts Move to Voting).
 *    - Extra discreet "Kill" button for Imposter (notifies GM/server, marks victim, starts auto-report timer).
 * 6. Flashing "Move to Voting": Flashing screen with countdown when body is reported or auto-timer expires.
 * 7. Secret Ballot Voting: Only alive players eligible, secret ballot during voting, results revealed after completion.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Shield, Clock, Users, Radio, CheckCircle, XCircle, Loader2,
  FileText, Skull, X, Megaphone, Vote, Pause
} from 'lucide-react';
import { useAuth } from '@/app/providers/AuthContext';
import {
  getPlayerGameState,
  recordKill,
  reportBody,
  submitVote,
  type PlayerGameStateData,
} from '@/services/gameService';
import { GAME_PHASE, PLAYER_ROLE } from '@/types/enums';
import { subscribeToEvent } from '@/lib/socket/socketClient';
import { SOCKET_EVENT } from '@/types/enums';

// ─── Authoritative Countdown Hook ───────────────────────────────────────────

function useCountdown(endsAt: string | null | undefined, isPaused?: boolean, pausedMs?: number | null) {
  const [secsLeft, setSecsLeft] = useState<number>(0);
  useEffect(() => {
    if (isPaused && typeof pausedMs === 'number') {
      setSecsLeft(Math.max(0, Math.round(pausedMs / 1000)));
      return;
    }
    if (!endsAt) return;
    const update = () => {
      const diff = Math.max(0, Math.round((new Date(endsAt).getTime() - Date.now()) / 1000));
      setSecsLeft(diff);
    };
    update();
    const id = setInterval(update, 500);
    return () => clearInterval(id);
  }, [endsAt, isPaused, pausedMs]);
  return secsLeft;
}

// ─── Voting Result Interface ────────────────────────────────────────────────

interface VotingResultData {
  votingCycle: number;
  tally: Array<{ playerId: string; playerName: string; voteCount: number }>;
  eliminatedPlayer: { id: string; playerName: string; role?: string } | null;
  isTie: boolean;
  gameComplete: boolean;
  result: string | null;
  nextPhase: string;
}

export default function Round2PlayerPage() {
  const navigate = useNavigate();
  const { playerContext } = useAuth();
  const gameId = playerContext?.game_id ?? '';

  const [state, setState] = useState<PlayerGameStateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [killLoading, setKillLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [voteLoading, setVoteLoading] = useState(false);
  const [votedFor, setVotedFor] = useState<string | null>(null);
  const [voteCount, setVoteCount] = useState<{ submitted: number; eligible: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const clientActionIdRef = useRef(0);

  // Modals
  const [showDossierModal, setShowDossierModal] = useState(true);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showKillModal, setShowKillModal] = useState(false);
  const [selectedReportVictim, setSelectedReportVictim] = useState<string>('');
  const [selectedKillVictim, setSelectedKillVictim] = useState<string>('');

  const [votingResult, setVotingResult] = useState<VotingResultData | null>(null);
  const [selectedVoteTarget, setSelectedVoteTarget] = useState<string>('');

  const masterSecsLeft = useCountdown(state?.round2EndsAt, state?.isPaused, state?.pausedRound2RemainingMs);
  const phaseSecsLeft = useCountdown(state?.phaseEndsAt, state?.isPaused, state?.pausedRemainingMs);

  const loadState = useCallback(async () => {
    if (!gameId) return;
    const res = await getPlayerGameState(gameId);
    if (res.success) {
      setState(res.data);
      if (res.data.phase === GAME_PHASE.GAME_COMPLETE) {
        navigate('/player/complete', { replace: true });
      }
    }
  }, [gameId, navigate]);

  useEffect(() => {
    void loadState().then(() => setLoading(false));
  }, [loadState]);

  // Phase change socket listener
  useEffect(() => {
    const unsub = subscribeToEvent<{ to: string }>(SOCKET_EVENT.PHASE_CHANGED, (data) => {
      if (data.to === GAME_PHASE.GAME_COMPLETE) {
        navigate('/player/complete', { replace: true });
      } else {
        if (data.to === GAME_PHASE.VOTING) {
          setVotedFor(null);
          setSelectedVoteTarget('');
          setVotingResult(null);
        }
        void loadState();
      }
    });
    return unsub;
  }, [loadState, navigate]);

  // Vote cast socket listener (Secret ballot: only counts are broadcast)
  useEffect(() => {
    const unsub = subscribeToEvent<any>(SOCKET_EVENT.VOTE_CAST, (data) => {
      setVoteCount({
        submitted: data?.submitted ?? data?.submittedVotesCount ?? 0,
        eligible: data?.eligible ?? data?.eligibleVotersCount ?? 0,
      });
    });
    return unsub;
  }, []);

  // Voting result listener
  useEffect(() => {
    const unsub = subscribeToEvent<VotingResultData>(SOCKET_EVENT.VOTING_RESULT, (data) => {
      setVotingResult(data);
      void loadState();
    });
    return unsub;
  }, [loadState]);

  // Game complete listener
  useEffect(() => {
    const unsub = subscribeToEvent(SOCKET_EVENT.GAME_COMPLETE, () => {
      navigate('/player/complete', { replace: true });
    });
    return unsub;
  }, [navigate]);

  // Pause / Resume / Reset / Terminate socket events
  useEffect(() => {
    const unsubPaused = subscribeToEvent(SOCKET_EVENT.GAME_PAUSED, () => void loadState());
    const unsubResumed = subscribeToEvent(SOCKET_EVENT.GAME_RESUMED, () => void loadState());
    const unsubReset = subscribeToEvent(SOCKET_EVENT.ROUND_RESET, () => {
      setShowDossierModal(true);
      setVotedFor(null);
      setVotingResult(null);
      void loadState();
    });
    const unsubTerminated = subscribeToEvent(SOCKET_EVENT.ROUND_TERMINATED, () => {
      navigate('/player/complete', { replace: true });
    });

    return () => {
      unsubPaused();
      unsubResumed();
      unsubReset();
      unsubTerminated();
    };
  }, [loadState, navigate]);

  // Player status changed listener
  useEffect(() => {
    const unsub = subscribeToEvent(SOCKET_EVENT.PLAYER_STATUS_CHANGED, () => void loadState());
    return unsub;
  }, [loadState]);

  // Handlers
  const handleKill = useCallback(async (victimId: string) => {
    if (!gameId || state?.isPaused || !victimId) return;
    setKillLoading(true);
    setError(null);
    const cid = `kill-${++clientActionIdRef.current}-${Date.now()}`;
    const res = await recordKill(gameId, victimId, cid);
    setKillLoading(false);
    setShowKillModal(false);
    setSelectedKillVictim('');
    if (!res.success) {
      setError(res.error?.message ?? 'Failed to execute kill');
    } else {
      void loadState();
    }
  }, [gameId, loadState, state?.isPaused]);

  const handleReportBody = useCallback(async (victimId?: string) => {
    if (!gameId || state?.isPaused) return;
    setReportLoading(true);
    setError(null);
    const cid = `report-${++clientActionIdRef.current}-${Date.now()}`;
    const res = await reportBody(gameId, cid, victimId || undefined);
    setReportLoading(false);
    setShowReportModal(false);
    setSelectedReportVictim('');
    if (!res.success) {
      setError(res.error?.message ?? 'Failed to report body');
    } else {
      void loadState();
    }
  }, [gameId, loadState, state?.isPaused]);

  const handleVote = useCallback(async (targetId: string) => {
    if (!gameId || state?.isPaused || !targetId) return;
    setVoteLoading(true);
    setError(null);
    const cid = `vote-${++clientActionIdRef.current}-${Date.now()}`;
    const res = await submitVote(gameId, targetId, cid);
    setVoteLoading(false);
    if (!res.success) {
      setError(res.error?.message ?? 'Failed to submit vote');
    } else {
      setVotedFor(targetId);
      if (res.data) {
        setVoteCount({ submitted: res.data.submittedVotesCount, eligible: res.data.eligibleVotersCount });
      }
    }
  }, [gameId, state?.isPaused]);

  if (loading) {
    return (
      <div className="min-h-screen bg-mosaic-dark flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-mosaic-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!state) {
    return (
      <div className="min-h-screen bg-mosaic-dark flex items-center justify-center text-mosaic-muted text-sm">
        Unable to load game state.
      </div>
    );
  }

  const role = state.myPlayer?.role ?? state.myRole;

  if (!role) {
    return (
      <div className="min-h-screen bg-mosaic-dark flex flex-col items-center justify-center p-4 text-center">
        <div className="w-10 h-10 border-2 border-mosaic-accent border-t-transparent rounded-full animate-spin mb-4" />
        <h2 className="text-white font-bold text-lg mb-1">Awaiting Role Assignment...</h2>
        <p className="text-mosaic-muted text-xs max-w-xs mb-4">
          Your private mission assignment is being synchronized from the server.
        </p>
        <button
          onClick={() => void loadState()}
          className="px-4 py-2 bg-mosaic-surface border border-mosaic-border text-white text-xs font-semibold rounded-xl hover:bg-mosaic-dark transition-colors cursor-pointer"
        >
          Retry Sync
        </button>
      </div>
    );
  }

  if (role !== PLAYER_ROLE.IMPOSTER && role !== PLAYER_ROLE.CREWMATE) {
    return (
      <div className="min-h-screen bg-mosaic-dark flex flex-col items-center justify-center p-4 text-center">
        <XCircle className="w-10 h-10 text-red-400 mb-3" />
        <h2 className="text-white font-bold text-base mb-1">Invalid Role Assignment</h2>
        <p className="text-mosaic-muted text-xs max-w-xs mb-4">
          Unrecognized role assignment received ({String(role)}). Please sync with the Game Master.
        </p>
        <button
          onClick={() => void loadState()}
          className="px-4 py-2 bg-mosaic-surface border border-mosaic-border text-white text-xs font-semibold rounded-xl cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  const isImposter = role === PLAYER_ROLE.IMPOSTER;
  const myStatus = state.myPlayer?.status ?? 'ALIVE';
  const isEliminated = myStatus === 'ELIMINATED';
  const phase = state.phase;

  const taskZone = state.myPlayer?.assignedTaskZone ?? state.myTaskZone;
  const taskZoneName = state.myPlayer?.assignedTaskZoneName ?? state.myTaskZoneName ?? (taskZone ? `Zone 0${taskZone}` : null);
  const taskName = state.myPlayer?.assignedTaskName ?? state.myTaskName;
  const taskDescription = state.myPlayer?.assignedTaskDescription ?? state.myTaskDescription ??
    'Follow physical instructions posted at the designated zone.';

  const masterMins = Math.floor(masterSecsLeft / 60);
  const masterSecs = masterSecsLeft % 60;

  // Active / alive teammates
  const allPlayersList = [
    {
      id: state.myPlayer.id,
      playerName: state.myPlayer.playerName,
      status: myStatus,
      isSelf: true,
    },
    ...state.teammates.filter(t => t.id !== state.myPlayer.id).map(t => ({
      id: t.id,
      playerName: t.playerName,
      status: t.status,
      isSelf: false,
    })),
  ];

  const alivePlayers = allPlayersList.filter(p => p.status === 'ALIVE');
  const aliveTargetsForVoting = alivePlayers.filter(p => p.id !== state.myPlayer.id);
  const aliveVictimsForKill = alivePlayers.filter(p => p.id !== state.myPlayer.id);

  return (
    <div className="min-h-screen bg-mosaic-dark text-white flex flex-col font-sans selection:bg-mosaic-accent/30 selection:text-white pb-28">
      {/* ─── Top Header (Uniform UI Theme for both roles) ─── */}
      <header className="sticky top-0 z-20 bg-mosaic-surface/90 backdrop-blur-md border-b border-mosaic-border px-4 py-3">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-mosaic-dark border border-mosaic-border flex items-center justify-center text-mosaic-accent">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold tracking-widest text-mosaic-muted">
                {state.teamName}
              </div>
              {/* Role badge in identical subtle theme */}
              <div className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <span>YOUR ROLE: {role}</span>
                {isEliminated && (
                  <span className="text-[10px] bg-red-500/20 text-red-400 border border-red-500/30 px-1.5 py-0.2 rounded font-semibold">
                    ELIMINATED
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Dual Timers: Transition Timer & Six-Minute Round 2 Continuous Timer */}
          <div className="flex items-center gap-2">
            {phase === GAME_PHASE.TRANSITION && (
              <div
                id="transition-timer"
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-mosaic-accent/15 border border-mosaic-accent/40 rounded-xl"
                title="Transition Timer"
              >
                <Clock className="w-3.5 h-3.5 text-mosaic-accent animate-pulse" />
                <span className="text-[10px] uppercase font-bold text-mosaic-accent tracking-wider">TRANSITION:</span>
                <span className="font-mono text-xs font-bold text-white tabular-nums">
                  {String(Math.floor(phaseSecsLeft / 60)).padStart(2, '0')}:{String(phaseSecsLeft % 60).padStart(2, '0')}
                </span>
              </div>
            )}
            <div
              id="round2-timer"
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-mosaic-dark/80 border border-mosaic-border rounded-xl"
              title="Six-Minute Round 2 Timer"
            >
              <Clock className={`w-3.5 h-3.5 ${masterSecsLeft <= 60 && phase !== GAME_PHASE.TRANSITION ? 'text-red-400 animate-pulse' : 'text-mosaic-accent'}`} />
              <span className="text-[10px] uppercase font-bold text-mosaic-muted tracking-wider">ROUND 2:</span>
              <span className={`font-mono text-xs font-bold tabular-nums ${masterSecsLeft <= 60 && phase !== GAME_PHASE.TRANSITION ? 'text-red-400 animate-pulse' : 'text-white'}`}>
                {phase === GAME_PHASE.TRANSITION && !state.round2EndsAt
                  ? '06:00'
                  : `${String(masterMins).padStart(2, '0')}:${String(masterSecs).padStart(2, '0')}`}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* ─── Paused Banner ─── */}
      {state.isPaused && (
        <div className="bg-yellow-500/15 border-b border-yellow-500/40 p-2.5 text-center text-yellow-300">
          <p className="text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-1.5 animate-pulse">
            <Pause className="w-3.5 h-3.5" /> Round 2 Paused by Game Master
          </p>
          <p className="text-[11px] text-yellow-300/80">
            Authoritative timers and player actions are temporarily frozen.
          </p>
        </div>
      )}

      {/* ─── Error notification ─── */}
      {error && (
        <div className="max-w-md mx-auto w-full px-4 pt-3">
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-300 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <XCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-white ml-2">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ─── Main Content ─── */}
      <main className="flex-1 max-w-md mx-auto w-full p-4 space-y-4">
        {/* Transition Countdown Banner */}
        {phase === GAME_PHASE.TRANSITION && (
          <section className="bg-gradient-to-r from-mosaic-accent/15 to-mosaic-purple/15 border border-mosaic-accent/40 rounded-2xl p-4 shadow-lg text-center space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-mosaic-dark/80 border border-mosaic-accent/30 rounded-full text-xs font-semibold text-mosaic-accent">
              <Clock className="w-3.5 h-3.5 animate-spin" />
              <span>ROUND 2 TRANSITION IN PROGRESS</span>
            </div>
            <div className="text-3xl font-black font-mono text-white tracking-wider tabular-nums">
              {String(Math.floor(phaseSecsLeft / 60)).padStart(2, '0')}:{String(phaseSecsLeft % 60).padStart(2, '0')}
            </div>
            <p className="text-xs text-mosaic-muted">
              Prepare for the six-minute round (06:00). Memorize your assigned role, task, and zone below.
            </p>
          </section>
        )}

        {/* Player's Own Role, Task & Zone Assignment Card */}
        <section id="player-assignment-card" className="bg-mosaic-surface border border-mosaic-border rounded-2xl p-5 shadow-lg shadow-black/20 space-y-3.5">
          <div className="flex items-center justify-between border-b border-mosaic-border/60 pb-2.5">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-mosaic-accent" />
              <span className="text-xs font-bold uppercase tracking-wider text-mosaic-muted">
                Your Secret Assignment
              </span>
            </div>
            <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-lg bg-mosaic-dark border border-mosaic-border text-mosaic-accent">
              Zone 0{taskZone}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-mosaic-dark/80 rounded-xl border border-mosaic-border/50">
              <span className="text-[10px] uppercase font-bold text-mosaic-muted tracking-wider block mb-0.5">
                Your Assigned Role
              </span>
              <span className="text-base font-black text-white uppercase tracking-wide">
                {role}
              </span>
            </div>
            <div className="p-3 bg-mosaic-dark/80 rounded-xl border border-mosaic-border/50">
              <span className="text-[10px] uppercase font-bold text-mosaic-muted tracking-wider block mb-0.5">
                Designated Zone
              </span>
              <span className="text-sm font-bold text-mosaic-accent block truncate">
                {taskZoneName}
              </span>
            </div>
          </div>

          <div className="p-3.5 bg-mosaic-dark/80 rounded-xl border border-mosaic-border/50 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-mosaic-muted tracking-wider">
                {isImposter ? 'Your Cover Task' : 'Your Assigned Task'}
              </span>
              <span className="text-[10px] font-mono text-mosaic-muted">Zone 0{taskZone}</span>
            </div>
            <div className="text-sm font-bold text-white">
              {taskName}
            </div>
            <div className="pt-2 border-t border-mosaic-border/40">
              <span className="text-[10px] uppercase font-bold text-mosaic-muted tracking-wider block mb-1">
                Work To Do:
              </span>
              <p className="text-xs text-mosaic-muted leading-relaxed">
                {taskDescription}
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowDossierModal(true)}
            className="w-full py-2.5 bg-mosaic-dark hover:bg-mosaic-surface border border-mosaic-border text-mosaic-accent hover:text-white text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Recite / Enlarge Task Dossier</span>
          </button>
        </section>

        {/* Players Manifest Card (Alive & Eliminated) */}
        <section className="bg-mosaic-surface border border-mosaic-border rounded-2xl p-4 shadow-lg shadow-black/20 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-white font-bold text-sm">
              <Users className="w-4 h-4 text-mosaic-accent" />
              <span>Team Roster</span>
            </div>
            <span className="text-xs font-mono text-mosaic-muted">
              {alivePlayers.length} / {allPlayersList.length} Alive
            </span>
          </div>

          <div className="space-y-2">
            {allPlayersList.map((player) => {
              const isPlayerAlive = player.status === 'ALIVE';
              return (
                <div
                  key={player.id}
                  className={`p-3 rounded-xl border flex items-center justify-between transition-colors ${
                    isPlayerAlive
                      ? 'bg-mosaic-dark/70 border-mosaic-border/70 text-white'
                      : 'bg-mosaic-dark/30 border-mosaic-border/30 text-mosaic-muted opacity-75'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`w-2 h-2 rounded-full ${isPlayerAlive ? 'bg-emerald-400 shadow-sm shadow-emerald-400' : 'bg-red-500'}`} />
                    <span className={`text-sm font-semibold ${!isPlayerAlive ? 'line-through text-mosaic-muted' : 'text-white'}`}>
                      {player.playerName}
                    </span>
                    {player.isSelf && (
                      <span className="text-[10px] text-mosaic-muted font-normal">(you)</span>
                    )}
                  </div>
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                      isPlayerAlive
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        : 'bg-red-500/10 text-red-400 border-red-500/30'
                    }`}
                  >
                    {isPlayerAlive ? 'Alive' : 'Dead'}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Quick Instructions Card */}
        <section className="bg-mosaic-surface/60 border border-mosaic-border/60 rounded-2xl p-4 text-xs text-mosaic-muted space-y-2">
          <p className="font-semibold text-white">Round 2 Guidelines:</p>
          <ul className="list-disc pl-4 space-y-1">
            <li>Execute your physical task at your assigned zone.</li>
            <li>If you spot a dead player, tap the circular <strong>Report</strong> button below.</li>
            <li>When an emergency meeting begins, immediately proceed to the voting room.</li>
          </ul>
        </section>
      </main>

      {/* ─── Fixed Bottom Action Bar (Identical Layout + Report & Kill) ─── */}
      <footer className="fixed bottom-0 inset-x-0 p-4 bg-mosaic-dark/95 backdrop-blur-md border-t border-mosaic-border z-30">
        <div className="max-w-md mx-auto flex items-center justify-center gap-6">
          {/* Small Circular Report Button (Everyone) */}
          <button
            onClick={() => setShowReportModal(true)}
            disabled={isEliminated || state.isPaused || reportLoading}
            className="flex flex-col items-center justify-center gap-1.5 group cursor-pointer disabled:opacity-50"
            title="Report Dead Body"
          >
            <div className="w-14 h-14 rounded-full bg-mosaic-surface border-2 border-mosaic-border group-hover:border-mosaic-accent group-hover:bg-mosaic-dark transition-all flex items-center justify-center shadow-lg shadow-black/50">
              <Radio className="w-6 h-6 text-mosaic-accent group-hover:scale-110 transition-transform" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-mosaic-muted group-hover:text-white">
              Report Body
            </span>
          </button>

          {/* Discreet Extra Kill Button (Imposter Only, Styled in Same Dark Theme) */}
          {isImposter && (
            <button
              onClick={() => setShowKillModal(true)}
              disabled={isEliminated || state.isPaused || killLoading || (state.killCount ?? 0) >= 2}
              className="flex flex-col items-center justify-center gap-1.5 group cursor-pointer disabled:opacity-50"
              title="Eliminate Target"
            >
              <div className="w-14 h-14 rounded-full bg-mosaic-surface border-2 border-mosaic-border group-hover:border-red-400/80 group-hover:bg-mosaic-dark transition-all flex items-center justify-center shadow-lg shadow-black/50">
                <Skull className="w-6 h-6 text-mosaic-muted group-hover:text-red-400 group-hover:scale-110 transition-transform" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-mosaic-muted group-hover:text-white">
                Kill ({(state.killCount ?? 0)}/2)
              </span>
            </button>
          )}
        </div>
      </footer>

      {/* ─── Modal 1: Secret Dossier / Assignment Card ─── */}
      {showDossierModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-mosaic-surface border border-mosaic-border rounded-3xl p-6 max-w-sm w-full space-y-5 shadow-2xl text-left my-6">
            <div className="flex items-center justify-between border-b border-mosaic-border pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-mosaic-accent" />
                <span className="text-xs font-bold uppercase tracking-widest text-mosaic-muted">
                  Mission Assignment Dossier
                </span>
              </div>
              <button
                onClick={() => setShowDossierModal(false)}
                className="text-mosaic-muted hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Secret Role in Neutral Styling */}
            <div className="p-4 rounded-2xl bg-mosaic-dark border border-mosaic-border space-y-1.5">
              <div className="text-[10px] font-bold uppercase tracking-widest text-mosaic-muted">
                Your Role Assignment
              </div>
              <div className="text-xl font-black text-white uppercase tracking-wider">
                YOUR ROLE: {role}
              </div>
              <p className="text-xs text-mosaic-muted leading-relaxed pt-1">
                {isImposter
                  ? 'Eliminate crewmates covertly while avoiding detection. Fake your assigned cover task to blend into the room.'
                  : 'Complete physical tasks across designated zones, coordinate with your team, and expose the Imposter during voting.'}
              </p>
            </div>

            {/* Task Information with Work To Do and Zone */}
            <div className="p-4 rounded-2xl bg-mosaic-dark border border-mosaic-border space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest text-mosaic-accent">
                  {isImposter ? 'Cover Task (To Blend In)' : 'Physical Task Assignment'}
                </span>
                <span className="text-xs font-mono font-bold text-white px-2 py-0.5 rounded bg-mosaic-surface border border-mosaic-border">
                  Zone 0{taskZone}
                </span>
              </div>
              <div className="text-sm font-bold text-white">
                {taskName}
              </div>
              <div className="text-xs font-medium text-mosaic-accent">
                {taskZoneName}
              </div>
              <div className="pt-2 border-t border-mosaic-border/50">
                <div className="text-[10px] font-bold uppercase tracking-wider text-mosaic-muted mb-1">
                  Work To Do:
                </div>
                <p className="text-xs text-mosaic-muted leading-relaxed">
                  {taskDescription}
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowDossierModal(false)}
              className="w-full py-3.5 bg-gradient-to-r from-mosaic-accent to-mosaic-purple text-black font-bold text-sm rounded-xl hover:opacity-90 transition-all cursor-pointer shadow-lg shadow-mosaic-accent/20"
            >
              OK, I Understand
            </button>
          </div>
        </div>
      )}

      {/* ─── Modal 2: Report Body Confirmation ─── */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-mosaic-surface border border-mosaic-border rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-2 text-mosaic-accent">
              <Radio className="w-5 h-5" />
              <h3 className="text-base font-bold text-white">Report Eliminated Body</h3>
            </div>
            <p className="text-xs text-mosaic-muted">
              Select the player found eliminated or call an emergency report. This triggers an immediate movement phase to the voting area.
            </p>

            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {allPlayersList.filter(p => !p.isSelf).map(p => (
                <button
                  key={p.id}
                  onClick={() => setSelectedReportVictim(p.id)}
                  className={`w-full p-2.5 rounded-xl border text-left text-xs font-semibold flex items-center justify-between transition-colors ${
                    selectedReportVictim === p.id
                      ? 'bg-mosaic-accent/20 border-mosaic-accent text-white'
                      : 'bg-mosaic-dark/80 border-mosaic-border text-mosaic-muted hover:text-white'
                  }`}
                >
                  <span>{p.playerName}</span>
                  <span className="text-[10px] opacity-75">{p.status}</span>
                </button>
              ))}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => { setShowReportModal(false); setSelectedReportVictim(''); }}
                className="flex-1 py-2.5 rounded-xl border border-mosaic-border text-xs text-mosaic-muted hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleReportBody(selectedReportVictim || undefined)}
                disabled={reportLoading}
                className="flex-1 py-2.5 bg-mosaic-accent text-black font-bold text-xs rounded-xl hover:opacity-90 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {reportLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Confirm Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal 3: Imposter Kill Target Selection ─── */}
      {showKillModal && isImposter && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-mosaic-surface border border-mosaic-border rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-2 text-red-400">
              <Skull className="w-5 h-5" />
              <h3 className="text-base font-bold text-white">Execute Elimination</h3>
            </div>
            <p className="text-xs text-mosaic-muted">
              Select an active crewmate to eliminate. This action will notify the Game Master and initiate the body discovery timer.
            </p>

            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {aliveVictimsForKill.map(p => (
                <button
                  key={p.id}
                  onClick={() => setSelectedKillVictim(p.id)}
                  className={`w-full p-2.5 rounded-xl border text-left text-xs font-semibold flex items-center justify-between transition-colors ${
                    selectedKillVictim === p.id
                      ? 'bg-red-500/20 border-red-500 text-white'
                      : 'bg-mosaic-dark/80 border-mosaic-border text-mosaic-muted hover:text-white'
                  }`}
                >
                  <span>{p.playerName}</span>
                  <span className="text-[10px] text-emerald-400">● Alive</span>
                </button>
              ))}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => { setShowKillModal(false); setSelectedKillVictim(''); }}
                className="flex-1 py-2.5 rounded-xl border border-mosaic-border text-xs text-mosaic-muted hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleKill(selectedKillVictim)}
                disabled={!selectedKillVictim || killLoading}
                className="flex-1 py-2.5 bg-red-600 text-white font-bold text-xs rounded-xl hover:bg-red-500 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {killLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Confirm Kill
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Phase Overlay 1: Body Report Window (Auto-Report Timer) ─── */}
      {phase === GAME_PHASE.BODY_REPORT && !isEliminated && (
        <div className="fixed inset-0 z-40 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-mosaic-surface border-2 border-mosaic-border rounded-3xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl">
            <Radio className="w-12 h-12 text-mosaic-accent mx-auto animate-pulse" />
            <h2 className="text-xl font-black text-white uppercase tracking-wide">
              Body Report Window
            </h2>
            <p className="text-xs text-mosaic-muted leading-relaxed">
              A player was eliminated. Report the body to skip directly to the voting meeting, or auto-timer will expire.
            </p>
            <div className="text-4xl font-mono font-black text-mosaic-accent tabular-nums">
              {phaseSecsLeft}s
            </div>
            <button
              onClick={() => handleReportBody()}
              disabled={reportLoading || state.isPaused}
              className="w-full py-3 bg-mosaic-accent text-black font-bold text-xs rounded-xl hover:opacity-90 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-mosaic-accent/20"
            >
              {reportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />}
              Report Body Now
            </button>
          </div>
        </div>
      )}

      {/* ─── Phase Overlay 2: Flashing "Go to Voting Room" (Move to Voting) ─── */}
      {phase === GAME_PHASE.MOVE_TO_VOTING && (
        <div className="fixed inset-0 z-40 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-mosaic-surface border-2 border-yellow-500/80 rounded-3xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl shadow-yellow-500/20 animate-pulse my-6">
            <Megaphone className="w-12 h-12 text-yellow-400 mx-auto animate-bounce" />
            <div>
              <h2 className="text-xl font-black text-yellow-300 uppercase tracking-wide">
                BODY REPORTED — GO TO VOTING ROOM
              </h2>
              <p className="text-xs text-yellow-300/80 mt-1">
                Move to the designated voting area before the countdown ends.
              </p>
            </div>

            {/* Large 15s Countdown */}
            <div className="p-3 bg-mosaic-dark/80 rounded-2xl border border-yellow-500/40">
              <div className="text-[10px] uppercase font-bold text-mosaic-muted tracking-widest mb-1">
                Movement Countdown
              </div>
              <div className="text-5xl font-mono font-black text-yellow-400 tabular-nums">
                {phaseSecsLeft}s
              </div>
            </div>

            {/* Player Info & Master Timer */}
            <div className="grid grid-cols-2 gap-2 text-left text-xs bg-mosaic-dark/60 p-3 rounded-xl border border-mosaic-border">
              <div>
                <span className="text-[10px] text-mosaic-muted uppercase block">Your Status</span>
                <span className="font-bold text-white">{state.myPlayer.playerName}</span>
                <span className={`text-[10px] ml-1.5 px-1.5 py-0.2 rounded font-semibold ${isEliminated ? 'text-red-400 bg-red-500/10' : 'text-emerald-400 bg-emerald-500/10'}`}>
                  {myStatus}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-mosaic-muted uppercase block">Round 2 Master</span>
                <span className="font-mono font-bold text-white">
                  {String(masterMins).padStart(2, '0')}:{String(masterSecs).padStart(2, '0')}
                </span>
              </div>
            </div>

            {/* Alive / Eliminated Lists */}
            <div className="text-left text-xs space-y-1.5 pt-1">
              <div className="text-[10px] uppercase font-bold text-mosaic-muted tracking-wider">
                Roster Status ({alivePlayers.length} Alive, {allPlayersList.length - alivePlayers.length} Eliminated)
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                {allPlayersList.map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-1 px-2 rounded-lg bg-mosaic-dark/50 border border-mosaic-border/40 text-[11px]">
                    <span className={p.status === 'ALIVE' ? 'text-white' : 'line-through text-mosaic-muted'}>
                      {p.playerName} {p.isSelf ? '(you)' : ''}
                    </span>
                    <span className={p.status === 'ALIVE' ? 'text-emerald-400 font-semibold text-[10px]' : 'text-red-400 font-semibold text-[10px]'}>
                      {p.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Phase Overlay 3: Emergency Voting (Secret Ballot) ─── */}
      {phase === GAME_PHASE.VOTING && (
        <div className="fixed inset-0 z-40 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-mosaic-surface border border-mosaic-border rounded-3xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl my-6">
            <div className="w-12 h-12 rounded-2xl bg-mosaic-dark border border-mosaic-border mx-auto flex items-center justify-center text-mosaic-accent">
              <Vote className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-black text-white uppercase tracking-wide">
                VOTING IN PROGRESS
              </h2>
              <div className={`text-3xl font-mono font-black ${phaseSecsLeft <= 5 ? 'text-red-400 animate-pulse' : 'text-mosaic-accent'} tabular-nums mt-1`}>
                {phaseSecsLeft}s
              </div>
            </div>

            {/* Master timer & your status */}
            <div className="grid grid-cols-2 gap-2 text-left text-xs bg-mosaic-dark/60 p-2.5 rounded-xl border border-mosaic-border">
              <div>
                <span className="text-[10px] text-mosaic-muted uppercase block">You</span>
                <span className="font-bold text-white text-xs">{state.myPlayer.playerName}</span>
                <span className={`text-[10px] ml-1 px-1.5 py-0.2 rounded font-semibold ${isEliminated ? 'text-red-400 bg-red-500/10' : 'text-emerald-400 bg-emerald-500/10'}`}>
                  {myStatus}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-mosaic-muted uppercase block">Master Timer</span>
                <span className="font-mono font-bold text-white text-xs">
                  {String(masterMins).padStart(2, '0')}:{String(masterSecs).padStart(2, '0')}
                </span>
              </div>
            </div>

            {/* Submitted Vote Counter */}
            <div className="text-xs text-mosaic-accent font-mono bg-mosaic-dark/80 py-1.5 px-3 rounded-lg border border-mosaic-border">
              {voteCount ? `${voteCount.submitted} / ${voteCount.eligible} votes submitted` : 'Votes cast are strictly private'}
            </div>

            {isEliminated ? (
              <div className="p-4 bg-mosaic-dark/80 border border-mosaic-border rounded-2xl text-xs text-mosaic-muted">
                You are eliminated and cannot cast a vote.
              </div>
            ) : votedFor ? (
              <div className="p-4 bg-mosaic-dark/80 border border-mosaic-border rounded-2xl space-y-1.5">
                <CheckCircle className="w-6 h-6 text-emerald-400 mx-auto" />
                <p className="text-sm font-bold text-white">Vote Submitted</p>
                <p className="text-xs text-mosaic-muted">
                  Ballot is secret. Waiting for remaining players or timer expiry...
                </p>
              </div>
            ) : (
              <div className="space-y-3 text-left">
                <p className="text-xs text-mosaic-muted font-medium">Select candidate to eliminate:</p>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {aliveTargetsForVoting.map((target) => {
                    const isSelected = selectedVoteTarget === target.id;
                    return (
                      <button
                        key={target.id}
                        type="button"
                        onClick={() => setSelectedVoteTarget(target.id)}
                        disabled={voteLoading || state.isPaused}
                        className={`w-full p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-mosaic-accent/20 border-mosaic-accent text-white'
                            : 'bg-mosaic-dark hover:bg-mosaic-surface border-mosaic-border text-mosaic-muted hover:text-white'
                        }`}
                      >
                        <span>{target.playerName}</span>
                        <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${isSelected ? 'border-mosaic-accent bg-mosaic-accent' : 'border-mosaic-border'}`}>
                          {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-black" />}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => handleVote(selectedVoteTarget)}
                  disabled={!selectedVoteTarget || voteLoading || state.isPaused}
                  className="w-full py-3 bg-gradient-to-r from-mosaic-accent to-mosaic-purple text-black font-bold text-xs rounded-xl hover:opacity-90 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shadow-lg shadow-mosaic-accent/20"
                >
                  {voteLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  SUBMIT VOTE
                </button>
              </div>
            )}

            {/* Current Alive / Eliminated Lists */}
            <div className="text-left text-xs space-y-1 border-t border-mosaic-border/40 pt-2">
              <span className="text-[10px] text-mosaic-muted uppercase font-bold tracking-wider">
                Players Manifest
              </span>
              <div className="space-y-0.5 max-h-24 overflow-y-auto pr-1">
                {allPlayersList.map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-[11px] py-0.5">
                    <span className={p.status === 'ALIVE' ? 'text-white' : 'line-through text-mosaic-muted'}>
                      {p.playerName}
                    </span>
                    <span className={p.status === 'ALIVE' ? 'text-emerald-400 text-[10px]' : 'text-red-400 text-[10px]'}>
                      {p.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal 4: Voting Results Reveal Overlay ─── */}
      {votingResult && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-mosaic-surface border border-mosaic-border rounded-3xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl my-6">
            <h3 className="text-lg font-black text-white uppercase tracking-wider">
              VOTING RESULTS
            </h3>

            {/* Clear Outcome Message */}
            <div className="p-3 rounded-2xl bg-mosaic-dark border border-mosaic-border">
              {votingResult.eliminatedPlayer?.role === PLAYER_ROLE.IMPOSTER ? (
                <div className="text-emerald-400 font-black text-base uppercase tracking-wider">
                  CREWMATES WIN
                </div>
              ) : votingResult.gameComplete && votingResult.result?.includes('IMPOSTER') ? (
                <div className="text-red-400 font-black text-base uppercase tracking-wider">
                  IMPOSTER WINS
                </div>
              ) : (
                <div className="text-mosaic-accent font-black text-base uppercase tracking-wider">
                  GAME CONTINUES
                </div>
              )}
            </div>

            {/* Vote Tally Breakdown */}
            <div className="p-3 bg-mosaic-dark rounded-2xl border border-mosaic-border space-y-1.5 text-left max-h-36 overflow-y-auto">
              <div className="text-[10px] font-bold uppercase tracking-wider text-mosaic-muted mb-1">
                Final Vote Totals:
              </div>
              {votingResult.tally.map((item) => (
                <div key={item.playerId} className="flex items-center justify-between text-xs py-1 border-b border-mosaic-border/40 last:border-0">
                  <span className="text-white font-medium">{item.playerName}</span>
                  <span className="font-mono text-mosaic-accent font-bold">{item.voteCount} votes</span>
                </div>
              ))}
            </div>

            {/* Elimination Outcome */}
            {votingResult.eliminatedPlayer ? (
              <div className="p-3 bg-mosaic-dark border border-mosaic-border rounded-2xl space-y-1 text-left text-xs">
                <div className="text-[10px] text-mosaic-muted uppercase tracking-wider font-semibold">
                  Player Eliminated:
                </div>
                <div className="text-sm font-bold text-white flex items-center justify-between">
                  <span>{votingResult.eliminatedPlayer.playerName}</span>
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-mosaic-surface border border-mosaic-border text-mosaic-muted">
                    Role: {votingResult.eliminatedPlayer.role || 'Revealed Post-Vote'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-mosaic-dark border border-mosaic-border rounded-2xl text-xs text-left">
                <div className="text-sm font-bold text-white">Tie Vote — No Elimination</div>
                <p className="text-[11px] text-mosaic-muted mt-0.5">
                  No player received a decisive majority. Round 2 active gameplay resumes.
                </p>
              </div>
            )}

            {/* Updated Alive / Eliminated Lists */}
            <div className="text-left text-xs space-y-1 border-t border-mosaic-border/40 pt-2">
              <span className="text-[10px] text-mosaic-muted uppercase font-bold tracking-wider">
                Updated Team Roster
              </span>
              <div className="space-y-0.5 max-h-24 overflow-y-auto pr-1">
                {allPlayersList.map((p) => {
                  const isNowEliminated = p.status !== 'ALIVE' || p.id === votingResult.eliminatedPlayer?.id;
                  return (
                    <div key={p.id} className="flex items-center justify-between text-[11px] py-0.5">
                      <span className={!isNowEliminated ? 'text-white' : 'line-through text-mosaic-muted'}>
                        {p.playerName}
                      </span>
                      <span className={!isNowEliminated ? 'text-emerald-400 text-[10px]' : 'text-red-400 text-[10px]'}>
                        {!isNowEliminated ? 'ALIVE' : 'ELIMINATED'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <button
              onClick={() => setVotingResult(null)}
              className="w-full py-3 bg-mosaic-surface hover:bg-mosaic-dark border border-mosaic-border text-white font-bold text-xs rounded-xl transition-all cursor-pointer"
            >
              Continue
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
