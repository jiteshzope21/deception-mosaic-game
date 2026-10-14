/**
 * DECEPTION — Custom Puzzle Image Upload & Snapshot Regression Tests
 *
 * Scenarios tested:
 * 1. Authorized Game Master can upload a valid image (PNG, JPEG, WebP).
 * 2. Unauthorized user cannot upload or replace an image (401 / 403).
 * 3. Unsupported file formats are rejected (400).
 * 4. Oversized files are rejected (> 5MB rejected with 400).
 * 5. The saved image reference persists and can be loaded again via /api/puzzle-image/:id.
 * 6. Replacing an image updates the configured image.
 * 7. Round 1 uses the saved custom image and existing puzzle-piece behavior remains unchanged.
 * 8. Failed replacement preserves the previous valid image.
 * 9. Active and archived game configuration rules remain intact (immutable snapshot).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import http from 'http';
import { Types } from 'mongoose';
import { createApp } from '../../src/app';
import { signGmToken, signPlayerToken } from '../../src/utils/jwt.utils';
import { PuzzleAsset } from '../../src/models/PuzzleAsset.model';
import { GameConfiguration } from '../../src/models/GameConfiguration.model';
import { Game } from '../../src/models/Game.model';
import { getGameForPlayer, getGameForGm } from '../../src/services/game.service';
import { GamePhase, PlayerRole, PlayerStatus } from '../../src/types/game.types';
import * as socketServer from '../../src/sockets/socketServer';
import {
  detectImageMimeType,
  validateImageBuffer,
  MAX_IMAGE_SIZE_BYTES,
} from '../../src/utils/imageUpload.utils';

// Helper to build a valid PNG buffer
function createValidPngBuffer(): Buffer {
  return Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG magic
    0x00, 0x00, 0x00, 0x0d, // IHDR length
    0x49, 0x48, 0x44, 0x52, // 'IHDR'
    0x00, 0x00, 0x00, 0x01, // width: 1
    0x00, 0x00, 0x00, 0x01, // height: 1
    0x08, 0x06, 0x00, 0x00, 0x00, // bit depth, color type, etc.
    0x1f, 0x15, 0xc4, 0x89, // CRC
  ]);
}

// Helper to build a valid JPEG buffer
function createValidJpegBuffer(): Buffer {
  return Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x60,
  ]);
}

// Helper to build a valid WebP buffer
function createValidWebpBuffer(): Buffer {
  const buf = Buffer.alloc(32);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(24, 4);
  buf.write('WEBP', 8);
  buf.write('VP8 ', 12);
  buf.writeUInt32LE(12, 16);
  return buf;
}

// Helper to build a multipart/form-data body
function buildMultipartBody(boundary: string, filename: string, mimeType: string, fileData: Buffer): Buffer {
  const pre = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`
  );
  const post = Buffer.from(`\r\n--${boundary}--\r\n`);
  return Buffer.concat([pre, fileData, post]);
}

describe('DECEPTION — Custom Puzzle Image Upload, Storage & Snapshot', () => {
  let server: http.Server;
  let port: number;

  const gmToken = signGmToken('gm_test_admin', 'gm@mosaic.com');
  const playerToken = signPlayerToken('player_test_id', 'game_test_id', 'AlicePlayer');

  beforeAll(async () => {
    const app = createApp();
    server = http.createServer(app);
    socketServer.createSocketServer(server);

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const address = server.address();
        if (address && typeof address === 'object') {
          port = address.port;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(socketServer, 'emitToGame').mockImplementation(() => {});
    vi.spyOn(socketServer, 'emitToGm').mockImplementation(() => {});
  });

  describe('1. Authorized Game Master can upload a valid image', () => {
    it('successfully uploads a valid PNG via multipart/form-data and saves asset in DB', async () => {
      const pngBuffer = createValidPngBuffer();
      const mockAssetId = new Types.ObjectId();

      vi.spyOn(PuzzleAsset, 'create').mockResolvedValueOnce({
        _id: mockAssetId,
        filename: 'custom_blueprint.png',
        mimeType: 'image/png',
        data: pngBuffer,
        size: pngBuffer.length,
        createdAt: new Date(),
      } as any);

      vi.spyOn(GameConfiguration, 'findOneAndUpdate').mockResolvedValueOnce({
        _singleton: true,
        puzzleImagePath: `/api/puzzle-image/${mockAssetId}`,
      } as any);

      const boundary = '----WebKitFormBoundaryUnitTest123';
      const body = buildMultipartBody(boundary, 'custom_blueprint.png', 'image/png', pngBuffer);

      const res = await fetch(`http://localhost:${port}/api/gm/puzzle-image/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${gmToken}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body,
      });

      expect(res.status).toBe(201);
      const json = (await res.json()) as any;
      expect(json.success).toBe(true);
      expect(json.data.puzzleImagePath).toBe(`/api/puzzle-image/${mockAssetId}`);
      expect(json.data.mimeType).toBe('image/png');
      expect(PuzzleAsset.create).toHaveBeenCalledTimes(1);
      expect(GameConfiguration.findOneAndUpdate).toHaveBeenCalledWith(
        { _singleton: true },
        { $set: { puzzleImagePath: `/api/puzzle-image/${mockAssetId}` } },
        expect.any(Object)
      );
    });

    it('successfully uploads a valid JPEG image via JSON base64 payload', async () => {
      const jpegBuffer = createValidJpegBuffer();
      const mockAssetId = new Types.ObjectId();

      vi.spyOn(PuzzleAsset, 'create').mockResolvedValueOnce({
        _id: mockAssetId,
        filename: 'puzzle.jpg',
        mimeType: 'image/jpeg',
        data: jpegBuffer,
        size: jpegBuffer.length,
        createdAt: new Date(),
      } as any);

      vi.spyOn(GameConfiguration, 'findOneAndUpdate').mockResolvedValueOnce({
        _singleton: true,
        puzzleImagePath: `/api/puzzle-image/${mockAssetId}`,
      } as any);

      const res = await fetch(`http://localhost:${port}/api/gm/puzzle-image/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${gmToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: 'puzzle.jpg',
          fileData: `data:image/jpeg;base64,${jpegBuffer.toString('base64')}`,
        }),
      });

      expect(res.status).toBe(201);
      const json = (await res.json()) as any;
      expect(json.success).toBe(true);
      expect(json.data.puzzleImagePath).toBe(`/api/puzzle-image/${mockAssetId}`);
      expect(json.data.mimeType).toBe('image/jpeg');
    });

    it('successfully uploads a valid WebP image via raw binary', async () => {
      const webpBuffer = createValidWebpBuffer();
      const mockAssetId = new Types.ObjectId();

      vi.spyOn(PuzzleAsset, 'create').mockResolvedValueOnce({
        _id: mockAssetId,
        filename: 'circuit.webp',
        mimeType: 'image/webp',
        data: webpBuffer,
        size: webpBuffer.length,
        createdAt: new Date(),
      } as any);

      vi.spyOn(GameConfiguration, 'findOneAndUpdate').mockResolvedValueOnce({
        _singleton: true,
        puzzleImagePath: `/api/puzzle-image/${mockAssetId}`,
      } as any);

      const res = await fetch(`http://localhost:${port}/api/gm/puzzle-image/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${gmToken}`,
          'Content-Type': 'image/webp',
          'x-filename': 'circuit.webp',
        },
        body: webpBuffer,
      });

      expect(res.status).toBe(201);
      const json = (await res.json()) as any;
      expect(json.success).toBe(true);
      expect(json.data.puzzleImagePath).toBe(`/api/puzzle-image/${mockAssetId}`);
      expect(json.data.mimeType).toBe('image/webp');
    });
  });

  describe('2. Unauthorized user cannot upload or replace an image', () => {
    it('rejects unauthenticated upload requests with 401 Unauthorized', async () => {
      const pngBuffer = createValidPngBuffer();
      const res = await fetch(`http://localhost:${port}/api/gm/puzzle-image/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'image/png',
        },
        body: pngBuffer,
      });

      expect(res.status).toBe(401);
      const json = (await res.json()) as any;
      expect(json.success).toBe(false);
    });

    it('rejects upload requests from player token with 403 Forbidden', async () => {
      const pngBuffer = createValidPngBuffer();
      const res = await fetch(`http://localhost:${port}/api/gm/puzzle-image/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${playerToken}`,
          'Content-Type': 'image/png',
        },
        body: pngBuffer,
      });

      expect(res.status).toBe(403);
      const json = (await res.json()) as any;
      expect(json.success).toBe(false);
    });

    it('rejects unauthenticated URL replacement on /api/gm/puzzle-image with 401', async () => {
      const res = await fetch(`http://localhost:${port}/api/gm/puzzle-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ puzzleImagePath: 'https://example.com/image.png' }),
      });

      expect(res.status).toBe(401);
    });
  });

  describe('3. Unsupported file formats are rejected', () => {
    it('rejects text files claiming to be images with 400 Validation Error', async () => {
      const fakeBuffer = Buffer.from('This is a plain text file, not a real image!');

      const res = await fetch(`http://localhost:${port}/api/gm/puzzle-image/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${gmToken}`,
          'Content-Type': 'image/png',
        },
        body: fakeBuffer,
      });

      expect(res.status).toBe(400);
      const json = (await res.json()) as any;
      expect(json.success).toBe(false);
      expect(json.error.message).toContain('Unsupported file format');
    });

    it('rejects GIF files with 400 (only PNG, JPEG, WebP allowed)', async () => {
      const gifBuffer = Buffer.from('GIF89a\x01\x00\x01\x00\x80\x00\x00');
      const res = await fetch(`http://localhost:${port}/api/gm/puzzle-image/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${gmToken}`,
          'Content-Type': 'image/gif',
        },
        body: gifBuffer,
      });

      expect(res.status).toBe(400);
      const json = (await res.json()) as any;
      expect(json.success).toBe(false);
      expect(json.error.message).toContain('Unsupported file format');
    });

    it('detectImageMimeType correctly detects valid formats and rejects others', () => {
      expect(detectImageMimeType(createValidPngBuffer())).toBe('image/png');
      expect(detectImageMimeType(createValidJpegBuffer())).toBe('image/jpeg');
      expect(detectImageMimeType(createValidWebpBuffer())).toBe('image/webp');
      expect(detectImageMimeType(Buffer.from('not an image'))).toBeNull();
      expect(detectImageMimeType(Buffer.alloc(5))).toBeNull();
    });
  });

  describe('4. Oversized files are rejected', () => {
    it('rejects images exceeding 5MB limit with 400 error', () => {
      const oversized = Buffer.alloc(MAX_IMAGE_SIZE_BYTES + 1024);
      const result = validateImageBuffer(oversized);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds the 5MB limit');
    });

    it('handles empty buffers with validation error', () => {
      const empty = Buffer.alloc(0);
      const result = validateImageBuffer(empty);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Uploaded file is empty');
    });
  });

  describe('5. Saved image reference persists and can be loaded again', () => {
    it('serves the stored image asset binary with correct headers on GET /api/puzzle-image/:id', async () => {
      const assetId = new Types.ObjectId();
      const pngBuffer = createValidPngBuffer();

      vi.spyOn(PuzzleAsset, 'findById').mockResolvedValueOnce({
        _id: assetId,
        filename: 'test_puzzle.png',
        mimeType: 'image/png',
        data: pngBuffer,
        size: pngBuffer.length,
        createdAt: new Date(),
      } as any);

      const res = await fetch(`http://localhost:${port}/api/puzzle-image/${assetId}`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/png');
      expect(res.headers.get('content-length')).toBe(String(pngBuffer.length));
      expect(res.headers.get('cache-control')).toContain('immutable');

      const arrayBuffer = await res.arrayBuffer();
      const receivedBuffer = Buffer.from(arrayBuffer);
      expect(receivedBuffer.equals(pngBuffer)).toBe(true);
    });

    it('returns 400 for invalid ObjectId format', async () => {
      const res = await fetch(`http://localhost:${port}/api/puzzle-image/invalid-not-id`);
      expect(res.status).toBe(400);
    });

    it('returns 404 if asset ID does not exist in DB', async () => {
      const validNonExistentId = new Types.ObjectId();
      vi.spyOn(PuzzleAsset, 'findById').mockResolvedValueOnce(null);

      const res = await fetch(`http://localhost:${port}/api/puzzle-image/${validNonExistentId}`);
      expect(res.status).toBe(404);
    });
  });

  describe('6. Replacing an image updates the configured image', () => {
    it('replaces an existing custom image with a new upload', async () => {
      const asset1Id = new Types.ObjectId();
      const asset2Id = new Types.ObjectId();
      const pngBuffer = createValidPngBuffer();

      let currentConfig: any = {
        _singleton: true,
        puzzleImagePath: `/api/puzzle-image/${asset1Id}`,
      };

      vi.spyOn(PuzzleAsset, 'create').mockResolvedValueOnce({
        _id: asset2Id,
        filename: 'new_image.png',
        mimeType: 'image/png',
        data: pngBuffer,
        size: pngBuffer.length,
        createdAt: new Date(),
      } as any);

      (vi.spyOn(GameConfiguration, 'findOneAndUpdate') as any).mockImplementation(async (_query: any, update: any) => {
        currentConfig.puzzleImagePath = update.$set.puzzleImagePath;
        return currentConfig;
      });

      const res = await fetch(`http://localhost:${port}/api/gm/puzzle-image/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${gmToken}`,
          'Content-Type': 'image/png',
        },
        body: pngBuffer,
      });

      expect(res.status).toBe(201);
      const json = (await res.json()) as any;
      expect(json.data.puzzleImagePath).toBe(`/api/puzzle-image/${asset2Id}`);
      expect(currentConfig.puzzleImagePath).toBe(`/api/puzzle-image/${asset2Id}`);
    });

    it('allows resetting the puzzle image to null (default theme blueprint)', async () => {
      let currentConfig: any = {
        _singleton: true,
        puzzleImagePath: '/api/puzzle-image/custom123',
      };

      (vi.spyOn(GameConfiguration, 'findOneAndUpdate') as any).mockImplementation(async (_query: any, update: any) => {
        currentConfig.puzzleImagePath = update.$set.puzzleImagePath;
        return currentConfig;
      });

      const res = await fetch(`http://localhost:${port}/api/gm/puzzle-image`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${gmToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ puzzleImagePath: null }),
      });

      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      expect(json.data.puzzleImagePath).toBeNull();
      expect(currentConfig.puzzleImagePath).toBeNull();
    });
  });

  describe('7. Round 1 uses the saved custom image and existing puzzle-piece behavior remains unchanged', () => {
    it('snapshots puzzleImagePath when game starts and returns it to players along with puzzle pieces', async () => {
      const customImagePath = '/api/puzzle-image/507f1f77bcf86cd799439099';

      const mockGameId = new Types.ObjectId();
      const p1Id = new Types.ObjectId();
      const p2Id = new Types.ObjectId();
      const p3Id = new Types.ObjectId();
      const p4Id = new Types.ObjectId();
      const p5Id = new Types.ObjectId();

      const playersList = [
        { _id: p1Id, playerName: 'P1', role: PlayerRole.CREWMATE, status: PlayerStatus.REGISTERED },
        { _id: p2Id, playerName: 'P2', role: PlayerRole.CREWMATE, status: PlayerStatus.REGISTERED },
        { _id: p3Id, playerName: 'P3', role: PlayerRole.CREWMATE, status: PlayerStatus.REGISTERED },
        { _id: p4Id, playerName: 'P4', role: PlayerRole.CREWMATE, status: PlayerStatus.REGISTERED },
        { _id: p5Id, playerName: 'P5', role: PlayerRole.IMPOSTER, status: PlayerStatus.REGISTERED },
      ];

      const mockGameDoc: any = {
        _id: mockGameId,
        gameCode: 'MOSAIC-CUSTOM',
        teamName: 'AlphaTeam',
        teamSize: 5,
        phase: GamePhase.LOBBY,
        puzzleCompleted: false,
        puzzleImagePath: customImagePath,
        configSnapshot: {
          round1DurationSeconds: 240,
          transitionDurationSeconds: 30,
          round2DurationSeconds: 480,
          bodyReportDurationSeconds: 20,
          moveToVotingDurationSeconds: 15,
          votingDurationSeconds: 15,
          startingLives: 2,
          teamSize: 5,
          maxKills: 2,
          imposterCount: 1,
          allowSelfVote: false,
          tieRule: 'NO_ELIMINATION',
          minQuestionsPerQr: 1,
          maxQuestionsPerQr: 1,
          puzzleImagePath: customImagePath,
          snapshottedAt: new Date(),
        },
        puzzlePieces: [
          { pieceIndex: 0, isUnlocked: false, unlockedAt: null, unlockedByPlayer: null },
          { pieceIndex: 1, isUnlocked: false, unlockedAt: null, unlockedByPlayer: null },
          { pieceIndex: 2, isUnlocked: false, unlockedAt: null, unlockedByPlayer: null },
          { pieceIndex: 3, isUnlocked: false, unlockedAt: null, unlockedByPlayer: null },
          { pieceIndex: 4, isUnlocked: false, unlockedAt: null, unlockedByPlayer: null },
        ],
        votes: [],
        kills: [],
        bodyReports: [],
        players: Object.assign(playersList, {
          id: (id: string) => playersList.find((p) => p._id.toString() === id.toString()) || null,
        }),
        save: vi.fn().mockResolvedValue(true),
      };

      vi.spyOn(Game, 'findById').mockResolvedValue(mockGameDoc as any);

      // Verify Player view receives the custom image and 5 puzzle pieces
      const playerView = await getGameForPlayer(mockGameId.toHexString(), p1Id.toHexString());
      expect(playerView).toBeDefined();
      expect(playerView!.puzzleImagePath).toBe(customImagePath);
      expect(playerView!.puzzlePieces).toHaveLength(5);
      expect(playerView!.puzzlePieces[0].pieceIndex).toBe(0);
      expect(playerView!.puzzlePieces[0].isUnlocked).toBe(false);

      // Verify GM view receives the custom image and puzzle pieces
      const gmView = await getGameForGm(mockGameId.toHexString());
      expect(gmView).toBeDefined();
      expect(gmView!.puzzleImagePath).toBe(customImagePath);
      expect(gmView!.puzzlePieces).toHaveLength(5);
    });
  });

  describe('8. Failed replacement preserves the previous valid image', () => {
    it('does not alter the configured image when an upload fails validation', async () => {
      const initialImagePath = '/api/puzzle-image/initialValid123';
      let storedImagePath = initialImagePath;

      (vi.spyOn(GameConfiguration, 'findOneAndUpdate') as any).mockImplementation(async (_q: any, update: any) => {
        storedImagePath = update.$set.puzzleImagePath;
        return { puzzleImagePath: storedImagePath } as any;
      });

      // Attempt to upload an invalid file (plain text)
      const invalidBuffer = Buffer.from('corrupted data not an image');
      const res = await fetch(`http://localhost:${port}/api/gm/puzzle-image/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${gmToken}`,
          'Content-Type': 'image/png',
        },
        body: invalidBuffer,
      });

      expect(res.status).toBe(400);
      // Ensure GameConfiguration was NOT touched with invalid data
      expect(storedImagePath).toBe(initialImagePath);
    });
  });

  describe('9. Active and archived game configuration rules remain intact', () => {
    it('changing GameConfiguration does NOT mutate active game configSnapshot', async () => {
      const activeGameSnapshotImage = '/api/puzzle-image/snapshotActiveGame';
      const newGmConfigImage = '/api/puzzle-image/brandNewConfigForFutureGames';

      const activeGameId = new Types.ObjectId();
      const p1Id = new Types.ObjectId();
      const activePlayersList = [
        { _id: p1Id, playerName: 'P1', role: PlayerRole.CREWMATE, status: PlayerStatus.ALIVE },
      ];

      const activeGameDoc: any = {
        _id: activeGameId,
        gameCode: 'MOSAIC-ACTIVE',
        teamName: 'ActiveCrew',
        teamSize: 5,
        phase: GamePhase.ROUND_1_ACTIVE,
        puzzleCompleted: false,
        puzzleImagePath: activeGameSnapshotImage,
        configSnapshot: {
          puzzleImagePath: activeGameSnapshotImage,
          snapshottedAt: new Date(),
          teamSize: 5,
        },
        puzzlePieces: [
          { pieceIndex: 0, isUnlocked: false, unlockedAt: null, unlockedByPlayer: null },
        ],
        votes: [],
        kills: [],
        bodyReports: [],
        players: Object.assign(activePlayersList, {
          id: (id: string) => activePlayersList.find((p) => p._id.toString() === id.toString()) || null,
        }),
        save: vi.fn().mockResolvedValue(true),
      };

      vi.spyOn(Game, 'findById').mockResolvedValue(activeGameDoc as any);

      // Now GM updates configuration for the future game
      vi.spyOn(GameConfiguration, 'findOneAndUpdate').mockResolvedValueOnce({
        _singleton: true,
        puzzleImagePath: newGmConfigImage,
      } as any);

      const updateRes = await fetch(`http://localhost:${port}/api/gm/puzzle-image`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${gmToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ puzzleImagePath: newGmConfigImage }),
      });
      expect(updateRes.status).toBe(200);

      // Verify the active running game still retains its original snapshot!
      const activePlayerView = await getGameForPlayer(activeGameId.toHexString(), p1Id.toHexString());
      expect(activePlayerView!.puzzleImagePath).toBe(activeGameSnapshotImage);

      const activeGmView = await getGameForGm(activeGameId.toHexString());
      expect(activeGmView!.puzzleImagePath).toBe(activeGameSnapshotImage);
    });
  });

  describe('10. Storage or upload failures return a controlled error, not fake success', () => {
    it('returns HTTP 500 with controlled error message when PuzzleAsset.create rejects', async () => {
      const pngBuffer = createValidPngBuffer();

      vi.spyOn(PuzzleAsset, 'create').mockRejectedValueOnce(new Error('MongoDB disk full or write error'));

      const res = await fetch(`http://localhost:${port}/api/gm/puzzle-image/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${gmToken}`,
          'Content-Type': 'image/png',
        },
        body: pngBuffer,
      });

      expect(res.status).toBe(500);
      const json = (await res.json()) as any;
      expect(json.success).toBe(false);
      expect(json.error.message).toBe('An internal server error occurred.');
    });
  });

  describe('11. Route aliases & multipart delegation', () => {
    it('supports upload via /api/puzzle-image/upload alias when authenticated as GM', async () => {
      const pngBuffer = createValidPngBuffer();
      const mockAssetId = new Types.ObjectId();

      vi.spyOn(PuzzleAsset, 'create').mockResolvedValueOnce({
        _id: mockAssetId,
        filename: 'alias_test.png',
        mimeType: 'image/png',
        data: pngBuffer,
        size: pngBuffer.length,
        createdAt: new Date(),
      } as any);

      vi.spyOn(GameConfiguration, 'findOneAndUpdate').mockResolvedValueOnce({
        _singleton: true,
        puzzleImagePath: `/api/puzzle-image/${mockAssetId}`,
      } as any);

      const res = await fetch(`http://localhost:${port}/api/puzzle-image/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${gmToken}`,
          'Content-Type': 'image/png',
        },
        body: pngBuffer,
      });

      expect(res.status).toBe(201);
      const json = (await res.json()) as any;
      expect(json.success).toBe(true);
      expect(json.data.puzzleImagePath).toBe(`/api/puzzle-image/${mockAssetId}`);
    });

    it('delegates to uploadPuzzleImage if multipart body is sent to /api/gm/puzzle-image', async () => {
      const pngBuffer = createValidPngBuffer();
      const mockAssetId = new Types.ObjectId();

      vi.spyOn(PuzzleAsset, 'create').mockResolvedValueOnce({
        _id: mockAssetId,
        filename: 'delegated.png',
        mimeType: 'image/png',
        data: pngBuffer,
        size: pngBuffer.length,
        createdAt: new Date(),
      } as any);

      vi.spyOn(GameConfiguration, 'findOneAndUpdate').mockResolvedValueOnce({
        _singleton: true,
        puzzleImagePath: `/api/puzzle-image/${mockAssetId}`,
      } as any);

      const boundary = '----WebKitFormBoundaryDelegateTest';
      const body = buildMultipartBody(boundary, 'delegated.png', 'image/png', pngBuffer);

      const res = await fetch(`http://localhost:${port}/api/gm/puzzle-image`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${gmToken}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body,
      });

      expect(res.status).toBe(201);
      const json = (await res.json()) as any;
      expect(json.success).toBe(true);
      expect(json.data.puzzleImagePath).toBe(`/api/puzzle-image/${mockAssetId}`);
    });
  });
});

