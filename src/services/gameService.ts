/**
 * MOSAIC — Game Service (Frontend)
 *
 * Communicates with backend for Lobby, Round 1 (Puzzle Solving),
 * QR Scanning, Answer Submissions, and GM Question Management.
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
  puzzleCompleted: boolean;
  puzzlePieces: PuzzlePieceState[];
  players: GmPlayerState[];
  qrMappings: GmQrMappingState[];
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
  puzzleCompleted: boolean;
  puzzlePieces: PuzzlePieceState[];
  myPlayer: {
    id: string;
    playerName: string;
    lives: number;
    status: string;
  };
  teammates: Array<{
    id: string;
    playerName: string;
    status: string;
    lives: number;
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
  startingLives: number;
  minQuestionsPerQr: number;
  maxQuestionsPerQr: number;
  puzzleImagePath: string | null;
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
