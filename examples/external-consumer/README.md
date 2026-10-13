# SyncForge External Consumer Example

This reference application demonstrates how an external Node.js, React, or full-stack application integrates the `@syncforge/sdk` package.

## Key Capabilities Demonstrated

1. **Independent Package Consumption**: Imports from `@syncforge/sdk` without private monorepo paths.
2. **Dynamic Authentication**: Uses the `getToken` asynchronous callback to supply session tokens.
3. **Multi-User Collaboration**: Two independent clients concurrently join a room and manipulate shared `Y.Doc` CRDT data.
4. **Presence & Cursors**: Emits and receives real-time ephemeral awareness updates.
5. **Robust Error Handling**: Handles room validation errors and disconnection lifecycle cleanly.

## Running the Example

### 1. Ensure the SyncForge Collaboration Server is Running

In your backend terminal:

```powershell
npm run dev:server
```

_(Runs on `http://localhost:4000` with WebSocket gateway on `ws://localhost:4000/ws/collaborate`)_

### 2. Run the External Consumer Script

From this directory (`examples/external-consumer`):

```powershell
npx tsx src/index.ts
```

Or from the monorepo root:

```powershell
npx tsx examples/external-consumer/src/index.ts
```
