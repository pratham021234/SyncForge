'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Connection,
  Edge,
  Node,
  OnNodesChange,
  OnEdgesChange,
  applyNodeChanges,
  applyEdgeChanges,
  useReactFlow,
  Panel,
  NodeChange,
  ReactFlowProvider,
} from '@xyflow/react';

import {
  CanvasNode,
  CanvasEdge,
  CanvasNodeType,
  createDefaultCanvasNode,
  createDefaultCanvasEdge,
  UserPresence,
} from '@syncforge/shared';
import { SyncForgeRoom, SyncForgeCanvasAdapter } from '@syncforge/sdk';
import { nodeTypes } from './nodes';
import { LiveCursors } from './LiveCursors';
import { CanvasToolbar } from './CanvasToolbar';
import { Sparkles, Plus } from 'lucide-react';

interface CanvasWorkspaceProps {
  room: SyncForgeRoom;
  adapter: SyncForgeCanvasAdapter;
  currentUserId: string;
  currentUserName: string;
  currentUserColor: string;
}

export function CanvasWorkspaceContent({
  room,
  adapter,
  currentUserId,
  currentUserName,
  currentUserColor,
}: CanvasWorkspaceProps) {
  const { screenToFlowPosition } = useReactFlow();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [peers, setPeers] = useState<UserPresence[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const lastCursorBroadcastRef = useRef<number>(0);
  const isLocalInteractingRef = useRef<boolean>(false);

  // Initialize and update local user presence
  useEffect(() => {
    room.updatePresence({
      userId: currentUserId,
      userName: currentUserName,
      color: currentUserColor,
    });
  }, [room, currentUserId, currentUserName, currentUserColor]);

  // Subscribe to peer presence updates
  useEffect(() => {
    const unsubPresence = room.onPresenceChange((activePeers) => {
      setPeers(activePeers);
    });
    return unsubPresence;
  }, [room]);

  // Subscribe to undo/redo stack state changes
  useEffect(() => {
    const unsubUndoRedo = adapter.onUndoRedoChange((state) => {
      setCanUndo(state.canUndo);
      setCanRedo(state.canRedo);
    });
    return unsubUndoRedo;
  }, [adapter]);

  // Helper to map SyncForge CanvasNode to ReactFlow Node
  const mapCanvasNodeToRfNode = useCallback(
    (cn: CanvasNode): Node => ({
      id: cn.id,
      type: cn.type,
      position: cn.position,
      data: {
        ...cn.data,
        onUpdate: (patch: Partial<CanvasNode>) => {
          adapter.updateNode(cn.id, patch);
        },
        onDelete: () => {
          adapter.deleteNode(cn.id);
        },
      },
    }),
    [adapter],
  );

  // Helper to map SyncForge CanvasEdge to ReactFlow Edge
  const mapCanvasEdgeToRfEdge = useCallback(
    (ce: CanvasEdge): Edge => ({
      id: ce.id,
      source: ce.source,
      target: ce.target,
      sourceHandle: ce.sourceHandle,
      targetHandle: ce.targetHandle,
      label: ce.label,
      animated: ce.animated ?? false,
      style: { stroke: '#64748b', strokeWidth: 2 },
    }),
    [],
  );

  // Subscribe to shared Yjs graph changes
  useEffect(() => {
    const unsubGraph = adapter.onGraphChange((state) => {
      // Avoid re-writing nodes during active dragging to prevent jitter
      if (!isLocalInteractingRef.current) {
        setNodes(state.nodes.map(mapCanvasNodeToRfNode));
      }
      setEdges(state.edges.map(mapCanvasEdgeToRfEdge));
    });
    return unsubGraph;
  }, [adapter, mapCanvasNodeToRfNode, mapCanvasEdgeToRfEdge]);

  // Handle ReactFlow node drag / selection changes
  const onNodesChange: OnNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((nds) => applyNodeChanges(changes, nds));

      for (const change of changes) {
        if (change.type === 'position' && change.position && change.id) {
          // Commit finalized drag position to Yjs
          if (change.dragging === false) {
            adapter.moveNode(change.id, change.position);
          }
        }
      }
    },
    [adapter],
  );

  const onNodeDragStart = useCallback(() => {
    isLocalInteractingRef.current = true;
  }, []);

  const onNodeDragStop = useCallback(
    (_event: unknown, node: Node) => {
      isLocalInteractingRef.current = false;
      adapter.moveNode(node.id, node.position);
    },
    [adapter],
  );

  // Handle ReactFlow edge changes
  const onEdgesChange: OnEdgesChange = useCallback((changes) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
  }, []);

  // Handle edge creation (connect)
  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const edge = createDefaultCanvasEdge(connection.source, connection.target, {
        id: `edge_${connection.source}_${connection.target}_${Math.random().toString(36).slice(2, 6)}`,
      });
      if (connection.sourceHandle) edge.sourceHandle = connection.sourceHandle;
      if (connection.targetHandle) edge.targetHandle = connection.targetHandle;
      adapter.addEdge(edge);
    },
    [adapter],
  );

  // Handle node and edge deletion
  const onNodesDelete = useCallback(
    (deletedNodes: Node[]) => {
      for (const node of deletedNodes) {
        adapter.deleteNode(node.id);
      }
    },
    [adapter],
  );

  const onEdgesDelete = useCallback(
    (deletedEdges: Edge[]) => {
      for (const edge of deletedEdges) {
        adapter.deleteEdge(edge.id);
      }
    },
    [adapter],
  );

  // Throttled mouse movement tracker for live awareness cursor
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const now = Date.now();
      // Throttle cursor updates to 50ms (~20 FPS) to conserve bandwidth
      if (now - lastCursorBroadcastRef.current < 50) return;
      lastCursorBroadcastRef.current = now;

      const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      room.updatePresence({
        cursor: {
          x: Math.round(flowPos.x),
          y: Math.round(flowPos.y),
        },
      });
    },
    [room, screenToFlowPosition],
  );

  const handleMouseLeave = useCallback(() => {
    room.updatePresence({ cursor: undefined });
  }, [room]);

  // Node addition handler from toolbar
  const handleAddNode = useCallback(
    (type: CanvasNodeType) => {
      // Spawn near center or offset from existing nodes
      const count = adapter.getNodes().length;
      const x = 120 + (count % 4) * 240;
      const y = 100 + Math.floor(count / 4) * 180;
      const newNode = createDefaultCanvasNode(type, { x, y });
      adapter.addNode(newNode);
    },
    [adapter],
  );

  // Keyboard shortcut listener for Undo / Redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        if (e.shiftKey) {
          if (adapter.canRedo()) {
            e.preventDefault();
            adapter.redo();
          }
        } else {
          if (adapter.canUndo()) {
            e.preventDefault();
            adapter.undo();
          }
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'y') {
        if (adapter.canRedo()) {
          e.preventDefault();
          adapter.redo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [adapter]);

  return (
    <div
      className="relative h-full w-full bg-[#080c14] select-none"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        fitView
        minZoom={0.2}
        maxZoom={2}
        defaultEdgeOptions={{ animated: false }}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} color="#1e293b" />
        <LiveCursors peers={peers} currentUserId={currentUserId} />

        {/* Toolbar Panel */}
        <Panel position="bottom-center" className="mb-6">
          <CanvasToolbar
            onAddNode={handleAddNode}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={() => adapter.undo()}
            onRedo={() => adapter.redo()}
          />
        </Panel>

        {/* Empty State Banner */}
        {nodes.length === 0 && (
          <Panel position="top-center" className="mt-20">
            <div className="flex flex-col items-center justify-center p-8 text-center rounded-2xl border border-slate-800/80 bg-[#0c1220]/80 shadow-2xl backdrop-blur-md max-w-md">
              <div className="p-3 rounded-full bg-indigo-950/60 border border-indigo-800/40 text-indigo-400 mb-3">
                <Sparkles className="h-6 w-6" />
              </div>
              <h3 className="text-base font-semibold text-white mb-1">
                Canvas is ready for collaboration
              </h3>
              <p className="text-xs text-slate-400 mb-5 leading-relaxed">
                Add nodes from the toolbar below or invite team members to this room to collaborate
                in real time with synchronized state and live cursors.
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleAddNode('note')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-medium border border-amber-500/30 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add First Note</span>
                </button>
                <button
                  onClick={() => handleAddNode('process')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 text-xs font-medium border border-sky-500/30 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Process</span>
                </button>
              </div>
            </div>
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}

export function CanvasWorkspace(props: CanvasWorkspaceProps) {
  return (
    <ReactFlowProvider>
      <CanvasWorkspaceContent {...props} />
    </ReactFlowProvider>
  );
}
