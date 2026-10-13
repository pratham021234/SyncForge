'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Terminal, Layers, BookOpen, LayoutDashboard, Radio } from 'lucide-react';

export function Navbar() {
  const pathname = usePathname();

  const navItems = [
    { href: '/', label: 'Overview', icon: Layers },
    { href: '/dashboard', label: 'Console', icon: LayoutDashboard },
    { href: '/rooms', label: 'Rooms', icon: Radio },
    { href: '/docs', label: 'Documentation', icon: BookOpen },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2.5 font-semibold text-lg tracking-tight">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-600 text-white shadow-lg shadow-primary-600/30">
              <Terminal className="h-5 w-5" />
            </div>
            <span className="text-white font-bold">SyncForge</span>
          </Link>
          <span className="hidden sm:inline-flex items-center rounded-full bg-cyan-950/60 px-2.5 py-0.5 text-xs font-medium text-cyan-400 border border-cyan-800/40">
            Phase 2 Live Canvas
          </span>
        </div>

        <nav className="flex items-center gap-1 sm:gap-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-surfaceHover text-white'
                    : 'text-slate-400 hover:bg-surface hover:text-slate-200'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <a
            href="http://localhost:4000/healthz"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden md:inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-mono text-slate-300 hover:border-slate-600 hover:text-white transition-colors"
            title="Inspect Fastify server liveness endpoint"
          >
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>API :4000</span>
          </a>
        </div>
      </div>
    </header>
  );
}
