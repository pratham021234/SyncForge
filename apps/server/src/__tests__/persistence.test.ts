import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { PersistenceService, InMemoryPersistenceStore } from '../services/persistence.service.js';

describe('PersistenceService & Document Reconstruction', () => {
  it('should persist updates and reconstruct document state accurately', async () => {
    const store = new InMemoryPersistenceStore();
    const service = new PersistenceService(store);

    const docA = new Y.Doc();
    const textA = docA.getText('content');
    textA.insert(0, 'First sentence. ');
    const update1 = Y.encodeStateAsUpdate(docA);

    await service.persistUpdate('room-persist-1', update1);

    textA.insert(textA.length, 'Second sentence.');
    // Incremental update
    const update2 = Y.encodeStateAsUpdate(docA, Y.encodeStateVector(new Y.Doc()));
    await service.persistUpdate('room-persist-1', update2);

    // Reconstruct into fresh document
    const { doc: loadedDoc, hadPreviousState } = await service.loadRoomDocument('room-persist-1');

    expect(hadPreviousState).toBe(true);
    expect(loadedDoc.getText('content').toString()).toBe('First sentence. Second sentence.');
  });

  it('should simulate server restart and recover state from storage', async () => {
    const store = new InMemoryPersistenceStore();

    // Server instance 1 writes updates
    const server1Persistence = new PersistenceService(store);
    const doc = new Y.Doc();
    const map = doc.getMap('canvas');
    map.set('shape_1', { type: 'rectangle', x: 10, y: 20 });
    const update = Y.encodeStateAsUpdate(doc);

    await server1Persistence.persistUpdate('room-restart-test', update);
    await server1Persistence.drain();

    // Server instance 2 boots up with same storage
    const server2Persistence = new PersistenceService(store);
    const { doc: recoveredDoc } = await server2Persistence.loadRoomDocument('room-restart-test');

    const recoveredMap = recoveredDoc.getMap('canvas');
    expect(recoveredMap.get('shape_1')).toEqual({
      type: 'rectangle',
      x: 10,
      y: 20,
    });
  });

  it('should enforce room isolation: Room A updates never affect Room B', async () => {
    const store = new InMemoryPersistenceStore();
    const service = new PersistenceService(store);

    const docA = new Y.Doc();
    docA.getText('text').insert(0, 'Room A secret data');
    await service.persistUpdate('room-alpha', Y.encodeStateAsUpdate(docA));

    // Load Room B
    const { doc: docB, hadPreviousState } = await service.loadRoomDocument('room-beta');
    expect(hadPreviousState).toBe(false);
    expect(docB.getText('text').toString()).toBe('');
  });

  it('should surface persistence write failures', async () => {
    const store = new InMemoryPersistenceStore();
    store.failNextWrite = true;
    const service = new PersistenceService(store);

    const doc = new Y.Doc();
    doc.getText('test').insert(0, 'error test');
    const update = Y.encodeStateAsUpdate(doc);

    await expect(service.persistUpdate('room-fail', update)).rejects.toThrow(
      'Simulated database write failure',
    );
    expect(service.totalFailures).toBe(1);
  });

  it('should compact updates into snapshot while preserving full recoverability', async () => {
    const store = new InMemoryPersistenceStore();
    const service = new PersistenceService(store);

    const doc = new Y.Doc();
    const text = doc.getText('stream');

    // Generate 5 incremental updates
    for (let i = 1; i <= 5; i++) {
      text.insert(text.length, `part_${i} `);
      await service.persistUpdate('room-compact', Y.encodeStateAsUpdate(doc));
    }

    // Compact room into snapshot
    await service.compactRoom('room-compact', doc, 5);

    // Reconstruct after compaction
    const { doc: reconstructed } = await service.loadRoomDocument('room-compact');
    expect(reconstructed.getText('stream').toString()).toBe('part_1 part_2 part_3 part_4 part_5 ');
  });
});
