/**
 * MOSAIC — MongoDB Connection
 *
 * Creates and manages a single Mongoose connection.
 * The browser NEVER connects to MongoDB directly.
 * All database access goes through this server.
 */

import dns from 'dns';
import mongoose from 'mongoose';
import { config } from '../config/config';

// Configure reliable DNS servers to resolve MongoDB Atlas SRV records
// (Prevents ECONNREFUSED on local router DNS that does not support SRV lookups)
try {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
} catch {
  // Ignore in restricted environments
}

let isConnected = false;

export async function connectDatabase(): Promise<void> {
  if (isConnected) return;

  try {
    await mongoose.connect(config.mongodb.uri, {
      dbName: config.mongodb.dbName,
      // Connection pool settings for event workload
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    isConnected = true;
    console.log(`[MOSAIC] Connected to MongoDB (db: ${config.mongodb.dbName})`);

    mongoose.connection.on('error', (err) => {
      console.error('[MOSAIC] MongoDB connection error:', err.message);
      isConnected = false;
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('[MOSAIC] MongoDB disconnected');
      isConnected = false;
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[MOSAIC] Failed to connect to MongoDB:', message);
    throw err;
  }
}

export function getConnectionState(): string {
  const states: Record<number, string> = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };
  return states[mongoose.connection.readyState] ?? 'unknown';
}

export { mongoose };
