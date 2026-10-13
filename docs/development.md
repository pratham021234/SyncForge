# SyncForge Local Development Guide

This guide provides instructions for setting up, running, testing, and troubleshooting the SyncForge collaboration infrastructure on Windows and Unix-compatible environments.

---

## 1. Prerequisites

Before running the project, verify that the following tools are installed:

- **Node.js:** v20.x or higher (Tested on Node v24.12.0)
- **npm:** v10.x or higher (Tested on npm 11.7.0)
- **Git:** Installed and available on system PATH
- **Docker Desktop:** Installed (for local PostgreSQL 16 and Redis 7 containers)

> **Windows PowerShell Execution Policy Note:**
> On Windows PowerShell, running `npm` directly might trigger an `UnauthorizedAccess` error due to script execution policies for `npm.ps1`.
> To prevent this, either run in **Windows CMD**, set your execution policy (`Set-ExecutionPolicy RemoteSigned -Scope CurrentUser`), or invoke `npm.cmd` explicitly in PowerShell:
>
> ```powershell
> npm.cmd install
> npm.cmd run dev
> ```

---

## 2. Quick Start

### Step 2.1 — Clone & Inspect Directory

Ensure your current directory is `D:\SyncForge`:

```cmd
cd /d D:\SyncForge
```

### Step 2.2 — Initialize Environment Variables

Copy the template configuration into `.env`:

```cmd
copy .env.example .env
```

### Step 2.3 — Install Dependencies

Run npm workspace installation from the repository root:

```cmd
npm.cmd install
```

---

## 3. Local Infrastructure (PostgreSQL & Redis)

SyncForge includes a pre-configured Docker Compose file in `infra/docker/docker-compose.yml` for local database and coordination caching.

### Start Local Infrastructure:

Ensure Docker Desktop is open and the daemon is running, then execute:

```cmd
npm.cmd run infra:up
```

_(Or via direct docker compose)_:

```cmd
docker compose -f infra/docker/docker-compose.yml up -d
```

### Inspect Container Status:

```cmd
docker compose -f infra/docker/docker-compose.yml ps
```

### Stream Infrastructure Logs:

```cmd
npm.cmd run infra:logs
```

### Stop Infrastructure:

```cmd
npm.cmd run infra:down
```

---

## 4. Database Migrations

Once PostgreSQL is running, apply the foundational database migrations:

### Check Migration Status:

```cmd
npm.cmd run db:status
```

### Apply Pending Migrations:

```cmd
npm.cmd run db:migrate
```

The migration runner records applied migrations and SHA-256 checksums in the `syncforge_migrations` table inside the `syncforge_dev` database.

---

## 5. Development Processes

SyncForge provides unified scripts in the root `package.json` using `concurrently`:

### Start All Services (Web + Server Concurrently):

```cmd
npm.cmd run dev
```

### Start Server Only:

Runs the Fastify backend on port `4000`:

```cmd
npm.cmd run dev:server
```

### Start Web Only:

Runs the Next.js frontend on port `3000`:

```cmd
npm.cmd run dev:web
```

---

## 6. Verification & Quality Checks

Run the following checks from the repository root to verify code quality:

| Check                         | Command (CMD / PowerShell)                                                |
| :---------------------------- | :------------------------------------------------------------------------ |
| **Check Code Formatting**     | `npm.cmd run format:check`                                                |
| **Fix Formatting**            | `npm.cmd run format`                                                      |
| **Lint Codebase**             | `npm.cmd run lint`                                                        |
| **Type Check All Packages**   | `npm.cmd run typecheck`                                                   |
| **Run Vitest Unit Tests**     | `npm.cmd run test`                                                        |
| **Run Integration Tests**     | `npm.cmd run test -- apps/server/src/__tests__/multi-client-sync.test.ts` |
| **Build All Packages & Apps** | `npm.cmd run build`                                                       |
| **Check Live API Health**     | `npm.cmd run health:check`                                                |

### 6.1 Test Suites Overview

SyncForge features a comprehensive test suite across the monorepo:

1. **Protocol & Binary Encoding (`packages/shared`):**
   - File: `packages/shared/src/__tests__/protocol.test.ts`
   - Validates discriminated union parsing, Zod schemas, error types, and lossless `bytesToBase64` / `base64ToBytes` conversions.
2. **SDK Room & Client (`packages/sdk`):**
   - Files: `packages/sdk/src/__tests__/room.test.ts`, `packages/sdk/src/__tests__/client.test.ts`
   - Validates `SyncForgeRoom` local vs remote Yjs observer isolation, connection state transitions, and reconnect handlers.
3. **CRDT Document Engine (`apps/server`):**
   - File: `apps/server/src/__tests__/document-engine.test.ts`
   - Validates state vector differential encoding, incremental updates, and snapshot compilation.
4. **Room Lifecycle & Concurrency (`apps/server`):**
   - File: `apps/server/src/__tests__/room-manager.test.ts`
   - Validates single-flight creation locks, broadcast exclusion, and idle room eviction.
5. **Persistence & Snapshot Compaction (`apps/server`):**
   - File: `apps/server/src/__tests__/persistence.test.ts`
   - Validates append-only update storage, restart recovery from snapshots and delta updates, and compaction.
6. **Multi-Client WebSocket Integration (`apps/server`):**
   - File: `apps/server/src/__tests__/multi-client-sync.test.ts`
   - Tests genuine concurrent peer edits across WebSockets, room tenant isolation, delta resynchronization after disconnect, and bidirectional synchronization.
7. **Canvas Schema Validation (`packages/shared`):**
   - File: `packages/shared/src/__tests__/canvas.test.ts`
   - Validates node types, coordinate boundaries, edge endpoints, and factories.
8. **Canvas Adapter & Scoped Undo/Redo (`packages/sdk`):**
   - File: `packages/sdk/src/__tests__/canvas-adapter.test.ts`
   - Tests node and edge transactions, cascade edge deletion on node remove, and guarantees that local undo does not revert remote peers.
9. **Multi-Client Canvas Collaboration (`apps/server`):**
   - File: `apps/server/src/__tests__/canvas-collaboration.test.ts`
   - Real WebSocket integration verifying concurrent node creation convergence, live presence and cursor awareness broadcasts, and canvas state recovery after reconnect.

---

## 7. WebSocket Collaboration Testing & Integration

### 7.1 Running the Collaboration Gateway Locally

1. Start the Fastify backend:
   ```cmd
   npm.cmd run dev:server
   ```
2. The WebSocket gateway will listen at:
   ```text
   ws://localhost:4000/ws/collaborate?token=dev-token-project-1&clientId=dev-client-1
   ```

### 7.2 Connecting from Client Applications

Using `@syncforge/sdk`:

```typescript
import { SyncForgeClient } from '@syncforge/sdk';

const client = new SyncForgeClient({
  url: 'ws://localhost:4000/ws/collaborate',
  token: 'dev-token-project-1',
  clientId: 'user-alice',
  reconnect: {
    maxAttempts: 10,
    initialDelayMs: 500,
    maxDelayMs: 5000,
  },
});

// Join collaborative room
const room = client.joinRoom('whiteboard-session-1');

// Listen to room lifecycle
room.onStatusChange((status) => {
  console.log('Room status:', status); // 'connecting' | 'syncing' | 'ready' | 'disconnected'
});

// Access shared Yjs data structures
const sharedMap = room.doc.getMap('elements');
sharedMap.set('shape-1', { type: 'rectangle', x: 100, y: 150 });
```

### 7.3 Opening the Collaborative Canvas in Two Browser Sessions

To experience live multi-user collaboration and real-time cursor awareness:

1. **Start the Fastify Backend & Next.js Frontend:**

   ```cmd
   npm.cmd run dev
   ```

   _(Backend starts on `http://localhost:4000`, Frontend starts on `http://localhost:3000`)_

2. **Open Window A (Browser 1):**
   - Navigate to `http://localhost:3000/rooms/project_architecture_01`.
   - In the top-right participant badge, set your name to "Alice" and choose a color (e.g. Emerald).
   - Click "Note" on the bottom toolbar to add a sticky note and write text.

3. **Open Window B (Browser 2 or Incognito Window):**
   - Navigate to the same URL: `http://localhost:3000/rooms/project_architecture_01`.
   - In the top-right participant badge, set your name to "Bob" and choose a different color (e.g. Amber).

4. **Observe Real-Time Collaboration:**
   - Both windows will display an active participant count of `2 online` in the top roster.
   - Moving your mouse in Window A renders a live pointer with Alice's name tag in Window B.
   - Modifying text or dragging shapes in Window B updates Window A instantly via Yjs CRDTs.
   - Pressing `Ctrl+Z` in Window A undoes only Alice's actions, leaving Bob's modifications intact.

---

## 8. Troubleshooting Common Errors

### 8.1 "failed to connect to the docker API ... daemon is not running"

- **Cause:** Docker Desktop is installed, but the background engine is paused or not started.
- **Resolution:** Launch the Docker Desktop application from the Windows Start menu. Wait for the whale icon in the taskbar to show "Docker Desktop running". Then rerun `npm.cmd run infra:up`.
- **Note:** Independent unit tests and frontend builds do NOT require Docker to run.

### 8.2 WebSocket Connection Closes with Code 4001 (Unauthorized)

- **Cause:** Missing or invalid authentication token passed in connection parameters or handshake.
- **Resolution:** Provide a valid token (`dev-token-...`, `sf_live_...`, or Bearer token) in the client constructor or query string.

### 8.3 WebSocket Connection Closes with Code 4004 (Room Not Found / Invalid Format)

- **Cause:** Room identifier does not match standard regex `/^[a-zA-Z0-9_-]{3,64}$/`.
- **Resolution:** Verify room IDs contain only letters, numbers, underscores, and dashes, with lengths between 3 and 64 characters.

### 8.4 WebSocket Rate Limit (Code 4005) or Max Payload (Code 4006)

- **Cause:** Client exceeded the maximum message throughput (> 100 messages/sec) or sent a single frame exceeding 64KB (`65536 bytes`).
- **Resolution:** Throttle high-frequency events (e.g. pointer moves) using micro-batching and ensure document snapshots are split if sending large custom binary data.

### 8.5 Port 4000 or 3000 Already in Use

- **Check occupied ports on Windows:**
  ```cmd
  netstat -ano | findstr :4000
  netstat -ano | findstr :3000
  ```
- **Kill conflicting process by PID:**
  ```cmd
  taskkill /PID <PID> /F
  ```
- **Alternative:** Change `SERVER_PORT` or `PORT` in your `.env` file.

### 8.6 TypeScript Project Reference Errors

- Ensure you have built shared packages before typechecking standalone applications:
  ```cmd
  npm.cmd run build:packages
  ```

---

## 9. External Consumer Reference Fixture & Packaging Inspection

### 9.1 Running the Standalone External Consumer Script

A standalone reference application demonstrating public SDK consumption is available in `examples/external-consumer`:

```cmd
npx tsx examples/external-consumer/src/index.ts
```

### 9.2 Inspecting the Built Package Tarball

Verify what files would be packaged for npm publication without actually publishing:

```cmd
npm.cmd run package:inspect --workspace=@syncforge/sdk
```
