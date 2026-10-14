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
      void loadState();
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
      <div className="min-h-screen bg-corridor flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-neon-red border-t-transparent rounded-full animate-spin shadow-[0_0_15px_rgba(255,30,66,0.5)]" />
      </div>
    );
  }

  if (!state) {
    return (
      <div className="min-h-screen bg-corridor flex items-center justify-center text-muted-steel text-sm font-tech">
        Unable to load tactical game state.
      </div>
    );
  }

  const role = state.myPlayer?.role ?? state.myRole;

  if (!role) {
    return (
      <div className="min-h-screen arcade-corridor-bg flex flex-col items-center justify-center p-4 text-center">
        <div className="w-10 h-10 border-2 border-electric-cyan border-t-transparent rounded-full animate-spin mb-4 shadow-[0_0_15px_rgba(0,229,255,0.4)]" />
        <h2 className="text-bone-cream font-display text-2xl uppercase tracking-wider mb-1">AWAITING DOSSIER ASSIGNMENT...</h2>
        <p className="text-muted-steel text-xs max-w-xs mb-4 font-tech">
          Your private mission assignment is being synchronized from the tactical server.
        </p>
        <button
          onClick={() => void loadState()}
          className="px-4 py-2 bg-tactical-slate border border-steel-border text-bone-cream text-xs font-arcade tracking-wider uppercase rounded-xl hover:border-electric-cyan transition-colors cursor-pointer"
        >
          RETRY SYNC
        </button>
      </div>
    );
  }

  if (role !== PLAYER_ROLE.IMPOSTER && role !== PLAYER_ROLE.CREWMATE) {
    return (
      <div className="min-h-screen arcade-corridor-bg flex flex-col items-center justify-center p-4 text-center">
        <XCircle className="w-10 h-10 text-neon-red mb-3 drop-shadow-[0_0_10px_rgba(255,30,66,0.5)]" />
        <h2 className="text-bone-cream font-display text-2xl uppercase tracking-wider mb-1">INVALID ROLE ASSIGNMENT</h2>
        <p className="text-muted-steel text-xs max-w-xs mb-4 font-tech">
          Unrecognized role assignment received ({String(role)}). Please sync with the Game Master.
        </p>
        <button
          onClick={() => void loadState()}
          className="px-4 py-2 bg-tactical-slate border border-steel-border text-bone-cream text-xs font-arcade tracking-wider uppercase rounded-xl cursor-pointer"
        >
          RETRY
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
  const unreportedBodies = allPlayersList.filter(
    p => !p.isSelf && p.status === 'ELIMINATED' && !(state.reportedVictimIds || []).includes(p.id)
  );

  return (
    <div className="min-h-screen arcade-corridor-bg text-bone-cream flex flex-col font-tech selection:bg-neon-red/30 selection:text-white pb-32">
      {/* ─── Top Header (Uniform UI Theme for both roles) ─── */}
      <header className="sticky top-0 z-20 bg-tactical-slate/95 backdrop-blur-md border-b border-steel-border px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-corridor border border-steel-border flex items-center justify-center text-electric-cyan shadow-inner">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] uppercase font-arcade tracking-widest text-muted-steel">
                {state.teamName}
              </div>
              {/* Role badge in identical subtle theme */}
              <div className="text-xs font-arcade font-bold text-bone-cream uppercase tracking-wider flex items-center gap-1.5">
                <span>OPERATIVE ROLE: {role}</span>
                {isEliminated && (
                  <span className="text-[10px] bg-neon-red/20 text-neon-red border border-neon-red/40 px-1.5 py-0.2 rounded font-arcade">
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
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-neon-red/10 border border-neon-red/40 rounded-xl shadow-[0_0_10px_rgba(255,30,66,0.2)]"
                title="Transition Timer"
              >
                <Clock className="w-3.5 h-3.5 text-neon-red animate-pulse" />
                <span className="text-[10px] uppercase font-arcade font-bold text-neon-red tracking-wider">TRANSITION:</span>
                <span className="font-arcade text-xs font-bold text-bone-cream tabular-nums">
                  {String(Math.floor(phaseSecsLeft / 60)).padStart(2, '0')}:{String(phaseSecsLeft % 60).padStart(2, '0')}
                </span>
              </div>
            )}
            <div
              id="round2-timer"
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-corridor/90 border border-steel-border rounded-xl"
              title="Six-Minute Round 2 Timer"
            >
              <Clock className={`w-3.5 h-3.5 ${masterSecsLeft <= 60 && phase !== GAME_PHASE.TRANSITION ? 'text-neon-red animate-pulse' : 'text-electric-cyan'}`} />
              <span className="text-[10px] uppercase font-arcade font-bold text-muted-steel tracking-wider">ROUND 2:</span>
              <span className={`font-arcade text-xs font-bold tabular-nums ${masterSecsLeft <= 60 && phase !== GAME_PHASE.TRANSITION ? 'text-neon-red glow-text-red animate-pulse' : 'text-bone-cream glow-text-cyan'}`}>
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
        <div className="bg-yellow-500/15 border-b border-yellow-500/40 p-2.5 text-center text-yellow-300 font-arcade">
          <p className="text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-1.5 animate-pulse">
            <Pause className="w-3.5 h-3.5" /> ROUND 2 SUSPENDED BY GAME MASTER
          </p>
          <p className="text-[11px] text-yellow-300/80 font-tech">
            Authoritative timers and operative tactical actions are temporarily frozen.
          </p>
        </div>
      )}

      {/* ─── Error notification ─── */}
      {error && (
        <div className="max-w-2xl mx-auto w-full px-4 pt-3">
          <div className="p-3 bg-neon-red/10 border border-neon-red/40 rounded-xl text-xs text-neon-red flex items-center justify-between font-tech">
            <div className="flex items-center gap-2">
              <XCircle className="w-4 h-4 shrink-0 text-neon-red" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError(null)} className="text-neon-red hover:text-white ml-2">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ─── Main Content ─── */}
      <main className="flex-1 max-w-2xl mx-auto w-full p-4 space-y-4">
        {/* Transition Countdown Banner */}
        {phase === GAME_PHASE.TRANSITION && (
          <section className="arcade-card p-5 text-center space-y-2 border-glow-red relative overflow-hidden">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-corridor/90 border border-neon-red/40 rounded-full text-xs font-arcade font-semibold text-neon-red">
              <Clock className="w-3.5 h-3.5 animate-spin" />
              <span>ROUND 2 TRANSITION IN PROGRESS</span>
            </div>
            <div className="text-4xl font-black font-arcade text-bone-cream tracking-widest tabular-nums glow-text-red">
              {String(Math.floor(phaseSecsLeft / 60)).padStart(2, '0')}:{String(phaseSecsLeft % 60).padStart(2, '0')}
            </div>
            <p className="text-xs text-muted-steel font-tech">
              Prepare for the six-minute operational round (06:00). Memorize your assigned role, task, and zone below.
            </p>
          </section>
        )}

        {/* Player's Own Role, Task & Zone Assignment Card */}
        <section id="player-assignment-card" className="arcade-card p-5 space-y-3.5 border-steel-border relative overflow-hidden">
          <div className="flex items-center justify-between border-b border-steel-border/60 pb-2.5">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-electric-cyan" />
              <span className="text-xs font-arcade font-bold uppercase tracking-wider text-muted-steel">
                SECRET ASSIGNMENT DOSSIER
              </span>
            </div>
            <span className="text-xs font-arcade font-bold px-2.5 py-0.5 rounded-lg bg-corridor border border-steel-border text-electric-cyan glow-text-cyan">
              Zone 0{taskZone}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-corridor/90 rounded-xl border border-steel-border">
              <span className="text-[10px] uppercase font-arcade font-bold text-muted-steel tracking-wider block mb-0.5">
                ASSIGNED ROLE
              </span>
              <span className="text-xl font-display uppercase tracking-wide text-bone-cream">
                {role}
              </span>
            </div>
            <div className="p-3 bg-corridor/90 rounded-xl border border-steel-border">
              <span className="text-[10px] uppercase font-arcade font-bold text-muted-steel tracking-wider block mb-0.5">
                DESIGNATED ZONE
              </span>
              <span className="text-sm font-tech font-bold text-electric-cyan block truncate">
                {taskZoneName}
              </span>
            </div>
          </div>

          <div className="p-3.5 bg-corridor/90 rounded-xl border border-steel-border space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-arcade font-bold text-muted-steel tracking-wider">
                {isImposter ? 'COVER PROTOCOL' : 'PHYSICAL PROTOCOL'}
              </span>
              <span className="text-[10px] font-arcade text-muted-steel">Zone 0{taskZone}</span>
            </div>
            <div className="text-base font-bold text-bone-cream font-tech">
              {taskName}
            </div>
            <div className="pt-2 border-t border-steel-border/60">
              <span className="text-[10px] uppercase font-arcade font-bold text-muted-steel tracking-wider block mb-1">
                OPERATIONAL DIRECTIVE:
              </span>
              <p className="text-xs text-muted-steel leading-relaxed font-tech">
                {taskDescription}
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowDossierModal(true)}
            className="w-full py-2.5 bg-corridor hover:bg-elevated-panel border border-steel-border text-electric-cyan hover:text-bone-cream text-xs font-arcade tracking-wider rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer uppercase shadow-inner"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>RECITE / ENLARGE DOSSIER</span>
          </button>
        </section>

        {/* Players Manifest Card (Alive & Eliminated) */}
        <section className="arcade-card-elevated p-4 space-y-3 border-steel-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-bone-cream font-arcade font-bold text-sm tracking-wider">
              <Users className="w-4 h-4 text-electric-cyan" />
              <span>TEAM SQUADRON ROSTER</span>
            </div>
            <span className="text-xs font-arcade text-muted-steel">
              {alivePlayers.length} / {allPlayersList.length} ALIVE
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {allPlayersList.map((player) => {
              const isPlayerAlive = player.status === 'ALIVE';
              return (
                <div
                  key={player.id}
                  className={`p-2.5 rounded-xl border flex items-center justify-between transition-colors ${
                    isPlayerAlive
                      ? 'bg-corridor/90 border-steel-border text-bone-cream'
                      : 'bg-corridor/40 border-steel-border/40 text-muted-steel/60 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${isPlayerAlive ? 'bg-electric-cyan shadow-[0_0_8px_rgba(0,229,255,0.7)]' : 'bg-neon-red'}`} />
                    <span className={`text-sm font-tech font-semibold ${!isPlayerAlive ? 'line-through text-muted-steel' : 'text-bone-cream'}`}>
                      {player.playerName}
                    </span>
                    {player.isSelf && (
                      <span className="text-[10px] text-muted-steel font-arcade">(YOU)</span>
                    )}
                  </div>
                  <span
                    className={`text-[10px] font-arcade font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                      isPlayerAlive
                        ? 'bg-electric-cyan/10 text-electric-cyan border-electric-cyan/30'
                        : 'bg-neon-red/10 text-neon-red border-neon-red/30'
                    }`}
                  >
                    {isPlayerAlive ? 'ALIVE' : 'DEAD'}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Quick Instructions Card */}
        <section className="arcade-card p-4 text-xs text-muted-steel font-tech space-y-2 border-steel-border">
          <p className="font-arcade font-bold text-bone-cream tracking-wider uppercase">ROUND 2 PROTOCOLS:</p>
          <ul className="list-disc pl-4 space-y-1">
            <li>Execute your physical protocol at your assigned sector zone.</li>
            <li>If you discover an eliminated operative, press the tactical <strong>Report</strong> radio.</li>
            <li>When an emergency alarm is raised, immediately report to the designated voting chamber.</li>
          </ul>
        </section>
      </main>

      {/* ─── Fixed Bottom Action Bar (Identical Layout + Report & Kill) ─── */}
      <footer className="fixed bottom-0 inset-x-0 p-4 bg-corridor/95 backdrop-blur-md border-t border-steel-border z-30">
        <div className="max-w-md mx-auto flex items-center justify-center gap-8">
          {/* Small Circular Report Button (Everyone) */}
          <button
            onClick={() => setShowReportModal(true)}
            disabled={isEliminated || state.isPaused || reportLoading}
            className="flex flex-col items-center justify-center gap-1.5 group cursor-pointer disabled:opacity-40"
            title="Report Dead Body"
          >
            <div className="w-14 h-14 rounded-full bg-tactical-slate border-2 border-steel-border group-hover:border-electric-cyan group-hover:bg-elevated-panel group-hover:shadow-[0_0_20px_rgba(0,229,255,0.4)] transition-all flex items-center justify-center shadow-lg">
              <Radio className="w-6 h-6 text-electric-cyan group-hover:scale-110 transition-transform" />
            </div>
            <span className="text-[10px] font-arcade uppercase tracking-wider text-muted-steel group-hover:text-electric-cyan transition-colors">
              REPORT BODY
            </span>
          </button>

          {/* Discreet Extra Kill Button (Imposter Only, Styled in Same Dark Theme) */}
          {isImposter && (
            <button
              onClick={() => setShowKillModal(true)}
              disabled={isEliminated || state.isPaused || killLoading || (state.killCount ?? 0) >= 2}
              className="flex flex-col items-center justify-center gap-1.5 group cursor-pointer disabled:opacity-40"
              title="Eliminate Target"
            >
              <div className="w-14 h-14 rounded-full bg-tactical-slate border-2 border-neon-red/60 group-hover:border-neon-red group-hover:bg-neon-red/15 group-hover:shadow-[0_0_20px_rgba(255,30,66,0.5)] transition-all flex items-center justify-center shadow-lg">
                <Skull className="w-6 h-6 text-neon-red group-hover:scale-110 transition-transform" />
              </div>
              <span className="text-[10px] font-arcade uppercase tracking-wider text-neon-red font-bold">
                ELIMINATE ({(state.killCount ?? 0)}/2)
              </span>
            </button>
          )}
        </div>
      </footer>

      {/* ─── Modal 1: Secret Dossier / Assignment Card ─── */}
      {showDossierModal && (
        <div className="fixed inset-0 z-50 bg-corridor/90 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="arcade-card p-6 max-w-sm w-full space-y-5 border-glow-cyan shadow-2xl text-left my-6 relative">
            <div className="flex items-center justify-between border-b border-steel-border pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-electric-cyan" />
                <span className="text-xs font-arcade font-bold uppercase tracking-widest text-muted-steel">
                  CLASSIFIED MISSION DOSSIER
                </span>
              </div>
              <button
                onClick={() => setShowDossierModal(false)}
                className="text-muted-steel hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Secret Role in Neutral Styling */}
            <div className="p-4 rounded-xl bg-corridor border border-steel-border space-y-1.5">
              <div className="text-[10px] font-arcade uppercase tracking-widest text-muted-steel">
                TACTICAL ROLE ASSIGNMENT
              </div>
              <div className="text-2xl font-display font-black text-bone-cream uppercase tracking-wider">
                ASSIGNMENT: {role}
              </div>
              <p className="text-xs text-muted-steel leading-relaxed pt-1 font-tech">
                {isImposter
                  ? 'Eliminate crewmates covertly while avoiding detection. Fake your assigned cover protocol to blend into the facility.'
                  : 'Complete physical tasks across designated zones, coordinate with your team, and expose the Imposter during voting.'}
              </p>
            </div>

            {/* Task Information with Work To Do and Zone */}
            <div className="p-4 rounded-xl bg-corridor border border-steel-border space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-arcade font-bold uppercase tracking-widest text-electric-cyan">
                  {isImposter ? 'COVER PROTOCOL (DECEPTION)' : 'TACTICAL PROTOCOL'}
                </span>
                <span className="text-xs font-arcade font-bold text-bone-cream px-2 py-0.5 rounded bg-tactical-slate border border-steel-border">
                  Zone 0{taskZone}
                </span>
              </div>
              <div className="text-base font-bold text-bone-cream font-tech">
                {taskName}
              </div>
              <div className="text-xs font-arcade font-bold text-electric-cyan">
                {taskZoneName}
              </div>
              <div className="pt-2 border-t border-steel-border/60">
                <div className="text-[10px] font-arcade font-bold uppercase tracking-wider text-muted-steel mb-1">
                  DIRECTIVE DETAILS:
                </div>
                <p className="text-xs text-muted-steel leading-relaxed font-tech">
                  {taskDescription}
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowDossierModal(false)}
              className="arcade-btn-primary w-full py-3.5 text-xs uppercase cursor-pointer"
            >
              ACKNOWLEDGE & CLOSE
            </button>
          </div>
        </div>
      )}

      {/* ─── Modal 2: Report Body Confirmation ─── */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 bg-corridor/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="arcade-card p-6 max-w-sm w-full space-y-4 border-steel-border shadow-2xl">
            <div className="flex items-center gap-2 text-electric-cyan">
              <Radio className="w-5 h-5" />
              <h3 className="text-lg font-display uppercase tracking-wider text-bone-cream">REPORT CASUALTY</h3>
            </div>
            <p className="text-xs text-muted-steel font-tech">
              Identify the eliminated operative or dispatch an emergency alarm. This triggers an immediate movement phase to the assembly hall.
            </p>

            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {unreportedBodies.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-steel border border-steel-border/60 rounded-xl bg-corridor">
                  No unreported bodies detected in sector.
                </div>
              ) : (
                unreportedBodies.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedReportVictim(p.id)}
                    className={`w-full p-2.5 rounded-xl border text-left text-xs font-tech font-semibold flex items-center justify-between transition-colors ${
                      selectedReportVictim === p.id
                        ? 'bg-electric-cyan/20 border-electric-cyan text-bone-cream'
                        : 'bg-corridor border-steel-border text-muted-steel hover:text-bone-cream'
                    }`}
                  >
                    <span>{p.playerName}</span>
                    <span className="text-[10px] text-neon-red font-arcade font-bold">● ELIMINATED</span>
                  </button>
                ))
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => { setShowReportModal(false); setSelectedReportVictim(''); }}
                className="arcade-btn-secondary flex-1 py-2.5 text-xs font-arcade uppercase cursor-pointer"
              >
                CANCEL
              </button>
              <button
                onClick={() => handleReportBody(selectedReportVictim || undefined)}
                disabled={reportLoading || !selectedReportVictim}
                className="arcade-btn-cyan flex-1 py-2.5 text-xs font-arcade uppercase flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
              >
                {reportLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                CONFIRM REPORT
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal 3: Imposter Kill Target Selection ─── */}
      {showKillModal && isImposter && (
        <div className="fixed inset-0 z-50 bg-corridor/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="arcade-card p-6 max-w-sm w-full space-y-4 border-glow-red shadow-2xl">
            <div className="flex items-center gap-2 text-neon-red">
              <Skull className="w-5 h-5" />
              <h3 className="text-lg font-display uppercase tracking-wider text-bone-cream">EXECUTE ELIMINATION</h3>
            </div>
            <p className="text-xs text-muted-steel font-tech">
              Select an active crewmate operative to eliminate. This action notifies Command and initiates the 30s body discovery window.
            </p>

            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {aliveVictimsForKill.map(p => (
                <button
                  key={p.id}
                  onClick={() => setSelectedKillVictim(p.id)}
                  className={`w-full p-2.5 rounded-xl border text-left text-xs font-tech font-semibold flex items-center justify-between transition-colors ${
                    selectedKillVictim === p.id
                      ? 'bg-neon-red/20 border-neon-red text-bone-cream'
                      : 'bg-corridor border-steel-border text-muted-steel hover:text-bone-cream'
                  }`}
                >
                  <span>{p.playerName}</span>
                  <span className="text-[10px] text-electric-cyan font-arcade font-bold">● ALIVE</span>
                </button>
              ))}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => { setShowKillModal(false); setSelectedKillVictim(''); }}
                className="arcade-btn-secondary flex-1 py-2.5 text-xs font-arcade uppercase cursor-pointer"
              >
                CANCEL
              </button>
              <button
                onClick={() => handleKill(selectedKillVictim)}
                disabled={!selectedKillVictim || killLoading}
                className="arcade-btn-primary flex-1 py-2.5 text-xs font-arcade uppercase flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
              >
                {killLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                CONFIRM KILL
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Phase Overlay 1: Body Report Window (Auto-Report Timer) ─── */}
      {phase === GAME_PHASE.BODY_REPORT && !isEliminated && (
        <div className="fixed inset-0 z-40 bg-corridor/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="arcade-card p-6 max-w-sm w-full text-center space-y-4 border-glow-red shadow-2xl">
            <Radio className="w-12 h-12 text-neon-red mx-auto animate-pulse drop-shadow-[0_0_15px_rgba(255,30,66,0.6)]" />
            <h2 className="text-2xl font-display uppercase tracking-wider text-bone-cream">
              BODY REPORT WINDOW — 00:{String(Math.max(0, phaseSecsLeft)).padStart(2, '0')}
            </h2>
            <p className="text-xs text-muted-steel font-tech leading-relaxed">
              An eliminated crewmate has been located in the facility. Report the body immediately to summon an emergency assembly, or the perimeter scanner will auto-trigger upon expiry.
            </p>
            <div className="text-5xl font-arcade font-black text-neon-red tabular-nums glow-text-red">
              00:{String(Math.max(0, phaseSecsLeft)).padStart(2, '0')}
            </div>
            <button
              onClick={() => handleReportBody()}
              disabled={reportLoading || state.isPaused}
              className="arcade-btn-primary w-full py-3.5 text-xs font-arcade uppercase flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
            >
              {reportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />}
              REPORT BODY NOW
            </button>
          </div>
        </div>
      )}

      {/* ─── Phase Overlay 2: Flashing "Go to Voting Room" (Move to Voting) ─── */}
      {phase === GAME_PHASE.MOVE_TO_VOTING && (
        <div className="fixed inset-0 z-40 bg-corridor/95 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="arcade-card p-6 max-w-sm w-full text-center space-y-4 border-2 border-neon-red shadow-[0_0_30px_rgba(255,30,66,0.35)] animate-pulse my-6">
            <Megaphone className="w-12 h-12 text-neon-red mx-auto animate-bounce drop-shadow-[0_0_15px_rgba(255,30,66,0.6)]" />
            <div>
              <h2 className="text-2xl sm:text-3xl font-display uppercase tracking-wider text-bone-cream">
                BODY REPORTED — REPORT TO VOTING ROOM
              </h2>
              <p className="text-xs text-neon-red font-arcade tracking-wider mt-1 uppercase">
                Move to the designated assembly zone before countdown expires.
              </p>
            </div>

            {/* Large 15s Countdown */}
            <div className="p-3 bg-corridor rounded-2xl border border-neon-red/40">
              <div className="text-[10px] uppercase font-arcade font-bold text-muted-steel tracking-widest mb-1">
                TRANSIT COUNTDOWN
              </div>
              <div className="text-5xl font-arcade font-black text-neon-red tabular-nums glow-text-red">
                {phaseSecsLeft}s
              </div>
            </div>

            {/* Player Info & Master Timer */}
            <div className="grid grid-cols-2 gap-2 text-left text-xs bg-corridor p-3 rounded-xl border border-steel-border">
              <div>
                <span className="text-[10px] text-muted-steel uppercase font-arcade block">YOUR STATUS</span>
                <span className="font-bold text-bone-cream font-tech">{state.myPlayer.playerName}</span>
                <span className={`text-[10px] ml-1.5 px-1.5 py-0.2 rounded font-arcade font-bold ${isEliminated ? 'text-neon-red bg-neon-red/10' : 'text-electric-cyan bg-electric-cyan/10'}`}>
                  {myStatus}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-muted-steel uppercase font-arcade block">ROUND 2 MASTER</span>
                <span className="font-arcade font-bold text-bone-cream">
                  {String(masterMins).padStart(2, '0')}:{String(masterSecs).padStart(2, '0')}
                </span>
              </div>
            </div>

            {/* Alive / Eliminated Lists */}
            <div className="text-left text-xs space-y-1.5 pt-1">
              <div className="text-[10px] uppercase font-arcade font-bold text-muted-steel tracking-wider">
                ROSTER STATUS ({alivePlayers.length} ALIVE, {allPlayersList.length - alivePlayers.length} ELIMINATED)
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                {allPlayersList.map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-1 px-2 rounded-lg bg-corridor border border-steel-border text-[11px] font-tech">
                    <span className={p.status === 'ALIVE' ? 'text-bone-cream' : 'line-through text-muted-steel'}>
                      {p.playerName} {p.isSelf ? '(you)' : ''}
                    </span>
                    <span className={p.status === 'ALIVE' ? 'text-electric-cyan font-arcade text-[10px]' : 'text-neon-red font-arcade text-[10px]'}>
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
        <div className="fixed inset-0 z-40 bg-corridor/95 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="arcade-card p-6 max-w-sm w-full text-center space-y-4 border-glow-cyan shadow-2xl my-6">
            <div className="w-12 h-12 rounded-xl bg-corridor border border-steel-border mx-auto flex items-center justify-center text-electric-cyan shadow-inner">
              <Vote className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl sm:text-3xl font-display uppercase tracking-wider text-bone-cream">
                BALLOT IN PROGRESS
              </h2>
              <div className={`text-4xl font-arcade font-black ${phaseSecsLeft <= 5 ? 'text-neon-red glow-text-red animate-pulse' : 'text-electric-cyan glow-text-cyan'} tabular-nums mt-1`}>
                {phaseSecsLeft}s
              </div>
            </div>

            {/* Master timer & your status */}
            <div className="grid grid-cols-2 gap-2 text-left text-xs bg-corridor p-2.5 rounded-xl border border-steel-border">
              <div>
                <span className="text-[10px] text-muted-steel uppercase font-arcade block">OPERATIVE</span>
                <span className="font-bold text-bone-cream text-xs font-tech">{state.myPlayer.playerName}</span>
                <span className={`text-[10px] ml-1 px-1.5 py-0.2 rounded font-arcade font-bold ${isEliminated ? 'text-neon-red bg-neon-red/10' : 'text-electric-cyan bg-electric-cyan/10'}`}>
                  {myStatus}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-muted-steel uppercase font-arcade block">MASTER CLOCK</span>
                <span className="font-arcade font-bold text-bone-cream text-xs">
                  {String(masterMins).padStart(2, '0')}:{String(masterSecs).padStart(2, '0')}
                </span>
              </div>
            </div>

            {/* Submitted Vote Counter */}
            <div className="text-xs text-electric-cyan font-arcade bg-corridor py-1.5 px-3 rounded-lg border border-steel-border uppercase tracking-wider">
              {voteCount ? `${voteCount.submitted} / ${voteCount.eligible} VOTES CAST` : 'SECRET BALLOT DISPATCH'}
            </div>

            {isEliminated ? (
              <div className="p-4 bg-corridor border border-steel-border rounded-xl text-xs text-muted-steel font-tech">
                Operative eliminated. Ballot transmission disabled.
              </div>
            ) : votedFor ? (
              <div className="p-4 bg-corridor border border-steel-border rounded-xl space-y-1.5">
                <CheckCircle className="w-6 h-6 text-electric-cyan mx-auto drop-shadow-[0_0_10px_rgba(0,229,255,0.6)]" />
                <p className="text-sm font-arcade uppercase font-bold text-bone-cream">BALLOT SUBMITTED</p>
                <p className="text-xs text-muted-steel font-tech">
                  Transmission encrypted. Awaiting remaining operative ballots or countdown expiration...
                </p>
              </div>
            ) : (
              <div className="space-y-3 text-left">
                <p className="text-xs text-muted-steel font-arcade uppercase tracking-wider">SELECT CANDIDATE TO EXPEL:</p>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {aliveTargetsForVoting.map((target) => {
                    const isSelected = selectedVoteTarget === target.id;
                    return (
                      <button
                        key={target.id}
                        type="button"
                        onClick={() => setSelectedVoteTarget(target.id)}
                        disabled={voteLoading || state.isPaused}
                        className={`w-full p-2.5 rounded-xl border text-xs font-tech font-semibold flex items-center justify-between transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-electric-cyan/20 border-electric-cyan text-bone-cream'
                            : 'bg-corridor hover:bg-elevated-panel border-steel-border text-muted-steel hover:text-bone-cream'
                        }`}
                      >
                        <span>{target.playerName}</span>
                        <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${isSelected ? 'border-electric-cyan bg-electric-cyan shadow-[0_0_8px_rgba(0,229,255,0.8)]' : 'border-steel-border'}`}>
                          {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-corridor" />}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => handleVote(selectedVoteTarget)}
                  disabled={!selectedVoteTarget || voteLoading || state.isPaused}
                  className="arcade-btn-primary w-full py-3.5 text-xs font-arcade uppercase flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
                >
                  {voteLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  CONFIRM BALLOT
                </button>
              </div>
            )}

            {/* Current Alive / Eliminated Lists */}
            <div className="text-left text-xs space-y-1 border-t border-steel-border/60 pt-2">
              <span className="text-[10px] text-muted-steel uppercase font-arcade font-bold tracking-wider">
                OPERATIVES ROSTER
              </span>
              <div className="space-y-0.5 max-h-24 overflow-y-auto pr-1">
                {allPlayersList.map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-[11px] py-0.5 font-tech">
                    <span className={p.status === 'ALIVE' ? 'text-bone-cream' : 'line-through text-muted-steel'}>
                      {p.playerName}
                    </span>
                    <span className={p.status === 'ALIVE' ? 'text-electric-cyan text-[10px] font-arcade' : 'text-neon-red text-[10px] font-arcade'}>
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
        <div className="fixed inset-0 z-50 bg-corridor/95 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="arcade-card p-6 max-w-sm w-full text-center space-y-4 border-steel-border shadow-2xl my-6">
            <h3 className="text-2xl font-display uppercase tracking-wider text-bone-cream">
              VOTING RESULTS
            </h3>

            {/* Clear Outcome Message */}
            <div className="p-3 rounded-xl bg-corridor border border-steel-border">
              {votingResult.eliminatedPlayer?.role === PLAYER_ROLE.IMPOSTER ? (
                <div className="text-electric-cyan font-display text-2xl uppercase tracking-wider glow-text-cyan">
                  CREWMATES WIN
                </div>
              ) : votingResult.gameComplete && votingResult.result?.includes('IMPOSTER') ? (
                <div className="text-neon-red font-display text-2xl uppercase tracking-wider glow-text-red">
                  IMPOSTER WINS
                </div>
              ) : (
                <div className="text-bone-cream font-arcade font-bold text-base uppercase tracking-wider">
                  MISSION CONTINUES
                </div>
              )}
            </div>

            {/* Vote Tally Breakdown */}
            <div className="p-3 bg-corridor rounded-xl border border-steel-border space-y-1.5 text-left max-h-36 overflow-y-auto">
              <div className="text-[10px] font-arcade font-bold uppercase tracking-wider text-muted-steel mb-1">
                FINAL TALLY:
              </div>
              {votingResult.tally.map((item) => (
                <div key={item.playerId} className="flex items-center justify-between text-xs py-1 border-b border-steel-border/40 last:border-0 font-tech">
                  <span className="text-bone-cream font-medium">{item.playerName}</span>
                  <span className="font-arcade text-electric-cyan font-bold">{item.voteCount} VOTES</span>
                </div>
              ))}
            </div>

            {/* Elimination Outcome */}
            {votingResult.eliminatedPlayer ? (
              <div className="p-3 bg-corridor border border-steel-border rounded-xl space-y-1 text-left text-xs font-tech">
                <div className="text-[10px] text-muted-steel uppercase font-arcade tracking-wider font-semibold">
                  OPERATIVE EXPELLED:
                </div>
                <div className="text-sm font-bold text-bone-cream flex items-center justify-between">
                  <span>{votingResult.eliminatedPlayer.playerName}</span>
                  <span className="text-[10px] uppercase font-arcade px-2 py-0.5 rounded bg-tactical-slate border border-steel-border text-neon-red">
                    Role: {votingResult.eliminatedPlayer.role || 'REVEALED'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-corridor border border-steel-border rounded-xl text-xs text-left font-tech">
                <div className="text-sm font-bold text-bone-cream font-arcade uppercase">TIE VOTE — NO EXPULSION</div>
                <p className="text-[11px] text-muted-steel mt-0.5">
                  No operative received a decisive majority. Round 2 operations resume immediately.
                </p>
              </div>
            )}

            {/* Updated Alive / Eliminated Lists */}
            <div className="text-left text-xs space-y-1 border-t border-steel-border/60 pt-2">
              <span className="text-[10px] text-muted-steel uppercase font-arcade font-bold tracking-wider">
                UPDATED ROSTER
              </span>
              <div className="space-y-0.5 max-h-24 overflow-y-auto pr-1">
                {allPlayersList.map((p) => {
                  const isNowEliminated = p.status !== 'ALIVE' || p.id === votingResult.eliminatedPlayer?.id;
                  return (
                    <div key={p.id} className="flex items-center justify-between text-[11px] py-0.5 font-tech">
                      <span className={!isNowEliminated ? 'text-bone-cream' : 'line-through text-muted-steel'}>
                        {p.playerName}
                      </span>
                      <span className={!isNowEliminated ? 'text-electric-cyan text-[10px] font-arcade' : 'text-neon-red text-[10px] font-arcade'}>
                        {!isNowEliminated ? 'ALIVE' : 'ELIMINATED'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <button
              onClick={() => setVotingResult(null)}
              className="arcade-btn-secondary w-full py-3 text-xs font-arcade uppercase cursor-pointer"
            >
              CONTINUE
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
