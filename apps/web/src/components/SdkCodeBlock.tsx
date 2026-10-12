'use client';

import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

const CODE_EXAMPLES = [
  {
    id: 'client',
    label: '1. Initialize Client',
    filename: 'client.ts',
    code: `import { SyncForgeClient } from '@syncforge/sdk';

// Initialize the SyncForge client instance
export const client = new SyncForgeClient({
  serverUrl: process.env.NEXT_PUBLIC_SYNCFORGE_URL || 'http://localhost:4000',
  apiKey: process.env.SYNCFORGE_API_KEY,
  autoConnect: true,
  reconnectAttempts: 5,
});

// Subscribe to connection lifecycle updates
client.onConnectionStateChange((state) => {
  console.log('SyncForge connection state:', state);
});`,
  },
  {
    id: 'room',
    label: '2. Join Room & Sync',
    filename: 'collaborative-session.ts',
    code: `import { client } from './client';

async function startCollaboration(roomId: string) {
  // Join or create the collaborative room
  const session = await client.joinRoom(roomId);

  console.log('Joined collaboration room:', session.roomId);

  // Update local cursor & presence
  session.updatePresence({
    userName: 'Alex Chen',
    cursor: { x: 240, y: 180 },
    color: '#06b6d4',
  });
}`,
  },
  {
    id: 'canvas',
    label: '3. Shared Canvas Integration',
    filename: 'useCollaborativeCanvas.ts',
    code: `import { useEffect, useState } from 'react';
import { client } from './client';
import type { UserPresence } from '@syncforge/shared';

export function useCollaborativeCanvas(roomId: string) {
  const [peers, setPeers] = useState<UserPresence[]>([]);

  useEffect(() => {
    let active = true;

    async function init() {
      const room = await client.joinRoom(roomId);
      // In Phase 2: Live cursor and shape observation
    }

    init();
    return () => {
      active = false;
    };
  }, [roomId]);

  return { peers };
}`,
  },
];

export function SdkCodeBlock() {
  const [activeTab, setActiveTab] = useState(CODE_EXAMPLES[0]!.id);
  const [copied, setCopied] = useState(false);

  const currentExample = CODE_EXAMPLES.find((e) => e.id === activeTab) || CODE_EXAMPLES[0]!;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(currentExample.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard', err);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-surface shadow-2xl overflow-hidden">
      {/* Tab Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-border bg-surface/80 px-4 py-2.5">
        <div className="flex items-center gap-1.5 sm:gap-2">
          {CODE_EXAMPLES.map((example) => (
            <button
              key={example.id}
              onClick={() => setActiveTab(example.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === example.id
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'text-slate-400 hover:bg-surfaceHover hover:text-slate-200'
              }`}
            >
              {example.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-slate-500 hidden sm:inline">
            {currentExample.filename}
          </span>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 rounded-md border border-slate-700 bg-surfaceHover px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
            title="Copy code snippet"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Code body */}
      <pre className="overflow-x-auto p-4 sm:p-6 font-mono text-xs sm:text-sm text-slate-300 leading-relaxed bg-[#0a0e17]">
        <code>{currentExample.code}</code>
      </pre>
    </div>
  );
}
