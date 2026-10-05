/**
 * MOSAIC — Question Model
 *
 * 50 MCQs (Q-001 through Q-050).
 * Questions are NOT permanently assigned to QR codes.
 * Per-game question-to-QR assignment is stored in the Game document.
 */

import { Schema, model, Document } from 'mongoose';
import { AnswerOption } from '../types/game.types';

export interface IQuestion extends Document {
  questionId: string;        // Q-001 through Q-050
  category: string;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: AnswerOption;
  technicalExplanation: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const questionSchema = new Schema<IQuestion>(
  {
    questionId: {
      type: String,
      required: true,
      unique: true,
      match: /^Q-\d{3}$/, // Enforces Q-001 format
      index: true,
    },
    category: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    questionText: {
      type: String,
      required: true,
      trim: true,
      minlength: 5,
      maxlength: 1000,
    },
    optionA: { type: String, required: true, trim: true, maxlength: 300 },
    optionB: { type: String, required: true, trim: true, maxlength: 300 },
    optionC: { type: String, required: true, trim: true, maxlength: 300 },
    optionD: { type: String, required: true, trim: true, maxlength: 300 },
    correctAnswer: {
      type: String,
      required: true,
      enum: Object.values(AnswerOption),
    },
    technicalExplanation: {
      type: String,
      required: true,
      trim: true,
      minlength: 5,
      maxlength: 2000,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'questions',
  }
);

// Don't expose correctAnswer in client-facing responses
// The backend validates answers server-side — never sends correctAnswer to players
questionSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete (ret as any).correctAnswer;
    return ret;
  },
});

// Allow safe GM access with correct answers
questionSchema.methods.toGmJSON = function () {
  return this.toObject();
};

export const Question = model<IQuestion>('Question', questionSchema);
