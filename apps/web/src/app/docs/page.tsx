import React from 'react';
import { BookOpen, Shield, Cpu, Terminal, Compass } from 'lucide-react';

export default function DocsPage() {
  const docs = [
    {
      title: 'Architecture Guide',
      file: 'docs/architecture.md',
      desc: 'System topology, client SDK boundaries, Fastify gateway, Yjs CRDT model, PostgreSQL persistence, and Redis coordination.',
      icon: Cpu,
    },
    {
      title: 'Development Manual',
      file: 'docs/development.md',
      desc: 'Local Windows PowerShell/CMD setup, Docker Compose initialization, npm workspace commands, migration execution, and troubleshooting.',
      icon: Terminal,
    },
    {
      title: 'Security Baseline',
      file: 'docs/security.md',
      desc: 'Authentication vs. authorization, input schema validation, CORS origin allowlists, secret hygiene, and pre-deployment auditing requirements.',
      icon: Shield,
    },
    {
      title: 'Implementation Roadmap',
      file: 'docs/roadmap.md',
      desc: 'Staged 7-phase development roadmap from Phase 0 foundation through collaborative canvas, public SDK, enterprise RBAC, and self-hosted deployment.',
      icon: Compass,
    },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="border-b border-border pb-6">
        <div className="flex items-center gap-2 mb-2">
          <BookOpen className="h-6 w-6 text-indigo-400" />
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            SyncForge Engineering Documentation
          </h1>
        </div>
        <p className="text-sm text-slate-400 max-w-2xl">
          Comprehensive reference guides, architecture specifications, security policies, and
          development workflows.
        </p>
      </div>

      {/* Docs Grid */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
        {docs.map((doc) => {
          const Icon = doc.icon;
          return (
            <div
              key={doc.title}
              className="flex flex-col justify-between rounded-xl border border-border bg-surface p-6 hover:border-slate-700 transition-colors"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="font-mono text-xs text-slate-500">{doc.file}</span>
                </div>
                <h2 className="text-lg font-semibold text-white mb-2">{doc.title}</h2>
                <p className="text-xs text-slate-400 leading-relaxed">{doc.desc}</p>
              </div>

              <div className="mt-6 pt-4 border-t border-border/60">
                <span className="text-xs text-indigo-400 font-mono">
                  Read in repository root: {doc.file}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
