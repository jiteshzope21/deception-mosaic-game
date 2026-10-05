/**
 * MOSAIC — Physical Task Model
 *
 * Six physical zone tasks. Display only — NEVER digitally verified.
 * No completion, verification, or approval fields exist anywhere.
 */

import { Schema, model, Document } from 'mongoose';

export interface IPhysicalTask extends Document {
  zoneNumber: number;     // 1–6
  taskName: string;
  description: string | null;
  instructions: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const physicalTaskSchema = new Schema<IPhysicalTask>(
  {
    zoneNumber: {
      type: Number,
      required: true,
      unique: true,
      min: 1,
      max: 6,
      index: true,
    },
    taskName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    description: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
    },
    instructions: {
      type: String,
      default: null,
      trim: true,
      maxlength: 1000,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // NOTE: NO completed/verified/approved/score fields — tasks are physical only
  },
  {
    timestamps: true,
    collection: 'physical_tasks',
  }
);

export const PhysicalTask = model<IPhysicalTask>('PhysicalTask', physicalTaskSchema);
