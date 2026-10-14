'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { Terminal, Lock, Mail, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const handleForgotPassword = async () => {
    if (!email) {
      setError('Please enter your email address to request a reset token');
      return;
    }
    setError(null);
    try {
      const res = await api.requestPasswordReset(email);
      setResetMessage(res.resetToken ? `Reset token generated: ${res.resetToken}` : res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset request failed');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login(email, password);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemo = () => {
    setEmail('developer@syncforge.dev');
    setPassword('Password123!');
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary-600 text-white shadow-lg shadow-primary-600/30">
            <Terminal className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-white">
            Welcome to SyncForge
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            Sign in to access your Developer Console, project API keys, and real-time collaboration
            metrics.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-surface/90 backdrop-blur-xl p-8 shadow-2xl">
          {error && (
            <div className="mb-6 flex items-start gap-3 rounded-lg border border-rose-800/40 bg-rose-950/40 p-4 text-sm text-rose-300">
              <AlertCircle className="h-5 w-5 shrink-0 text-rose-400 mt-0.5" />
              <div>
                <span className="font-semibold">Authentication Failed: </span>
                {error}
              </div>
            </div>
          )}

          {resetMessage && (
            <div className="mb-6 flex items-start gap-3 rounded-lg border border-emerald-800/40 bg-emerald-950/40 p-4 text-sm text-emerald-300">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400 mt-0.5" />
              <div>{resetMessage}</div>
            </div>
          )}

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-slate-300 mb-1.5">
                Email Address
              </label>
              <div className="relative rounded-lg shadow-sm">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Mail className="h-4 w-4 text-slate-500" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="block w-full rounded-lg border border-border bg-[#0c101a] py-2.5 pl-10 pr-3 text-sm text-white placeholder-slate-500 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium uppercase tracking-wider text-slate-300">
                  Password
                </label>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-xs text-primary-400 hover:text-primary-300 transition-colors"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative rounded-lg shadow-sm">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Lock className="h-4 w-4 text-slate-500" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="block w-full rounded-lg border border-border bg-[#0c101a] py-2.5 pl-10 pr-3 text-sm text-white placeholder-slate-500 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 transition-colors"
            >
              {loading ? (
                <span>Authenticating...</span>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-border/60 flex flex-col gap-3">
            <button
              type="button"
              onClick={handleQuickDemo}
              className="text-xs text-cyan-400 hover:text-cyan-300 font-mono text-center transition-colors"
            >
              Use demo values: developer@syncforge.dev
            </button>
            <div className="text-center text-xs text-slate-400">
              New to SyncForge?{' '}
              <Link
                href="/register"
                className="font-semibold text-primary-400 hover:text-primary-300"
              >
                Create a developer account
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
