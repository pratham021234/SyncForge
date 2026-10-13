import * as Y from 'yjs';
import { Pool } from 'pg';
import { getDatabasePool } from '../infrastructure/database.js';

export interface IPersistenceStore {
  loadRoomState(roomId: string): Promise<{
    snapshot?: Uint8Array;
    lastUpdateId: number;
    updates: Uint8Array[];
  }>;
  persistUpdate(roomId: string, update: Uint8Array): Promise<number>;
  saveSnapshot(roomId: string, snapshotData: Uint8Array, lastUpdateId: number): Promise<number>;
  pruneUpdates?(roomId: string, beforeUpdateId: number): Promise<number>;
  isHealthy(): Promise<boolean>;
}

/**
 * PostgreSQL Implementation of IPersistenceStore
 * Uses parameterized queries and native BYTEA byte buffers.
 */
export class PostgresPersistenceStore implements IPersistenceStore {
  constructor(private pool: Pool = getDatabasePool()) {}

  public async isHealthy(): Promise<boolean> {
    try {
      const client = await this.pool.connect();
      try {
        await client.query('SELECT 1;');
        return true;
      } finally {
        client.release();
      }
    } catch {
      return false;
    }
  }

  public async loadRoomState(roomId: string): Promise<{
    snapshot?: Uint8Array;
    lastUpdateId: number;
    updates: Uint8Array[];
  }> {
    const client = await this.pool.connect();
    try {
      // 1. Fetch latest snapshot if one exists
      const snapshotRes = await client.query<{
        snapshot_data: Buffer;
        last_update_id: string;
      }>(
        'SELECT snapshot_data, last_update_id FROM document_snapshots WHERE room_id = $1 LIMIT 1;',
        [roomId],
      );

      let snapshot: Uint8Array | undefined;
      let lastUpdateId = 0;

      if (snapshotRes.rows.length > 0 && snapshotRes.rows[0]) {
        const row = snapshotRes.rows[0];
        snapshot = new Uint8Array(row.snapshot_data);
        lastUpdateId = parseInt(row.last_update_id, 10) || 0;
      }

      // 2. Fetch all incremental updates newer than snapshot
      const updatesRes = await client.query<{ id: string; update_data: Buffer }>(
        'SELECT id, update_data FROM document_updates WHERE room_id = $1 AND id > $2 ORDER BY id ASC;',
        [roomId, lastUpdateId],
      );

      const updates: Uint8Array[] = updatesRes.rows.map((r) => new Uint8Array(r.update_data));

      return {
        snapshot,
        lastUpdateId,
        updates,
      };
    } finally {
      client.release();
    }
  }

  public async persistUpdate(roomId: string, update: Uint8Array): Promise<number> {
    const buffer = Buffer.from(update.buffer, update.byteOffset, update.byteLength);
    const res = await this.pool.query<{ id: string }>(
      'INSERT INTO document_updates (room_id, update_data) VALUES ($1, $2) RETURNING id;',
      [roomId, buffer],
    );
    const row = res.rows[0];
    if (!row) {
      throw new Error(`Failed to persist update for room ${roomId}: no record returned`);
    }
    return parseInt(row.id, 10);
  }

  public async saveSnapshot(
    roomId: string,
    snapshotData: Uint8Array,
    lastUpdateId: number,
  ): Promise<number> {
    const buffer = Buffer.from(
      snapshotData.buffer,
      snapshotData.byteOffset,
      snapshotData.byteLength,
    );
    const res = await this.pool.query<{ id: string }>(
      `INSERT INTO document_snapshots (room_id, snapshot_data, last_update_id, updated_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (room_id)
       DO UPDATE SET snapshot_data = EXCLUDED.snapshot_data,
                     last_update_id = EXCLUDED.last_update_id,
                     updated_at = CURRENT_TIMESTAMP
       RETURNING id;`,
      [roomId, buffer, lastUpdateId],
    );
    const row = res.rows[0];
    if (!row) {
      throw new Error(`Failed to save snapshot for room ${roomId}: no record returned`);
    }
    return parseInt(row.id, 10);
  }

  public async pruneUpdates(roomId: string, beforeUpdateId: number): Promise<number> {
    const res = await this.pool.query(
      'DELETE FROM document_updates WHERE room_id = $1 AND id <= $2;',
      [roomId, beforeUpdateId],
    );
    return res.rowCount ?? 0;
  }
}

/**
 * InMemoryPersistenceStore
 * Hermetic, zero-dependency persistence store for unit and concurrent integration tests.
 */
export class InMemoryPersistenceStore implements IPersistenceStore {
  private snapshots = new Map<string, { data: Uint8Array; lastUpdateId: number }>();
  private updates = new Map<string, Array<{ id: number; data: Uint8Array }>>();
  private updateCounter = 0;
  public failNextWrite = false;

  public async isHealthy(): Promise<boolean> {
    return true;
  }

  public async loadRoomState(roomId: string): Promise<{
    snapshot?: Uint8Array;
    lastUpdateId: number;
    updates: Uint8Array[];
  }> {
    const snap = this.snapshots.get(roomId);
    const allUpdates = this.updates.get(roomId) ?? [];
    const minId = snap ? snap.lastUpdateId : 0;
    const newerUpdates = allUpdates.filter((u) => u.id > minId).map((u) => u.data);

    return {
      snapshot: snap?.data,
      lastUpdateId: minId,
      updates: newerUpdates,
    };
  }

  public async persistUpdate(roomId: string, update: Uint8Array): Promise<number> {
    if (this.failNextWrite) {
      this.failNextWrite = false;
      throw new Error('Simulated database write failure');
    }
    this.updateCounter++;
    const id = this.updateCounter;
    const list = this.updates.get(roomId) ?? [];
    list.push({ id, data: new Uint8Array(update) });
    this.updates.set(roomId, list);
    return id;
  }

  public async saveSnapshot(
    roomId: string,
    snapshotData: Uint8Array,
    lastUpdateId: number,
  ): Promise<number> {
    this.snapshots.set(roomId, {
      data: new Uint8Array(snapshotData),
      lastUpdateId,
    });
    return 1;
  }

  public async pruneUpdates(roomId: string, beforeUpdateId: number): Promise<number> {
    const list = this.updates.get(roomId) ?? [];
    const filtered = list.filter((u) => u.id > beforeUpdateId);
    const prunedCount = list.length - filtered.length;
    this.updates.set(roomId, filtered);
    return prunedCount;
  }

  public clear(): void {
    this.snapshots.clear();
    this.updates.clear();
    this.updateCounter = 0;
  }
}

/**
 * PersistenceService
 * Orchestrates room document reconstitution, bounded write queues, and compaction.
 */
export class PersistenceService {
  private activePendingWrites = new Set<Promise<unknown>>();
  private totalPersistedCount = 0;
  private totalFailureCount = 0;

  constructor(
    private store: IPersistenceStore = new PostgresPersistenceStore(),
    private maxQueueDepth = 10000,
  ) {}

  public get pendingQueueDepth(): number {
    return this.activePendingWrites.size;
  }

  public get totalPersisted(): number {
    return this.totalPersistedCount;
  }

  public get totalFailures(): number {
    return this.totalFailureCount;
  }

  /**
   * Reconstitutes a room's Yjs document from persisted snapshots and update logs.
   */
  public async loadRoomDocument(roomId: string): Promise<{
    doc: Y.Doc;
    lastUpdateId: number;
    hadPreviousState: boolean;
  }> {
    const doc = new Y.Doc();
    const state = await this.store.loadRoomState(roomId);

    let hadPreviousState = false;

    // Apply snapshot if available
    if (state.snapshot && state.snapshot.length > 0) {
      Y.applyUpdate(doc, state.snapshot);
      hadPreviousState = true;
    }

    // Sequentially apply all subsequent incremental updates
    for (const update of state.updates) {
      if (update.length > 0) {
        Y.applyUpdate(doc, update);
        hadPreviousState = true;
      }
    }

    return {
      doc,
      lastUpdateId: state.lastUpdateId,
      hadPreviousState,
    };
  }

  /**
   * Schedules an update for persistence with bounded backpressure tracking.
   */
  public async persistUpdate(roomId: string, update: Uint8Array): Promise<number> {
    if (this.activePendingWrites.size >= this.maxQueueDepth) {
      throw new Error(
        `Persistence queue depth limit exceeded (${this.maxQueueDepth}). Dropping update for room ${roomId}`,
      );
    }

    const task = this.store.persistUpdate(roomId, update);
    this.activePendingWrites.add(task);

    try {
      const id = await task;
      this.totalPersistedCount++;
      return id;
    } catch (err) {
      this.totalFailureCount++;
      throw err;
    } finally {
      this.activePendingWrites.delete(task);
    }
  }

  /**
   * Compacts all accumulated updates for a room into a single snapshot.
   */
  public async compactRoom(roomId: string, doc: Y.Doc, lastUpdateId: number): Promise<number> {
    const snapshot = Y.encodeStateAsUpdate(doc);
    const snapshotId = await this.store.saveSnapshot(roomId, snapshot, lastUpdateId);
    if (this.store.pruneUpdates && lastUpdateId > 0) {
      await this.store.pruneUpdates(roomId, lastUpdateId);
    }
    return snapshotId;
  }

  /**
   * Flushes and drains all in-flight persistence promises before server shutdown.
   */
  public async drain(timeoutMs = 5000): Promise<void> {
    if (this.activePendingWrites.size === 0) return;

    await Promise.race([
      Promise.all(Array.from(this.activePendingWrites)),
      new Promise<void>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                `Persistence drain timed out after ${timeoutMs}ms (${this.activePendingWrites.size} pending writes remaining)`,
              ),
            ),
          timeoutMs,
        ),
      ),
    ]);
  }
}
