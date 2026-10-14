# SyncForge Security Baseline & Threat Model

This document establishes the security baseline for SyncForge, details implemented defensive mechanisms, identifies known foundational gaps, and outlines the planned authorization model.

---

## 1. Implemented Security Controls

### 1.1 Strict Input Validation

- All untrusted input boundaries (HTTP request payloads, query parameters, room identifiers, presence payloads) are validated using strict Zod schemas in `@syncforge/shared`.
- Room identifiers are constrained by `ROOM_ID_REGEX` (`/^[a-zA-Z0-9_-]{3,64}$/`) preventing path traversal, injection, or formatting exploits.
- WebSocket wire messages are checked against discriminated union schemas before any internal routing or CRDT processing.

### 1.2 WebSocket Transport Controls (Implemented Phase 1)

- **Origin Validation:** WebSocket upgrade requests validate the `Origin` header against the configured CORS allowlist (`CORS_ORIGIN`). Connections from unauthorized origins are rejected immediately.
- **Message Rate Limiting:** Each active WebSocket connection is protected by a dedicated rate limiter enforcing a maximum message frequency (default: 100 messages/second). Flooding triggers error code `RATE_LIMIT_EXCEEDED` and connection closure with code `4005`.
- **Max Payload Size Enforcement:** Incoming message frames are bounded to a maximum size of 64KB (`MAX_MESSAGE_BYTES = 65536`). Oversized frames are rejected with close code `4006`.
- **Binary CRDT Validation:** Binary Yjs byte diffs received from clients are validated before ingestion. If decoding or applying an update throws an exception, the error is isolated, logged, and surfaced without compromising process stability.
- **Heartbeat & Zombie Sockets:** The gateway tracks active pings and pongs to eliminate half-open zombie TCP sockets. Unresponsive sockets are safely evicted after a 30-second window.

### 1.3 Tenant & Room Data Isolation

- Connections and updates are strictly isolated to the specified `roomId`.
- The broadcast mechanism uses explicit room peer filters, ensuring updates are never transmitted across room boundaries or echoed back to the originating sender.
- Database queries and persistence writes strictly parameterize `room_id` and raw byte arrays (`BYTEA`) via parameterized queries (`$1, $2, $3`), fully preventing SQL injection.

### 1.4 Explicit CORS Policies

- Fastify server configures `@fastify/cors` with an explicit origin allowlist derived from `CORS_ORIGIN`.
- Wildcard origins (`*`) are disallowed by default in production configurations.

### 1.5 Structured Logging & Secret Redaction

- Fastify Pino logger is configured with redaction paths:
  - `req.headers.authorization`
  - `req.headers.cookie`
  - `body.password`
  - `body.apiKey`
  - Query parameters containing credentials or tokens.
- Internal database connection errors and stack traces are suppressed in production environments (`NODE_ENV=production`).

### 1.6 Container Security

- Production Docker images for `apps/server` and `apps/web` run under unprivileged non-root users (`USER node` and `USER nextjs`).
- Secrets and `.env` files are excluded from image contexts via `.dockerignore`.

### 1.7 Collaborative Canvas & Ephemeral Presence Controls (Implemented Phase 2)

- **Canvas Schema Validation:** Nodes and edges added to the collaborative canvas are strictly validated via `CanvasNodeSchema` and `CanvasEdgeSchema`. Non-finite coordinates, invalid node types, and oversized text bodies are rejected before mutating the CRDT document.
- **Transient State Isolation:** Real-time cursor coordinates and presence indicators are routed strictly through ephemeral in-memory awareness channels. Cursor movements are never written to durable PostgreSQL storage, preventing storage bloat and write amplification attacks.
- **Throttling & Frame Caps:** Cursor broadcasts are rate-throttled on the client (50ms interval) and bounded by the server gateway's frame size (64KB) and per-socket rate limit (100 messages/sec).
- **Identity Boundaries:** Local development identities are generated with random development prefixes (`dev_usr_`) and clearly isolated from authenticated tenant project IDs.

### 1.8 Production SDK & Token Lifecycle Security (Implemented Phase 3)

- **Dynamic Token Acquisition (`getToken`):** The SDK supports dynamic asynchronous token callbacks, allowing client applications to fetch short-lived session tokens from backend authentication endpoints on-demand without hardcoding or embedding long-lived secrets in browser bundles.
- **Safe Reconnection Throttling:** Reconnection retries are strictly bounded by exponential backoff with random jitter. Critical authentication rejections (`UNAUTHENTICATED` / HTTP 401 / code 4001) or permission denials (`UNAUTHORIZED` / HTTP 403 / code 4003) immediately halt retries, preventing client-side denial-of-service loops against backend auth providers.
- **Distribution Boundary Isolation:** The SDK's published manifest is explicitly constrained to `dist/`, `README.md`, `CHANGELOG.md`, and `LICENSE`. All local `.env` files, credentials, internal test fixtures, and monorepo source files are blocked from packaging.

---

## 2. Threat Assumptions & Boundaries

| Threat Scenario                       | Risk Level | Implemented Architectural Mitigation                                                       |
| :------------------------------------ | :--------- | :----------------------------------------------------------------------------------------- |
| **Malicious CRDT Injections**         | High       | Binary updates decoded in try/catch blocks; schema rejects non-base64 payloads.            |
| **Room Flooding / Denial of Service** | High       | Per-connection rate limiter (100 msgs/sec) + 64KB frame size bounds with immediate drop.   |
| **Cross-Tenant Data Leakage**         | Critical   | Strict room session mapping; database queries strictly scoped by `room_id` & `project_id`. |
| **Stale / Zombie Connections**        | Medium     | Periodic WebSocket heartbeats with 30s timeout and automatic session eviction.             |
| **Connection Eavesdropping**          | High       | TLS required for production deployments (`wss://` and `https://`).                         |

---

## 3. Known Limitations & Roadmap Controls

1. **Production Token Cryptography (Targeted Phase 4):**
   - Phase 1 implements token extraction and validation via `AuthService`. Cryptographic public key verification and self-serve dashboard key revocation are scheduled for Phase 4.
2. **Distributed Redis Rate Limiting (Phase 5):**
   - Cluster-wide distributed sliding window limiting via Redis will be introduced during multi-node cluster scaling.

---

## 4. Secrets Management Guidelines

1. **Never Commit Secrets:** `.env` and all credential files are explicitly ignored in `.gitignore`.
2. **Production Rotation:** API secrets, JWT signing keys, and database passwords must be injected at runtime via environment variables or secret vaults (e.g., AWS Secrets Manager, HashiCorp Vault, Doppler).
3. **Salted Hash Storage:** API keys must always be hashed with SHA-256 before storage in PostgreSQL. Plaintext keys are presented to users exactly once during creation.

---

## 5. Multi-Tenant Identity, Authentication & Room Authorization (Phase 4)

1. **Password Hashing (OWASP Compliant):**
   - User passwords are encrypted using native Node.js `scrypt` with a cryptographically secure 16-byte random salt (`N=16384`, `r=8`, `p=1`).
   - Constant-time verification (`crypto.timingSafeEqual`) prevents timing attack side-channels.
2. **Single-Use Password Reset Tokens:**
   - Password reset tokens are generated as 32-byte high-entropy values.
   - Raw tokens are never stored; only their SHA-256 digests are stored with strict 1-hour expirations and single-use invalidation (`used_at IS NOT NULL`).
3. **Two-Tier Credential Hierarchy:**
   - **Secret API Keys (`sf_{env}_sec_...`):** Restricted strictly to backend servers. Used to authenticate server-to-server operations and mint room tokens. Revealed exactly once upon creation.
   - **Short-Lived Scoped Room Tokens:** Browser clients receive short-lived HMAC-SHA256 JWTs containing explicit `{ projectId, roomId, userId, role, exp }` claims.
4. **Room Namespace & Cross-Tenant Isolation:**
   - Collaboration rooms are strictly scoped to project namespaces.
   - If a client authenticated under Project A attempts to join a room associated with Project B, the WebSocket gateway immediately rejects the join with close code `4003 / UNAUTHORIZED` ("Room belongs to another project namespace").
5. **Auditing & Security Visibility:**
   - All credential generation, revocation, project creation/deletion, and role modifications produce immutable audit logs in `audit_logs` storing actor, action, timestamp, and client IP without leaking sensitive secrets or payload contents.

---

## 6. Pre-Deployment Verification Checklist

Before deploying SyncForge to production environments:

- [ ] Ensure `NODE_ENV` is set to `production`.
- [ ] Replace default `AUTH_SECRET` with a cryptographically generated 256-bit secret.
- [ ] Configure TLS (HTTPS and WSS) terminating reverse proxy (Caddy / Nginx / Cloudflare).
- [ ] Restrict `CORS_ORIGIN` to verified production frontend domains.
- [ ] Verify rate limiting on both HTTP and WebSocket endpoints.
- [ ] Ensure PostgreSQL database user has restricted privileges (no superuser access).
