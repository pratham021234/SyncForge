/**
 * External Consumer Reference Example
 *
 * Demonstrates consuming the SyncForge TypeScript SDK exclusively through its public package API.
 * This file contains no private monorepo imports and models a real third-party developer's integration.
 */

import { SyncForgeClient, RoomError } from '@syncforge/sdk';
import * as Y from 'yjs';

// Configuration (points to standard SyncForge collaboration server)
const SERVER_URL = process.env.SYNCFORGE_SERVER_URL || 'ws://127.0.0.1:4000/ws/collaborate';
const ROOM_ID = 'demo-external-workspace';

async function mockTokenProvider(userId: string): Promise<string> {
  // In production, developers call their authentication backend (e.g. NextAuth, Supabase, Clerk, Auth0)
  // to obtain a signed JWT. Here we return a development-prefixed token accepted by SyncForge server.
  return `dev-token-${userId}`;
}

async function runCollaborativeSession() {
  console.info('====================================================');
  console.info('SyncForge External Consumer Integration Demo');
  console.info(`Connecting to: ${SERVER_URL}`);
  console.info('====================================================\n');

  // 1. Initialize Client A (Alice)
  const aliceClient = new SyncForgeClient({
    endpoint: SERVER_URL,
    clientId: 'alice_workstation_1',
    getToken: async () => mockTokenProvider('alice'),
    autoConnect: true,
  });

  // 2. Initialize Client B (Bob)
  const bobClient = new SyncForgeClient({
    endpoint: SERVER_URL,
    clientId: 'bob_workstation_2',
    getToken: async () => mockTokenProvider('bob'),
    autoConnect: true,
  });

  // Subscribe to client lifecycle events
  aliceClient.on('status', (state) => {
    console.info(`[Alice Client] Connection state -> ${state}`);
  });

  bobClient.on('status', (state) => {
    console.info(`[Bob Client] Connection state -> ${state}`);
  });

  try {
    // 3. Both clients join the shared room
    console.info(`\nJoining shared room: "${ROOM_ID}"...`);
    const [aliceRoom, bobRoom] = await Promise.all([
      aliceClient.joinRoom(ROOM_ID),
      bobClient.joinRoom(ROOM_ID),
    ]);

    console.info(`[Alice Room] Joined with status: ${aliceRoom.status}`);
    console.info(`[Bob Room] Joined with status: ${bobRoom.status}`);

    // Wait for initial CRDT document synchronization
    await Promise.all([
      new Promise<void>((resolve) => {
        if (aliceRoom.isSynced) resolve();
        else aliceRoom.on('synced', resolve);
      }),
      new Promise<void>((resolve) => {
        if (bobRoom.isSynced) resolve();
        else bobRoom.on('synced', resolve);
      }),
    ]);

    console.info('\n✓ Both clients successfully synchronized room state.\n');

    // 4. Access shared Yjs document via public room.document API
    const aliceDoc: Y.Doc = aliceRoom.document;
    const bobDoc: Y.Doc = bobRoom.document;

    const aliceTasks = aliceDoc.getMap<string>('project_tasks');
    const bobTasks = bobDoc.getMap<string>('project_tasks');

    // Setup change observers
    bobTasks.observe((event) => {
      console.info(
        `[Bob's Observer] Detected remote document changes:`,
        Array.from(event.keys.keys()),
      );
    });

    // 5. Alice performs a shared mutation
    console.info(`[Alice] Adding task "task-1": "Design Canvas Architecture"`);
    aliceDoc.transact(() => {
      aliceTasks.set('task-1', 'Design Canvas Architecture (Pending)');
    });

    // Allow network message round-trip
    await new Promise((r) => setTimeout(r, 200));

    console.info(`[Bob's View] task-1 content -> "${bobTasks.get('task-1')}"`);

    // 6. Bob updates task status
    console.info(`[Bob] Updating task "task-1" to "Completed"`);
    bobDoc.transact(() => {
      bobTasks.set('task-1', 'Design Canvas Architecture (Completed by Bob)');
    });

    await new Promise((r) => setTimeout(r, 200));
    console.info(`[Alice's View] task-1 content -> "${aliceTasks.get('task-1')}"`);

    // 7. Presence and awareness verification
    console.info('\n--- Broadcasting Ephemeral Awareness ---');
    aliceRoom.updatePresence({
      userName: 'Alice Smith',
      color: '#3B82F6',
      cursor: { x: 340, y: 180 },
    });

    bobRoom.updatePresence({
      userName: 'Bob Jones',
      color: '#10B981',
      cursor: { x: 520, y: 440 },
    });

    await new Promise((r) => setTimeout(r, 200));

    const bobPeers = bobRoom.getPresence();
    console.info(
      `[Bob] Active room peers (${bobPeers.length}):`,
      bobPeers.map((p) => p.userName),
    );

    // 8. Error handling demonstration (Invalid Room ID)
    console.info('\n--- Testing Error Handling ---');
    try {
      await aliceClient.joinRoom('invalid room! @#$%');
    } catch (err) {
      if (err instanceof RoomError) {
        console.info(`✓ Caught expected RoomError: ${err.message} (${err.code})`);
      } else {
        console.error('Unexpected error type:', err);
      }
    }

    // 9. Clean resource teardown
    console.info('\n--- Teardown ---');
    console.info('Leaving rooms and disconnecting clients...');
    await Promise.all([aliceRoom.leave(), bobRoom.leave()]);
    await Promise.all([aliceClient.disconnect(), bobClient.disconnect()]);

    console.info('✓ All resources successfully disposed. External consumer demo complete.\n');
  } catch (err) {
    console.error('External consumer demo encountered an error:', err);
    process.exit(1);
  }
}

// Execute demo when invoked directly
if (process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js')) {
  runCollaborativeSession().catch((err) => {
    console.error('Unhandled fatal error in consumer demo:', err);
    process.exit(1);
  });
}

export { runCollaborativeSession };
