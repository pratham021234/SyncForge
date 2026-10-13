'use client';

import React from 'react';
import { Users } from 'lucide-react';
import { UserPresence } from '@syncforge/shared';

interface PresenceRosterProps {
  peers: UserPresence[];
  currentUserId?: string;
}

export function PresenceRoster({ peers, currentUserId }: PresenceRosterProps) {
  // Sort with current user first
  const sortedPeers = [...peers].sort((a, b) => {
    if (a.userId === currentUserId) return -1;
    if (b.userId === currentUserId) return 1;
    return (a.userName || '').localeCompare(b.userName || '');
  });

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-slate-900/80 border border-slate-800 text-xs text-slate-300">
        <Users className="h-3.5 w-3.5 text-cyan-400" />
        <span className="font-mono text-cyan-300 font-semibold">{peers.length}</span>
        <span className="text-[11px] text-slate-400 hidden sm:inline">online</span>
      </div>

      {/* Avatar Stack */}
      <div className="flex -space-x-1.5 overflow-hidden p-0.5">
        {sortedPeers.slice(0, 5).map((peer) => {
          const isMe = peer.userId === currentUserId;
          const initials = (peer.userName || 'U')
            .split(' ')
            .map((n) => n[0])
            .slice(0, 2)
            .join('')
            .toUpperCase();
          const color = peer.color || '#6366f1';

          return (
            <div
              key={peer.userId}
              className="group relative inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#090d16] font-mono text-[10px] font-bold text-white shadow-sm transition-transform hover:scale-110 hover:z-20 cursor-default"
              style={{ backgroundColor: color }}
              title={`${peer.userName || 'Collaborator'}${isMe ? ' (You)' : ''}`}
            >
              <span>{initials}</span>

              {/* Hover Tooltip */}
              <div className="pointer-events-none absolute bottom-full mb-1.5 hidden group-hover:flex flex-col items-center">
                <span className="rounded bg-black/90 px-2 py-0.5 text-[10px] font-sans font-medium text-white shadow whitespace-nowrap border border-slate-700">
                  {peer.userName || 'Collaborator'}{' '}
                  {isMe && <span className="text-cyan-300">(You)</span>}
                </span>
              </div>
            </div>
          );
        })}

        {sortedPeers.length > 5 && (
          <div className="inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#090d16] bg-slate-800 text-[10px] font-semibold text-slate-300 shadow-sm">
            +{sortedPeers.length - 5}
          </div>
        )}
      </div>
    </div>
  );
}
