/**
 * MOSAIC — Image Upload Utilities
 *
 * Validates image size, MIME type, and magic bytes for PNG, JPEG, and WebP.
 * Parses multipart/form-data buffers without external dependencies.
 */

export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export type SupportedMimeType = 'image/png' | 'image/jpeg' | 'image/webp';

export interface ImageValidationResult {
  valid: boolean;
  error?: string;
  mimeType?: SupportedMimeType;
}

/**
 * Detects the real MIME type from binary magic bytes.
 */
export function detectImageMimeType(buffer: Buffer): SupportedMimeType | null {
  if (!buffer || buffer.length < 12) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  // JPEG / JPG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // WebP: RIFF .... WEBP
  // 'RIFF' at 0..3 (0x52, 0x49, 0x46, 0x46)
  // 'WEBP' at 8..11 (0x57, 0x45, 0x42, 0x50)
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp';
  }

  return null;
}

/**
 * Validates image buffer size and format.
 */
export function validateImageBuffer(buffer: Buffer): ImageValidationResult {
  if (!buffer || buffer.length === 0) {
    return { valid: false, error: 'Uploaded file is empty.' };
  }

  if (buffer.length > MAX_IMAGE_SIZE_BYTES) {
    return {
      valid: false,
      error: 'File size exceeds the 5MB limit. Please upload a smaller image.',
    };
  }

  const detected = detectImageMimeType(buffer);
  if (!detected) {
    return {
      valid: false,
      error: 'Unsupported file format. Please upload a PNG, JPEG, or WebP image.',
    };
  }

  return { valid: true, mimeType: detected };
}

/**
 * Sanitizes an uploaded filename to prevent directory traversal or invalid characters.
 */
export function sanitizeFilename(filename: string): string {
  const base = filename.replace(/^.*[\\/]/, '').trim();
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, '_');
  return cleaned || 'puzzle_image';
}

/**
 * Parses a multipart/form-data buffer to extract an uploaded file.
 */
export function parseMultipartBuffer(
  buffer: Buffer,
  contentTypeHeader: string
): { filename: string; mimeType: string; data: Buffer } | null {
  const boundaryMatch = contentTypeHeader.match(/boundary=([^;]+)/i);
  if (!boundaryMatch) return null;

  let boundary = boundaryMatch[1].trim();
  if (boundary.startsWith('"') && boundary.endsWith('"')) {
    boundary = boundary.slice(1, -1);
  }

  const boundaryBuf = Buffer.from(`--${boundary}`);
  const startIdx = buffer.indexOf(boundaryBuf);
  if (startIdx === -1) return null;

  const headerStart = startIdx + boundaryBuf.length;

  // Header separator \r\n\r\n or \n\n
  const crlf2 = Buffer.from('\r\n\r\n');
  const lf2 = Buffer.from('\n\n');

  let headerEnd = buffer.indexOf(crlf2, headerStart);
  let delimiterLen = 4;
  if (headerEnd === -1) {
    headerEnd = buffer.indexOf(lf2, headerStart);
    delimiterLen = 2;
  }
  if (headerEnd === -1) return null;

  const headerStr = buffer.slice(headerStart, headerEnd).toString('utf-8');
  const filenameMatch = headerStr.match(/filename=["']?([^"';\r\n]+)["']?/i);
  const contentTypeMatch = headerStr.match(/Content-Type:\s*([^\r\n;]+)/i);

  const rawFilename = filenameMatch ? filenameMatch[1] : 'puzzle_image.png';
  const claimedMime = contentTypeMatch ? contentTypeMatch[1].trim().toLowerCase() : 'application/octet-stream';

  const fileDataStart = headerEnd + delimiterLen;
  const nextBoundary = buffer.indexOf(boundaryBuf, fileDataStart);
  if (nextBoundary === -1) return null;

  // Trim trailing CRLF before boundary
  let fileDataEnd = nextBoundary;
  if (fileDataEnd >= 2 && buffer[fileDataEnd - 2] === 13 && buffer[fileDataEnd - 1] === 10) {
    fileDataEnd -= 2;
  } else if (fileDataEnd >= 1 && buffer[fileDataEnd - 1] === 10) {
    fileDataEnd -= 1;
  }

  const data = buffer.slice(fileDataStart, fileDataEnd);
  return {
    filename: sanitizeFilename(rawFilename),
    mimeType: claimedMime,
    data,
  };
}
