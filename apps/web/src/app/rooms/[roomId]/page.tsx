'use client';

import React, { useState, useEffect, useMemo, use } from 'react';
import Link from 'next/link';
import { RoomIdSchema, UserPresence } from '@syncforge/shared';
import {
  SyncForgeClient,
  SyncForgeRoom,
  SyncForgeCanvasAdapter,
  ConnectionState,
  RoomStatus,
} from '@syncforge/sdk';
import { CanvasWorkspace } from '@/components/canvas/CanvasWorkspace';
import { PresenceRoster } from '@/components/canvas/PresenceRoster';
import {
  ArrowLeft,
  Copy,
  Check,
  AlertTriangle,
  RefreshCw,
  Wifi,
  WifiOff,
  User,
  CheckCircle2,
} from 'lucide-react';

interface PageProps {
  params: Promise<{ roomId: string }>;
}

const PRESET_COLORS = [
  '#6366f1', // Indigo
  '#06b6d4', // Cyan
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#8b5cf6', // Purple
  '#3b82f6', // Blue
  '#f43f5e', // Rose
];

export default function RoomCanvasPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const rawRoomId = resolvedParams.roomId;

  // Validate room ID against shared protocol schema
  const validation = useMemo(() => {
    return RoomIdSchema.safeParse(rawRoomId);
  }, [rawRoomId]);

  // Local identity state
  const [identity, setIdentity] = useState<{ userId: string; userName: string; color: string }>(
    () => {
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem('syncforge_identity');
        if (saved) {
          try {
            return JSON.parse(saved);
          } catch {
            // ignore
          }
        }
      }
      const randId = Math.random().toString(36).slice(2, 7);
      const randColor = PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)]!;
      return {
        userId: `user_${randId}`,
        userName: `Engineer ${randId}`,
        color: randColor,
      };
    },
  );

  const [copiedLink, setCopiedLink] = useState(false);
  const [isEditingIdentity, setIsEditingIdentity] = useState(false);
  const [nameInput, setNameInput] = useState(identity.userName);

  // SyncForge SDK client & room references
  const [client, setClient] = useState<SyncForgeClient | null>(null);
  const [room, setRoom] = useState<SyncForgeRoom | null>(null);
  const [adapter, setAdapter] = useState<SyncForgeCanvasAdapter | null>(null);

  const [connState, setConnState] = useState<ConnectionState>('connecting');
  const [roomStatus, setRoomStatus] = useState<RoomStatus>('connecting');
  const [peers, setPeers] = useState<UserPresence[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Save identity changes
  const saveIdentity = (newName: string, newColor: string) => {
    const updated = {
      ...identity,
      userName: newName.trim() || identity.userName,
      color: newColor,
    };
    setIdentity(updated);
    if (typeof window !== 'undefined') {
      localStorage.setItem('syncforge_identity', JSON.stringify(updated));
    }
    if (room) {
      room.updatePresence({
        userName: updated.userName,
        color: updated.color,
      });
    }
    setIsEditingIdentity(false);
  };

  // Connect to SyncForge collaboration server
  useEffect(() => {
    if (!validation.success) return;

    const serverWsUrl =
      process.env.NEXT_PUBLIC_WS_URL ||
      (typeof window !== 'undefined'
        ? `ws://${window.location.hostname}:4000/ws/collaborate`
        : 'ws://localhost:4000/ws/collaborate');

    const clientInstance = new SyncForgeClient({
      serverUrl: serverWsUrl,
      clientId: identity.userId,
      token: 'dev-token-project-1',
      autoConnect: true,
      reconnectAttempts: 15,
      reconnectDelayMs: 600,
    });

    setClient(clientInstance);

    const unsubConn = clientInstance.onConnectionStateChange((state) => {
      setConnState(state);
      if (state === 'error') {
        setErrorMessage('Failed to connect to collaboration gateway.');
      } else {
        setErrorMessage(null);
      }
    });

    let cancelled = false;
    let activeRoom: SyncForgeRoom | null = null;
    let activeAdapter: SyncForgeCanvasAdapter | null = null;
    let unsubRoom: (() => void) | null = null;
    let unsubPresence: (() => void) | null = null;

    clientInstance
      .joinRoom(rawRoomId)
      .then((roomSession) => {
        if (cancelled) {
          void roomSession.leave();
          return;
        }

        activeRoom = roomSession;
        setRoom(roomSession);

        const canvasAdapter = new SyncForgeCanvasAdapter(roomSession);
        activeAdapter = canvasAdapter;
        setAdapter(canvasAdapter);

        unsubRoom = roomSession.onStatusChange((status) => {
          setRoomStatus(status);
        });

        unsubPresence = roomSession.onPresenceChange((activePeers) => {
          setPeers(activePeers);
        });
      })
      .catch((err) => {
        if (!cancelled) {
          setErrorMessage(err instanceof Error ? err.message : 'Failed to join collaborative room');
          setConnState('error');
        }
      });

    return () => {
      cancelled = true;
      unsubConn();
      if (unsubRoom) unsubRoom();
      if (unsubPresence) unsubPresence();
      if (activeAdapter) activeAdapter.destroy();
      if (activeRoom) void activeRoom.leave();
      void clientInstance.disconnect();
    };
  }, [rawRoomId, validation.success, identity.userId]);

  const copyRoomUrl = () => {
    if (typeof window !== 'undefined') {
      void navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  // 1. Invalid Room ID Error State
  if (!validation.success) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-rose-800/40 bg-rose-950/20 p-8 text-center backdrop-blur-md">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-900/50 text-rose-400 mb-4">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold text-white mb-2">Invalid Room Identifier</h2>
          <p className="text-xs text-rose-200/80 mb-6 leading-relaxed">
            Room identifiers must contain 3 to 64 alphanumeric characters, underscores, or dashes
            according to the SyncForge protocol.
          </p>
          <Link
            href="/rooms"
            className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Return to Room Directory</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col bg-[#070b12] overflow-hidden">
      {/* Top Navigation & Workspace Status Bar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-800 bg-[#090d16] px-4">
        {/* Left: Back & Room Metadata */}
        <div className="flex items-center gap-3">
          <Link
            href="/rooms"
            className="flex items-center gap-1.5 rounded-lg p-1.5 text-xs text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            title="Back to Rooms"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Rooms</span>
          </Link>

          <div className="h-4 w-px bg-slate-800" />

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-semibold text-slate-200">{rawRoomId}</span>
            <button
              onClick={copyRoomUrl}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-mono text-slate-400 hover:bg-slate-800 hover:text-cyan-300 transition-colors"
              title="Copy room link to share with collaborators"
            >
              {copiedLink ? (
                <>
                  <Check className="h-3 w-3 text-emerald-400" />
                  <span className="text-emerald-400">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  <span className="hidden md:inline">Share</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Center: System Connection & CRDT Status Badge */}
        <div className="flex items-center gap-2">
          {connState === 'connecting' && (
            <div className="flex items-center gap-1.5 rounded-full border border-amber-800/40 bg-amber-950/20 px-2.5 py-1 text-[11px] font-medium text-amber-300">
              <RefreshCw className="h-3 w-3 animate-spin text-amber-400" />
              <span>Connecting</span>
            </div>
          )}

          {connState === 'reconnecting' && (
            <div className="flex items-center gap-1.5 rounded-full border border-amber-800/40 bg-amber-950/20 px-2.5 py-1 text-[11px] font-medium text-amber-300">
              <Wifi className="h-3 w-3 animate-pulse text-amber-400" />
              <span>Reconnecting</span>
            </div>
          )}

          {connState === 'connected' && roomStatus === 'syncing' && (
            <div className="flex items-center gap-1.5 rounded-full border border-cyan-800/40 bg-cyan-950/20 px-2.5 py-1 text-[11px] font-medium text-cyan-300">
              <RefreshCw className="h-3 w-3 animate-spin text-cyan-400" />
              <span>Syncing State</span>
            </div>
          )}

          {connState === 'connected' && roomStatus === 'synced' && (
            <div className="flex items-center gap-1.5 rounded-full border border-emerald-800/40 bg-emerald-950/20 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
              <CheckCircle2 className="h-3 w-3 text-emerald-400" />
              <span className="hidden sm:inline">Live & Synced</span>
            </div>
          )}

          {connState === 'error' && (
            <div className="flex items-center gap-1.5 rounded-full border border-rose-800/40 bg-rose-950/20 px-2.5 py-1 text-[11px] font-medium text-rose-300">
              <WifiOff className="h-3 w-3 text-rose-400" />
              <span>Offline</span>
            </div>
          )}
        </div>

        {/* Right: Presence Roster & User Identity Badge */}
        <div className="flex items-center gap-3">
          <PresenceRoster peers={peers} currentUserId={identity.userId} />

          <div className="relative">
            <button
              onClick={() => setIsEditingIdentity(!isEditingIdentity)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/60 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800 transition-colors"
              title="Change your display name and color"
            >
              <div
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: identity.color }}
              />
              <span className="max-w-[100px] truncate">{identity.userName}</span>
              <User className="h-3 w-3 text-slate-400" />
            </button>

            {/* Identity Settings Dropdown */}
            {isEditingIdentity && (
              <div className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-slate-700 bg-[#0d1322] p-4 shadow-2xl z-50">
                <div className="text-xs font-semibold text-white mb-2">Participant Profile</div>
                <div className="mb-3">
                  <label className="block text-[11px] text-slate-400 mb-1">Display Name</label>
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white outline-none focus:border-indigo-500"
                    placeholder="Your name"
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Avatar & Cursor Color
                  </label>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => saveIdentity(nameInput, c)}
                        className={`h-5 w-5 rounded-full border-2 transition-transform ${
                          identity.color === c ? 'border-white scale-110' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => saveIdentity(nameInput, identity.color)}
                    className="rounded bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-500"
                  >
                    Save
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Error Notification Banner if disconnected */}
      {errorMessage && (
        <div className="flex items-center justify-between gap-2 border-b border-rose-900/40 bg-rose-950/40 px-4 py-2 text-xs text-rose-300">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
            <span>{errorMessage} Local edits will sync automatically upon reconnection.</span>
          </div>
          <button
            onClick={() => client?.connect()}
            className="flex items-center gap-1 rounded bg-rose-900/60 px-2 py-0.5 text-xs text-white hover:bg-rose-800"
          >
            <RefreshCw className="h-3 w-3" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Main Interactive Collaborative Canvas */}
      <main className="relative flex-1 overflow-hidden">
        {room && adapter ? (
          <CanvasWorkspace
            room={room}
            adapter={adapter}
            currentUserId={identity.userId}
            currentUserName={identity.userName}
            currentUserColor={identity.color}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <RefreshCw className="h-6 w-6 animate-spin text-cyan-400" />
              <span className="text-xs text-slate-400">Loading collaborative room...</span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
