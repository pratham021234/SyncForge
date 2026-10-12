# SyncForge Security Baseline & Threat Model

This document establishes the security baseline for SyncForge, details implemented defensive mechanisms, identifies known foundational gaps, and outlines the planned authorization model.

---

## 1. Implemented Security Controls (Phase 0)

### 1.1 Strict Input Validation

- All untrusted input boundaries (HTTP request payloads, query parameters, room identifiers, presence payloads) are validated using strict Zod schemas in `@syncforge/shared`.
- Room identifiers are constrained by `ROOM_ID_REGEX` (`/^[a-zA-Z0-9_-]{3,64}$/`) preventing path traversal, injection, or formatting exploits.

### 1.2 Explicit CORS Policies

- Fastify server configures `@fastify/cors` with an explicit origin allowlist derived from `CORS_ORIGIN`.
- Wildcard origins (`*`) are disallowed by default in production configurations.

### 1.3 Request Throttling & Resource Limits

- Request body sizes are capped at 1MB (`REQUEST_BODY_LIMIT_BYTES = 1048576`) to prevent memory exhaustion and buffer bloat attacks.
- Server connection timeouts are enforced (`REQUEST_TIMEOUT_MS = 15000`) to mitigate slowloris connection starvation.

### 1.4 Structured Logging & Secret Redaction

- Fastify Pino logger is configured with redaction paths:
  - `req.headers.authorization`
  - `req.headers.cookie`
  - `body.password`
  - `body.apiKey`
- Stack traces and internal database connection errors are hidden from API responses in production (`NODE_ENV=production`).

### 1.5 Container Security

- Production Docker images for `apps/server` and `apps/web` run under unprivileged non-root users (`USER node` and `USER nextjs`).
- Secrets and `.env` files are excluded from image contexts via `.dockerignore`.

---

## 2. Threat Assumptions & Boundaries

| Threat Scenario                       | Risk Level | Architectural Mitigation                                                                   |
| :------------------------------------ | :--------- | :----------------------------------------------------------------------------------------- |
| **Malicious CRDT Injections**         | High       | Binary Yjs updates will be decoded and verified for valid struct trees before propagation. |
| **Room Flooding / Denial of Service** | High       | Redis-backed token bucket rate limiters per IP / API key (Planned Phase 5).                |
| **Cross-Tenant Data Leakage**         | Critical   | Every database query scopes records strictly by `project_id`.                              |
| **Stale / Zombie Connections**        | Medium     | Periodic WebSocket heartbeats with aggressive disconnection after timeout.                 |

---

## 3. Known Foundational Gaps & Limitations (Phase 0)

1. **Authentication Not Yet Enforced on WebSocket Gateway:**
   - In Phase 0, the server provides foundational HTTP `/healthz`, `/readyz`, and `/api/v1/info` endpoints.
   - Protected collaboration endpoints are NOT yet open to the public; mock authentication has NOT been fabricated.
2. **Key Hashing in Migrations:**
   - The database schema introduces the `api_keys` table with `key_hash VARCHAR(64)`. The key generation and verification routines will be implemented in Phase 4.
3. **Audit Logging:**
   - Operational security audit logging for administrative actions will be established alongside the developer console in Phase 4.

---

## 4. Secrets Management Guidelines

1. **Never Commit Secrets:** `.env` and all credential files are explicitly ignored in `.gitignore`.
2. **Production Rotation:** API secrets, JWT signing keys, and database passwords must be injected at runtime via environment variables or secret vaults (e.g., AWS Secrets Manager, HashiCorp Vault, Doppler).
3. **Salted Hash Storage:** API keys must always be hashed with SHA-256 before storage in PostgreSQL. Plaintext keys are presented to users exactly once during creation.

---

## 5. Pre-Deployment Verification Checklist

Before deploying SyncForge to production environments:

- [ ] Ensure `NODE_ENV` is set to `production`.
- [ ] Replace default `AUTH_SECRET` with a cryptographically generated 256-bit secret.
- [ ] Configure TLS (HTTPS and WSS) terminating reverse proxy (Caddy / Nginx / Cloudflare).
- [ ] Restrict `CORS_ORIGIN` to verified production frontend domains.
- [ ] Verify rate limiting on all public endpoints.
- [ ] Perform penetration testing on binary WebSocket message handlers.
