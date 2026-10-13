import { useState, useEffect, useRef } from 'react';
import * as Y from 'yjs';
import { SyncForgeRoom } from '../room.js';
import { RoomStatus } from '../types.js';
import { useSyncForgeClient } from './context.js';

export interface UseSyncForgeRoomOptions {
  autoJoin?: boolean;
}

export interface UseSyncForgeRoomResult {
  room: SyncForgeRoom | null;
  doc: Y.Doc | null;
  status: RoomStatus;
  isSynced: boolean;
  error: Error | null;
}

/**
 * Hook to manage a collaborative room session within React.
 * Designed to safely handle React 19 / StrictMode mount/unmount lifecycles without leaking connections.
 */
export function useSyncForgeRoom(
  roomId: string | null | undefined,
  options: UseSyncForgeRoomOptions = {},
): UseSyncForgeRoomResult {
  const client = useSyncForgeClient();
  const autoJoin = options.autoJoin ?? true;

  const [room, setRoom] = useState<SyncForgeRoom | null>(null);
  const [status, setStatus] = useState<RoomStatus>('disconnected');
  const [error, setError] = useState<Error | null>(null);

  const activeRoomRef = useRef<SyncForgeRoom | null>(null);

  useEffect(() => {
    if (!roomId || !autoJoin) {
      setRoom(null);
      setStatus('disconnected');
      setError(null);
      return;
    }

    let isDisposed = false;
    let currentRoom: SyncForgeRoom | null = null;

    setStatus('connecting');
    setError(null);

    client
      .joinRoom(roomId)
      .then((joinedRoom) => {
        if (isDisposed) {
          // Unmounted before join resolved - leave immediately
          void joinedRoom.leave();
          return;
        }

        currentRoom = joinedRoom;
        activeRoomRef.current = joinedRoom;
        setRoom(joinedRoom);
        setStatus(joinedRoom.status);

        // Subscribe to status updates
        const unsubStatus = joinedRoom.on('status', (newStatus) => {
          if (!isDisposed) {
            setStatus(newStatus);
          }
        });

        // Subscribe to errors
        const unsubError = joinedRoom.on('error', (err) => {
          if (!isDisposed) {
            setError(err);
          }
        });

        return () => {
          unsubStatus();
          unsubError();
        };
      })
      .catch((err: Error) => {
        if (!isDisposed) {
          setError(err);
          setStatus('failed');
        }
      });

    return () => {
      isDisposed = true;
      if (currentRoom) {
        void currentRoom.leave();
        activeRoomRef.current = null;
      }
    };
  }, [client, roomId, autoJoin]);

  return {
    room,
    doc: room ? room.doc : null,
    status,
    isSynced: status === 'synced',
    error,
  };
}
