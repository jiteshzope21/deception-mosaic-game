/**
 * MOSAIC — GM Controller (Question Bank & Configuration Management)
 */

import { Request, Response } from 'express';
import { Question } from '../models/Question.model';
import { GameConfiguration } from '../models/GameConfiguration.model';
import { sendSuccess, sendError, sendInternalError } from '../utils/response.utils';
import { ErrorCode } from '../types/auth.types';
import { logger } from '../utils/logger';

// ─── Question Bank ────────────────────────────────────────────────────────────

export async function listQuestions(req: Request, res: Response): Promise<void> {
  try {
    const { search, category } = req.query as { search?: string; category?: string };

    const filter: Record<string, any> = {};
    if (category && category !== 'ALL') {
      filter.category = category;
    }
    if (search) {
      filter.$or = [
        { questionId: { $regex: search, $options: 'i' } },
        { questionText: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } },
      ];
    }

    const questions = await Question.find(filter).sort({ questionId: 1 });
    sendSuccess(res, {
      questions: questions.map((q) => q.toObject()),
      total: questions.length,
    });
  } catch (err) {
    logger.error('listQuestions error:', err);
    sendInternalError(res);
  }
}

export async function createQuestion(req: Request, res: Response): Promise<void> {
  try {
    const questionData = req.body;
    const existing = await Question.findOne({ questionId: questionData.questionId });
    if (existing) {
      sendError(res, ErrorCode.VALIDATION_ERROR, `Question ID ${questionData.questionId} already exists.`, 409);
      return;
    }

    const newQuestion = await Question.create(questionData);
    sendSuccess(res, newQuestion.toObject(), 201);
  } catch (err: any) {
    if (err.name === 'ValidationError') {
      sendError(res, ErrorCode.VALIDATION_ERROR, err.message, 422);
      return;
    }
    logger.error('createQuestion error:', err);
    sendInternalError(res);
  }
}

export async function updateQuestion(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const question = await Question.findOneAndUpdate(
      { questionId: id },
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!question) {
      sendError(res, ErrorCode.NOT_FOUND, 'Question not found.', 404);
      return;
    }

    sendSuccess(res, question.toObject());
  } catch (err: any) {
    if (err.name === 'ValidationError') {
      sendError(res, ErrorCode.VALIDATION_ERROR, err.message, 422);
      return;
    }
    logger.error('updateQuestion error:', err);
    sendInternalError(res);
  }
}

export async function deleteQuestion(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const result = await Question.findOneAndDelete({ questionId: id });
    if (!result) {
      sendError(res, ErrorCode.NOT_FOUND, 'Question not found.', 404);
      return;
    }

    sendSuccess(res, { message: `Question ${id} deleted.` });
  } catch (err) {
    logger.error('deleteQuestion error:', err);
    sendInternalError(res);
  }
}

// ─── Game Configuration ───────────────────────────────────────────────────────

export async function getGameConfig(_req: Request, res: Response): Promise<void> {
  try {
    let config = await GameConfiguration.findOne({ _singleton: true });
    if (!config) {
      config = await GameConfiguration.create({ _singleton: true });
    }
    sendSuccess(res, config.toObject());
  } catch (err) {
    logger.error('getGameConfig error:', err);
    sendInternalError(res);
  }
}

export async function updateGameConfig(req: Request, res: Response): Promise<void> {
  try {
    const updateData = req.body;
    // Don't allow changing maxKills (always 2) or imposterCount (always 1)
    delete updateData.maxKills;
    delete updateData.imposterCount;
    delete updateData._singleton;

    const config = await GameConfiguration.findOneAndUpdate(
      { _singleton: true },
      { $set: updateData },
      { new: true, runValidators: true, upsert: true }
    );

    sendSuccess(res, config?.toObject());
  } catch (err: any) {
    if (err.name === 'ValidationError') {
      sendError(res, ErrorCode.VALIDATION_ERROR, err.message, 422);
      return;
    }
    logger.error('updateGameConfig error:', err);
    sendInternalError(res);
  }
}
