import React from 'react';
import Link from 'next/link';
import {
  Code2,
  Workflow,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Zap,
  RefreshCw,
  Share2,
  Lock,
  Layers,
} from 'lucide-react';
import { SdkCodeBlock } from '@/components/SdkCodeBlock';
import { ArchitectureDiagram } from '@/components/ArchitectureDiagram';

export default function HomePage() {
  const problems = [
    {
      title: 'Lost Updates & Concurrency',
      desc: 'Multiple users modifying state concurrently causes overwrite conflicts without a formal CRDT model.',
      icon: RefreshCw,
    },
    {
      title: 'State Recovery & Durability',
      desc: 'Handling network disconnections, tab switches, and server restarts without corrupting shared state.',
      icon: ShieldCheck,
    },
    {
      title: 'Presence & Cursor Latency',
      desc: 'Broadcasting high-frequency cursor positions and ephemeral presence without overloading databases.',
      icon: Zap,
    },
    {
      title: 'Multi-Tenant Room Isolation',
      desc: 'Safely partitioning document rooms, authorization checks, and connection lifecycles across projects.',
      icon: Lock,
    },
  ];

  const plannedCapabilities = [
    {
      title: 'Yjs CRDT Synchronization',
      phase: 'Phase 1',
      status: 'Planned',
      desc: 'Mathematically proven conflict-free convergence for document trees, text, and graph structures.',
    },
    {
      title: 'Durable PostgreSQL Persistence',
      phase: 'Phase 0 & 1',
      status: 'Schema Ready',
      desc: 'Append-only document update logs with transactional integrity and compaction strategies.',
    },
    {
      title: 'Live Cursors & User Presence',
      phase: 'Phase 2',
      status: 'Planned',
      desc: 'Low-latency ephemeral state synchronization with smooth interpolation and color assignment.',
    },
    {
      title: 'Collaborative Canvas Engine',
      phase: 'Phase 2',
      status: 'Planned Demo',
      desc: 'Shared multi-user whiteboard demo supporting interactive shapes, nodes, connections, and notes.',
    },
    {
      title: 'Public TypeScript Client SDK',
      phase: 'Phase 0 & 3',
      status: 'Core Types Ready',
      desc: 'Minimal-footprint, framework-agnostic client with typed connection listeners and room handles.',
    },
    {
      title: 'Self-Hostable Docker Topology',
      phase: 'Phase 0 & 6',
      status: 'Compose Configured',
      desc: 'Turnkey PostgreSQL and Redis containers with production health probes and zero vendor lock-in.',
    },
  ];

  return (
    <div className="flex flex-col gap-16 pb-20 pt-10 sm:gap-24 sm:pt-16">
      {/* 1. HERO SECTION */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3.5 py-1 text-xs font-medium text-indigo-300 mb-6">
            <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
            <span>Developer-Focused Infrastructure Platform</span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-tight">
            Real-Time Collaboration Infrastructure for{' '}
            <span className="bg-gradient-to-r from-indigo-400 via-cyan-400 to-sky-400 bg-clip-text text-transparent">
              Modern Applications
            </span>
          </h1>

          <p className="mt-6 text-base sm:text-lg text-slate-300 leading-relaxed max-w-2xl">
            Integrate synchronized shared state, collaborative documents, live cursors, presence,
            and interactive canvases without building synchronization infrastructure from scratch.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/docs"
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-primary-600/25 hover:bg-primary-500 transition-all"
            >
              <Workflow className="h-4 w-4" />
              <span>Explore Architecture & Roadmap</span>
              <ArrowRight className="h-4 w-4" />
            </Link>

            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-5 py-3 text-sm font-semibold text-slate-200 hover:bg-surfaceHover hover:text-white transition-all"
            >
              <Layers className="h-4 w-4 text-cyan-400" />
              <span>Developer Console Shell</span>
            </Link>
          </div>

          {/* Foundation Status Alert */}
          <div className="mt-8 rounded-lg border border-cyan-800/50 bg-cyan-950/30 p-4 text-left max-w-2xl w-full">
            <div className="flex items-start gap-3">
              <Code2 className="h-5 w-5 text-cyan-400 mt-0.5 shrink-0" />
              <div className="text-xs text-cyan-200/90 leading-relaxed">
                <span className="font-semibold text-cyan-100">
                  Phase 0 Engineering Foundation:{' '}
                </span>
                Monorepo workspace, strict TypeScript tooling, Fastify gateway, local PostgreSQL &
                Redis infrastructure, database migration runner, and testing harnesses are
                initialized. Full CRDT synchronization transport will be activated in Phase 1.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. THE ENGINEERING CHALLENGE WE SOLVE */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 text-center sm:text-left">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            The Distributed Synchronization Challenge
          </h2>
          <p className="mt-2 text-sm text-slate-400 max-w-2xl">
            Building reliable multiplayer collaboration requires solving complex distributed systems
            edge cases. SyncForge encapsulates these primitives into a reusable platform.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {problems.map((problem) => {
            const Icon = problem.icon;
            return (
              <div
                key={problem.title}
                className="flex flex-col rounded-xl border border-border bg-surface p-5 hover:border-slate-700 transition-colors"
              >
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold text-white mb-2">{problem.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">{problem.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. ARCHITECTURE VISUALIZATION */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <ArchitectureDiagram />
      </section>

      {/* 4. SDK PREVIEW */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Integration Experience
            </h2>
            <p className="mt-2 text-sm text-slate-400 max-w-xl">
              SyncForge exposes an intuitive, typed TypeScript SDK. Embed multi-user state
              synchronization in minutes without managing raw WebSocket buffers.
            </p>
          </div>
          <span className="self-start sm:self-auto rounded-md bg-slate-800 px-3 py-1 font-mono text-xs text-slate-300 border border-slate-700">
            @syncforge/sdk
          </span>
        </div>

        <SdkCodeBlock />
      </section>

      {/* 5. ROADMAP & CAPABILITIES */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 text-center sm:text-left">
          <div className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-cyan-400 mb-2">
            <Share2 className="h-3.5 w-3.5" />
            <span>Architecture Roadmap</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Core Capabilities & Phased Evolution
          </h2>
          <p className="mt-2 text-sm text-slate-400 max-w-2xl">
            A staged, transparent roadmap ensuring architectural stability before feature expansion.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {plannedCapabilities.map((cap) => (
            <div
              key={cap.title}
              className="flex flex-col justify-between rounded-xl border border-border bg-surface p-5 hover:border-slate-700 transition-colors"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-mono text-indigo-400">{cap.phase}</span>
                  <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-[10px] font-mono text-slate-300 border border-slate-700">
                    {cap.status}
                  </span>
                </div>
                <h3 className="text-base font-semibold text-white mb-2">{cap.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">{cap.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
