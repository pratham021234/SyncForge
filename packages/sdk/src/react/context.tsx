import { createContext, useContext, ReactNode } from 'react';
import { SyncForgeClient } from '../client.js';

const SyncForgeContext = createContext<SyncForgeClient | null>(null);

export interface SyncForgeProviderProps {
  client: SyncForgeClient;
  children: ReactNode;
}

/**
 * Provides a SyncForgeClient instance to the React component tree.
 */
export function SyncForgeProvider({ client, children }: SyncForgeProviderProps) {
  return <SyncForgeContext.Provider value={client}>{children}</SyncForgeContext.Provider>;
}

/**
 * Hook to access the current SyncForgeClient instance from React context.
 */
export function useSyncForgeClient(): SyncForgeClient {
  const client = useContext(SyncForgeContext);
  if (!client) {
    throw new Error('useSyncForgeClient must be used within a <SyncForgeProvider>');
  }
  return client;
}
