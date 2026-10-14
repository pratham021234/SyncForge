import * as Y from 'yjs';
import {
  Awareness,
  encodeAwarenessUpdate,
  applyAwarenessUpdate,
  removeAwarenessStates,
} from 'y-protocols/awareness';
import { RoomId, UserPresence } from '@syncforge/shared';
import {
  RoomSession,
  RoomStatus,
  RoomStatusListener,
  PresenceListener,
  UnsubscribeFn,
  RoomEvent,
} from './types.js';

export interface RoomTransport {
  sendDocUpdate(roomId: string, update: Uint8Array): void;
  sendSyncStep1(roomId: string, stateVector: Uint8Array): void;
  sendSyncStep2(roomId: string, update: Uint8Array): void;
  sendLeaveRoom(roomId: string): void;
  sendAwareness(roomId: string, awarenessUpdate: Uint8Array): void;
}

export class SyncForgeRoom implements RoomSession {
  public readonly roomId: RoomId;
  public readonly doc: Y.Doc;
  public readonly awareness: Awareness;
  private currentStatus: RoomStatus = 'connecting';
  private statusListeners = new Set<RoomStatusListener>();
  private presenceListeners = new Set<PresenceListener>();
  private syncedListeners = new Set<() => void>();
  private errorListeners = new Set<(err: Error) => void>();
  private updateHandler: (update: Uint8Array, origin: unknown) => void;
  private awarenessUpdateHandler: (
    changes: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => void;
  private awarenessChangeHandler: () => void;
  private isDestroyed = false;

  constructor(
    roomId: RoomId,
    private transport: RoomTransport,
    existingDoc?: Y.Doc,
  ) {
    this.roomId = roomId;
    this.doc = existingDoc ?? new Y.Doc();
    this.awareness = new Awareness(this.doc);

    // Register local document change listener
    this.updateHandler = (update: Uint8Array, origin: unknown) => {
      // Only broadcast updates originating from local user edits
      if (origin !== 'remote' && origin !== 'sync' && !this.isDestroyed) {
        this.transport.sendDocUpdate(this.roomId, update);
      }
    };
    this.doc.on('update', this.updateHandler);

    // Register awareness update handler (encodes and sends wire updates)
    this.awarenessUpdateHandler = ({ added, updated, removed }, origin) => {
      if (origin !== 'remote' && !this.isDestroyed) {
        const changedClients = added.concat(updated).concat(removed);
        if (changedClients.length > 0) {
          const awarenessBytes = encodeAwarenessUpdate(this.awareness, changedClients);
          this.transport.sendAwareness(this.roomId, awarenessBytes);
        }
      }
    };
    this.awareness.on('update', this.awarenessUpdateHandler);

    // Register awareness change listener (notifies UI subscribers of peer changes)
    this.awarenessChangeHandler = () => {
      this.notifyPresenceListeners();
    };
    this.awareness.on('change', this.awarenessChangeHandler);
  }

  /**
   * Alias for `doc` for developer ergonomics (e.g. `const doc = room.document;`).
   */
  public get document(): Y.Doc {
    return this.doc;
  }

  public get status(): RoomStatus {
    return this.currentStatus;
  }

  public get isJoined(): boolean {
    return this.currentStatus === 'synced' || this.currentStatus === 'syncing';
  }

  public get isSynced(): boolean {
    return this.currentStatus === 'synced';
  }

  public get peers(): UserPresence[] {
    return this.getPresence();
  }

  public onStatusChange(listener: RoomStatusListener): UnsubscribeFn {
    this.statusListeners.add(listener);
    listener(this.currentStatus);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  public setStatus(newStatus: RoomStatus): void {
    if (this.currentStatus === newStatus || this.isDestroyed) return;
    this.currentStatus = newStatus;

    if (newStatus === 'synced') {
      for (const listener of this.syncedListeners) {
        try {
          listener();
        } catch (err) {
          console.error(`[SyncForgeRoom] Error in synced listener for ${this.roomId}:`, err);
        }
      }
    }

    for (const listener of this.statusListeners) {
      try {
        listener(newStatus);
      } catch (err) {
        console.error(`[SyncForgeRoom] Error in status listener for ${this.roomId}:`, err);
      }
    }
  }

  public emitError(err: Error): void {
    if (this.isDestroyed) return;
    for (const listener of this.errorListeners) {
      try {
        listener(err);
      } catch (listenerErr) {
        console.error(`[SyncForgeRoom] Error in error listener for ${this.roomId}:`, listenerErr);
      }
    }
  }

  public onPresenceChange(listener: PresenceListener): UnsubscribeFn {
    this.presenceListeners.add(listener);
    listener(this.getPresence());
    return () => {
      this.presenceListeners.delete(listener);
    };
  }

  public on(event: 'status', listener: (status: RoomStatus) => void): UnsubscribeFn;
  public on(event: 'synced', listener: () => void): UnsubscribeFn;
  public on(event: 'presence', listener: (peers: UserPresence[]) => void): UnsubscribeFn;
  public on(event: 'error', listener: (err: Error) => void): UnsubscribeFn;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public on(event: RoomEvent, listener: (...args: any[]) => void): UnsubscribeFn {
    switch (event) {
      case 'status': {
        const fn = listener as (status: RoomStatus) => void;
        this.statusListeners.add(fn);
        fn(this.currentStatus);
        return () => this.statusListeners.delete(fn);
      }
      case 'synced': {
        const fn = listener as () => void;
        this.syncedListeners.add(fn);
        if (this.isSynced) {
          fn();
        }
        return () => this.syncedListeners.delete(fn);
      }
      case 'presence': {
        const fn = listener as (peers: UserPresence[]) => void;
        this.presenceListeners.add(fn);
        fn(this.getPresence());
        return () => this.presenceListeners.delete(fn);
      }
      case 'error': {
        const fn = listener as (err: Error) => void;
        this.errorListeners.add(fn);
        return () => this.errorListeners.delete(fn);
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public off(event: RoomEvent, listener: (...args: any[]) => void): void {
    switch (event) {
      case 'status':
        this.statusListeners.delete(listener as RoomStatusListener);
        break;
      case 'synced':
        this.syncedListeners.delete(listener as () => void);
        break;
      case 'presence':
        this.presenceListeners.delete(listener as PresenceListener);
        break;
      case 'error':
        this.errorListeners.delete(listener as (err: Error) => void);
        break;
    }
  }

  private notifyPresenceListeners(): void {
    if (this.isDestroyed) return;
    const peers = this.getPresence();
    for (const listener of this.presenceListeners) {
      try {
        listener(peers);
      } catch (err) {
        console.error(`[SyncForgeRoom] Error in presence listener for ${this.roomId}:`, err);
      }
    }
  }

  public getPresence(): UserPresence[] {
    const peers: UserPresence[] = [];
    const states = this.awareness.getStates();

    for (const [clientId, state] of states.entries()) {
      if (!state || typeof state !== 'object') continue;
      const userState = (state as Record<string, unknown>).user as
        Partial<UserPresence> | undefined;
      const cursor = (state as Record<string, unknown>).cursor as
        { x: number; y: number } | undefined;
      const lastActive =
        typeof (state as Record<string, unknown>).lastActive === 'number'
          ? ((state as Record<string, unknown>).lastActive as number)
          : Date.now();

      peers.push({
        userId: userState?.userId ?? `client_${clientId}`,
        userName: userState?.userName ?? `Collaborator ${clientId % 1000}`,
        color: userState?.color ?? '#6366f1',
        cursor: cursor ?? userState?.cursor,
        lastActive,
        metadata: userState?.metadata,
      });
    }

    return peers;
  }

  public updatePresence(presence: Partial<UserPresence>): void {
    if (this.isDestroyed) return;
    const currentState = (this.awareness.getLocalState() as Record<string, unknown> | null) ?? {};
    const currentUser = (currentState.user as Partial<UserPresence> | undefined) ?? {};

    const updatedUser: UserPresence = {
      userId: presence.userId ?? currentUser.userId ?? `client_${this.awareness.clientID}`,
      userName: presence.userName ?? currentUser.userName ?? 'Anonymous Collaborator',
      color: presence.color ?? currentUser.color ?? '#6366f1',
      cursor: presence.cursor !== undefined ? presence.cursor : currentUser.cursor,
      lastActive: Date.now(),
      metadata: { ...(currentUser.metadata ?? {}), ...(presence.metadata ?? {}) },
    };

    this.awareness.setLocalState({
      user: updatedUser,
      cursor: presence.cursor !== undefined ? presence.cursor : currentState.cursor,
      lastActive: Date.now(),
    });
  }

  /**
   * Applies an incremental remote update received from the server.
   */
  public handleRemoteUpdate(update: Uint8Array): void {
    if (this.isDestroyed) return;
    Y.applyUpdate(this.doc, update, 'remote');
  }

  /**
   * Applies a sync_step2 diff update received from the server.
   */
  public handleSyncStep2(update: Uint8Array): void {
    if (this.isDestroyed) return;
    if (update.length > 0) {
      Y.applyUpdate(this.doc, update, 'sync');
    }
    this.setStatus('synced');
  }

  /**
   * Applies an ephemeral awareness update received from the server.
   */
  public handleRemoteAwareness(update: Uint8Array): void {
    if (this.isDestroyed) return;
    applyAwarenessUpdate(this.awareness, update, 'remote');
  }

  /**
   * Re-synchronizes document state with server after reconnection.
   */
  public synchronizeState(): void {
    if (this.isDestroyed) return;
    this.setStatus('syncing');
    const stateVector = Y.encodeStateVector(this.doc);
    this.transport.sendSyncStep1(this.roomId, stateVector);

    // Re-announce local awareness state
    const awUpdate = encodeAwarenessUpdate(this.awareness, [this.awareness.clientID]);
    if (awUpdate.length > 0) {
      this.transport.sendAwareness(this.roomId, awUpdate);
    }
  }

  public async leave(): Promise<void> {
    if (this.isDestroyed) return;
    removeAwarenessStates(this.awareness, [this.awareness.clientID], 'local');
    this.transport.sendLeaveRoom(this.roomId);
    this.destroy();
  }

  public destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    this.setStatus('disconnected');
    this.doc.off('update', this.updateHandler);
    this.awareness.off('update', this.awarenessUpdateHandler);
    this.awareness.off('change', this.awarenessChangeHandler);
    removeAwarenessStates(this.awareness, [this.awareness.clientID], 'local');
    this.statusListeners.clear();
    this.presenceListeners.clear();
    this.syncedListeners.clear();
    this.errorListeners.clear();
    this.awareness.destroy();
    this.doc.destroy();
  }
}
