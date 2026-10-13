import * as Y from 'yjs';
import { ServerMessage, bytesToBase64 } from '@syncforge/shared';
import { PersistenceService } from '../services/persistence.service.js';

export interface RoomConnection {
  connectionId: string;
  userId: string;
  readOnly: boolean;
  send(message: ServerMessage): void;
}

/**
 * Room
 * In-memory representation of an active collaboration room with associated Yjs CRDT document.
 */
export class Room {
  public readonly roomId: string;
  public readonly doc: Y.Doc;
  private connections = new Map<string, RoomConnection>();
  private awarenessUpdates = new Map<string, string>();
  private persistenceService: PersistenceService;
  private initPromise: Promise<void> | null = null;
  private isInitialized = false;
  private pendingOperations = 0;
  private lastActivityTimestamp = Date.now();
  private lastPersistedUpdateId = 0;
  private destroyed = false;

  constructor(roomId: string, persistenceService: PersistenceService) {
    this.roomId = roomId;
    this.persistenceService = persistenceService;
    this.doc = new Y.Doc();
  }

  public get connectionCount(): number {
    return this.connections.size;
  }

  public get lastActivity(): number {
    return this.lastActivityTimestamp;
  }

  public get isReady(): boolean {
    return this.isInitialized && !this.destroyed;
  }

  public get isBusy(): boolean {
    return this.pendingOperations > 0 || this.initPromise !== null;
  }

  public get isDestroyed(): boolean {
    return this.destroyed;
  }

  /**
   * Initializes room by loading persisted document state from storage.
   * Concurrency-safe: duplicate concurrent calls return the existing in-flight promise.
   */
  public async init(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        const { doc: loadedDoc, lastUpdateId } = await this.persistenceService.loadRoomDocument(
          this.roomId,
        );

        // Apply loaded state to our room document
        const snapshot = Y.encodeStateAsUpdate(loadedDoc);
        if (snapshot.length > 0) {
          Y.applyUpdate(this.doc, snapshot, 'persistence_init');
        }

        this.lastPersistedUpdateId = lastUpdateId;
        this.isInitialized = true;
        this.lastActivityTimestamp = Date.now();
      } finally {
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  /**
   * Adds an authorized connection to this room.
   */
  public addConnection(conn: RoomConnection): void {
    if (this.destroyed) {
      throw new Error(`Cannot add connection to destroyed room ${this.roomId}`);
    }
    this.connections.set(conn.connectionId, conn);
    this.lastActivityTimestamp = Date.now();
  }

  /**
   * Removes a connection from this room.
   */
  public removeConnection(connectionId: string): boolean {
    this.awarenessUpdates.delete(connectionId);
    const removed = this.connections.delete(connectionId);
    if (removed) {
      this.lastActivityTimestamp = Date.now();
    }
    return removed;
  }

  public updateAwareness(connectionId: string, base64Update: string): void {
    this.awarenessUpdates.set(connectionId, base64Update);
    this.lastActivityTimestamp = Date.now();
  }

  public getAwarenessUpdates(): string[] {
    return Array.from(this.awarenessUpdates.values());
  }

  public hasConnection(connectionId: string): boolean {
    return this.connections.has(connectionId);
  }

  /**
   * Broadcasts a server message to all connections in this room,
   * optionally skipping the originating sender.
   */
  public broadcast(message: ServerMessage, excludeConnectionId?: string): void {
    for (const [connId, conn] of this.connections) {
      if (excludeConnectionId && connId === excludeConnectionId) {
        continue;
      }
      try {
        conn.send(message);
      } catch (err) {
        console.error(
          `Failed to broadcast message to connection ${connId} in room ${this.roomId}:`,
          err,
        );
      }
    }
  }

  /**
   * Applies an incremental client document update.
   * 1. Applies update to room Y.Doc.
   * 2. Broadcasts to other peers in room.
   * 3. Persists update to PostgreSQL asynchronously.
   */
  public async applyClientUpdate(
    update: Uint8Array,
    senderConnectionId?: string,
    messageId?: string,
  ): Promise<{ persistedId: number }> {
    if (this.destroyed) {
      throw new Error(`Room ${this.roomId} has been destroyed`);
    }

    this.lastActivityTimestamp = Date.now();
    this.pendingOperations++;

    try {
      // 1. Apply to in-memory CRDT
      Y.applyUpdate(this.doc, update, senderConnectionId ?? 'client_update');

      // 2. Broadcast immediately to peers in this room
      const base64Update = bytesToBase64(update);
      this.broadcast(
        {
          type: 'doc_update',
          roomId: this.roomId,
          update: base64Update,
        },
        senderConnectionId,
      );

      // 3. Persist update durably
      const updateId = await this.persistenceService.persistUpdate(this.roomId, update);
      this.lastPersistedUpdateId = updateId;

      // 4. Send acknowledgment to sender if requested
      if (senderConnectionId && messageId) {
        const sender = this.connections.get(senderConnectionId);
        if (sender) {
          sender.send({
            type: 'doc_update_ack',
            roomId: this.roomId,
            messageId,
            persisted: true,
          });
        }
      }

      return { persistedId: updateId };
    } catch (err) {
      // Send failed ack to sender
      if (senderConnectionId && messageId) {
        const sender = this.connections.get(senderConnectionId);
        if (sender) {
          sender.send({
            type: 'doc_update_ack',
            roomId: this.roomId,
            messageId,
            persisted: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      throw err;
    } finally {
      this.pendingOperations--;
    }
  }

  /**
   * Compacts accumulated room updates into a snapshot.
   */
  public async compact(): Promise<void> {
    if (this.destroyed) return;
    this.pendingOperations++;
    try {
      await this.persistenceService.compactRoom(this.roomId, this.doc, this.lastPersistedUpdateId);
    } finally {
      this.pendingOperations--;
    }
  }

  /**
   * Cleans up room resources.
   */
  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.connections.clear();
    this.doc.destroy();
  }
}
