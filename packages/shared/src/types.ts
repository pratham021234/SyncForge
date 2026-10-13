import { z } from 'zod';
import {
  RoomIdSchema,
  UserPresenceSchema,
  ClientInitSchema,
  ClientJoinRoomSchema,
  ClientLeaveRoomSchema,
  ClientSyncStep1Schema,
  ClientSyncStep2Schema,
  ClientDocUpdateSchema,
  ClientAwarenessSchema,
  ClientPingSchema,
  ClientMessageSchema,
  ServerInitAckSchema,
  ServerRoomJoinedSchema,
  ServerRoomRejectedSchema,
  ServerSyncStep1Schema,
  ServerSyncStep2Schema,
  ServerDocUpdateSchema,
  ServerDocUpdateAckSchema,
  ServerAwarenessSchema,
  ServerRoomLeftSchema,
  ServerErrorSchema,
  ServerShutdownSchema,
  ServerPongSchema,
  ServerMessageSchema,
} from './protocol.js';

export type RoomId = z.infer<typeof RoomIdSchema>;
export type UserPresence = z.infer<typeof UserPresenceSchema>;

// Client message types
export type ClientInitMessage = z.infer<typeof ClientInitSchema>;
export type ClientJoinRoomMessage = z.infer<typeof ClientJoinRoomSchema>;
export type ClientLeaveRoomMessage = z.infer<typeof ClientLeaveRoomSchema>;
export type ClientSyncStep1Message = z.infer<typeof ClientSyncStep1Schema>;
export type ClientSyncStep2Message = z.infer<typeof ClientSyncStep2Schema>;
export type ClientDocUpdateMessage = z.infer<typeof ClientDocUpdateSchema>;
export type ClientAwarenessMessage = z.infer<typeof ClientAwarenessSchema>;
export type ClientPingMessage = z.infer<typeof ClientPingSchema>;
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

// Server message types
export type ServerInitAckMessage = z.infer<typeof ServerInitAckSchema>;
export type ServerRoomJoinedMessage = z.infer<typeof ServerRoomJoinedSchema>;
export type ServerRoomRejectedMessage = z.infer<typeof ServerRoomRejectedSchema>;
export type ServerSyncStep1Message = z.infer<typeof ServerSyncStep1Schema>;
export type ServerSyncStep2Message = z.infer<typeof ServerSyncStep2Schema>;
export type ServerDocUpdateMessage = z.infer<typeof ServerDocUpdateSchema>;
export type ServerDocUpdateAckMessage = z.infer<typeof ServerDocUpdateAckSchema>;
export type ServerAwarenessMessage = z.infer<typeof ServerAwarenessSchema>;
export type ServerRoomLeftMessage = z.infer<typeof ServerRoomLeftSchema>;
export type ServerErrorMessage = z.infer<typeof ServerErrorSchema>;
export type ServerShutdownMessage = z.infer<typeof ServerShutdownSchema>;
export type ServerPongMessage = z.infer<typeof ServerPongSchema>;
export type ServerMessage = z.infer<typeof ServerMessageSchema>;

export interface HealthCheckResponse {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  uptimeSeconds: number;
  version: string;
  environment: string;
}

export interface ReadinessCheckResponse {
  status: 'ready' | 'not_ready';
  timestamp: string;
  dependencies: {
    database: 'healthy' | 'unhealthy' | 'disabled';
    redis: 'healthy' | 'unhealthy' | 'disabled';
  };
  details?: Record<string, string>;
}
