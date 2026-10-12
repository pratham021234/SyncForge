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

/**
 * Client Handshake Message Schema
 */
export const ClientHelloSchema = z.object({
  type: z.literal('hello'),
  protocolVersion: z.literal(SYNCFORGE_PROTOCOL_VERSION),
  clientId: z.string().min(1).max(128),
  token: z.string().optional(),
});

/**
 * Join Room Request Schema
 */
export const ClientJoinRoomSchema = z.object({
  type: z.literal('join_room'),
  roomId: RoomIdSchema,
  initialPresence: UserPresenceSchema.omit({ lastActive: true }).optional(),
});

/**
 * Leave Room Request Schema
 */
export const ClientLeaveRoomSchema = z.object({
  type: z.literal('leave_room'),
  roomId: RoomIdSchema,
});

/**
 * Client Ping Message Schema
 */
export const ClientPingSchema = z.object({
  type: z.literal('ping'),
  timestamp: z.number().int().positive(),
});

/**
 * Discriminated Union of Client to Server Messages
 */
export const ClientMessageSchema = z.discriminatedUnion('type', [
  ClientHelloSchema,
  ClientJoinRoomSchema,
  ClientLeaveRoomSchema,
  ClientPingSchema,
]);

/**
 * Server Pong Message Schema
 */
export const ServerPongSchema = z.object({
  type: z.literal('pong'),
  timestamp: z.number().int().positive(),
});

/**
 * Server Room Joined Schema
 */
export const ServerRoomJoinedSchema = z.object({
  type: z.literal('room_joined'),
  roomId: RoomIdSchema,
  peers: z.array(UserPresenceSchema),
});

/**
 * Server Error Schema
 */
export const ServerErrorSchema = z.object({
  type: z.literal('error'),
  code: z.nativeEnum(SYNCFORGE_ERROR_CODES),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
  timestamp: z.string(),
});

/**
 * Discriminated Union of Server to Client Messages
 */
export const ServerMessageSchema = z.discriminatedUnion('type', [
  ServerPongSchema,
  ServerRoomJoinedSchema,
  ServerErrorSchema,
]);
