import React from 'react';
import Link from 'next/link';

export function Footer() {
  return (
    <footer className="border-t border-border bg-surface/50 text-slate-400 text-sm">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4 text-center sm:text-left">
            <span className="font-semibold text-slate-200">SyncForge Infrastructure</span>
            <span className="hidden sm:inline text-slate-600">•</span>
            <span className="text-xs text-slate-400">
              TypeScript Monorepo & Collaboration Engine Foundation
            </span>
          </div>

          <div className="flex items-center gap-6 text-xs text-slate-400">
            <Link href="/docs" className="hover:text-slate-200 transition-colors">
              Architecture & Guides
            </Link>
            <a
              href="https://github.com/yjs/yjs"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-200 transition-colors"
            >
              Yjs CRDT
            </a>
            <span className="text-slate-600">|</span>
            <span className="text-slate-500">Node v24 • Strict TypeScript 5</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
