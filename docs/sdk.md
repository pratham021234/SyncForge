# SyncForge Client SDK Documentation (`@syncforge/sdk`)

The `@syncforge/sdk` package is the official TypeScript library connecting client applications to SyncForge collaboration infrastructure. It provides conflict-free Yjs document synchronization, real-time awareness/presence, connection resilience, and React 19 bindings.

---

## 1. Installation

Install `@syncforge/sdk` and `yjs` from npm or your local repository:

```bash
npm install @syncforge/sdk yjs
```

Peer dependencies for React applications:

```bash
npm install react react-dom
```

---

## 2. Public API Architecture

The SDK is published in dual module formats with zero private monorepo dependencies:

- **ESM Entrypoint**: `@syncforge/sdk` (`dist/index.js`)
- **CommonJS Entrypoint**: `@syncforge/sdk` (`dist/index.cjs`)
- **React Subpath**: `@syncforge/sdk/react` (`dist/react/index.js`, `dist/react/index.cjs`)
- **TypeScript Declarations**: Fully bundled `.d.ts` definitions.

---

## 3. Core SDK Quick Start

```typescript
import { SyncForgeClient } from '@syncforge/sdk';

// 1. Initialize client with server URL and dynamic auth token
const client = new SyncForgeClient({
  endpoint: 'ws://127.0.0.1:4000/ws/collaborate',
  getToken: async () => {
    // Fetch short-lived session JWT from your auth provider
    const res = await fetch('/api/auth/syncforge-token');
    const { token } = await res.json();
    return token;
  },
  autoConnect: true,
});

// 2. Subscribe to client connection events
client.on('status', (state) => {
  console.log('Client connection state:', state); // 'connecting' | 'connected' | 'reconnecting' | 'failed' | 'disconnected'
});

client.on('error', (err) => {
  console.error('SyncForge client error:', err);
});

// 3. Join a collaborative room
async function startSession() {
  const room = await client.joinRoom('design-workspace-101');

  // 4. Access shared Yjs document
  const doc = room.document;
  const sharedMap = doc.getMap<string>('project_metadata');

  // Observe remote mutations
  sharedMap.observe((event) => {
    console.log('Keys modified by peers:', Array.from(event.keys.keys()));
  });

  // Mutate local state (automatically broadcasted & persisted)
  sharedMap.set('title', 'Q4 Product Roadmap');

  // 5. Track room synchronization state
  room.on('synced', () => {
    console.log('Room is fully converged with server');
  });

  // 6. Broadcast live presence and cursor coordinates
  room.updatePresence({
    userName: 'Alice',
    color: '#3B82F6',
    cursor: { x: 250, y: 140 },
  });

  room.on('presence', (peers) => {
    console.log(
      `Active collaborators (${peers.length}):`,
      peers.map((p) => p.userName),
    );
  });

  // 7. Clean teardown on exit
  // await room.leave();
  // await client.disconnect();
}

startSession();
```

---

## 4. API Reference

### `SyncForgeClient`

#### Constructor

```typescript
new SyncForgeClient(options: SyncForgeClientOptions)
```

| Option                   | Type                              | Default        | Description                                             |
| :----------------------- | :-------------------------------- | :------------- | :------------------------------------------------------ |
| `endpoint` / `serverUrl` | `string`                          | _(Required)_   | Collaboration server URL (`ws://...`, `http://...`)     |
| `getToken`               | `() => Promise<string> \| string` | `undefined`    | Dynamic token callback invoked on connect and reconnect |
| `token` / `apiKey`       | `string`                          | `undefined`    | Static auth token or service API key                    |
| `clientId`               | `string`                          | auto-generated | Unique client instance ID                               |
| `autoConnect`            | `boolean`                         | `false`        | Automatically connect on creation                       |
| `reconnectAttempts`      | `number`                          | `10`           | Max reconnection retries before entering `'failed'`     |
| `reconnectDelayMs`       | `number`                          | `500`          | Initial exponential backoff delay (ms)                  |
| `maxReconnectDelayMs`    | `number`                          | `10000`        | Maximum backoff delay cap (ms)                          |
| `timeoutMs`              | `number`                          | `10000`        | Handshake and join timeout limit (ms)                   |
| `webSocket`              | `typeof WebSocket`                | universal      | Custom WebSocket class (for Node.js or mocks)           |

#### Methods

- `connect(): Promise<void>`: Establishes the WebSocket connection and completes protocol handshake.
- `joinRoom(roomId: string, options?: JoinRoomOptions): Promise<SyncForgeRoom>`: Joins room and returns room handle.
- `getRoom(roomId: string): SyncForgeRoom | undefined`: Retrieves an active room session.
- `getActiveRooms(): SyncForgeRoom[]`: Returns all currently open room sessions.
- `leaveRoom(roomId: string): Promise<void>`: Leaves room, broadcasts departure, and destroys local state.
- `disconnect(): Promise<void>`: Explicit client disconnection. Disables automatic reconnection.
- `destroy(): void`: Disposes all open rooms, socket connections, and event listeners.
- `on(event, listener): UnsubscribeFn`: Subscribes to `'status'`, `'connected'`, `'disconnected'`, `'error'`.
- `off(event, listener): void`: Unsubscribes from client lifecycle events.

---

### `SyncForgeRoom`

#### Properties

- `room.document`: Standard `Y.Doc` CRDT root instance (alias for `room.doc`).
- `room.status`: Room synchronization state (`'connecting'` | `'syncing'` | `'synced'` | `'failed'` | `'disconnected'`).
- `room.isSynced`: `boolean` indicating if local state is converged with the server.
- `room.isJoined`: `boolean` indicating if the room session is active.
- `room.awareness`: Direct access to underlying `y-protocols/awareness` Awareness instance.
- `room.peers`: Array of current active `UserPresence` peer records.

#### Methods

- `on('synced', () => void): UnsubscribeFn`: Fires when synchronization with the server completes.
- `on('status', (status) => void): UnsubscribeFn`: Fires on room lifecycle changes.
- `on('presence', (peers) => void): UnsubscribeFn`: Fires when peers join, leave, or update cursors.
- `on('error', (err) => void): UnsubscribeFn`: Fires on room-specific operational errors.
- `updatePresence(presence: Partial<UserPresence>): void`: Broadcasts local ephemeral state.
- `getPresence(): UserPresence[]`: Returns active peer roster.
- `leave(): Promise<void>`: Unregisters awareness, notifies server, and disposes local resources.
- `destroy(): void`: Internal teardown of listeners, awareness, and `Y.Doc`.

---

## 5. React Integration (`@syncforge/sdk/react`)

```tsx
import {
  SyncForgeProvider,
  useSyncForgeClient,
  useSyncForgeRoom,
  useSyncForgePresence,
  useSyncForgeStatus,
} from '@syncforge/sdk/react';
import { SyncForgeClient } from '@syncforge/sdk';

const client = new SyncForgeClient({
  endpoint: process.env.NEXT_PUBLIC_SYNCFORGE_WS_URL || 'ws://127.0.0.1:4000/ws/collaborate',
  getToken: async () => obtainUserToken(),
});

export function App() {
  return (
    <SyncForgeProvider client={client}>
      <CollaborativeBoard roomId="design-sprint-2026" />
    </SyncForgeProvider>
  );
}

function CollaborativeBoard({ roomId }: { roomId: string }) {
  // Safe across React 19 / StrictMode mount/unmount cycles
  const { room, doc, status, isSynced, error } = useSyncForgeRoom(roomId);
  const { peers, updatePresence } = useSyncForgePresence(room);
  const connectionState = useSyncForgeStatus();

  if (error) {
    return <div className="error">Failed to join room: {error.message}</div>;
  }

  if (!isSynced) {
    return (
      <div>
        Connecting... (Room: {status}, Network: {connectionState})
      </div>
    );
  }

  return (
    <div
      onPointerMove={(e) => {
        updatePresence({ cursor: { x: e.clientX, y: e.clientY } });
      }}
    >
      <header>Active Users: {peers.length}</header>
      {/* Mutate or render shared doc */}
    </div>
  );
}
```

---

## 6. Error Handling Hierarchy

All SDK errors inherit from `SyncForgeError`:

```
SyncForgeError
├── ConfigurationError     (Invalid endpoint URL, missing options)
├── ConnectionError        (Network drop, WebSocket construction failure, timeout)
├── AuthenticationError    (Expired token, invalid credentials - HTTP 401 / code 4001)
├── AuthorizationError     (Insufficient room permissions - HTTP 403 / code 4003)
└── RoomError              (Invalid room ID schema, room capacity exceeded)
```

Permanent authentication or authorization errors automatically halt reconnection attempts to prevent infinite request hammering.

---

## 7. External Consumer Fixture

A standalone reference fixture consuming `@syncforge/sdk` via its public interface is located at [`examples/external-consumer/`](file:///d:/SyncForge/examples/external-consumer/).

Run the demo against a running local server:

```powershell
npx tsx examples/external-consumer/src/index.ts
```
