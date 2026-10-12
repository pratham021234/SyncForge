import { z } from 'zod';
import {
  RoomIdSchema,
  UserPresenceSchema,
  ClientHelloSchema,
  ClientJoinRoomSchema,
  ClientLeaveRoomSchema,
  ClientPingSchema,
  ClientMessageSchema,
  ServerPongSchema,
  ServerRoomJoinedSchema,
  ServerErrorSchema,
  ServerMessageSchema,
} from './protocol.js';

export type RoomId = z.infer<typeof RoomIdSchema>;
export type UserPresence = z.infer<typeof UserPresenceSchema>;

export type ClientHello = z.infer<typeof ClientHelloSchema>;
export type ClientJoinRoom = z.infer<typeof ClientJoinRoomSchema>;
export type ClientLeaveRoom = z.infer<typeof ClientLeaveRoomSchema>;
export type ClientPing = z.infer<typeof ClientPingSchema>;
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export type ServerPong = z.infer<typeof ServerPongSchema>;
export type ServerRoomJoined = z.infer<typeof ServerRoomJoinedSchema>;
export type ServerError = z.infer<typeof ServerErrorSchema>;
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
