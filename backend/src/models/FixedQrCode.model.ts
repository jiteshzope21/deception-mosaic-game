/**
 * MOSAIC — Fixed QR Code Model
 *
 * Exactly 10 permanent physical QR codes: QR-01 through QR-10.
 * These are static — seeded once, never modified.
 * Game-specific meaning belongs in the Game document's qrMappings array.
 */

import { Schema, model, Document } from 'mongoose';

export interface IFixedQrCode extends Document {
  qrId: string;          // QR-01 through QR-10
  displayLabel: string;  // Human-readable label
  createdAt: Date;
}

const fixedQrCodeSchema = new Schema<IFixedQrCode>(
  {
    qrId: {
      type: String,
      required: true,
      unique: true,
      match: /^QR-\d{2}$/,
      index: true,
    },
    displayLabel: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // Immutable
    collection: 'fixed_qr_codes',
  }
);

export const FixedQrCode = model<IFixedQrCode>('FixedQrCode', fixedQrCodeSchema);
