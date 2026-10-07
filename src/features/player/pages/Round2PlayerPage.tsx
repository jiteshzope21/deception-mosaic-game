/**
 * MOSAIC — Round 2 Player Page
 *
 * The main deception gameplay screen. Shows:
 * - Master countdown timer (continuous, always counting down)
 * - Player's role, task, and kill button (Imposter only)
 * - Body Report button (when a body exists)
 * - Phase overlays: BODY_REPORT, MOVE_TO_VOTING, VOTING, GAME_COMPLETE
 * - Real-time socket-driven state updates
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Shield, AlertTriangle, Clock, Skull, Users,
  Radio, CheckCircle, XCircle, Loader2
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

// ─── Countdown hook ───────────────────────────────────────────────────────────

function useCountdown(endsAt: string | null | undefined) {
  const [secsLeft, setSecsLeft] = useState<number>(0);
  useEffect(() => {
    if (!endsAt) return;
    const update = () => {
      const diff = Math.max(0, Math.round((new Date(endsAt).getTime() - Date.now()) / 1000));
      setSecsLeft(diff);
    };
    update();
    const id = setInterval(update, 500);
    return () => clearInterval(id);
  }, [endsAt]);
  return secsLeft;
}



// ─── Phase overlays ───────────────────────────────────────────────────────────

interface OverlayProps {
  state: PlayerGameStateData;
  onReportBody: () => void;
  onVote: (targetId: string) => void;
  reportLoading: boolean;
  voteLoading: boolean;
  votedFor: string | null;
  voteCount: { submitted: number; eligible: number } | null;
}

function BodyReportOverlay({ state, onReportBody, reportLoading }: Pick<OverlayProps, 'state' | 'onReportBody' | 'reportLoading'>) {
  const secsLeft = useCountdown(state.phaseEndsAt);
  const hasReported = state.hasReportedBody || state.myPlayer.status === 'ELIMINATED';
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-mosaic-surface border border-red-500/60 rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl shadow-red-900/30">
        <Skull className="w-16 h-16 text-red-400 mx-auto mb-4 animate-pulse" />
        <h2 className="text-2xl font-black text-red-300 mb-2">Body Found!</h2>
        <p className="text-mosaic-muted text-sm mb-4">
          A player has been eliminated. Report the body to trigger an emergency vote!
        </p>
        <div className="text-3xl font-mono font-black text-red-400 mb-5">{secsLeft}s</div>
        {!hasReported && (
          <button
            onClick={onReportBody}
            disabled={reportLoading}
            className="w-full py-3 bg-red-500 hover:bg-red-400 text-white font-bold rounded-xl transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {reportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />}
            Report Body
          </button>
        )}
        {hasReported && (
          <div className="text-emerald-400 font-semibold">✓ Body reported — waiting for vote</div>
        )}
      </div>
    </div>
  );
}

function MovingOverlay({ state }: { state: PlayerGameStateData }) {
  const secsLeft = useCountdown(state.phaseEndsAt);
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-mosaic-surface border border-yellow-500/60 rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl shadow-yellow-900/20">
        <Users className="w-16 h-16 text-yellow-400 mx-auto mb-4" />
        <h2 className="text-2xl font-black text-yellow-300 mb-2">Move to Voting!</h2>
        <p className="text-mosaic-muted text-sm mb-4">
          Everyone must move to the designated voting area now.
        </p>
        <div className={`text-5xl font-mono font-black mb-2 ${secsLeft <= 5 ? 'text-red-400 animate-pulse' : 'text-yellow-400'}`}>
          {secsLeft}s
        </div>
      </div>
    </div>
  );
}

function VotingOverlay({ state, onVote, voteLoading, votedFor, voteCount }: Pick<OverlayProps, 'state' | 'onVote' | 'voteLoading' | 'votedFor' | 'voteCount'>) {
  const secsLeft = useCountdown(state.phaseEndsAt);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const alivePlayers = (state.alivePlayers ?? state.teammates.filter(t => t.status === 'ALIVE')).filter(
    p => p.id !== state.myPlayer.id
  );

  const hasVoted = votedFor !== null || !!(state.myPlayer as any).hasVoted;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-mosaic-surface border border-purple-500/60 rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl shadow-purple-900/30 my-4">
        <CheckCircle className="w-12 h-12 text-purple-400 mx-auto mb-3" />
        <h2 className="text-2xl font-black text-purple-300 mb-1">Emergency Vote</h2>
        <div className={`text-2xl font-mono font-black mb-3 ${secsLeft <= 10 ? 'text-red-400 animate-pulse' : 'text-purple-300'}`}>
          {secsLeft}s
        </div>

        {voteCount && (
          <div className="text-xs text-mosaic-muted mb-4">
            {voteCount.submitted}/{voteCount.eligible} votes submitted
          </div>
        )}

        {hasVoted ? (
          <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-xl">
            <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
            <p className="text-emerald-400 font-semibold">Vote submitted!</p>
            <p className="text-mosaic-muted text-xs mt-1">Waiting for others...</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-mosaic-muted text-sm mb-3">Vote to eliminate the Imposter:</p>
            {alivePlayers.map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className={`w-full py-3 px-4 rounded-xl border text-left font-medium transition-all duration-150 ${
                  selectedId === p.id
                    ? 'bg-purple-500/20 border-purple-400 text-purple-200'
                    : 'bg-mosaic-dark/60 border-mosaic-border text-white hover:border-purple-500/50'
                }`}
              >
                {p.playerName}
              </button>
            ))}
            {selectedId && (
              <button
                onClick={() => onVote(selectedId)}
                disabled={voteLoading}
                className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl mt-3 transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {voteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Confirm Vote
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Kill Selector (Imposter only) ────────────────────────────────────────────

function KillPanel({ state, onKill, killLoading }: {
  state: PlayerGameStateData;
  onKill: (victimId: string) => void;
  killLoading: boolean;
}) {
  const [showKillList, setShowKillList] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);

  const killsUsed = state.killCount ?? 0;
  const canKill = killsUsed < 2 && state.myPlayer.status === 'ALIVE';

  const victims = state.teammates.filter(
    t => t.id !== state.myPlayer.id && t.status === 'ALIVE'
  );

  if (!canKill) {
    return (
      <div className="bg-red-950/30 border border-red-800/40 rounded-xl p-4 text-center">
        <Skull className="w-6 h-6 text-red-700 mx-auto mb-1" />
        <p className="text-red-700 text-xs font-semibold">
          {killsUsed >= 2 ? 'Kill limit reached (2/2)' : 'You are eliminated'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {!showKillList ? (
        <button
          onClick={() => setShowKillList(true)}
          className="w-full py-3 bg-red-600/80 hover:bg-red-500 text-white font-bold rounded-xl border border-red-500/50 transition-all duration-200 flex items-center justify-center gap-2"
        >
          <Skull className="w-4 h-4" />
          Execute Kill ({killsUsed}/2 used)
        </button>
      ) : confirming ? (
        <div className="bg-red-950/60 border border-red-500/60 rounded-xl p-4 text-center">
          <p className="text-red-200 font-semibold mb-3">
            Eliminate {victims.find(v => v.id === confirming)?.playerName}?
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => { onKill(confirming); setConfirming(null); setShowKillList(false); }}
              disabled={killLoading}
              className="flex-1 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg transition-all duration-200 disabled:opacity-50"
            >
              {killLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Confirm'}
            </button>
            <button
              onClick={() => setConfirming(null)}
              className="flex-1 py-2 bg-mosaic-dark text-mosaic-muted hover:text-white border border-mosaic-border rounded-lg transition-all duration-200"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-red-950/40 border border-red-700/40 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-red-400">Select Victim</span>
            <button onClick={() => setShowKillList(false)} className="text-mosaic-muted hover:text-white text-xs">Cancel</button>
          </div>
          {victims.map(v => (
            <button
              key={v.id}
              onClick={() => setConfirming(v.id)}
              className="w-full py-2 px-3 bg-red-900/40 hover:bg-red-800/60 text-red-200 font-medium rounded-lg text-left transition-all duration-150 border border-red-700/30"
            >
              {v.playerName}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Round2PlayerPage() {
  const { playerContext } = useAuth();
  const navigate = useNavigate();
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

  const masterSecsLeft = useCountdown(state?.round2EndsAt);

  const loadState = useCallback(async () => {
    if (!gameId) return;
    const res = await getPlayerGameState(gameId);
    if (res.success) {
      setState(res.data);
      // Redirect if needed
      if (res.data.phase === GAME_PHASE.TRANSITION) {
        navigate('/player/transition', { replace: true });
      } else if (res.data.phase === GAME_PHASE.GAME_COMPLETE) {
        navigate('/player/complete', { replace: true });
      }
    }
  }, [gameId, navigate]);

  useEffect(() => {
    void loadState().then(() => setLoading(false));
  }, [loadState]);

  // Phase change socket listener
  useEffect(() => {
    const unsub = subscribeToEvent<{ to: string; phaseEndsAt?: string; round2EndsAt?: string }>(
      SOCKET_EVENT.PHASE_CHANGED,
      (data) => {
        if (data.to === GAME_PHASE.GAME_COMPLETE) {
          navigate('/player/complete', { replace: true });
        } else {
          void loadState();
        }
      }
    );
    return unsub;
  }, [loadState, navigate]);

  useEffect(() => {
    const unsub = subscribeToEvent<any>(
      SOCKET_EVENT.VOTE_CAST,
      (data) => {
        setVoteCount({
          submitted: data?.submitted ?? data?.submittedVotesCount ?? 0,
          eligible: data?.eligible ?? data?.eligibleVotersCount ?? 0,
        });
      }
    );
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = subscribeToEvent(SOCKET_EVENT.GAME_COMPLETE, () => {
      navigate('/player/complete', { replace: true });
    });
    return unsub;
  }, [navigate]);

  // Refresh on kill/status change
  useEffect(() => {
    const unsub = subscribeToEvent(SOCKET_EVENT.PLAYER_STATUS_CHANGED, () => void loadState());
    return unsub;
  }, [loadState]);

  const handleKill = useCallback(async (victimId: string) => {
    if (!gameId) return;
    setKillLoading(true);
    setError(null);
    const cid = `kill-${++clientActionIdRef.current}-${Date.now()}`;
    const res = await recordKill(gameId, victimId, cid);
    if (!res.success) {
      setError(res.error?.message ?? 'Failed to record kill');
    } else {
      void loadState();
    }
    setKillLoading(false);
  }, [gameId, loadState]);

  const handleReportBody = useCallback(async () => {
    if (!gameId) return;
    setReportLoading(true);
    setError(null);
    const cid = `report-${++clientActionIdRef.current}-${Date.now()}`;
    const res = await reportBody(gameId, cid);
    if (!res.success) {
      setError(res.error?.message ?? 'Failed to report body');
    } else {
      void loadState();
    }
    setReportLoading(false);
  }, [gameId, loadState]);

  const handleVote = useCallback(async (targetId: string) => {
    if (!gameId) return;
    setVoteLoading(true);
    setError(null);
    const cid = `vote-${++clientActionIdRef.current}-${Date.now()}`;
    const res = await submitVote(gameId, targetId, cid);
    if (!res.success) {
      setError(res.error?.message ?? 'Failed to submit vote');
    } else {
      setVotedFor(targetId);
      if (res.data) {
        setVoteCount({ submitted: res.data.submittedVotesCount, eligible: res.data.eligibleVotersCount });
      }
    }
    setVoteLoading(false);
  }, [gameId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-mosaic-dark flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-mosaic-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!state) {
    return (
      <div className="min-h-screen bg-mosaic-dark flex items-center justify-center text-mosaic-muted">
        Unable to load game state.
      </div>
    );
  }

  const role = state.myPlayer?.role ?? state.myRole;
  const isImposter = role === PLAYER_ROLE.IMPOSTER;
  const taskZone = state.myPlayer?.assignedTaskZone ?? state.myTaskZone;
  const taskName = state.myPlayer?.assignedTaskName ?? state.myTaskName;
  const myStatus = state.myPlayer.status;
  const isEliminated = myStatus === 'ELIMINATED';
  const phase = state.phase;

  const masterMins = Math.floor(masterSecsLeft / 60);
  const masterSecs = masterSecsLeft % 60;

  return (
    <div className="min-h-screen bg-mosaic-dark flex flex-col">
      {/* Phase Overlays */}
      {phase === GAME_PHASE.BODY_REPORT && !isEliminated && (
        <BodyReportOverlay
          state={state}
          onReportBody={handleReportBody}
          reportLoading={reportLoading}
        />
      )}
      {phase === GAME_PHASE.MOVE_TO_VOTING && (
        <MovingOverlay state={state} />
      )}
      {phase === GAME_PHASE.VOTING && (
        <VotingOverlay
          state={state}
          onVote={handleVote}
          voteLoading={voteLoading}
          votedFor={votedFor}
          voteCount={voteCount}
        />
      )}

      {/* Header */}
      <div className="bg-mosaic-surface/80 backdrop-blur-sm border-b border-mosaic-border p-4">
        <div className="max-w-sm mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isImposter ? (
              <AlertTriangle className="w-5 h-5 text-red-400" />
            ) : (
              <Shield className="w-5 h-5 text-emerald-400" />
            )}
            <span className={`text-sm font-bold uppercase tracking-wider ${isImposter ? 'text-red-300' : 'text-emerald-300'}`}>
              {isImposter ? 'Imposter' : 'Crewmate'}
            </span>
          </div>
          {isEliminated && (
            <span className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-1 rounded-full font-semibold">
              ELIMINATED
            </span>
          )}
        </div>
      </div>

      {/* Master Timer */}
      <div className={`p-5 text-center ${masterSecsLeft <= 60 ? 'bg-red-950/20' : 'bg-mosaic-surface/30'}`}>
        <div className="flex items-center justify-center gap-2 mb-1">
          <Clock className={`w-4 h-4 ${masterSecsLeft <= 60 ? 'text-red-400 animate-pulse' : 'text-mosaic-muted'}`} />
          <span className="text-xs font-semibold uppercase tracking-widest text-mosaic-muted">
            Round 2 Time Remaining
          </span>
        </div>
        <div className={`text-4xl font-mono font-black ${masterSecsLeft <= 60 ? 'text-red-400 animate-pulse' : masterSecsLeft <= 120 ? 'text-yellow-400' : 'text-white'}`}>
          {String(masterMins).padStart(2, '0')}:{String(masterSecs).padStart(2, '0')}
        </div>
        {masterSecsLeft <= 60 && (
          <p className="text-red-400 text-xs mt-1 font-semibold animate-pulse">⚠️ Time running out!</p>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 p-4 max-w-sm mx-auto w-full space-y-4">
        {/* Task Card */}
        {taskZone && taskName && (
          <div className={`bg-mosaic-surface border rounded-xl p-4 ${isImposter ? 'border-red-700/40' : 'border-mosaic-border'}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold uppercase tracking-widest text-mosaic-muted">Your Task</span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className={`font-bold text-lg ${isImposter ? 'text-red-300' : 'text-white'}`}>Zone {taskZone}</div>
                <div className="text-mosaic-muted text-sm">{taskName}</div>
              </div>
              {isImposter && (
                <span className="text-xs bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-1 rounded-full">
                  Fake It
                </span>
              )}
            </div>
          </div>
        )}

        {/* Players Status */}
        <div className="bg-mosaic-surface border border-mosaic-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-mosaic-muted" />
            <span className="text-xs font-semibold uppercase tracking-widest text-mosaic-muted">Players</span>
          </div>
          <div className="space-y-2">
            {/* Self */}
            <div className="flex items-center justify-between py-1">
              <span className="text-white font-medium text-sm">
                {state.myPlayer.playerName} <span className="text-mosaic-muted text-xs">(you)</span>
              </span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                isEliminated
                  ? 'bg-red-500/10 text-red-400 border-red-500/30'
                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
              }`}>
                {isEliminated ? 'Eliminated' : 'Alive'}
              </span>
            </div>
            {/* Teammates */}
            {state.teammates.filter(t => t.id !== state.myPlayer.id).map(t => (
              <div key={t.id} className="flex items-center justify-between py-1 border-t border-mosaic-border/50">
                <span className={`text-sm font-medium ${t.status === 'ELIMINATED' ? 'line-through text-mosaic-muted' : 'text-white'}`}>
                  {t.playerName}
                </span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                  t.status === 'ELIMINATED'
                    ? 'bg-red-500/10 text-red-400 border-red-500/30'
                    : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                }`}>
                  {t.status === 'ELIMINATED' ? 'Eliminated' : 'Alive'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Imposter Kill Panel */}
        {isImposter && !isEliminated && phase === GAME_PHASE.ROUND_2_ACTIVE && (
          <KillPanel
            state={state}
            onKill={handleKill}
            killLoading={killLoading}
          />
        )}

        {/* Error message */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-300">
            <XCircle className="w-4 h-4 flex-shrink-0" />
            {error}
            <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-200">×</button>
          </div>
        )}

        {/* Eliminated message */}
        {isEliminated && (
          <div className="bg-mosaic-surface border border-red-700/40 rounded-xl p-4 text-center">
            <Skull className="w-8 h-8 text-red-500 mx-auto mb-2" />
            <p className="text-red-300 font-semibold">You have been eliminated</p>
            <p className="text-mosaic-muted text-xs mt-1">Watch the round play out...</p>
          </div>
        )}
      </div>
    </div>
  );
}
