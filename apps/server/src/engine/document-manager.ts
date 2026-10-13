import * as Y from 'yjs';

/**
 * DocumentEngine
 * Encapsulates core Yjs CRDT operations independently of network transport.
 */
export class DocumentEngine {
  /**
   * Creates a new in-memory Yjs Document.
   */
  public static createDoc(): Y.Doc {
    return new Y.Doc();
  }

  /**
   * Applies a binary Yjs update to the target document.
   */
  public static applyUpdate(doc: Y.Doc, update: Uint8Array, origin?: unknown): void {
    Y.applyUpdate(doc, update, origin);
  }

  /**
   * Encodes the entire document state as a binary update buffer.
   */
  public static encodeState(doc: Y.Doc): Uint8Array {
    return Y.encodeStateAsUpdate(doc);
  }

  /**
   * Encodes the document's state vector for computing delta synchronization diffs.
   */
  public static encodeStateVector(doc: Y.Doc): Uint8Array {
    return Y.encodeStateVector(doc);
  }

  /**
   * Computes the binary diff update needed to bring a peer from targetStateVector to the current document state.
   */
  public static diffUpdate(doc: Y.Doc, targetStateVector?: Uint8Array): Uint8Array {
    return Y.encodeStateAsUpdate(doc, targetStateVector);
  }

  /**
   * Helper to retrieve a shared Y.Text type.
   */
  public static getText(doc: Y.Doc, name = 'default-text'): Y.Text {
    return doc.getText(name);
  }

  /**
   * Helper to retrieve a shared Y.Map type.
   */
  public static getMap<T = unknown>(doc: Y.Doc, name = 'default-map'): Y.Map<T> {
    return doc.getMap<T>(name);
  }

  /**
   * Helper to retrieve a shared Y.Array type.
   */
  public static getArray<T = unknown>(doc: Y.Doc, name = 'default-array'): Y.Array<T> {
    return doc.getArray<T>(name);
  }
}
