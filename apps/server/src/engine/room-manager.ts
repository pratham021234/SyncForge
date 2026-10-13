import { Room } from './room.js';
import { PersistenceService } from '../services/persistence.service.js';

export interface RoomManagerOptions {
  idleTimeoutMs?: number;
  cleanupIntervalMs?: number;
}

export class RoomManager {
  private rooms = new Map<string, Room>();
  private creationLocks = new Map<string, Promise<Room>>();
  private cleanupTimer: NodeJS.Timeout | null = null;
  private readonly idleTimeoutMs: number;
  private readonly cleanupIntervalMs: number;
  private isShuttingDown = false;

  constructor(
    private persistenceService: PersistenceService,
    options: RoomManagerOptions = {},
  ) {
    this.idleTimeoutMs = options.idleTimeoutMs ?? 60000; // 60 seconds idle timeout
    this.cleanupIntervalMs = options.cleanupIntervalMs ?? 15000; // scan every 15 seconds

    // Start background idle cleanup loop
    this.cleanupTimer = setInterval(() => {
      this.cleanupIdleRooms();
    }, this.cleanupIntervalMs);
    // Don't keep event loop alive if everything else finishes
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  public get activeRoomCount(): number {
    return this.rooms.size;
  }

  public get totalActiveConnections(): number {
    let count = 0;
    for (const room of this.rooms.values()) {
      count += room.connectionCount;
    }
    return count;
  }

  /**
   * Retrieves or creates a room instance with guaranteed single-flight initialization.
   */
  public async getOrCreateRoom(roomId: string): Promise<Room> {
    if (this.isShuttingDown) {
      throw new Error('RoomManager is shutting down; cannot create new rooms');
    }

    const existing = this.rooms.get(roomId);
    if (existing && !existing.isDestroyed) {
      if (!existing.isReady) {
        await existing.init();
      }
      return existing;
    }

    // Single-flight lock: deduplicates simultaneous creation races
    const existingLock = this.creationLocks.get(roomId);
    if (existingLock) {
      return existingLock;
    }

    const lockPromise = (async () => {
      try {
        const room = new Room(roomId, this.persistenceService);
        await room.init();
        this.rooms.set(roomId, room);
        return room;
      } finally {
        this.creationLocks.delete(roomId);
      }
    })();

    this.creationLocks.set(roomId, lockPromise);
    return lockPromise;
  }

  public getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  public removeRoom(roomId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    if (room.isBusy) {
      return false; // Prevent removing busy room
    }

    this.rooms.delete(roomId);
    room.destroy();
    return true;
  }

  /**
   * Periodically scans and evicts idle rooms with zero connections.
   */
  public cleanupIdleRooms(): number {
    const now = Date.now();
    let evicted = 0;

    for (const [roomId, room] of Array.from(this.rooms.entries())) {
      if (
        room.connectionCount === 0 &&
        !room.isBusy &&
        now - room.lastActivity >= this.idleTimeoutMs
      ) {
        this.rooms.delete(roomId);
        room.destroy();
        evicted++;
      }
    }

    return evicted;
  }

  /**
   * Graceful shutdown: drains all in-flight persistence and cleanly destroys all rooms.
   */
  public async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Wait for in-flight persistence
    await this.persistenceService.drain(5000);

    // Destroy all active rooms
    for (const [roomId, room] of this.rooms) {
      try {
        room.destroy();
      } catch (err) {
        console.error(`Error destroying room ${roomId} during shutdown:`, err);
      }
    }
    this.rooms.clear();
  }

  public getStats() {
    return {
      activeRooms: this.activeRoomCount,
      activeConnections: this.totalActiveConnections,
      pendingPersistenceQueue: this.persistenceService.pendingQueueDepth,
      totalPersistedUpdates: this.persistenceService.totalPersisted,
      totalPersistenceFailures: this.persistenceService.totalFailures,
    };
  }
}
