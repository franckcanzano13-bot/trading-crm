'use client';
// Phase 1.1 — "Forgot password" request page, shared by traders (type=user)
// and broker staff (type=admin). Always shows the same confirmation whether
// or not the email exists (no account enumeration).
import { useState, useEffect } from 'react';
import { authApi } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [type, setType] = useState<'user' | 'admin'>('user');
  const [tenantId, setTenantId] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      if (q.get('type') === 'admin') setType('admin');
      const t = q.get('tenant') || localStorage.getItem('tradexlabel-tenant') || '';
      if (t) setTenantId(t);
    } catch { /* ignore */ }
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!tenantId) { setError('Broker (tenant) ID is required'); return; }
    setLoading(true);
    try {
      if (type === 'admin') await authApi.adminForgotPassword(tenantId, email);
      else await authApi.forgotPassword(tenantId, email);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const input = 'w-full bg-card border border-border rounded-lg text-sm px-3.5 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition';

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm bg-card/60 border border-border rounded-2xl p-8 shadow-xl">
        <h1 className="text-lg font-semibold text-foreground mb-1">Reset your password</h1>
        <p className="text-xs text-muted-foreground mb-6">
          {type === 'admin' ? 'Broker staff account' : 'Trading account'} — enter the email you signed up with.
        </p>

        {done ? (
          <div className="text-sm text-foreground bg-primary/10 border border-primary/20 rounded-lg px-4 py-3">
            If an account exists for <span className="font-medium">{email}</span>, a reset link has been sent. It is valid for 30 minutes.
            <div className="mt-4"><a href="/" className="text-xs text-primary hover:underline">Back to sign in</a></div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground font-medium block mb-1.5">Broker ID</label>
              <input value={tenantId} onChange={(e) => setTenantId(e.target.value)} required className={`${input} font-mono`} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium block mb-1.5">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={input} />
            </div>
            {error && <div className="text-xs text-sell bg-sell/10 border border-sell/20 rounded-lg px-3.5 py-2.5">{error}</div>}
            <button type="submit" disabled={loading}
              className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold text-sm py-3 rounded-lg transition-all disabled:opacity-50">
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
            <div className="text-center">
              <a href={type === 'admin' ? '/crm' : '/'} className="text-xs text-muted-foreground hover:text-primary transition-colors">Back to sign in</a>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
