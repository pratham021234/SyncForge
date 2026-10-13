# Changelog

All notable changes to `@syncforge/sdk` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-10-13

### Added

- **Core Client**: `SyncForgeClient` with universal WebSocket support (browser & Node.js).
- **Authentication**: Dynamic `getToken` async callback and static `token` / `apiKey` support.
- **Connection Ergonomics**: Synonym `endpoint` for `serverUrl`.
- **Room Management**: `SyncForgeRoom` with `room.document` / `room.doc` access and multi-room management.
- **Lifecycle Events**: Typed `.on()` and `.off()` event subscriptions for `'status'`, `'connected'`, `'synced'`, `'presence'`, `'error'`.
- **Ephemeral Awareness**: `y-protocols/awareness` transport with live cursor tracking and peer roster.
- **Resilience**: Bounded exponential backoff with jitter and reconnection cancellation during disposal.
- **React 19 Integration**: Subpath export `@syncforge/sdk/react` providing:
  - `<SyncForgeProvider>` and `useSyncForgeClient`
  - `useSyncForgeRoom` (StrictMode safe)
  - `useSyncForgePresence`
  - `useSyncForgeStatus`
- **Canvas CRDT Adapter**: `SyncForgeCanvasAdapter` binding Yjs shared state to diagram node/edge graphs with scoped undo/redo.
- **Error Hierarchy**: `SyncForgeError`, `ConnectionError`, `AuthenticationError`, `AuthorizationError`, `RoomError`, `ConfigurationError`.
- **Self-Contained Packaging**: Standalone ESM (`dist/index.js`) and CJS (`dist/index.cjs`) bundles with bundled shared protocol schemas.
