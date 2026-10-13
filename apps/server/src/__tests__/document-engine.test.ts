import { describe, it, expect } from 'vitest';
import { DocumentEngine } from '../engine/document-manager.js';

describe('DocumentEngine', () => {
  it('should create an independent Y.Doc', () => {
    const doc = DocumentEngine.createDoc();
    expect(doc).toBeDefined();
    expect(doc.clientID).toBeGreaterThan(0);
  });

  it('should synchronize concurrent edits and converge', () => {
    const docA = DocumentEngine.createDoc();
    const docB = DocumentEngine.createDoc();

    const textA = DocumentEngine.getText(docA, 'shared-notes');
    const textB = DocumentEngine.getText(docB, 'shared-notes');

    // Concurrent edits
    textA.insert(0, 'Hello ');
    textB.insert(0, 'World!');

    // Exchange updates
    const updateA = DocumentEngine.encodeState(docA);
    const updateB = DocumentEngine.encodeState(docB);

    DocumentEngine.applyUpdate(docA, updateB);
    DocumentEngine.applyUpdate(docB, updateA);

    // Both documents must converge to the exact same string
    expect(textA.toString()).toBe(textB.toString());
  });

  it('should compute delta diff using state vectors', () => {
    const docServer = DocumentEngine.createDoc();
    const docClient = DocumentEngine.createDoc();

    const textServer = DocumentEngine.getText(docServer, 'content');
    textServer.insert(0, 'Initial base text. ');

    // Client has state vector of empty doc
    const clientVector = DocumentEngine.encodeStateVector(docClient);

    // Server generates diff for client's state vector
    const diff = DocumentEngine.diffUpdate(docServer, clientVector);
    DocumentEngine.applyUpdate(docClient, diff);

    const textClient = DocumentEngine.getText(docClient, 'content');
    expect(textClient.toString()).toBe('Initial base text. ');

    // Server adds more text
    textServer.insert(textServer.length, 'Appended server edit.');

    // New diff
    const updatedClientVector = DocumentEngine.encodeStateVector(docClient);
    const deltaDiff = DocumentEngine.diffUpdate(docServer, updatedClientVector);

    DocumentEngine.applyUpdate(docClient, deltaDiff);
    expect(textClient.toString()).toBe('Initial base text. Appended server edit.');
  });
});
