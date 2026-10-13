import { describe, it, expect } from 'vitest';
import {
  RoomIdSchema,
  UserPresenceSchema,
  ClientMessageSchema,
  ServerMessageSchema,
  SYNCFORGE_PROTOCOL_VERSION,
  bytesToBase64,
  base64ToBytes,
} from '../index.js';

describe('Binary conversion utilities', () => {
  it('should roundtrip arbitrary byte arrays losslessly', () => {
    const original = new Uint8Array([0, 1, 2, 255, 128, 64, 32, 16, 8, 4, 2, 1]);
    const encoded = bytesToBase64(original);
    const decoded = base64ToBytes(encoded);

    expect(decoded.length).toBe(original.length);
    for (let i = 0; i < original.length; i++) {
      expect(decoded[i]).toBe(original[i]);
    }
  });

  it('should handle empty byte arrays', () => {
    const empty = new Uint8Array(0);
    const encoded = bytesToBase64(empty);
    const decoded = base64ToBytes(encoded);
    expect(decoded.length).toBe(0);
  });
});

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
  it('should validate init message', () => {
    const init = {
      type: 'init',
      protocolVersion: SYNCFORGE_PROTOCOL_VERSION,
      clientId: 'client-1',
      token: 'dev_test_token',
    };
    const result = ClientMessageSchema.safeParse(init);
    expect(result.success).toBe(true);
  });

  it('should reject init message with outdated protocol version', () => {
    const outdated = {
      type: 'init',
      protocolVersion: '0.0.1',
      clientId: 'client-1',
    };
    const result = ClientMessageSchema.safeParse(outdated);
    expect(result.success).toBe(false);
  });

  it('should validate join_room message with stateVector', () => {
    const join = {
      type: 'join_room',
      roomId: 'project-canvas-1',
      stateVector: bytesToBase64(new Uint8Array([1, 2, 3])),
    };
    const result = ClientMessageSchema.safeParse(join);
    expect(result.success).toBe(true);
  });

  it('should validate doc_update message with binary payload', () => {
    const docUpdate = {
      type: 'doc_update',
      roomId: 'project-canvas-1',
      update: bytesToBase64(new Uint8Array([4, 5, 6])),
      messageId: 'msg-123',
    };
    const result = ClientMessageSchema.safeParse(docUpdate);
    expect(result.success).toBe(true);
  });

  it('should reject doc_update message exceeding size limits', () => {
    const oversized = {
      type: 'doc_update',
      roomId: 'project-canvas-1',
      update: 'a'.repeat(8 * 1024 * 1024), // > 7MB base64
    };
    const result = ClientMessageSchema.safeParse(oversized);
    expect(result.success).toBe(false);
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

describe('ServerMessageSchema discriminated union', () => {
  it('should validate init_ack message', () => {
    const ack = {
      type: 'init_ack',
      protocolVersion: SYNCFORGE_PROTOCOL_VERSION,
      connectionId: 'conn-abc-123',
      authenticated: true,
      userId: 'usr-1',
      serverTime: Date.now(),
    };
    expect(ServerMessageSchema.safeParse(ack).success).toBe(true);
  });

  it('should validate doc_update_ack message', () => {
    const ack = {
      type: 'doc_update_ack',
      roomId: 'room-alpha',
      messageId: 'msg-1',
      persisted: true,
    };
    expect(ServerMessageSchema.safeParse(ack).success).toBe(true);
  });
});
