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

| Check                         | Command (CMD / PowerShell) |
| :---------------------------- | :------------------------- |
| **Check Code Formatting**     | `npm.cmd run format:check` |
| **Fix Formatting**            | `npm.cmd run format`       |
| **Lint Codebase**             | `npm.cmd run lint`         |
| **Type Check All Packages**   | `npm.cmd run typecheck`    |
| **Run Vitest Unit Tests**     | `npm.cmd run test`         |
| **Build All Packages & Apps** | `npm.cmd run build`        |
| **Check Live API Health**     | `npm.cmd run health:check` |

---

## 7. Troubleshooting Common Errors

### 7.1 "failed to connect to the docker API ... daemon is not running"

- **Cause:** Docker Desktop is installed, but the background engine is paused or not started.
- **Resolution:** Launch the Docker Desktop application from the Windows Start menu. Wait for the whale icon in the taskbar to show "Docker Desktop running". Then rerun `npm.cmd run infra:up`.
- **Note:** Independent unit tests and frontend builds do NOT require Docker to run.

### 7.2 Port 4000 or 3000 Already in Use

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

### 7.3 TypeScript Project Reference Errors

- Ensure you have built shared packages before typechecking standalone applications:
  ```cmd
  npm.cmd run build:packages
  ```
