'use client';
// Phase 1.1 — Landing page of the reset link sent by email.
// URL: /reset-password?type=user|admin&tenant=<id>&token=<raw>
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { authApi } from '@/lib/api';

export default function ResetPasswordPage() {
  const [type, setType] = useState<'user' | 'admin'>('user');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      if (q.get('type') === 'admin') setType('admin');
      setToken(q.get('token') || '');
      const t = q.get('tenant');
      if (t) localStorage.setItem('tradexlabel-tenant', t);
    } catch { /* ignore */ }
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setLoading(true);
    try {
      if (type === 'admin') await authApi.adminResetPassword(token, password);
      else await authApi.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setLoading(false);
    }
  };

  const input = 'w-full bg-card border border-border rounded-lg text-sm px-3.5 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition';
  const backHref = type === 'admin' ? '/crm' : '/';

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm bg-card/60 border border-border rounded-2xl p-8 shadow-xl">
        <h1 className="text-lg font-semibold text-foreground mb-1">Choose a new password</h1>
        <p className="text-xs text-muted-foreground mb-6">{type === 'admin' ? 'Broker staff account' : 'Trading account'}</p>

        {!token ? (
          <div className="text-sm text-sell bg-sell/10 border border-sell/20 rounded-lg px-4 py-3">
            This link is missing its token. Request a new one from the <Link href={`/forgot-password?type=${type}`} className="underline">forgot password</Link> page.
          </div>
        ) : done ? (
          <div className="text-sm text-foreground bg-primary/10 border border-primary/20 rounded-lg px-4 py-3">
            Your password has been changed.
            <div className="mt-4"><Link href={backHref} className="text-xs text-primary hover:underline">Sign in</Link></div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground font-medium block mb-1.5">New password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} className={input} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium block mb-1.5">Confirm password</label>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} className={input} />
            </div>
            {error && <div className="text-xs text-sell bg-sell/10 border border-sell/20 rounded-lg px-3.5 py-2.5">{error}</div>}
            <button type="submit" disabled={loading}
              className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold text-sm py-3 rounded-lg transition-all disabled:opacity-50">
              {loading ? 'Saving…' : 'Save new password'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
