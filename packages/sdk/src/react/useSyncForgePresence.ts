import { useState, useEffect, useCallback } from 'react';
import { UserPresence } from '@syncforge/shared';
import { SyncForgeRoom } from '../room.js';

export interface UseSyncForgePresenceResult {
  peers: UserPresence[];
  updatePresence: (presence: Partial<UserPresence>) => void;
}

/**
 * Hook to subscribe to and publish real-time presence/awareness states for a room.
 */
export function useSyncForgePresence(
  room: SyncForgeRoom | null | undefined,
): UseSyncForgePresenceResult {
  const [peers, setPeers] = useState<UserPresence[]>(room ? room.getPresence() : []);

  useEffect(() => {
    if (!room) {
      setPeers([]);
      return;
    }

    setPeers(room.getPresence());
    const unsub = room.on('presence', (updatedPeers) => {
      setPeers(updatedPeers);
    });

    return () => {
      unsub();
    };
  }, [room]);

  const updatePresence = useCallback(
    (presence: Partial<UserPresence>) => {
      if (room) {
        room.updatePresence(presence);
      }
    },
    [room],
  );

  return { peers, updatePresence };
}
