import { useState, useEffect } from 'react';
import { SyncForgeClient } from '../client.js';
import { SyncForgeRoom } from '../room.js';
import { ConnectionState, RoomStatus } from '../types.js';
import { useSyncForgeClient } from './context.js';

/**
 * Hook to subscribe to connection status of a client or sync status of a room.
 */
export function useSyncForgeStatus(
  target?: SyncForgeClient | SyncForgeRoom | null,
): ConnectionState | RoomStatus {
  // If no target provided, attempt to use client from context
  let fallbackClient: SyncForgeClient | null = null;
  try {
    fallbackClient = useSyncForgeClient();
  } catch {
    // ignore outside provider
  }

  const effectiveTarget = target ?? fallbackClient;

  const getInitialState = (): ConnectionState | RoomStatus => {
    if (!effectiveTarget) return 'disconnected';
    if (effectiveTarget instanceof SyncForgeRoom) {
      return effectiveTarget.status;
    }
    return effectiveTarget.connectionState;
  };

  const [status, setStatus] = useState<ConnectionState | RoomStatus>(getInitialState);

  useEffect(() => {
    if (!effectiveTarget) {
      setStatus('disconnected');
      return;
    }

    if (effectiveTarget instanceof SyncForgeRoom) {
      setStatus(effectiveTarget.status);
      const unsub = effectiveTarget.on('status', (newStatus) => {
        setStatus(newStatus);
      });
      return unsub;
    } else {
      setStatus(effectiveTarget.connectionState);
      const unsub = effectiveTarget.on('status', (newState) => {
        setStatus(newState);
      });
      return unsub;
    }
  }, [effectiveTarget]);

  return status;
}
