# SyncForge

> Real-time collaboration infrastructure that developers can integrate into their applications.

SyncForge gives software engineers reusable infrastructure to embed synchronized shared state, collaborative documents, live cursors, presence, and interactive canvases without building custom distributed synchronization backends from scratch.

---

## 1. The Problem We Solve

Developers building collaborative applications face difficult distributed systems challenges:

- **Concurrent Edits & Lost Updates:** Multiple users modifying state simultaneously can overwrite each other's changes without formal conflict-free convergence.
- **State Recovery & Reconnection:** Handling drops in network connectivity, tab sleep, or server restarts without state divergence or data loss.
- **Presence & Cursor Performance:** Broadcasting high-frequency pointer movements without causing network or database bottlenecks.
- **Room Lifecycle Management:** Isolating tenant sessions, enforcing authorization, and tearing down idle document states cleanly.

SyncForge resolves these challenges with a unified architecture powered by **Yjs CRDTs**, **Fastify**, **PostgreSQL**, **Redis**, and a clean **TypeScript Client SDK**.

---

## 2. Monorepo Structure

```text
SyncForge/
├── apps/
│   ├── web/                     # Next.js 15 developer portal, console shell, and demo
│   └── server/                  # Fastify 5 backend, health probes, and WS collaboration gateway
├── packages/
│   ├── sdk/                     # Public TypeScript client SDK (@syncforge/sdk)
│   └── shared/                  # Shared protocol schemas, types, and constants (@syncforge/shared)
├── infra/
│   └── docker/                  # Docker Compose for PostgreSQL 16 & Redis 7
├── docs/
│   ├── architecture.md          # Comprehensive system topology & CRDT sequence diagrams
│   ├── development.md           # Local Windows setup and command reference
│   ├── protocol.md              # WebSocket frame format, schemas, and close codes
│   ├── sdk.md                   # Client SDK guide, API reference, and examples
│   ├── security.md              # Threat model and security baseline
│   └── roadmap.md               # 7-phase implementation milestones
├── scripts/
│   ├── health-check.mjs         # Node script for probing /healthz and /readyz
├── .github/
│   └── workflows/ci.yml         # Continuous integration workflow
├── .env.example                 # Documented environment template
└── package.json                 # Monorepo workspaces and scripts
```

---

## 3. Technology Stack

- **Frontend:** Next.js 15 (App Router), React 19, Tailwind CSS, Lucide Icons.
- **Backend:** Node.js 24, Fastify 5, Pino logger, Zod schema validation, `@fastify/websocket`.
- **CRDT Engine (Implemented Phase 1):** Yjs for conflict-free state resolution, state vectors, and delta encoding.
- **Database:** PostgreSQL 16 with custom transactional SQL migration runner and bytea snapshot storage.
- **Cache & Coordination:** Redis 7 Alpine for multi-instance pub/sub and high-frequency presence.
- **Tooling & Quality:** TypeScript 5 (Strict Mode), Vitest, ESLint 9, Prettier.
- **Infrastructure:** Docker Compose, multi-stage production Dockerfiles.

---

## 4. Getting Started

### 4.1 Prerequisites

- **Node.js:** v20.x or higher (Tested on Node v24.12.0)
- **npm:** v10.x or higher (Tested on npm 11.7.0)
- **Docker Desktop:** Installed for running local PostgreSQL & Redis containers

> **Windows PowerShell Note:** If running scripts is restricted by PowerShell policies, run commands in **Windows CMD** or call `npm.cmd` explicitly (e.g. `npm.cmd run dev`).

### 4.2 Installation

```cmd
# 1. Clone or navigate to the repository
cd /d D:\SyncForge

# 2. Initialize environment configuration
copy .env.example .env

# 3. Install dependencies across all workspaces
npm.cmd install
```

### 4.3 Local Infrastructure (Docker Compose)

Start PostgreSQL 16 and Redis 7 in the background:

```cmd
npm.cmd run infra:up
```

_To check container logs or shut down containers:_

```cmd
npm.cmd run infra:logs
npm.cmd run infra:down
```

### 4.4 Apply Database Migrations

Once PostgreSQL is running, apply the foundational database migrations:

```cmd
npm.cmd run db:migrate
```

_To inspect migration status:_

```cmd
npm.cmd run db:status
```

---

## 5. Development Commands

| Command (CMD / PowerShell) | Description                                                   |
| :------------------------- | :------------------------------------------------------------ |
| `npm.cmd run dev`          | Runs both backend (:4000) and frontend (:3000) concurrently   |
| `npm.cmd run dev:server`   | Starts the Fastify backend with live reload                   |
| `npm.cmd run dev:web`      | Starts the Next.js frontend developer server                  |
| `npm.cmd run typecheck`    | Type-checks all packages using the strict TypeScript compiler |
| `npm.cmd run lint`         | Runs ESLint across all packages and apps                      |
| `npm.cmd run format:check` | Verifies code formatting via Prettier                         |
| `npm.cmd run format`       | Automatically formats all source code                         |
| `npm.cmd run test`         | Runs the Vitest test suites                                   |
| `npm.cmd run build`        | Builds packages, server, and frontend for production          |
| `npm.cmd run health:check` | Probes backend liveness and readiness endpoints               |

---

## 6. Endpoints & Gateway

The backend exposes the following standard diagnostic, control plane, and real-time collaboration endpoints:

- `GET http://localhost:4000/healthz` — **Liveness Probe**: Returns HTTP 200 with server uptime and version.
- `GET http://localhost:4000/readyz` — **Readiness Probe**: Verifies connectivity to PostgreSQL and Redis.
- `GET http://localhost:4000/api/v1/info` — **Metadata**: Returns protocol version and service capabilities.
- `POST http://localhost:4000/api/v1/auth/register` — **Registration**: Creates user account and default organization/project.
- `POST http://localhost:4000/api/v1/auth/login` — **Authentication**: OWASP `scrypt` verification and JWT session cookie issuance.
- `GET/POST http://localhost:4000/api/v1/projects` — **Projects**: Multi-tenant project lifecycle management.
- `GET/POST/DELETE http://localhost:4000/api/v1/api-keys` — **API Credentials**: Cryptographic key generation (`sf_live_sec_...`), one-time reveal, and revocation.
- `POST http://localhost:4000/api/v1/tokens/room` — **Room Tokens**: Mint short-lived scoped JWT room tokens for client SDK connections.
- `GET http://localhost:4000/api/v1/usage` — **Usage & Metering**: Query real-time concurrent connections and daily metric aggregates.
- `WS ws://localhost:4000/ws/collaborate` — **Collaboration Gateway**: WebSocket transport for CRDT synchronization, state vector handshake, and delta update streaming with project namespace enforcement.

---

## 7. Current Implementation Status (Phase 4)

| Component                     | Status    | Details                                                                                            |
| :---------------------------- | :-------- | :------------------------------------------------------------------------------------------------- |
| **Monorepo & Workspaces**     | Completed | Clean npm-workspaces setup with shared tsconfig, linting, formatting                               |
| **Shared Protocol**           | Completed | `@syncforge/shared` with Zod validation, close codes, binary base64 conversion                     |
| **Canvas Document Schema**    | Completed | Zod schemas and validation for nodes, positions, custom node data, and edges                       |
| **Production Client SDK**     | Completed | `@syncforge/sdk` dual ESM/CJS bundles, standalone zero-monorepo dependency packaging               |
| **Dynamic Auth & Events**     | Completed | Dynamic `getToken` async resolution, typed `.on()`/`.off()` events, error hierarchy                |
| **React 19 Integration**      | Completed | `@syncforge/sdk/react` with `<SyncForgeProvider>`, StrictMode-safe `useSyncForgeRoom`              |
| **External Consumer Fixture** | Completed | Standalone example in `examples/external-consumer/` consuming public package interface             |
| **Canvas Adapter & Undo**     | Completed | `SyncForgeCanvasAdapter` with atomic graph ops and scoped undo/redo isolating peers                |
| **Fastify Gateway**           | Completed | Strict CORS, Pino logging, correlation IDs, `/healthz`, `/readyz`, & `/ws/collaborate`             |
| **Collaboration Engine**      | Completed | Yjs CRDT engine, state vectors, delta streaming, single-flight room lifecycle, eviction            |
| **Durable Persistence**       | Completed | Append-only `document_updates` and compacted `document_snapshots` in PostgreSQL (BYTEA)            |
| **Reconnection Recovery**     | Completed | Automatic state-vector delta reconciliation on network reconnection with zero data loss            |
| **Collaborative Canvas**      | Completed | Interactive workspace at `/rooms/[roomId]` powered by `@xyflow/react` and SDK adapter              |
| **Presence & Live Cursors**   | Completed | Real-time pointer awareness, throttled broadcasts, participant avatars & roster                    |
| **Identity & Access Control** | Completed | `scrypt` password hashing, timing-safe checks, expiring reset tokens, JWT auth cookies             |
| **Multi-Tenant Isolation**    | Completed | Scoped organizations, projects, memberships (owner/admin/member/viewer)                            |
| **Two-Tier API Credentials**  | Completed | Server secret keys (`sf_live_sec_...` / `sf_dev_sec_...`) with one-time reveal; client room tokens |
| **Usage Metering Engine**     | Completed | Real-time connection tracking, daily byte/action aggregation, plan limit enforcement               |
| **Developer Console UI**      | Completed | Full 5-tab dashboard (`/dashboard`) with Overview, Projects, API Keys, Usage, Settings             |
| **Testing & CI**              | Completed | 89 Vitest unit, adapter, lifecycle, packaging, and multi-tenant isolation tests                    |

---

## 8. Planned Next Phase

The next scheduled milestone is **Phase 5: Multi-Server Clustering & Redis Coordination**:

- Cross-node pub/sub propagation of binary CRDT updates using Redis channels.
- Distributed sliding-window rate limiting per API key.
- Horizontal scalability behind load balancers with sticky sessions.
