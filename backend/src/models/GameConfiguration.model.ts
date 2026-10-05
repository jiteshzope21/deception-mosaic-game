/**
 * MOSAIC — Game Configuration Model
 *
 * GM-editable configuration. Changes here do NOT affect running games.
 * When a game starts, an immutable snapshot is embedded in the Game document.
 * There is always exactly one active config document (singleton pattern).
 */

import { Schema, model, Document } from 'mongoose';
import { TieRule } from '../types/game.types';
import { GAME_CONSTANTS } from '../config/constants';

export interface IGameConfiguration extends Document {
  // Singleton marker
  _singleton: true;

  // Timer durations (seconds)
  round1DurationSeconds: number;
  transitionDurationSeconds: number;
  round2DurationSeconds: number;
  bodyReportDurationSeconds: number;
  moveToVotingDurationSeconds: number;
  votingDurationSeconds: number;

  // Lives
  startingLives: number;

  // Round 2 rules
  maxKills: 2; // Always 2 — cannot be changed
  imposterCount: 1; // Always 1 — cannot be changed
  allowSelfVote: boolean;
  tieRule: TieRule;

  // Questions
  minQuestionsPerQr: number;
  maxQuestionsPerQr: number;

  // Puzzle
  puzzleImagePath: string | null;

  createdAt: Date;
  updatedAt: Date;
}

const gameConfigurationSchema = new Schema<IGameConfiguration>(
  {
    _singleton: {
      type: Boolean,
      default: true,
      unique: true, // Enforces single document at DB level
    },
    round1DurationSeconds: {
      type: Number,
      default: GAME_CONSTANTS.ROUND_1_DURATION,
      min: 60,
      max: 600,
    },
    transitionDurationSeconds: {
      type: Number,
      default: GAME_CONSTANTS.TRANSITION_DURATION,
      min: 10,
      max: 300,
    },
    round2DurationSeconds: {
      type: Number,
      default: GAME_CONSTANTS.ROUND_2_DURATION,
      min: 120,
      max: 1200,
    },
    bodyReportDurationSeconds: {
      type: Number,
      default: GAME_CONSTANTS.BODY_REPORT_DURATION,
      min: 10,
      max: 60,
    },
    moveToVotingDurationSeconds: {
      type: Number,
      default: GAME_CONSTANTS.MOVE_TO_VOTING_DURATION,
      min: 5,
      max: 60,
    },
    votingDurationSeconds: {
      type: Number,
      default: GAME_CONSTANTS.VOTING_DURATION,
      min: 10,
      max: 120,
    },
    startingLives: {
      type: Number,
      default: GAME_CONSTANTS.STARTING_LIVES,
      min: 1,
      max: 5,
    },
    maxKills: {
      type: Number,
      default: 2,
      enum: [2], // Cannot be changed
    },
    imposterCount: {
      type: Number,
      default: 1,
      enum: [1], // Cannot be changed
    },
    allowSelfVote: {
      type: Boolean,
      default: GAME_CONSTANTS.ALLOW_SELF_VOTE_DEFAULT,
    },
    tieRule: {
      type: String,
      enum: Object.values(TieRule),
      default: TieRule.NO_ELIMINATION,
    },
    minQuestionsPerQr: {
      type: Number,
      default: GAME_CONSTANTS.MIN_QUESTIONS_PER_QR,
      min: 1,
      max: 2,
    },
    maxQuestionsPerQr: {
      type: Number,
      default: GAME_CONSTANTS.MAX_QUESTIONS_PER_QR,
      min: 1,
      max: 2,
    },
    puzzleImagePath: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'game_configuration',
  }
);

export const GameConfiguration = model<IGameConfiguration>(
  'GameConfiguration',
  gameConfigurationSchema
);
