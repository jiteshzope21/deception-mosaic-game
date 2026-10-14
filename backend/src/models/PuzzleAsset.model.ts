/**
 * MOSAIC — Puzzle Asset Model
 *
 * Stores uploaded custom puzzle images directly in MongoDB as binary buffers.
 * This guarantees production persistence across container restarts, deploys,
 * and ephemeral filesystems without external paid storage providers.
 */

import { Schema, model, Document, Types } from 'mongoose';

export interface IPuzzleAsset extends Document {
  _id: Types.ObjectId;
  filename: string;
  mimeType: string;
  data: Buffer;
  size: number;
  createdAt: Date;
}

const puzzleAssetSchema = new Schema<IPuzzleAsset>(
  {
    filename: { type: String, required: true },
    mimeType: { type: String, required: true },
    data: { type: Buffer, required: true },
    size: { type: Number, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  {
    collection: 'puzzle_assets',
  }
);

export const PuzzleAsset = model<IPuzzleAsset>('PuzzleAsset', puzzleAssetSchema);
