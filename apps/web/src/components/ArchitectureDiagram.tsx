'use client';

import React from 'react';
import { Database, Cpu, Globe, Server, CheckCircle2, Clock } from 'lucide-react';

export function ArchitectureDiagram() {
  return (
    <div className="rounded-xl border border-border bg-surface p-6 shadow-2xl">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/60 pb-4">
        <div>
          <h3 className="text-base font-semibold text-white">
            System Architecture & Boundary Model
          </h3>
          <p className="text-xs text-slate-400">
            Clear separation between public SDK, WebSocket gateway, CRDT state engine, and durable
            storage.
          </p>
        </div>
        <span className="self-start sm:self-auto rounded-full bg-indigo-950/60 px-3 py-1 text-xs font-mono text-indigo-400 border border-indigo-800/40">
          SyncForge Topology
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Layer 1: Client Application */}
        <div className="flex flex-col justify-between rounded-lg border border-slate-800 bg-[#0d131f] p-4">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-cyan-400" />
                <span className="font-semibold text-xs uppercase tracking-wider text-slate-200">
                  Client Apps
                </span>
              </div>
              <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-mono">
                <CheckCircle2 className="h-3 w-3" /> Ready
              </span>
            </div>
            <p className="text-xs text-slate-400 mb-3">
              React, Next.js, or TypeScript applications embedding the collaboration client.
            </p>
            <div className="space-y-1.5 font-mono text-[11px]">
              <div className="rounded bg-slate-900/80 px-2 py-1 text-slate-300 border border-slate-800">
                @syncforge/sdk
              </div>
              <div className="rounded bg-slate-900/80 px-2 py-1 text-slate-400 border border-slate-800">
                @syncforge/shared
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800 text-[10px] text-slate-500">
            Transport: WSS / HTTPS
          </div>
        </div>

        {/* Layer 2: Fastify Gateway */}
        <div className="flex flex-col justify-between rounded-lg border border-slate-800 bg-[#0d131f] p-4">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Server className="h-4 w-4 text-indigo-400" />
                <span className="font-semibold text-xs uppercase tracking-wider text-slate-200">
                  API & Gateway
                </span>
              </div>
              <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-mono">
                <CheckCircle2 className="h-3 w-3" /> Active
              </span>
            </div>
            <p className="text-xs text-slate-400 mb-3">
              Fastify HTTP endpoints, health probes, CORS validation, and correlation IDs.
            </p>
            <div className="space-y-1.5 font-mono text-[11px]">
              <div className="rounded bg-slate-900/80 px-2 py-1 text-emerald-400 border border-slate-800">
                /healthz & /readyz
              </div>
              <div className="rounded bg-slate-900/80 px-2 py-1 text-slate-400 border border-slate-800">
                /api/v1/info
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800 text-[10px] text-slate-500">
            Runtime: Node 24 + Fastify 5
          </div>
        </div>

        {/* Layer 3: CRDT & Rooms */}
        <div className="flex flex-col justify-between rounded-lg border border-dashed border-slate-700 bg-[#0d131f]/60 p-4">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-amber-400" />
                <span className="font-semibold text-xs uppercase tracking-wider text-slate-200">
                  Sync Engine
                </span>
              </div>
              <span className="flex items-center gap-1 text-[10px] text-amber-400 font-mono">
                <Clock className="h-3 w-3" /> Phase 1
              </span>
            </div>
            <p className="text-xs text-slate-400 mb-3">
              Yjs conflict-free replicated data types, room connection lifecycles, and delta sync.
            </p>
            <div className="space-y-1.5 font-mono text-[11px]">
              <div className="rounded bg-slate-900/50 px-2 py-1 text-slate-400 border border-slate-800">
                Yjs Doc Management
              </div>
              <div className="rounded bg-slate-900/50 px-2 py-1 text-slate-400 border border-slate-800">
                Presence & Cursors (Ph. 2)
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800 text-[10px] text-slate-500">
            CRDT: Yjs State Updates
          </div>
        </div>

        {/* Layer 4: Storage & Coordination */}
        <div className="flex flex-col justify-between rounded-lg border border-slate-800 bg-[#0d131f] p-4">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-emerald-400" />
                <span className="font-semibold text-xs uppercase tracking-wider text-slate-200">
                  Persistence
                </span>
              </div>
              <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-mono">
                <CheckCircle2 className="h-3 w-3" /> Schema Ready
              </span>
            </div>
            <p className="text-xs text-slate-400 mb-3">
              PostgreSQL for durable update logs and rooms; Redis for multi-instance coordination.
            </p>
            <div className="space-y-1.5 font-mono text-[11px]">
              <div className="rounded bg-slate-900/80 px-2 py-1 text-slate-300 border border-slate-800">
                PostgreSQL 16 (Durable)
              </div>
              <div className="rounded bg-slate-900/80 px-2 py-1 text-slate-400 border border-slate-800">
                Redis 7 (Coordination)
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800 text-[10px] text-slate-500">
            Docker Compose Configured
          </div>
        </div>
      </div>
    </div>
  );
}
