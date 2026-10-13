import * as Y from 'yjs';
import {
  CanvasNode,
  CanvasEdge,
  CanvasNodePosition,
  validateCanvasNode,
  validateCanvasEdge,
} from '@syncforge/shared';
import { SyncForgeRoom } from './room.js';
import { UnsubscribeFn } from './types.js';

export const CANVAS_LOCAL_ORIGIN = 'local-canvas-edit';

export interface CanvasGraphState {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

export type CanvasGraphListener = (state: CanvasGraphState) => void;
export type UndoRedoStateListener = (state: { canUndo: boolean; canRedo: boolean }) => void;

/**
 * SyncForgeCanvasAdapter
 * Bridges a SyncForgeRoom's Yjs CRDT document to collaborative graph models
 * with atomic transactions, observer callbacks, and local-only UndoManager.
 */
export class SyncForgeCanvasAdapter {
  private readonly nodesMap: Y.Map<CanvasNode>;
  private readonly edgesMap: Y.Map<CanvasEdge>;
  private readonly undoManager: Y.UndoManager;
  private graphListeners = new Set<CanvasGraphListener>();
  private undoRedoListeners = new Set<UndoRedoStateListener>();
  private nodesObserver: (event: Y.YMapEvent<CanvasNode>) => void;
  private edgesObserver: (event: Y.YMapEvent<CanvasEdge>) => void;
  private undoStackHandler: () => void;
  private isDestroyed = false;

  constructor(public readonly room: SyncForgeRoom) {
    this.nodesMap = this.room.doc.getMap<CanvasNode>('canvas_nodes');
    this.edgesMap = this.room.doc.getMap<CanvasEdge>('canvas_edges');

    // Scoped UndoManager: only tracks operations with CANVAS_LOCAL_ORIGIN
    // Remote peer updates are never undone by the local user
    this.undoManager = new Y.UndoManager([this.nodesMap, this.edgesMap], {
      trackedOrigins: new Set([CANVAS_LOCAL_ORIGIN]),
      captureTimeout: 400,
    });

    this.nodesObserver = () => {
      if (!this.isDestroyed) {
        this.notifyGraphListeners();
      }
    };
    this.edgesObserver = () => {
      if (!this.isDestroyed) {
        this.notifyGraphListeners();
      }
    };

    this.nodesMap.observe(this.nodesObserver);
    this.edgesMap.observe(this.edgesObserver);

    this.undoStackHandler = () => {
      if (!this.isDestroyed) {
        this.notifyUndoRedoListeners();
      }
    };

    this.undoManager.on('stack-item-added', this.undoStackHandler);
    this.undoManager.on('stack-item-popped', this.undoStackHandler);
  }

  public getNodes(): CanvasNode[] {
    const nodes: CanvasNode[] = [];
    for (const node of this.nodesMap.values()) {
      nodes.push(node);
    }
    return nodes;
  }

  public getEdges(): CanvasEdge[] {
    const edges: CanvasEdge[] = [];
    for (const edge of this.edgesMap.values()) {
      edges.push(edge);
    }
    return edges;
  }

  public getGraphState(): CanvasGraphState {
    return {
      nodes: this.getNodes(),
      edges: this.getEdges(),
    };
  }

  public onGraphChange(listener: CanvasGraphListener): UnsubscribeFn {
    this.graphListeners.add(listener);
    listener(this.getGraphState());
    return () => {
      this.graphListeners.delete(listener);
    };
  }

  public onUndoRedoChange(listener: UndoRedoStateListener): UnsubscribeFn {
    this.undoRedoListeners.add(listener);
    listener({ canUndo: this.canUndo(), canRedo: this.canRedo() });
    return () => {
      this.undoRedoListeners.delete(listener);
    };
  }

  private notifyGraphListeners(): void {
    const state = this.getGraphState();
    for (const listener of this.graphListeners) {
      try {
        listener(state);
      } catch (err) {
        console.error('[SyncForgeCanvasAdapter] Error in graph listener:', err);
      }
    }
  }

  private notifyUndoRedoListeners(): void {
    const state = { canUndo: this.canUndo(), canRedo: this.canRedo() };
    for (const listener of this.undoRedoListeners) {
      try {
        listener(state);
      } catch (err) {
        console.error('[SyncForgeCanvasAdapter] Error in undo/redo listener:', err);
      }
    }
  }

  /**
   * Operations
   */
  public addNode(node: CanvasNode): void {
    if (this.isDestroyed) return;
    const validation = validateCanvasNode(node);
    if (!validation.success) {
      throw new Error(`Invalid CanvasNode: ${validation.error}`);
    }

    this.room.doc.transact(() => {
      this.nodesMap.set(node.id, node);
    }, CANVAS_LOCAL_ORIGIN);
  }

  public updateNode(id: string, patch: Partial<CanvasNode>): void {
    if (this.isDestroyed) return;
    this.room.doc.transact(() => {
      const existing = this.nodesMap.get(id);
      if (!existing) return;

      const merged: CanvasNode = {
        ...existing,
        ...patch,
        data: {
          ...existing.data,
          ...(patch.data ?? {}),
        },
        position: patch.position ?? existing.position,
        updatedAt: Date.now(),
      };

      this.nodesMap.set(id, merged);
    }, CANVAS_LOCAL_ORIGIN);
  }

  public moveNode(id: string, position: CanvasNodePosition): void {
    if (this.isDestroyed) return;
    this.room.doc.transact(() => {
      const existing = this.nodesMap.get(id);
      if (!existing) return;

      this.nodesMap.set(id, {
        ...existing,
        position,
        updatedAt: Date.now(),
      });
    }, CANVAS_LOCAL_ORIGIN);
  }

  public deleteNode(id: string): void {
    if (this.isDestroyed) return;
    this.room.doc.transact(() => {
      this.nodesMap.delete(id);

      // Cascade delete connected edges atomically
      for (const [edgeId, edge] of this.edgesMap.entries()) {
        if (edge.source === id || edge.target === id) {
          this.edgesMap.delete(edgeId);
        }
      }
    }, CANVAS_LOCAL_ORIGIN);
  }

  public addEdge(edge: CanvasEdge): void {
    if (this.isDestroyed) return;
    const validation = validateCanvasEdge(edge);
    if (!validation.success) {
      throw new Error(`Invalid CanvasEdge: ${validation.error}`);
    }

    this.room.doc.transact(() => {
      this.edgesMap.set(edge.id, edge);
    }, CANVAS_LOCAL_ORIGIN);
  }

  public deleteEdge(id: string): void {
    if (this.isDestroyed) return;
    this.room.doc.transact(() => {
      this.edgesMap.delete(id);
    }, CANVAS_LOCAL_ORIGIN);
  }

  /**
   * Undo & Redo
   */
  public canUndo(): boolean {
    return this.undoManager.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.undoManager.redoStack.length > 0;
  }

  public undo(): void {
    if (this.isDestroyed) return;
    this.undoManager.undo();
  }

  public redo(): void {
    if (this.isDestroyed) return;
    this.undoManager.redo();
  }

  public destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    this.nodesMap.unobserve(this.nodesObserver);
    this.edgesMap.unobserve(this.edgesObserver);
    this.undoManager.off('stack-item-added', this.undoStackHandler);
    this.undoManager.off('stack-item-popped', this.undoStackHandler);
    this.undoManager.destroy();
    this.graphListeners.clear();
    this.undoRedoListeners.clear();
  }
}
