export * from './types.js';
export * from './errors.js';
export * from './room.js';
export * from './client.js';
export * from './canvas-adapter.js';

// Re-export protocol and canvas schemas/types for standalone consumers
export {
  RoomIdSchema,
  UserPresenceSchema,
  CanvasNodeSchema,
  CanvasEdgeSchema,
  CanvasMetadataSchema,
  createDefaultCanvasNode,
  createDefaultCanvasEdge,
  SYNCFORGE_PROTOCOL_VERSION,
} from '@syncforge/shared';

export type {
  RoomId,
  UserPresence,
  CanvasNode,
  CanvasEdge,
  CanvasMetadata,
} from '@syncforge/shared';
