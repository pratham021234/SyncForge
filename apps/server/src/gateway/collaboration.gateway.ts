import { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import crypto from 'crypto';
import {
  ClientMessageSchema,
  ServerMessage,
  bytesToBase64,
  base64ToBytes,
  SYNCFORGE_WS_CLOSE_CODES,
  SYNCFORGE_ERROR_CODES,
} from '@syncforge/shared';
import { RoomManager } from '../engine/room-manager.js';
import { AuthService, AuthContext } from '../services/auth.service.js';
import { DocumentEngine } from '../engine/document-manager.js';

export interface GatewayOptions {
  maxMessageSizeBytes?: number;
  maxUpdatesPerSecond?: number;
  maxRoomsPerConnection?: number;
  heartbeatIntervalMs?: number;
}

export class WebSocketSession {
  public readonly connectionId: string;
  public authContext: AuthContext | null = null;
  public readonly joinedRooms = new Set<string>();
  public isAlive = true;
  private messageCountInWindow = 0;
  private rateWindowStart = Date.now();

  constructor(
    public readonly socket: WebSocket,
    connectionId?: string,
  ) {
    this.connectionId = connectionId ?? crypto.randomUUID();
  }

  public send(message: ServerMessage): void {
    if (this.socket.readyState === WebSocket.OPEN) {
      // Backpressure check: avoid buffering over 1MB outbound
      if (this.socket.bufferedAmount > 1024 * 1024) {
        console.warn(
          `[Gateway] High backpressure on connection ${this.connectionId} (${this.socket.bufferedAmount} bytes buffered)`,
        );
      }
      this.socket.send(JSON.stringify(message));
    }
  }

  public checkRateLimit(maxPerSecond: number): boolean {
    const now = Date.now();
    if (now - this.rateWindowStart >= 1000) {
      this.rateWindowStart = now;
      this.messageCountInWindow = 0;
    }
    this.messageCountInWindow++;
    return this.messageCountInWindow <= maxPerSecond;
  }
}

export function registerCollaborationGateway(
  fastify: FastifyInstance,
  roomManager: RoomManager,
  authService: AuthService,
  options: GatewayOptions = {},
): {
  sessions: Map<string, WebSocketSession>;
  broadcastShutdown: () => void;
} {
  const maxMessageSize = options.maxMessageSizeBytes ?? 512 * 1024; // 512KB
  const maxUpdatesPerSec = options.maxUpdatesPerSecond ?? 120; // 120 updates/sec
  const maxRoomsPerConn = options.maxRoomsPerConnection ?? 20;
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? 30000;

  const activeSessions = new Map<string, WebSocketSession>();

  // Heartbeat loop for detecting zombie connections
  const heartbeatTimer = setInterval(() => {
    for (const [connId, session] of activeSessions) {
      if (!session.isAlive) {
        session.socket.terminate();
        activeSessions.delete(connId);
        continue;
      }
      session.isAlive = false;
      session.socket.ping();
    }
  }, heartbeatIntervalMs);

  if (heartbeatTimer.unref) {
    heartbeatTimer.unref();
  }

  // Register WebSocket route inside plugin scope
  fastify.register(async (scope) => {
    scope.get('/ws/collaborate', { websocket: true }, (socket, req) => {
      const session = new WebSocketSession(socket as unknown as WebSocket);
      activeSessions.set(session.connectionId, session);

      req.log.info({ connId: session.connectionId }, '[Gateway] WebSocket connection established');

      session.socket.on('pong', () => {
        session.isAlive = true;
      });

      session.socket.on('message', async (data: Buffer | string) => {
        // 1. Message size check
        const byteLength = typeof data === 'string' ? Buffer.byteLength(data) : data.length;
        if (byteLength > maxMessageSize) {
          session.send({
            type: 'error',
            code: SYNCFORGE_ERROR_CODES.INVALID_PAYLOAD,
            message: `Message size exceeds maximum limit of ${maxMessageSize} bytes`,
            timestamp: new Date().toISOString(),
          });
          session.socket.close(SYNCFORGE_WS_CLOSE_CODES.MESSAGE_TOO_BIG, 'Message too large');
          return;
        }

        // 2. Rate limit check
        if (!session.checkRateLimit(maxUpdatesPerSec)) {
          session.send({
            type: 'error',
            code: SYNCFORGE_ERROR_CODES.RATE_LIMIT_EXCEEDED,
            message: 'Rate limit exceeded: too many messages per second',
            timestamp: new Date().toISOString(),
          });
          return;
        }

        // 3. Schema parsing
        let rawJson: unknown;
        try {
          rawJson = JSON.parse(data.toString());
        } catch {
          session.send({
            type: 'error',
            code: SYNCFORGE_ERROR_CODES.INVALID_PAYLOAD,
            message: 'Malformed JSON payload',
            timestamp: new Date().toISOString(),
          });
          return;
        }

        const parseResult = ClientMessageSchema.safeParse(rawJson);
        if (!parseResult.success) {
          session.send({
            type: 'error',
            code: SYNCFORGE_ERROR_CODES.INVALID_PAYLOAD,
            message: `Invalid message structure: ${parseResult.error.issues.map((i) => i.message).join(', ')}`,
            timestamp: new Date().toISOString(),
          });
          return;
        }

        const message = parseResult.data;

        // 4. Message Dispatching
        try {
          switch (message.type) {
            case 'init': {
              try {
                const authContext = await authService.authenticate(message.token, message.clientId);
                session.authContext = authContext;
                session.send({
                  type: 'init_ack',
                  protocolVersion: '1.0.0',
                  connectionId: session.connectionId,
                  authenticated: true,
                  userId: authContext.userId,
                  serverTime: Date.now(),
                });
              } catch (err) {
                session.send({
                  type: 'error',
                  code: SYNCFORGE_ERROR_CODES.UNAUTHORIZED,
                  message: err instanceof Error ? err.message : 'Authentication failed',
                  timestamp: new Date().toISOString(),
                });
                session.socket.close(
                  SYNCFORGE_WS_CLOSE_CODES.UNAUTHORIZED,
                  'Authentication failed',
                );
              }
              break;
            }

            case 'join_room': {
              // Require authentication before joining rooms
              if (!session.authContext) {
                session.send({
                  type: 'room_rejected',
                  roomId: message.roomId,
                  code: SYNCFORGE_ERROR_CODES.UNAUTHENTICATED,
                  reason: 'Must initialize session before joining rooms',
                });
                return;
              }

              // Max rooms per connection limit
              if (
                session.joinedRooms.size >= maxRoomsPerConn &&
                !session.joinedRooms.has(message.roomId)
              ) {
                session.send({
                  type: 'room_rejected',
                  roomId: message.roomId,
                  code: SYNCFORGE_ERROR_CODES.ROOM_CAPACITY_EXCEEDED,
                  reason: `Exceeded maximum concurrent rooms per connection (${maxRoomsPerConn})`,
                });
                return;
              }

              // Authorize room join
              const authCheck = await authService.authorizeRoomJoin(
                session.authContext,
                message.roomId,
              );
              if (!authCheck.authorized) {
                session.send({
                  type: 'room_rejected',
                  roomId: message.roomId,
                  code: SYNCFORGE_ERROR_CODES.UNAUTHORIZED,
                  reason: authCheck.reason ?? 'Unauthorized to access room',
                });
                return;
              }

              const room = await roomManager.getOrCreateRoom(message.roomId);

              // Add connection to room
              room.addConnection({
                connectionId: session.connectionId,
                userId: session.authContext.userId,
                readOnly: authCheck.readOnly,
                send: (msg) => session.send(msg),
              });
              session.joinedRooms.add(message.roomId);

              // Encode server state vector for two-way sync
              const serverStateVector = DocumentEngine.encodeStateVector(room.doc);

              session.send({
                type: 'room_joined',
                roomId: message.roomId,
                readOnly: authCheck.readOnly,
                serverStateVector: bytesToBase64(serverStateVector),
              });

              // Send existing peers' awareness updates to the joining client
              for (const peerAwareness of room.getAwarenessUpdates()) {
                session.send({
                  type: 'awareness',
                  roomId: message.roomId,
                  awarenessUpdate: peerAwareness,
                });
              }

              // If client provided its state vector in join request, compute diff and send sync_step2
              if (message.stateVector) {
                const clientVector = base64ToBytes(message.stateVector);
                const diff = DocumentEngine.diffUpdate(room.doc, clientVector);
                if (diff.length > 0) {
                  session.send({
                    type: 'sync_step2',
                    roomId: message.roomId,
                    update: bytesToBase64(diff),
                  });
                }
              }
              break;
            }

            case 'leave_room': {
              const room = roomManager.getRoom(message.roomId);
              if (room) {
                room.removeConnection(session.connectionId);
              }
              session.joinedRooms.delete(message.roomId);
              session.send({
                type: 'room_left',
                roomId: message.roomId,
              });
              break;
            }

            case 'sync_step1': {
              if (!session.joinedRooms.has(message.roomId)) {
                session.send({
                  type: 'error',
                  code: SYNCFORGE_ERROR_CODES.UNAUTHORIZED,
                  message: `Not joined to room ${message.roomId}`,
                  timestamp: new Date().toISOString(),
                });
                return;
              }

              const room = roomManager.getRoom(message.roomId);
              if (!room) return;

              const clientVector = base64ToBytes(message.stateVector);
              const diff = DocumentEngine.diffUpdate(room.doc, clientVector);

              session.send({
                type: 'sync_step2',
                roomId: message.roomId,
                update: bytesToBase64(diff),
              });
              break;
            }

            case 'sync_step2':
            case 'doc_update': {
              if (!session.joinedRooms.has(message.roomId)) {
                session.send({
                  type: 'error',
                  code: SYNCFORGE_ERROR_CODES.UNAUTHORIZED,
                  message: `Not joined to room ${message.roomId}`,
                  timestamp: new Date().toISOString(),
                });
                return;
              }

              const room = roomManager.getRoom(message.roomId);
              if (!room) return;

              const updateBytes = base64ToBytes(message.update);
              const messageId = 'messageId' in message ? message.messageId : undefined;

              await room.applyClientUpdate(updateBytes, session.connectionId, messageId);
              break;
            }

            case 'awareness': {
              if (!session.joinedRooms.has(message.roomId)) return;
              const room = roomManager.getRoom(message.roomId);
              if (!room) return;

              // Cache client awareness in room state
              room.updateAwareness(session.connectionId, message.awarenessUpdate);

              // Broadcast ephemeral awareness update to room peers
              room.broadcast(
                {
                  type: 'awareness',
                  roomId: message.roomId,
                  awarenessUpdate: message.awarenessUpdate,
                },
                session.connectionId,
              );
              break;
            }

            case 'ping': {
              session.send({
                type: 'pong',
                timestamp: Date.now(),
              });
              break;
            }
          }
        } catch (err) {
          req.log.error(
            { err, connId: session.connectionId },
            '[Gateway] Error processing message',
          );
          session.send({
            type: 'error',
            code: SYNCFORGE_ERROR_CODES.INTERNAL_ERROR,
            message: err instanceof Error ? err.message : 'Internal error processing message',
            timestamp: new Date().toISOString(),
          });
        }
      });

      session.socket.on('close', (code, reason) => {
        req.log.info(
          { connId: session.connectionId, code, reason: reason.toString() },
          '[Gateway] WebSocket connection closed',
        );

        // Clean up connection from all joined rooms
        for (const roomId of session.joinedRooms) {
          const room = roomManager.getRoom(roomId);
          if (room) {
            room.removeConnection(session.connectionId);
          }
        }
        session.joinedRooms.clear();
        activeSessions.delete(session.connectionId);
      });

      session.socket.on('error', (err) => {
        req.log.warn({ connId: session.connectionId, err }, '[Gateway] WebSocket connection error');
      });
    });
  });

  return {
    sessions: activeSessions,
    broadcastShutdown: () => {
      clearInterval(heartbeatTimer);
      const shutdownMsg: ServerMessage = {
        type: 'server_shutdown',
        reason: 'Server is stopping for planned maintenance',
        reconnectDelayMs: 2000,
      };
      for (const session of activeSessions.values()) {
        try {
          session.send(shutdownMsg);
          session.socket.close(SYNCFORGE_WS_CLOSE_CODES.SERVER_SHUTDOWN, 'Server shutting down');
        } catch {
          // ignore error on closing
        }
      }
      activeSessions.clear();
    },
  };
}
