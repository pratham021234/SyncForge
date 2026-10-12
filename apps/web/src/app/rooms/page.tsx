'use client';

import React, { useState } from 'react';
import { Radio, CheckCircle, XCircle, ArrowRight, Layers } from 'lucide-react';
import { RoomIdSchema } from '@syncforge/shared';

export default function RoomsPage() {
  const [roomIdInput, setRoomIdInput] = useState('canvas_team_alpha');
  const [validationResult, setValidationResult] = useState<{
    isValid: boolean;
    error?: string;
  } | null>(() => {
    const res = RoomIdSchema.safeParse('canvas_team_alpha');
    return {
      isValid: res.success,
      error: !res.success ? res.error.issues[0]?.message : undefined,
    };
  });

  const handleInputChange = (val: string) => {
    setRoomIdInput(val);
    const res = RoomIdSchema.safeParse(val);
    setValidationResult({
      isValid: res.success,
      error: !res.success ? res.error.issues[0]?.message : undefined,
    });
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Collaboration Rooms
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Room lifecycle boundaries, session validation, and real-time document scoping.
          </p>
        </div>
        <span className="self-start sm:self-auto rounded-full bg-cyan-950/60 px-3 py-1 text-xs font-mono text-cyan-400 border border-cyan-800/40">
          Phase 1 Engine Target
        </span>
      </div>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Room Validator Live Demo */}
        <div className="rounded-xl border border-border bg-surface p-6">
          <div className="flex items-center gap-2 mb-4">
            <Radio className="h-5 w-5 text-cyan-400" />
            <h2 className="text-lg font-semibold text-white">Live Room ID Protocol Validator</h2>
          </div>
          <p className="text-xs text-slate-400 mb-6">
            SyncForge rooms enforce deterministic naming policies across the public SDK, WebSocket
            gateway, and database persistence layer. Test room ID compatibility against
            `@syncforge/shared`.
          </p>

          <div className="space-y-4">
            <div>
              <label htmlFor="roomId" className="block text-xs font-medium text-slate-300 mb-2">
                Room Identifier (3–64 chars, alphanumeric, dashes, underscores)
              </label>
              <input
                id="roomId"
                type="text"
                value={roomIdInput}
                onChange={(e) => handleInputChange(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-[#0c101a] px-3.5 py-2.5 font-mono text-sm text-white focus:border-indigo-500 focus:outline-none"
                placeholder="e.g. project_canvas_01"
              />
            </div>

            {validationResult && (
              <div
                className={`rounded-lg p-3 text-xs flex items-start gap-2.5 border ${
                  validationResult.isValid
                    ? 'border-emerald-800/40 bg-emerald-950/20 text-emerald-300'
                    : 'border-rose-800/40 bg-rose-950/20 text-rose-300'
                }`}
              >
                {validationResult.isValid ? (
                  <>
                    <CheckCircle className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                    <div>
                      <div className="font-semibold text-emerald-200">Valid Room Identifier</div>
                      <div>Compatible with SyncForge protocol v1.0.0 and database schemas.</div>
                    </div>
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 text-rose-400 mt-0.5 shrink-0" />
                    <div>
                      <div className="font-semibold text-rose-200">Validation Error</div>
                      <div>{validationResult.error}</div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Room Lifecycle Details */}
        <div className="rounded-xl border border-border bg-surface p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Layers className="h-5 w-5 text-indigo-400" />
              <h2 className="text-lg font-semibold text-white">Room Lifecycle Architecture</h2>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              How SyncForge manages collaboration room state from creation to disconnection:
            </p>

            <ol className="space-y-3 text-xs text-slate-300 list-decimal list-inside leading-relaxed">
              <li>
                <span className="font-semibold text-slate-100">Handshake & Auth: </span>
                Client verifies connection via HTTP/WS handshake with API credentials.
              </li>
              <li>
                <span className="font-semibold text-slate-100">Room Attachment: </span>
                Server loads existing document updates from PostgreSQL into Yjs memory state.
              </li>
              <li>
                <span className="font-semibold text-slate-100">Delta Synchronization: </span>
                Concurrent changes broadcast to room participants via CRDT update vectors.
              </li>
              <li>
                <span className="font-semibold text-slate-100">Presence Broadcast: </span>
                Cursor coordinates and peer metadata synchronized with sub-second latency.
              </li>
              <li>
                <span className="font-semibold text-slate-100">Persistence & Draining: </span>
                Updates flushed reliably to PostgreSQL; idle rooms cleanly de-allocated.
              </li>
            </ol>
          </div>

          <div className="mt-6 pt-4 border-t border-border/60">
            <span className="text-xs text-slate-400 flex items-center gap-1.5">
              <span>Full WebSocket room synchronization activates in Phase 1</span>
              <ArrowRight className="h-3.5 w-3.5 text-indigo-400" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
