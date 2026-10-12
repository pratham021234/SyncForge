'use client';

import React, { useState } from 'react';
import { Key, Shield, AlertCircle, Plus, Copy, Check } from 'lucide-react';

export default function DashboardPage() {
  const [copiedKey, setCopiedKey] = useState(false);

  const sampleApiKey = 'sf_dev_7f8a9b2c3d4e5f6a1b2c3d4e5f6a7b8c';

  const handleCopy = () => {
    navigator.clipboard.writeText(sampleApiKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Developer Console
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Project configuration, API credentials, and room tenancy management.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-950/60 px-3 py-1 text-xs font-medium text-amber-400 border border-amber-800/40">
            <AlertCircle className="h-3.5 w-3.5" />
            <span>Phase 4 Architecture Target</span>
          </span>
        </div>
      </div>

      {/* Info Callout */}
      <div className="mt-6 rounded-lg border border-border bg-surface p-4 text-xs text-slate-300">
        <span className="font-semibold text-slate-100">Foundational Shell: </span>
        The API key hashing table (`api_keys`) and project namespace table (`projects`) are
        established in the database migration schema. Full cryptographic key issuance and project
        RBAC will be enabled in Phase 4.
      </div>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Projects & API Keys */}
        <div className="lg:col-span-2 space-y-6">
          {/* Projects Card */}
          <div className="rounded-xl border border-border bg-surface p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Active Projects</h2>
              <button
                disabled
                className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-400 cursor-not-allowed opacity-60"
                title="Enabled in Phase 4"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>New Project (Phase 4)</span>
              </button>
            </div>
            <div className="divide-y divide-border/60">
              <div className="py-3 flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm text-slate-200">Default Workspace</div>
                  <div className="text-xs text-slate-500 font-mono">slug: default-workspace</div>
                </div>
                <span className="rounded bg-emerald-950/60 px-2.5 py-0.5 text-[11px] font-mono text-emerald-400 border border-emerald-800/40">
                  Active
                </span>
              </div>
            </div>
          </div>

          {/* API Keys Card */}
          <div className="rounded-xl border border-border bg-surface p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Key className="h-4 w-4 text-cyan-400" />
                <h2 className="text-lg font-semibold text-white">API Credentials</h2>
              </div>
              <button
                disabled
                className="inline-flex items-center gap-1.5 rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-400 cursor-not-allowed opacity-60"
                title="Enabled in Phase 4"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Generate Key</span>
              </button>
            </div>

            <p className="text-xs text-slate-400 mb-4">
              API keys authenticate SDK client sessions and authorize WebSocket room joins.
            </p>

            <div className="rounded-lg border border-slate-800 bg-[#0c101a] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="font-mono text-xs text-slate-300 truncate">
                <span className="text-slate-500">Key Prefix: </span>sf_dev_7f8a...
              </div>
              <button
                onClick={handleCopy}
                className="self-start sm:self-auto inline-flex items-center gap-1 rounded bg-surfaceHover px-2.5 py-1 text-xs text-slate-300 hover:text-white transition-colors"
              >
                {copiedKey ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-400" />
                    <span className="text-emerald-400">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    <span>Copy Token</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Infrastructure Readiness */}
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-surface p-6">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="h-4 w-4 text-indigo-400" />
              <h2 className="text-lg font-semibold text-white">Infrastructure Status</h2>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Health checks for local development dependencies configured in docker-compose.
            </p>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between p-3 rounded-lg bg-[#0c101a] border border-slate-800">
                <span className="text-slate-300">Fastify Server (:4000)</span>
                <span className="font-mono text-emerald-400">Configured</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-[#0c101a] border border-slate-800">
                <span className="text-slate-300">PostgreSQL (:5432)</span>
                <span className="font-mono text-cyan-400">Docker Compose</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-[#0c101a] border border-slate-800">
                <span className="text-slate-300">Redis (:6379)</span>
                <span className="font-mono text-cyan-400">Docker Compose</span>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-border/60">
              <a
                href="http://localhost:4000/readyz"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-indigo-400 hover:underline flex items-center gap-1"
              >
                <span>Query Live Readiness Probe (/readyz)</span>
                <span>→</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
