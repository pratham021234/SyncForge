import { z } from 'zod';
import {
  ROOM_ID_REGEX,
  MAX_ROOM_ID_LENGTH,
  MIN_ROOM_ID_LENGTH,
  SYNCFORGE_PROTOCOL_VERSION,
} from './constants.js';
import { SYNCFORGE_ERROR_CODES } from './errors.js';

/**
 * Room Identifier Validation Schema
 */
export const RoomIdSchema = z
  .string()
  .min(MIN_ROOM_ID_LENGTH, `Room ID must be at least ${MIN_ROOM_ID_LENGTH} characters`)
  .max(MAX_ROOM_ID_LENGTH, `Room ID must not exceed ${MAX_ROOM_ID_LENGTH} characters`)
  .regex(
    ROOM_ID_REGEX,
    'Room ID may only contain alphanumeric characters, underscores, and dashes',
  );

/**
 * Base64 Payload Schema (constrained to 5MB max binary size to prevent memory bloat)
 */
export const Base64PayloadSchema = z
  .string()
  .max(7 * 1024 * 1024, 'Binary payload exceeds 5MB size limit');

/**
 * User Presence Schema
 */
export const UserPresenceSchema = z.object({
  userId: z.string().min(1).max(128),
  userName: z.string().min(1).max(64).optional(),
  cursor: z
    .object({
      x: z.number(),
      y: z.number(),
    })
    .optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  metadata: z.record(z.unknown()).optional(),
  lastActive: z.number().int().positive(),
});

// -----------------------------------------------------------------------------
// Client -> Server Messages
// -----------------------------------------------------------------------------

export const ClientInitSchema = z.object({
  type: z.literal('init'),
  protocolVersion: z.literal(SYNCFORGE_PROTOCOL_VERSION),
  clientId: z.string().min(1).max(128),
  token: z.string().optional(),
});

export const ClientJoinRoomSchema = z.object({
  type: z.literal('join_room'),
  roomId: RoomIdSchema,
  stateVector: Base64PayloadSchema.optional(),
});

export const ClientLeaveRoomSchema = z.object({
  type: z.literal('leave_room'),
  roomId: RoomIdSchema,
});

export const ClientSyncStep1Schema = z.object({
  type: z.literal('sync_step1'),
  roomId: RoomIdSchema,
  stateVector: Base64PayloadSchema,
});

export const ClientSyncStep2Schema = z.object({
  type: z.literal('sync_step2'),
  roomId: RoomIdSchema,
  update: Base64PayloadSchema,
});

export const ClientDocUpdateSchema = z.object({
  type: z.literal('doc_update'),
  roomId: RoomIdSchema,
  update: Base64PayloadSchema,
  messageId: z.string().optional(),
});

export const ClientAwarenessSchema = z.object({
  type: z.literal('awareness'),
  roomId: RoomIdSchema,
  awarenessUpdate: Base64PayloadSchema,
});

export const ClientPingSchema = z.object({
  type: z.literal('ping'),
  timestamp: z.number().int().positive(),
});

export const ClientMessageSchema = z.discriminatedUnion('type', [
  ClientInitSchema,
  ClientJoinRoomSchema,
  ClientLeaveRoomSchema,
  ClientSyncStep1Schema,
  ClientSyncStep2Schema,
  ClientDocUpdateSchema,
  ClientAwarenessSchema,
  ClientPingSchema,
]);

// -----------------------------------------------------------------------------
// Server -> Client Messages
// -----------------------------------------------------------------------------

export const ServerInitAckSchema = z.object({
  type: z.literal('init_ack'),
  protocolVersion: z.literal(SYNCFORGE_PROTOCOL_VERSION),
  connectionId: z.string().min(1),
  authenticated: z.boolean(),
  userId: z.string(),
  serverTime: z.number().int().positive(),
});

export const ServerRoomJoinedSchema = z.object({
  type: z.literal('room_joined'),
  roomId: RoomIdSchema,
  readOnly: z.boolean(),
  serverStateVector: Base64PayloadSchema.optional(),
});

export const ServerRoomRejectedSchema = z.object({
  type: z.literal('room_rejected'),
  roomId: RoomIdSchema,
  reason: z.string(),
  code: z.nativeEnum(SYNCFORGE_ERROR_CODES),
});

export const ServerSyncStep1Schema = z.object({
  type: z.literal('sync_step1'),
  roomId: RoomIdSchema,
  stateVector: Base64PayloadSchema,
});

export const ServerSyncStep2Schema = z.object({
  type: z.literal('sync_step2'),
  roomId: RoomIdSchema,
  update: Base64PayloadSchema,
});

export const ServerDocUpdateSchema = z.object({
  type: z.literal('doc_update'),
  roomId: RoomIdSchema,
  update: Base64PayloadSchema,
});

export const ServerDocUpdateAckSchema = z.object({
  type: z.literal('doc_update_ack'),
  roomId: RoomIdSchema,
  messageId: z.string(),
  persisted: z.boolean(),
  error: z.string().optional(),
});

export const ServerAwarenessSchema = z.object({
  type: z.literal('awareness'),
  roomId: RoomIdSchema,
  awarenessUpdate: Base64PayloadSchema,
});

export const ServerRoomLeftSchema = z.object({
  type: z.literal('room_left'),
  roomId: RoomIdSchema,
});

export const ServerErrorSchema = z.object({
  type: z.literal('error'),
  code: z.nativeEnum(SYNCFORGE_ERROR_CODES),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
  timestamp: z.string(),
});

export const ServerShutdownSchema = z.object({
  type: z.literal('server_shutdown'),
  reason: z.string(),
  reconnectDelayMs: z.number().int().positive(),
});

export const ServerPongSchema = z.object({
  type: z.literal('pong'),
  timestamp: z.number().int().positive(),
});

export const ServerMessageSchema = z.discriminatedUnion('type', [
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
]);
