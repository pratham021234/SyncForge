import { describe, it, expect } from 'vitest';
import {
  RoomIdSchema,
  UserPresenceSchema,
  ClientMessageSchema,
  SYNCFORGE_PROTOCOL_VERSION,
} from '../index.js';

describe('RoomIdSchema validation', () => {
  it('should accept valid room IDs', () => {
    expect(RoomIdSchema.safeParse('canvas_123').success).toBe(true);
    expect(RoomIdSchema.safeParse('team-room-01').success).toBe(true);
    expect(RoomIdSchema.safeParse('abc').success).toBe(true);
  });

  it('should reject invalid room IDs', () => {
    expect(RoomIdSchema.safeParse('ab').success).toBe(false); // too short (< 3)
    expect(RoomIdSchema.safeParse('').success).toBe(false);
    expect(RoomIdSchema.safeParse('room with spaces').success).toBe(false);
    expect(RoomIdSchema.safeParse('room$special#chars').success).toBe(false);
    expect(RoomIdSchema.safeParse('a'.repeat(65)).success).toBe(false); // too long (> 64)
  });
});

describe('UserPresenceSchema validation', () => {
  it('should validate valid user presence', () => {
    const valid = {
      userId: 'usr_abc123',
      userName: 'Alice',
      cursor: { x: 150.5, y: 320.0 },
      color: '#4f46e5',
      lastActive: Date.now(),
    };
    const result = UserPresenceSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('should reject invalid hex color format', () => {
    const invalid = {
      userId: 'usr_abc123',
      color: 'red', // not 6-digit hex
      lastActive: Date.now(),
    };
    const result = UserPresenceSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe('ClientMessageSchema discriminated union', () => {
  it('should validate hello message', () => {
    const hello = {
      type: 'hello',
      protocolVersion: SYNCFORGE_PROTOCOL_VERSION,
      clientId: 'client-1',
    };
    const result = ClientMessageSchema.safeParse(hello);
    expect(result.success).toBe(true);
  });

  it('should reject hello message with outdated protocol version', () => {
    const outdated = {
      type: 'hello',
      protocolVersion: '0.0.1',
      clientId: 'client-1',
    };
    const result = ClientMessageSchema.safeParse(outdated);
    expect(result.success).toBe(false);
  });

  it('should validate join_room message', () => {
    const join = {
      type: 'join_room',
      roomId: 'project-canvas-1',
    };
    const result = ClientMessageSchema.safeParse(join);
    expect(result.success).toBe(true);
  });

  it('should reject unrecognized message type', () => {
    const unknown = {
      type: 'unknown_action',
      payload: {},
    };
    const result = ClientMessageSchema.safeParse(unknown);
    expect(result.success).toBe(false);
  });
});
