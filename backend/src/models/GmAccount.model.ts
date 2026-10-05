/**
 * MOSAIC — GM Account Model
 *
 * There is exactly ONE GM account.
 * Created by the organizer via seed script — NO public registration.
 * Passwords are hashed with bcrypt before storage.
 */

import { Schema, model, Document } from 'mongoose';

export interface IGmAccount extends Document {
  email: string;
  passwordHash: string;
  displayName: string;
  createdAt: Date;
  updatedAt: Date;
}

const gmAccountSchema = new Schema<IGmAccount>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
      default: 'Game Master',
    },
  },
  {
    timestamps: true,
    collection: 'gm_accounts',
  }
);

// Never expose password hash in serialized output
gmAccountSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete (ret as any).passwordHash;
    return ret;
  },
});

export const GmAccount = model<IGmAccount>('GmAccount', gmAccountSchema);
