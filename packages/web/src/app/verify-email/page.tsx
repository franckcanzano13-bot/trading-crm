'use client';
// Phase 1.2 — Landing page of the "confirm your email" link.
// URL: /verify-email?tenant=<id>&token=<raw>
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { authApi } from '@/lib/api';

export default function VerifyEmailPage() {
  const [state, setState] = useState<'working' | 'done' | 'error' | 'missing'>('working');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let token = '';
    try {
      const q = new URLSearchParams(window.location.search);
      token = q.get('token') || '';
      const t = q.get('tenant');
      if (t) localStorage.setItem('tradexlabel-tenant', t);
    } catch { /* ignore */ }
    if (!token) { setState('missing'); return; }
    authApi.verifyEmail(token)
      .then(() => setState('done'))
      .catch((err) => { setMessage(err instanceof Error ? err.message : 'Verification failed'); setState('error'); });
  }, []);

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm bg-card/60 border border-border rounded-2xl p-8 shadow-xl text-center">
        <h1 className="text-lg font-semibold text-foreground mb-4">Email confirmation</h1>
        {state === 'working' && <p className="text-sm text-muted-foreground">Confirming your address…</p>}
        {state === 'done' && (
          <div className="text-sm text-foreground bg-primary/10 border border-primary/20 rounded-lg px-4 py-3">
            Your email is confirmed. Trading is now enabled on your account.
            <div className="mt-4"><Link href="/" className="text-xs text-primary hover:underline">Go to the trading terminal</Link></div>
          </div>
        )}
        {state === 'missing' && (
          <div className="text-sm text-sell bg-sell/10 border border-sell/20 rounded-lg px-4 py-3">
            This link is missing its token. Sign in and use “Resend confirmation email” from your profile.
          </div>
        )}
        {state === 'error' && (
          <div className="text-sm text-sell bg-sell/10 border border-sell/20 rounded-lg px-4 py-3">
            {message}
            <div className="mt-3 text-xs text-muted-foreground">Sign in and request a new link if this one has expired.</div>
            <div className="mt-4"><Link href="/" className="text-xs text-primary hover:underline">Back to sign in</Link></div>
          </div>
        )}
      </div>
    </main>
  );
}
