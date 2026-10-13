# SyncForge Collaboration Protocol Specification

**Protocol Version:** `1.0.0`  
**Transport:** WebSocket (JSON message envelope with Base64-encoded binary Yjs updates)  
**Target Endpoint:** `/ws/collaborate`

---

## 1. Overview & Serialization Model

SyncForge uses a versioned, typed collaboration protocol. While connection negotiation, room management, and operational acknowledgments use standard JSON, all CRDT document state vectors and incremental updates are encoded as binary byte arrays (`Uint8Array`) serialized losslessly into Base64 strings.

This architecture ensures:

1. **100% Binary Fidelity:** Zero conversion to lossy JSON structures for CRDT merges.
2. **Schema Validation:** Every message envelope is strictly validated against Zod schemas in `@syncforge/shared`.
3. **Transport Extensibility:** The protocol clearly isolates control messages, document updates, and ephemeral awareness events.

---

## 2. Message Formats

All messages must contain a discriminated `type` field.

### 2.1 Client to Server Messages

#### 1. Session Initialization (`init`)

Sent immediately when the WebSocket connection opens:

```json
{
  "type": "init",
  "protocolVersion": "1.0.0",
  "clientId": "client_usr_123",
  "token": "sf_dev_7f8a9b2c..."
}
```

#### 2. Join Room (`join_room`)

Requests attachment to a collaborative room. Optionally includes the client's current state vector for immediate delta synchronization:

```json
{
  "type": "join_room",
  "roomId": "canvas_team_alpha",
  "stateVector": "AQID..."
}
```

#### 3. Leave Room (`leave_room`)

Detaches client from the specified room:

```json
{
  "type": "leave_room",
  "roomId": "canvas_team_alpha"
}
```

#### 4. Synchronization Step 1 (`sync_step1`)

Transmits the client's local state vector so the server can compute the required catch-up diff:

```json
{
  "type": "sync_step1",
  "roomId": "canvas_team_alpha",
  "stateVector": "AQID..."
}
```

#### 5. Synchronization Step 2 (`sync_step2`)

Transmits a diff update computed against a received state vector:

```json
{
  "type": "sync_step2",
  "roomId": "canvas_team_alpha",
  "update": "BAUG..."
}
```

#### 6. Incremental Document Update (`doc_update`)

Transmits a local user mutation (generated via `Y.Doc.on('update')`):

```json
{
  "type": "doc_update",
  "roomId": "canvas_team_alpha",
  "update": "BwgJ...",
  "messageId": "msg-uuid-1"
}
```

#### 7. Ephemeral Awareness (`awareness`)

Transmits high-frequency ephemeral peer state (cursors, selections):

```json
{
  "type": "awareness",
  "roomId": "canvas_team_alpha",
  "awarenessUpdate": "CwwN..."
}
```

#### 8. Ping Heartbeat (`ping`)

```json
{
  "type": "ping",
  "timestamp": 1728777600000
}
```

---

### 2.2 Server to Client Messages

#### 1. Handshake Acknowledgment (`init_ack`)

```json
{
  "type": "init_ack",
  "protocolVersion": "1.0.0",
  "connectionId": "026c51e7-b541-4b06-866d-755b689a3a7e",
  "authenticated": true,
  "userId": "usr_dev_123",
  "serverTime": 1728777600100
}
```

#### 2. Room Joined (`room_joined`)

```json
{
  "type": "room_joined",
  "roomId": "canvas_team_alpha",
  "readOnly": false,
  "serverStateVector": "AQID..."
}
```

#### 3. Room Rejected (`room_rejected`)

```json
{
  "type": "room_rejected",
  "roomId": "canvas_team_alpha",
  "code": "UNAUTHORIZED",
  "reason": "Room belongs to another project namespace"
}
```

#### 4. Sync Step 2 / Catch-up Diff (`sync_step2`)

```json
{
  "type": "sync_step2",
  "roomId": "canvas_team_alpha",
  "update": "BAUG..."
}
```

#### 5. Document Update Broadcast (`doc_update`)

Broadcast to room peers (excludes originating sender):

```json
{
  "type": "doc_update",
  "roomId": "canvas_team_alpha",
  "update": "BwgJ..."
}
```

#### 6. Update Acknowledgment (`doc_update_ack`)

Sent directly to the originating client confirming persistence:

```json
{
  "type": "doc_update_ack",
  "roomId": "canvas_team_alpha",
  "messageId": "msg-uuid-1",
  "persisted": true
}
```

#### 7. Server Shutdown (`server_shutdown`)

```json
{
  "type": "server_shutdown",
  "reason": "Server is stopping for planned maintenance",
  "reconnectDelayMs": 2000
}
```

#### 8. Protocol Error (`error`)

```json
{
  "type": "error",
  "code": "INVALID_PAYLOAD",
  "message": "Message size exceeds maximum limit of 524288 bytes",
  "timestamp": "2026-10-13T00:00:00.000Z"
}
```

---

## 3. WebSocket Close Codes

| Code   | Name                   | Description                                            |
| :----- | :--------------------- | :----------------------------------------------------- |
| `1000` | Normal Closure         | Client disconnected cleanly.                           |
| `1001` | Going Away             | Server or client navigating away.                      |
| `1009` | Message Too Big        | Message exceeded maximum limit (512KB).                |
| `4001` | Unauthorized           | Missing, invalid, or revoked token.                    |
| `4004` | Room Not Found         | Target room does not exist and cannot be created.      |
| `4005` | Room Capacity Exceeded | Max rooms per connection (20) exceeded.                |
| `4029` | Rate Limited           | Exceeded inbound message rate threshold (120 msg/sec). |
| `4030` | Server Shutdown        | Server graceful draining and stopping.                 |
