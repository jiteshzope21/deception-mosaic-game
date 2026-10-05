/**
 * MOSAIC — Decoy Message Model
 *
 * All decoy messages MUST contain "Try another QR Buddy!" — enforced by validator.
 */

import { Schema, model, Document } from 'mongoose';
import { GAME_CONSTANTS } from '../config/constants';

export interface IDecoyMessage extends Document {
  message: string;
  imagePath: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const decoyMessageSchema = new Schema<IDecoyMessage>(
  {
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
      validate: {
        validator(v: string) {
          return v.includes(GAME_CONSTANTS.REQUIRED_DECOY_PHRASE);
        },
        message: `Decoy message MUST contain: "${GAME_CONSTANTS.REQUIRED_DECOY_PHRASE}"`,
      },
    },
    imagePath: {
      type: String,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'decoy_messages',
  }
);

export const DecoyMessage = model<IDecoyMessage>('DecoyMessage', decoyMessageSchema);
