'use client';

import React from 'react';
import { ViewportPortal } from '@xyflow/react';
import { UserPresence } from '@syncforge/shared';

interface LiveCursorsProps {
  peers: UserPresence[];
  currentUserId?: string;
}

export function LiveCursors({ peers, currentUserId }: LiveCursorsProps) {
  // Filter for remote peers with valid cursor coordinates
  const remoteCursors = peers.filter(
    (p) =>
      p.userId !== currentUserId &&
      p.cursor &&
      typeof p.cursor.x === 'number' &&
      typeof p.cursor.y === 'number',
  );

  if (remoteCursors.length === 0) return null;

  return (
    <ViewportPortal>
      <div className="pointer-events-none absolute inset-0 z-50 overflow-visible">
        {remoteCursors.map((peer) => {
          const { x, y } = peer.cursor!;
          const color = peer.color || '#6366f1';

          return (
            <div
              key={peer.userId}
              className="absolute left-0 top-0 transition-transform duration-75 ease-out"
              style={{
                transform: `translate(${x}px, ${y}px)`,
              }}
            >
              {/* Cursor SVG Arrow */}
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="drop-shadow-md"
              >
                <path
                  d="M5.65376 12.3673H5.46026L5.31717 12.4976L0.500002 16.8829L0.500002 1.19841L11.7841 12.3673H5.65376Z"
                  fill={color}
                  stroke="#ffffff"
                  strokeWidth="1.2"
                />
              </svg>

              {/* Cursor Name Tag */}
              <div
                className="ml-3 mt-1 flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-white shadow-lg whitespace-nowrap"
                style={{ backgroundColor: color }}
              >
                <span>{peer.userName || 'Collaborator'}</span>
              </div>
            </div>
          );
        })}
      </div>
    </ViewportPortal>
  );
}
