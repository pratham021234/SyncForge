# @syncforge/sdk

Official TypeScript client SDK for **SyncForge**: real-time collaboration infrastructure powered by Yjs CRDTs and WebSockets.

## Features

- **Document Synchronization**: Conflict-free, real-time shared state backed by Yjs (`Y.Doc`, `Y.Map`, `Y.Array`, `Y.Text`).
- **Live Awareness & Cursors**: Ephemeral presence, cursor tracking, and peer state with `y-protocols/awareness`.
- **Network Resilience**: Bounded exponential reconnect backoff with jitter and automatic missed-update catchup.
- **Multi-Room Support**: Connect to and manage multiple independent rooms simultaneously.
- **React 19 Integration**: Zero-boilerplate hooks (`useSyncForgeRoom`, `useSyncForgePresence`, `useSyncForgeStatus`) with StrictMode safety.
- **Universal Runtime**: Works in browsers, Next.js, Vite, Node.js, and Edge environments.

## Installation

```bash
npm install @syncforge/sdk yjs
```

## Quick Start (Core SDK)

```typescript
import { SyncForgeClient } from '@syncforge/sdk';

// 1. Initialize client with authentication
const client = new SyncForgeClient({
  endpoint: 'ws://localhost:4000/ws/collaborate',
  getToken: async () => 'your-auth-token-or-dev-token',
  autoConnect: true,
});

// 2. Join a room
const room = await client.joinRoom('project-canvas-101');

// 3. Access shared Yjs document
const doc = room.document;
const nodesMap = doc.getMap('canvas_nodes');

// 4. Listen for synchronization completion
room.on('synced', () => {
  console.log('Room is fully synchronized with server');
});

// 5. Broadcast ephemeral presence
room.updatePresence({
  userName: 'Alice',
  color: '#3B82F6',
  cursor: { x: 120, y: 340 },
});

// 6. Clean up on teardown
await room.leave();
await client.disconnect();
```

## React Integration

```tsx
import { SyncForgeProvider, useSyncForgeRoom, useSyncForgePresence } from '@syncforge/sdk/react';
import { SyncForgeClient } from '@syncforge/sdk';

const client = new SyncForgeClient({
  endpoint: process.env.NEXT_PUBLIC_SYNCFORGE_WS_URL!,
  getToken: async () => fetchSessionToken(),
});

function CollaborativeApp() {
  return (
    <SyncForgeProvider client={client}>
      <Workspace roomId="design-sprint" />
    </SyncForgeProvider>
  );
}

function Workspace({ roomId }: { roomId: string }) {
  const { doc, status, isSynced } = useSyncForgeRoom(roomId);
  const { peers, updatePresence } = useSyncForgePresence(room);

  if (!isSynced) {
    return <div>Connecting to room... ({status})</div>;
  }

  return (
    <div>
      <p>Active Collaborators: {peers.length}</p>
      {/* Mutate or render doc shared types */}
    </div>
  );
}
```

## Documentation

Full architectural guides, protocol specifications, and security policies are available in the [SyncForge Documentation](https://github.com/pratham021234/SyncForge).

## License

MIT
