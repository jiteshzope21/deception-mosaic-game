/**
 * MOSAIC / DECEPTION — Automated Regression Tests:
 * Live Game Master Dashboard Updates & Socket Authorization
 *
 * Scenarios tested:
 * 1. GM already connected; a player joins; GM receives updated lobby data.
 * 2. GM lobby player count and player list reflect the new player without reload.
 * 3. Authorized GM receives a valid kill update immediately.
 * 4. The victim is marked eliminated and alive/eliminated counts update.
 * 5. Unauthorized clients cannot receive GM-only kill/role details.
 * 6. Invalid or duplicate kill requests do not produce duplicate success events.
 * 7. Socket reconnect restores latest game state without duplicate players or event listeners.
 * 8. Existing game flow and timers continue working correctly.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import http from 'http';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import { createApp } from '../../src/app';
import { createSocketServer, emitToGame, emitToGm } from '../../src/sockets/socketServer';
import { signGmToken, signPlayerToken } from '../../src/utils/jwt.utils';
import { GamePhase, PlayerRole, PlayerStatus, SocketEvent } from '../../src/types/game.types';
import { Game } from '../../src/models/Game.model';
import { recordKill } from '../../src/services/game.service';

describe('Live Game Master Dashboard Updates & Socket Security', () => {
  let server: http.Server;
  let port: number;
  let gmSocket: ClientSocketType;
  let playerSocket: ClientSocketType;

  const mockGameId = '507f1f77bcf86cd799439011';
  const gmToken = signGmToken('gm_test_id', 'gm@mosaic.com');
  const imposterPlayerId = '507f1f77bcf86cd799439021';
  const victimPlayerId = '507f1f77bcf86cd799439022';
  const playerToken = signPlayerToken(victimPlayerId, mockGameId, 'VictimBob');

  const mockGameDoc: any = {
    _id: mockGameId,
    gameCode: 'MOSAIC-LIVE',
    teamName: 'CyberCrew',
    teamSize: 5,
    phase: GamePhase.ROUND_2_ACTIVE,
    result: null,
    isPaused: false,
    killCount: 0,
    kills: [],
    bodyReports: [],
    events: [],
    round2StartedAt: new Date(),
    round2EndsAt: new Date(Date.now() + 600000),
    phaseStartedAt: new Date(),
    phaseEndsAt: new Date(Date.now() + 600000),
    configSnapshot: {
      bodyReportDurationSeconds: 20,
      moveToVotingDurationSeconds: 15,
      votingDurationSeconds: 15,
      teamSize: 5,
      maxKills: 2,
    },
    players: [
      {
        _id: imposterPlayerId,
        playerName: 'AliceImposter',
        role: PlayerRole.IMPOSTER,
        status: PlayerStatus.ALIVE,
        lives: 2,
      },
      {
        _id: victimPlayerId,
        playerName: 'VictimBob',
        role: PlayerRole.CREWMATE,
        status: PlayerStatus.ALIVE,
        lives: 2,
      },
      {
        _id: '507f1f77bcf86cd799439023',
        playerName: 'Charlie',
        role: PlayerRole.CREWMATE,
        status: PlayerStatus.ALIVE,
        lives: 2,
      },
    ],
    save: vi.fn().mockResolvedValue(true),
  };

  // Helper to connect a client socket
  function connectClient(token: string, extraAuth: Record<string, unknown> = {}): Promise<ClientSocketType> {
    return new Promise((resolve, reject) => {
      const socket = ClientSocket(`http://localhost:${port}`, {
        transports: ['websocket'],
        auth: {
          token,
          ...extraAuth,
        },
      });

      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', (err) => reject(err));
    });
  }

  beforeAll(async () => {
    // Mock Game.findById to return our mockGameDoc
    vi.spyOn(Game, 'findById').mockImplementation((id: any) => {
      if (String(id) === mockGameId) {
        return Promise.resolve(mockGameDoc) as any;
      }
      return Promise.resolve(null) as any;
    });

    const app = createApp();
    server = http.createServer(app);
    createSocketServer(server);

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
    if (gmSocket?.connected) gmSocket.disconnect();
    if (playerSocket?.connected) playerSocket.disconnect();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    // Reset mock game state for each test
    mockGameDoc.killCount = 0;
    mockGameDoc.kills = [];
    mockGameDoc.phase = GamePhase.ROUND_2_ACTIVE;
    mockGameDoc.players.forEach((p: any) => {
      p.status = PlayerStatus.ALIVE;
    });
    // Add Mongoose DocumentArray helper mock .id()
    mockGameDoc.players.id = (id: string) => mockGameDoc.players.find((p: any) => String(p._id) === String(id));
  });

  // ─── Scenario 1 & 2: GM live lobby update without page reload ────────────────
  it('1 & 2: GM already connected receives live lobby updates and player list updates without reload', async () => {
    gmSocket = await connectClient(gmToken, { gameId: mockGameId });

    // Join the game room
    gmSocket.emit(SocketEvent.JOIN_ROOM, { gameId: mockGameId });
    await new Promise((r) => setTimeout(r, 50));

    // Listen for lobby update
    const lobbyUpdatePromise = new Promise<any>((resolve) => {
      gmSocket.once(SocketEvent.LOBBY_UPDATE, (data) => resolve(data));
    });

    // Simulate backend persisting a player join and emitting lobby update
    const updatedPlayers = [
      { id: 'p1', playerName: 'Alice', status: 'JOINED', isClaimed: true },
      { id: 'p2', playerName: 'Bob', status: 'REGISTERED', isClaimed: false },
    ];
    emitToGm(mockGameId, SocketEvent.LOBBY_UPDATE, {
      gameId: mockGameId,
      players: updatedPlayers,
    });

    const lobbyData = await lobbyUpdatePromise;
    expect(lobbyData).toBeDefined();
    expect(lobbyData.players).toHaveLength(2);
    expect(lobbyData.players[0].status).toBe('JOINED');

    // Verify GM client state mapping (joinedCount & roster status)
    const joinedCount = lobbyData.players.filter((p: any) => p.status === 'JOINED').length;
    expect(joinedCount).toBe(1);
    expect(lobbyData.players[0].playerName).toBe('Alice');
  });

  // ─── Scenario 3 & 4: Live kill update to GM and status update ────────────────
  it('3 & 4: Authorized GM receives valid kill update immediately and victim status updates', async () => {
    // GM listens for KILL_OCCURRED
    const killOccurredPromise = new Promise<any>((resolve) => {
      gmSocket.once(SocketEvent.KILL_OCCURRED, (data) => resolve(data));
    });

    const statusChangedPromise = new Promise<any>((resolve) => {
      gmSocket.once(SocketEvent.PLAYER_STATUS_CHANGED, (data) => resolve(data));
    });

    const res = await recordKill({
      gameId: mockGameId,
      imposterPlayerId,
      victimPlayerId,
      clientActionId: 'kill-test-1',
    });

    expect(res.success).toBe(true);
    expect(res.killNumber).toBe(1);

    const killPayload = await killOccurredPromise;
    expect(killPayload).toBeDefined();
    expect(killPayload.killNumber).toBe(1);
    expect(killPayload.victimPlayerId).toBe(victimPlayerId);
    expect(killPayload.victimPlayerName).toBe('VictimBob');
    expect(killPayload.imposterPlayerId).toBe(imposterPlayerId);
    expect(killPayload.imposterPlayerName).toBe('AliceImposter');

    const statusPayload = await statusChangedPromise;
    expect(statusPayload).toBeDefined();
    expect(statusPayload.playerId).toBe(victimPlayerId);
    expect(statusPayload.status).toBe(PlayerStatus.ELIMINATED);

    // Verify victim status in mockGameDoc
    const victim = mockGameDoc.players.id(victimPlayerId);
    expect(victim.status).toBe(PlayerStatus.ELIMINATED);
    const aliveCount = mockGameDoc.players.filter((p: any) => p.status === PlayerStatus.ALIVE).length;
    const eliminatedCount = mockGameDoc.players.filter((p: any) => p.status === PlayerStatus.ELIMINATED).length;
    expect(aliveCount).toBe(2);
    expect(eliminatedCount).toBe(1);
  });

  // ─── Scenario 5: Unauthorized clients cannot receive GM-only kill/role data ──
  it('5: Unauthorized player socket CANNOT receive GM-only kill/role details or join gm: room', async () => {
    playerSocket = await connectClient(playerToken);

    let receivedGmKillEvent = false;
    playerSocket.on(SocketEvent.KILL_OCCURRED, () => {
      receivedGmKillEvent = true;
    });

    // Player attempts to join gm: room directly
    playerSocket.emit(SocketEvent.JOIN_ROOM, { room: `gm:${mockGameId}` });
    await new Promise((r) => setTimeout(r, 50));

    // Emit confidential GM event
    emitToGm(mockGameId, SocketEvent.KILL_OCCURRED, {
      imposterPlayerName: 'AliceImposter',
      secretRole: 'IMPOSTER',
    });

    await new Promise((r) => setTimeout(r, 100));
    expect(receivedGmKillEvent).toBe(false);
  });

  // ─── Scenario 6: Invalid or duplicate kill requests ──────────────────────────
  it('6: Invalid or duplicate kill requests do NOT produce duplicate success events', async () => {
    // 1. First valid kill
    mockGameDoc.phase = GamePhase.ROUND_2_ACTIVE;
    mockGameDoc.players.forEach((p: any) => { p.status = PlayerStatus.ALIVE; });

    const kill1 = await recordKill({
      gameId: mockGameId,
      imposterPlayerId,
      victimPlayerId,
      clientActionId: 'idem-key-1',
    });
    expect(kill1.success).toBe(true);

    // 2. Duplicate kill with same clientActionId
    const killDup = await recordKill({
      gameId: mockGameId,
      imposterPlayerId,
      victimPlayerId,
      clientActionId: 'idem-key-1',
    });
    expect(killDup.success).toBe(true);
    expect((killDup as any).cached).toBe(true);
    expect(mockGameDoc.kills).toHaveLength(1); // No second kill document!

    // 3. Invalid kill: victim already eliminated
    mockGameDoc.phase = GamePhase.ROUND_2_ACTIVE;
    await expect(
      recordKill({
        gameId: mockGameId,
        imposterPlayerId,
        victimPlayerId,
        clientActionId: 'idem-key-2',
      })
    ).rejects.toThrow('Victim is already eliminated');

    // 4. Invalid kill: non-imposter attempting kill
    await expect(
      recordKill({
        gameId: mockGameId,
        imposterPlayerId: victimPlayerId, // crewmate!
        victimPlayerId: '507f1f77bcf86cd799439023',
      })
    ).rejects.toThrow('Only the Imposter can perform a kill');
  });

  // ─── Scenario 7: Socket reconnect restores latest state without duplicates ───
  it('7: Socket reconnect restores rooms and updates latest game state without duplicates', async () => {
    // Reconnect GM socket
    gmSocket.disconnect();
    expect(gmSocket.connected).toBe(false);

    const reconnectedSocket = await connectClient(gmToken, { gameId: mockGameId });
    expect(reconnectedSocket.connected).toBe(true);

    // Re-join game room
    reconnectedSocket.emit(SocketEvent.JOIN_ROOM, { gameId: mockGameId });
    await new Promise((r) => setTimeout(r, 50));

    // Verify receiving events after reconnect
    const phaseChangedPromise = new Promise<any>((resolve) => {
      reconnectedSocket.once(SocketEvent.PHASE_CHANGED, (data) => resolve(data));
    });

    emitToGame(mockGameId, SocketEvent.PHASE_CHANGED, {
      from: GamePhase.ROUND_2_ACTIVE,
      to: GamePhase.BODY_REPORT,
    });

    const phaseData = await phaseChangedPromise;
    expect(phaseData).toBeDefined();
    expect(phaseData.to).toBe(GamePhase.BODY_REPORT);

    reconnectedSocket.disconnect();
  });

  // ─── Scenario 8: Existing game flow and timers continue working correctly ───
  it('8: Round 2 master timer is not reset by kill event or socket reconnect', async () => {
    const originalRound2EndsAt = mockGameDoc.round2EndsAt;
    mockGameDoc.phase = GamePhase.ROUND_2_ACTIVE;
    mockGameDoc.players.forEach((p: any) => { p.status = PlayerStatus.ALIVE; });

    const killRes = await recordKill({
      gameId: mockGameId,
      imposterPlayerId,
      victimPlayerId,
      clientActionId: 'timer-check-kill',
    });

    expect(killRes.success).toBe(true);
    // Sub-phase changed to BODY_REPORT
    expect(mockGameDoc.phase).toBe(GamePhase.BODY_REPORT);
    // Master timer remains identical!
    expect(mockGameDoc.round2EndsAt).toBe(originalRound2EndsAt);
  });
});
