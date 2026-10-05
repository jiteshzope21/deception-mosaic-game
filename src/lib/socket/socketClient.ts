/**
 * MOSAIC — Socket.IO Client
 *
 * Manages real-time bidirectional communication with the backend.
 * Uses the stored JWT token for authentication upon connection.
 */

import { io, Socket } from 'socket.io-client';
import { getStoredToken } from '../api/apiClient';
import { SocketEvent, type SocketEventName } from '@/types/enums';

const SOCKET_URL = (
  import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001'
).replace(/\/$/, '');

let socketInstance: Socket | null = null;

export function getSocket(): Socket {
  if (!socketInstance) {
    const token = getStoredToken();
    socketInstance = io(SOCKET_URL, {
      autoConnect: false,
      auth: {
        token: token ?? undefined,
      },
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });

    socketInstance.on(SocketEvent.CONNECT, () => {
      console.log('[MOSAIC Socket] Connected:', socketInstance?.id);
    });

    socketInstance.on(SocketEvent.DISCONNECT, (reason) => {
      console.log('[MOSAIC Socket] Disconnected:', reason);
    });

    socketInstance.on(SocketEvent.AUTH_ERROR, (err) => {
      console.error('[MOSAIC Socket] Auth error:', err);
    });
  }

  return socketInstance;
}

export function connectSocket(): Socket {
  const socket = getSocket();
  const token = getStoredToken();
  if (token && socket.auth) {
    (socket.auth as Record<string, unknown>).token = token;
  }
  if (!socket.connected) {
    socket.connect();
  }
  return socket;
}

export function disconnectSocket(): void {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
}

export function joinRoom(room: string): void {
  const socket = getSocket();
  if (socket.connected) {
    socket.emit(SocketEvent.JOIN_ROOM, { room });
  } else {
    socket.once(SocketEvent.CONNECT, () => {
      socket.emit(SocketEvent.JOIN_ROOM, { room });
    });
    connectSocket();
  }
}

export function subscribeToEvent<T>(
  event: SocketEventName,
  callback: (data: T) => void
): () => void {
  const socket = getSocket();
  socket.on(event, callback as (...args: any[]) => void);
  return () => {
    socket.off(event, callback as (...args: any[]) => void);
  };
}
