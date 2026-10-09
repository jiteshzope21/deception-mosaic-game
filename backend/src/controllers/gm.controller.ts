/**
 * MOSAIC — GM Controller (Question Bank & Configuration Management)
 */

import { Request, Response } from 'express';
import { Question } from '../models/Question.model';
import { GameConfiguration } from '../models/GameConfiguration.model';
import { FixedQrCode } from '../models/FixedQrCode.model';
import { DecoyMessage } from '../models/DecoyMessage.model';
import { PhysicalTask } from '../models/PhysicalTask.model';
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

    // Auto-generate questionId if not provided
    if (!questionData.questionId) {
      const allQuestions = await Question.find({}, { questionId: 1 });
      const maxId = allQuestions.reduce((max, q) => {
        const match = q.questionId.match(/^Q-(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          return num > max ? num : max;
        }
        return max;
      }, 0);
      questionData.questionId = `Q-${String(maxId + 1).padStart(3, '0')}`;
    }

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

// ─── Fixed QR Codes ───────────────────────────────────────────────────────────

export async function listFixedQrs(_req: Request, res: Response): Promise<void> {
  try {
    const qrs = await FixedQrCode.find().sort({ qrId: 1 });
    sendSuccess(res, {
      qrCodes: qrs.map((q) => q.toObject()),
      total: qrs.length,
    });
  } catch (err) {
    logger.error('listFixedQrs error:', err);
    sendInternalError(res);
  }
}

// ─── Decoy Messages CRUD ──────────────────────────────────────────────────────

export async function listDecoys(_req: Request, res: Response): Promise<void> {
  try {
    const decoys = await DecoyMessage.find().sort({ createdAt: -1 });
    sendSuccess(res, {
      decoys: decoys.map((d) => d.toObject()),
      total: decoys.length,
    });
  } catch (err) {
    logger.error('listDecoys error:', err);
    sendInternalError(res);
  }
}

export async function createDecoy(req: Request, res: Response): Promise<void> {
  try {
    const decoyData = req.body;
    const newDecoy = await DecoyMessage.create(decoyData);
    sendSuccess(res, newDecoy.toObject(), 201);
  } catch (err: any) {
    if (err.name === 'ValidationError') {
      sendError(res, ErrorCode.VALIDATION_ERROR, err.message, 422);
      return;
    }
    logger.error('createDecoy error:', err);
    sendInternalError(res);
  }
}

export async function updateDecoy(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const updateData = req.body;
    const decoy = await DecoyMessage.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    );
    if (!decoy) {
      sendError(res, ErrorCode.NOT_FOUND, 'Decoy message not found.', 404);
      return;
    }
    sendSuccess(res, decoy.toObject());
  } catch (err: any) {
    if (err.name === 'ValidationError') {
      sendError(res, ErrorCode.VALIDATION_ERROR, err.message, 422);
      return;
    }
    logger.error('updateDecoy error:', err);
    sendInternalError(res);
  }
}

export async function deleteDecoy(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const result = await DecoyMessage.findByIdAndDelete(id);
    if (!result) {
      sendError(res, ErrorCode.NOT_FOUND, 'Decoy message not found.', 404);
      return;
    }
    sendSuccess(res, { message: 'Decoy message deleted.' });
  } catch (err) {
    logger.error('deleteDecoy error:', err);
    sendInternalError(res);
  }
}

// ─── Physical Task CRUD ───────────────────────────────────────────────────────

export async function listTasks(_req: Request, res: Response): Promise<void> {
  try {
    const tasks = await PhysicalTask.find().sort({ zoneNumber: 1 });
    sendSuccess(res, {
      tasks: tasks.map((t) => t.toObject()),
      total: tasks.length,
    });
  } catch (err) {
    logger.error('listTasks error:', err);
    sendInternalError(res);
  }
}

export async function createTask(req: Request, res: Response): Promise<void> {
  try {
    const taskData = req.body;
    const existing = await PhysicalTask.findOne({ zoneNumber: taskData.zoneNumber });
    if (existing) {
      sendError(res, ErrorCode.VALIDATION_ERROR, `Zone number ${taskData.zoneNumber} already exists.`, 409);
      return;
    }
    const newTask = await PhysicalTask.create(taskData);
    sendSuccess(res, newTask.toObject(), 201);
  } catch (err: any) {
    if (err.name === 'ValidationError') {
      sendError(res, ErrorCode.VALIDATION_ERROR, err.message, 422);
      return;
    }
    logger.error('createTask error:', err);
    sendInternalError(res);
  }
}

export async function updateTask(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const updateData = req.body;
    if (updateData.zoneNumber !== undefined) {
      const existing = await PhysicalTask.findOne({ zoneNumber: updateData.zoneNumber, _id: { $ne: id } });
      if (existing) {
        sendError(res, ErrorCode.VALIDATION_ERROR, `Zone number ${updateData.zoneNumber} already in use.`, 409);
        return;
      }
    }
    const task = await PhysicalTask.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    );
    if (!task) {
      sendError(res, ErrorCode.NOT_FOUND, 'Physical task not found.', 404);
      return;
    }
    sendSuccess(res, task.toObject());
  } catch (err: any) {
    if (err.name === 'ValidationError') {
      sendError(res, ErrorCode.VALIDATION_ERROR, err.message, 422);
      return;
    }
    logger.error('updateTask error:', err);
    sendInternalError(res);
  }
}

export async function deleteTask(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const result = await PhysicalTask.findByIdAndDelete(id);
    if (!result) {
      sendError(res, ErrorCode.NOT_FOUND, 'Physical task not found.', 404);
      return;
    }
    sendSuccess(res, { message: 'Physical task deleted.' });
  } catch (err) {
    logger.error('deleteTask error:', err);
    sendInternalError(res);
  }
}

// ─── Puzzle Image ─────────────────────────────────────────────────────────────

export async function updatePuzzleImage(req: Request, res: Response): Promise<void> {
  try {
    const { puzzleImagePath } = req.body;
    const config = await GameConfiguration.findOneAndUpdate(
      { _singleton: true },
      { $set: { puzzleImagePath } },
      { new: true, runValidators: true, upsert: true }
    );
    sendSuccess(res, { puzzleImagePath: config?.puzzleImagePath });
  } catch (err) {
    logger.error('updatePuzzleImage error:', err);
    sendInternalError(res);
  }
}
