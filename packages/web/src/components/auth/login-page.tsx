'use client';
import { useState } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { authApi } from '@/lib/api';

export function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Phase 1.2: after registering, hold the session until the user has read the confirmation notice.
  const [pendingLogin, setPendingLogin] = useState<null | (() => void)>(null);
  const login = useAuthStore((s) => s.login);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) {
      setError('Please enter your Broker ID');
      return;
    }
    setLoading(true);
    setError('');

    try {
      if (mode === 'login') {
        const data = await authApi.login(tenantId, { email, password });
        login({ token: data.token, refreshToken: data.refreshToken, user: data.user, tenantId, execution_mode: data.execution_mode });
      } else {
        const data = await authApi.register(tenantId, { email, password, name });
        const enter = () => login({ token: data.token, refreshToken: data.refreshToken, user: data.user, tenantId, execution_mode: data.execution_mode });
        if (data.email_verification_required) setPendingLogin(() => enter); else enter();
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left panel — branding (bicolor: dark panel) */}
      <div className="hidden lg:flex lg:w-[480px] xl:w-[540px] surface-sidebar flex-col justify-between p-10 relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-blue-500/10 blur-3xl" />
          <div className="absolute -bottom-24 -left-24 w-64 h-64 rounded-full bg-blue-400/5 blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-blue-500/5 blur-3xl" />
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
              <span className="text-sm font-black text-white tracking-tight">TX</span>
            </div>
            <span className="text-xl font-bold">TradeXLabel</span>
          </div>
          <p className="text-sm sidebar-muted mt-1">Enterprise Trading Platform</p>
        </div>

        <div className="relative z-10 space-y-8">
          <div>
            <h2 className="text-2xl font-bold leading-tight">
              Trade smarter.<br />
              <span className="text-blue-400">Grow faster.</span>
            </h2>
            <p className="sidebar-muted text-sm mt-3 leading-relaxed max-w-sm">
              Access 500+ instruments across Forex, Crypto, Indices and Commodities with institutional-grade execution.
            </p>
          </div>

          <div className="flex gap-6">
            <div>
              <div className="text-2xl font-bold text-blue-400">500+</div>
              <div className="text-[11px] sidebar-muted">Instruments</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-400">0.1ms</div>
              <div className="text-[11px] sidebar-muted">Execution</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-amber-400">1:500</div>
              <div className="text-[11px] sidebar-muted">Leverage</div>
            </div>
          </div>
        </div>

        <div className="relative z-10">
          <p className="text-[10px] sidebar-muted">
            Risk Warning: Trading leveraged products carries significant risk of loss.
          </p>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="text-center mb-8 lg:hidden">
            <div className="inline-flex items-center gap-2.5 mb-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg">
                <span className="text-sm font-black text-white">TX</span>
              </div>
              <span className="text-lg font-bold text-foreground">TradeXLabel</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {mode === 'login' ? 'Sign in to start trading' : 'Create your trading account'}
            </p>
          </div>

          {/* Desktop header */}
          <div className="hidden lg:block mb-8">
            <h1 className="text-2xl font-bold text-foreground">
              {mode === 'login' ? 'Welcome back' : 'Get started'}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {mode === 'login' ? 'Sign in to your trading account' : 'Create a new trading account'}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground font-medium block mb-1.5">Broker ID</label>
              <input
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                placeholder="Enter your broker UUID"
                className="w-full bg-card border border-border rounded-lg text-sm px-3.5 py-2.5 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition"
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground font-medium block mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-card border border-border rounded-lg text-sm px-3.5 py-2.5 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition"
              />
            </div>

            {mode === 'register' && (
              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1.5">Full Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full bg-card border border-border rounded-lg text-sm px-3.5 py-2.5 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition"
                />
              </div>
            )}

            <div>
              <label className="text-xs text-muted-foreground font-medium block mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-card border border-border rounded-lg text-sm px-3.5 py-2.5 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition"
              />
            </div>

            {pendingLogin && (
              <div className="text-xs text-foreground bg-primary/10 border border-primary/20 rounded-lg px-3.5 py-3 space-y-2">
                <div>Account created. We sent a confirmation link to <span className="font-medium">{email}</span>. You can explore the platform now; trading unlocks once your email is confirmed.</div>
                <button type="button" onClick={pendingLogin} className="text-xs font-semibold text-primary hover:underline">Continue to the terminal</button>
              </div>
            )}
            {error && (
              <div className="text-xs text-sell bg-sell/10 border border-sell/20 rounded-lg px-3.5 py-2.5 flex items-center gap-2">
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold text-sm py-3 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/25 active:scale-[0.98]"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Processing...
                </span>
              ) : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <div className="mt-6 text-center space-y-2">
            {mode === 'login' && (
              <div>
                <a href={`/forgot-password?type=user${tenantId ? `&tenant=${tenantId}` : ''}`} className="text-xs text-muted-foreground hover:text-primary transition-colors">
                  Forgot your password?
                </a>
              </div>
            )}
            <button
              type="button"
              onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
              className="text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              {mode === 'login' ? "Don't have an account? Register" : 'Already have an account? Sign in'}
            </button>
          </div>

          {/* Risk warning - mobile */}
          <p className="text-center text-[10px] text-muted-foreground/50 mt-6 lg:hidden">
            Risk Warning: Trading CFDs involves significant risk of loss.
          </p>
        </div>
      </div>
    </div>
  );
}
