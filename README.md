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
│   └── server/                  # Fastify 5 backend, health probes, and future WS gateway
├── packages/
│   ├── sdk/                     # Public TypeScript client SDK (@syncforge/sdk)
│   └── shared/                  # Shared protocol schemas, types, and constants (@syncforge/shared)
├── infra/
│   └── docker/                  # Docker Compose for PostgreSQL 16 & Redis 7
├── docs/
│   ├── architecture.md          # Comprehensive system topology & CRDT design
│   ├── development.md           # Local Windows setup and command reference
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
- **Backend:** Node.js 24, Fastify 5, Pino logger, Zod schema validation.
- **CRDT Engine (Planned Phase 1):** Yjs for conflict-free state resolution.
- **Database:** PostgreSQL 16 with custom transactional SQL migration runner.
- **Cache & Coordination:** Redis 7 Alpine for multi-instance pub/sub.
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

## 6. Endpoints & Probes

The backend exposes the following standard diagnostic endpoints:

- `GET http://localhost:4000/healthz` — **Liveness Probe**: Returns HTTP 200 with server uptime and version.
- `GET http://localhost:4000/readyz` — **Readiness Probe**: Verifies connectivity to PostgreSQL and Redis.
- `GET http://localhost:4000/api/v1/info` — **Metadata**: Returns protocol version and service capabilities.

---

## 7. Current Implementation Status (Phase 0)

| Component                 | Status    | Details                                                                       |
| :------------------------ | :-------- | :---------------------------------------------------------------------------- |
| **Monorepo & Workspaces** | Completed | Clean npm-workspaces setup with shared tsconfig, linting, formatting          |
| **Shared Protocol**       | Completed | `@syncforge/shared` with Zod validation, close codes, protocol version        |
| **Public SDK Skeleton**   | Completed | `@syncforge/sdk` with connection state machine, error hierarchy, client types |
| **Fastify Gateway**       | Completed | Strict CORS, Pino logging, correlation IDs, `/healthz` & `/readyz`            |
| **Database & Migrations** | Completed | PostgreSQL schema for projects, api_keys, rooms, document_updates             |
| **Docker Compose**        | Completed | PostgreSQL 16 + Redis 7 with health checks and persistent volumes             |
| **Frontend Shell**        | Completed | Next.js 15 dark mode portal, architecture explorer, protocol validator        |
| **Testing & CI**          | Completed | Vitest test suites passing; GitHub Actions workflow configured                |
| **Collaboration Engine**  | Planned   | Yjs WebSocket synchronization engine scheduled for Phase 1                    |
| **Collaborative Canvas**  | Planned   | Demonstration canvas application scheduled for Phase 2                        |

---

## 8. Planned Next Phase

The next scheduled milestone is **Phase 1: Core Collaboration Engine & Yjs Sync**:

- Fastify WebSocket upgrade transport.
- Yjs CRDT document synchronization.
- Room attachment, joining, and detachment lifecycle.
- Saving incremental binary Yjs updates to PostgreSQL.
- Reconnection and missed update reconciliation.
