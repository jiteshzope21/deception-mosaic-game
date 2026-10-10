/**
 * MOSAIC — Game Service (Frontend)
 *
 * Communicates with backend for Lobby, Round 1 (Puzzle Solving),
 * QR Scanning, Answer Submissions, GM Question Management, and
 * Phase 3 (Transition, Round 2, Kill, Body Report, Vote, History).
 */

import { apiClient } from '@/lib/api/apiClient';
import type { ApiResult } from '@/types/app';
import type { AnswerOption, GamePhase } from '@/types/enums';

export interface LobbyPlayerData {
  id: string;
  playerName: string;
  status: string;
  isClaimed: boolean;
}

export interface PublicLobbyData {
  gameId: string;
  gameCode: string;
  teamName: string;
  teamSize: 5 | 6;
  phase: GamePhase;
  players: LobbyPlayerData[];
}

export interface PuzzlePieceState {
  pieceIndex: number;
  isUnlocked: boolean;
}

export interface GmQrMappingState {
  qrCodeId: string;
  qrType: 'PUZZLE' | 'DECOY';
  isCompleted: boolean;
  puzzlePieceIndex: number | null;
  questionsCount: number;
  completedAt: string | null;
}

export interface GmPlayerState {
  id: string;
  playerName: string;
  status: string;
  lives: number;
  role?: string | null;
  assignedTaskZone?: number | null;
  assignedTaskZoneName?: string | null;
  assignedTaskName?: string | null;
  assignedTaskDescription?: string | null;
  joinedAt: string | null;
}

export interface GmGameStateData {
  id: string;
  gameCode: string;
  teamName: string;
  teamSize: 5 | 6;
  phase: GamePhase;
  result: string | null;
  phaseStartedAt: string | null;
  phaseEndsAt: string | null;
  round2EndsAt?: string | null;
  isPaused?: boolean;
  pausedAt?: string | null;
  pausedRemainingMs?: number | null;
  pausedRound2RemainingMs?: number | null;
  roundRevision?: number;
  puzzleCompleted: boolean;
  puzzlePieces: PuzzlePieceState[];
  players: GmPlayerState[];
  qrMappings: GmQrMappingState[];
  killCount?: number;
  votingCycle?: number;
  recentEvents: Array<{
    _id: string;
    eventType: string;
    playerId: string | null;
    eventData: Record<string, unknown>;
    occurredAt: string;
  }>;
}

export interface PlayerGameStateData {
  id: string;
  gameCode: string;
  teamName: string;
  teamSize: 5 | 6;
  phase: GamePhase;
  result: string | null;
  phaseStartedAt: string | null;
  phaseEndsAt: string | null;
  round2EndsAt?: string | null;
  isPaused?: boolean;
  pausedAt?: string | null;
  pausedRemainingMs?: number | null;
  pausedRound2RemainingMs?: number | null;
  roundRevision?: number;
  puzzleCompleted: boolean;
  puzzlePieces: PuzzlePieceState[];
  // Phase 3 fields
  myRole?: string | null;
  myTaskZone?: number | null;
  myTaskZoneName?: string | null;
  myTaskName?: string | null;
  myTaskDescription?: string | null;
  killCount?: number;
  votingCycle?: number;
  myVotedFor?: string | null;
  hasReportedBody?: boolean;
  myPlayer: {
    id: string;
    playerName: string;
    lives: number;
    status: string;
    role?: string | null;
    assignedTaskZone?: number | null;
    assignedTaskZoneName?: string | null;
    assignedTaskName?: string | null;
    assignedTaskDescription?: string | null;
  };
  teammates: Array<{
    id: string;
    playerName: string;
    status: string;
    lives: number;
  }>;
  alivePlayers?: Array<{
    id: string;
    playerName: string;
  }>;
}

export interface QuestionDetails {
  questionId: string;
  category: string;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  questionOrder: number;
  totalQuestionsOnQr: number;
}

export interface ScanQrResult {
  status: 'QUESTION' | 'ALREADY_COMPLETED' | 'ROUND_ENDED';
  qrCodeId?: string;
  question?: QuestionDetails;
  message?: string;
}

export interface SubmitAnswerResult {
  isCorrect: boolean;
  livesRemaining?: number;
  roundEnded?: boolean;
  qrCompleted?: boolean;
  isPuzzle?: boolean;
  pieceIndex?: number;
  puzzleCompleted?: boolean;
  decoyMessage?: string;
  nextQuestion?: QuestionDetails;
  explanation?: string;
  message?: string;
}

export interface QuestionBankItem {
  _id: string;
  questionId: string;
  category: string;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: AnswerOption;
  technicalExplanation: string;
  isActive: boolean;
}

export interface GameConfigData {
  round1DurationSeconds: number;
  transitionDurationSeconds: number;
  round2DurationSeconds: number;
  bodyReportDurationSeconds: number;
  moveToVotingDurationSeconds: number;
  votingDurationSeconds: number;
  startingLives: number;
  minQuestionsPerQr: number;
  maxQuestionsPerQr: number;
  allowSelfVote: boolean;
  tieRule: string;
  puzzleImagePath: string | null;
}

// Phase 3 response types

export interface KillResult {
  success: boolean;
  killNumber?: number;
  victimPlayerId?: string;
  cached?: boolean;
}

export interface BodyReportResult {
  success: boolean;
  phase?: string;
  phaseEndsAt?: string;
  message?: string;
}

export interface VoteResult {
  success: boolean;
  submittedVotesCount: number;
  eligibleVotersCount: number;
  cached?: boolean;
}

export interface GameHistoryEntry {
  gameId: string;
  gameCode: string;
  teamName: string;
  teamSize: number;
  result: string | null;
  startedAt: string | null;
  completedAt: string | null;
  killCount: number;
  imposterName: string | null;
  playersCount: number;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getPublicLobby(gameCode: string): Promise<ApiResult<PublicLobbyData>> {
  return apiClient.get<PublicLobbyData>(`/games/by-code/${gameCode}`);
}

// ─── Player API ───────────────────────────────────────────────────────────────

export async function getPlayerGameState(gameId: string): Promise<ApiResult<PlayerGameStateData>> {
  return apiClient.get<PlayerGameStateData>(`/games/${gameId}/player-state`);
}

export async function scanQr(gameId: string, qrCodeId: string): Promise<ApiResult<ScanQrResult>> {
  return apiClient.post<ScanQrResult>(`/games/${gameId}/qr-scan`, { qrCodeId });
}

export async function submitAnswer(
  gameId: string,
  qrCodeId: string,
  questionId: string,
  answer: AnswerOption,
  clientActionId?: string
): Promise<ApiResult<SubmitAnswerResult>> {
  return apiClient.post<SubmitAnswerResult>(`/games/${gameId}/answer`, {
    qrCodeId,
    questionId,
    answer,
    clientActionId,
  });
}

// Phase 3: Player actions

export async function recordKill(
  gameId: string,
  victimPlayerId: string,
  clientActionId?: string
): Promise<ApiResult<KillResult>> {
  return apiClient.post<KillResult>(`/games/${gameId}/kill`, { victimPlayerId, clientActionId });
}

export async function reportBody(
  gameId: string,
  clientActionId?: string,
  victimPlayerId?: string
): Promise<ApiResult<BodyReportResult>> {
  return apiClient.post<BodyReportResult>(`/games/${gameId}/body-report`, { clientActionId, victimPlayerId });
}

export async function submitVote(
  gameId: string,
  targetPlayerId: string,
  clientActionId?: string
): Promise<ApiResult<VoteResult>> {
  return apiClient.post<VoteResult>(`/games/${gameId}/vote`, { targetPlayerId, clientActionId });
}

// ─── GM API ───────────────────────────────────────────────────────────────────

export async function createLobby(
  teamName: string,
  teamSize: 5 | 6,
  playerNames: string[]
): Promise<ApiResult<{ gameId: string; gameCode: string; teamName: string; teamSize: number; phase: string }>> {
  return apiClient.post('/games', { teamName, teamSize, playerNames });
}

export async function getActiveGame(): Promise<ApiResult<{ game: GmGameStateData | null }>> {
  return apiClient.get<{ game: GmGameStateData | null }>('/games/active');
}

export async function getGmGameState(gameId: string): Promise<ApiResult<GmGameStateData>> {
  return apiClient.get<GmGameStateData>(`/games/${gameId}/gm-state`);
}

export async function startGame(gameId: string): Promise<ApiResult<{ gameId: string; gameCode: string; phase: string }>> {
  return apiClient.post(`/games/${gameId}/start`);
}

export async function emergencyEndRound(gameId: string): Promise<ApiResult<{ gameId: string; phase: string; message: string }>> {
  return apiClient.post(`/games/${gameId}/end-round`);
}

export async function restartGame(gameId: string): Promise<ApiResult<{ gameId: string; phase: string; message: string }>> {
  return apiClient.post(`/games/${gameId}/restart`);
}

// Phase 3: GM controls

export async function gmStartTransition(gameId: string): Promise<ApiResult<{ gameId: string; phase: string }>> {
  return apiClient.post(`/games/${gameId}/transition`);
}

export async function gmStartRound2(gameId: string): Promise<ApiResult<{ gameId: string; phase: string; round2EndsAt: string }>> {
  return apiClient.post(`/games/${gameId}/start-round2`);
}

export async function listGameHistory(): Promise<ApiResult<{ games: GameHistoryEntry[] }>> {
  return apiClient.get<{ games: GameHistoryEntry[] }>('/games/history');
}

export async function getGameHistory(gameId: string): Promise<ApiResult<unknown>> {
  return apiClient.get(`/games/${gameId}/history`);
}

// ─── GM Question Bank CRUD ────────────────────────────────────────────────────

export async function listQuestions(
  search?: string,
  category?: string
): Promise<ApiResult<{ questions: QuestionBankItem[]; total: number }>> {
  return apiClient.get('/gm/questions', { params: { search, category } });
}

export async function createQuestion(data: Omit<QuestionBankItem, '_id'>): Promise<ApiResult<QuestionBankItem>> {
  return apiClient.post('/gm/questions', data);
}

export async function updateQuestion(
  questionId: string,
  data: Partial<QuestionBankItem>
): Promise<ApiResult<QuestionBankItem>> {
  return apiClient.put(`/gm/questions/${questionId}`, data);
}

export async function deleteQuestion(questionId: string): Promise<ApiResult<{ message: string }>> {
  return apiClient.delete(`/gm/questions/${questionId}`);
}

// ─── GM Config ────────────────────────────────────────────────────────────────

export async function getGameConfig(): Promise<ApiResult<GameConfigData>> {
  return apiClient.get('/gm/config');
}

export async function updateGameConfig(data: Partial<GameConfigData>): Promise<ApiResult<GameConfigData>> {
  return apiClient.put('/gm/config', data);
}

// ─── GM Round Controls ────────────────────────────────────────────────────────

export async function pauseGame(gameId: string): Promise<ApiResult<{ gameId: string; phase: string; isPaused: boolean }>> {
  return apiClient.post(`/games/${gameId}/pause`);
}

export async function resumeGame(gameId: string): Promise<ApiResult<{ gameId: string; phase: string; isPaused: boolean }>> {
  return apiClient.post(`/games/${gameId}/resume`);
}

export async function resetRound1(gameId: string): Promise<ApiResult<{ gameId: string; phase: string; roundRevision: number }>> {
  return apiClient.post(`/games/${gameId}/reset-round1`);
}

export async function resetRound2(gameId: string): Promise<ApiResult<{ gameId: string; phase: string; roundRevision: number }>> {
  return apiClient.post(`/games/${gameId}/reset-round2`);
}

export async function terminateRound1(gameId: string): Promise<ApiResult<{ gameId: string; phase: string }>> {
  return apiClient.post(`/games/${gameId}/terminate-round1`);
}

export async function terminateRound2(gameId: string): Promise<ApiResult<{ gameId: string; phase: string; result: string }>> {
  return apiClient.post(`/games/${gameId}/terminate-round2`);
}

// ─── Fixed Master QR Codes ───────────────────────────────────────────────────

export interface FixedQrCodeItem {
  _id: string;
  qrId: string;
  displayLabel: string;
  createdAt: string;
}

export async function listFixedQrs(): Promise<ApiResult<{ qrCodes: FixedQrCodeItem[]; total: number }>> {
  return apiClient.get('/gm/fixed-qrs');
}

// ─── Decoy Messages CRUD ──────────────────────────────────────────────────────

export interface DecoyMessageItem {
  _id: string;
  message: string;
  imagePath?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function listDecoys(): Promise<ApiResult<{ decoys: DecoyMessageItem[]; total: number }>> {
  return apiClient.get('/gm/decoys');
}

export async function createDecoy(data: {
  message: string;
  imagePath?: string | null;
  isActive?: boolean;
}): Promise<ApiResult<DecoyMessageItem>> {
  return apiClient.post('/gm/decoys', data);
}

export async function updateDecoy(
  id: string,
  data: Partial<{ message: string; imagePath?: string | null; isActive?: boolean }>
): Promise<ApiResult<DecoyMessageItem>> {
  return apiClient.put(`/gm/decoys/${id}`, data);
}

export async function deleteDecoy(id: string): Promise<ApiResult<{ message: string }>> {
  return apiClient.delete(`/gm/decoys/${id}`);
}

// ─── Physical Tasks CRUD ──────────────────────────────────────────────────────

export interface PhysicalTaskItem {
  _id: string;
  zoneNumber: number;
  taskName: string;
  description: string | null;
  instructions: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function listTasks(): Promise<ApiResult<{ tasks: PhysicalTaskItem[]; total: number }>> {
  return apiClient.get('/gm/tasks');
}

export async function createTask(data: {
  zoneNumber: number;
  taskName: string;
  description?: string | null;
  instructions?: string | null;
  isActive?: boolean;
}): Promise<ApiResult<PhysicalTaskItem>> {
  return apiClient.post('/gm/tasks', data);
}

export async function updateTask(
  id: string,
  data: Partial<{
    zoneNumber: number;
    taskName: string;
    description?: string | null;
    instructions?: string | null;
    isActive?: boolean;
  }>
): Promise<ApiResult<PhysicalTaskItem>> {
  return apiClient.put(`/gm/tasks/${id}`, data);
}

export async function deleteTask(id: string): Promise<ApiResult<{ message: string }>> {
  return apiClient.delete(`/gm/tasks/${id}`);
}

// ─── Puzzle Image ─────────────────────────────────────────────────────────────

export async function updatePuzzleImage(puzzleImagePath: string | null): Promise<ApiResult<{ puzzleImagePath: string | null }>> {
  return apiClient.post('/gm/puzzle-image', { puzzleImagePath });
}
