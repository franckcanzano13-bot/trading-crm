'use client';
import { useState, useEffect, useCallback } from 'react';
import { superAdminApi } from '@/lib/api';
import { useThemeStore } from '@/stores/theme-store';

export default function SuperAdminPage() {
  const [token, setToken] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copiedId, setCopiedId] = useState('');

  const [tenants, setTenants] = useState<any[]>([]);
  const [monitoring, setMonitoring] = useState<any>(null);
  const [tab, setTab] = useState<'tenants' | 'monitoring' | 'create' | 'settings' | 'analytics' | 'billing' | 'audit'>('tenants');
  const [togglingTenant, setTogglingTenant] = useState('');
  const [analytics, setAnalytics] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [assignPlan, setAssignPlan] = useState({ tenant_id: '', plan_id: '', trial: false });

  const [newTenant, setNewTenant] = useState({
    name: '', domain: '', slug: '', execution_mode: 'B_BOOK',
    admin_email: '', admin_password: '', admin_name: '',
  });

  const [settings, setSettings] = useState({
    platform_name: 'TradeXLabel',
    default_execution_mode: 'B_BOOK',
    max_leverage: '500',
    jwt_expiry: '24h',
  });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const data = await superAdminApi.login({ email, password });
      setToken(data.token);
      setIsLoggedIn(true);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const refreshData = useCallback(() => {
    if (!token) return;
    superAdminApi.getTenants(token).then(setTenants).catch(() => {});
    superAdminApi.getMonitoring(token).then(setMonitoring).catch(() => {});
    superAdminApi.getAnalytics(token).then(setAnalytics).catch(() => {});
    superAdminApi.getPlans(token).then(setPlans).catch(() => {});
    superAdminApi.getInvoices(token).then(setInvoices).catch(() => {});
    superAdminApi.getAuditLogs(token).then(setAuditLogs).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!isLoggedIn) return;
    refreshData();
  }, [isLoggedIn, refreshData]);

  const handleToggleTenant = async (tenant: any) => {
    setTogglingTenant(tenant.id);
    setError('');
    try {
      await superAdminApi.updateTenant(token, tenant.id, { is_active: !tenant.is_active });
      const data = await superAdminApi.getTenants(token);
      setTenants(data);
      setSuccess(`Broker "${tenant.name}" ${tenant.is_active ? 'disabled' : 'enabled'} successfully`);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setTogglingTenant('');
    }
  };

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(''), 2000);
    });
  };

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await superAdminApi.createTenant(token, newTenant);
      const data = await superAdminApi.getTenants(token);
      setTenants(data);
      setSuccess('Broker created successfully!');
      setTimeout(() => setSuccess(''), 3000);
      setTab('tenants');
      setNewTenant({ name: '', domain: '', slug: '', execution_mode: 'B_BOOK', admin_email: '', admin_password: '', admin_name: '' });
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex bg-background">
        {/* Left branding */}
        <div className="hidden lg:flex lg:w-[440px] surface-sidebar flex-col justify-between p-10 relative overflow-hidden">
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-purple-500/10 blur-3xl" />
            <div className="absolute -bottom-24 -left-24 w-64 h-64 rounded-full bg-blue-500/8 blur-3xl" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center shadow-lg shadow-purple-500/25">
                <span className="text-sm font-black text-white">TX</span>
              </div>
              <div>
                <span className="text-xl font-bold block">TradeXLabel</span>
                <span className="text-[11px] sidebar-muted">SuperAdmin</span>
              </div>
            </div>
          </div>
          <div className="relative z-10 space-y-4">
            <h2 className="text-2xl font-bold leading-tight">
              Platform<br /><span className="text-purple-400">Control Center</span>
            </h2>
            <p className="sidebar-muted text-sm leading-relaxed max-w-sm">
              Manage brokers, monitor system health, and configure the entire platform from a single dashboard.
            </p>
          </div>
          <div className="relative z-10">
            <p className="text-[10px] sidebar-muted">TradeXLabel Platform v1.0</p>
          </div>
        </div>

        {/* Login */}
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-sm">
            <div className="hidden lg:block mb-8">
              <h1 className="text-2xl font-bold text-foreground">SuperAdmin</h1>
              <p className="text-sm text-muted-foreground mt-1">Platform-level administration</p>
            </div>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1.5">Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                  className="w-full bg-card border border-border rounded-lg text-sm px-3.5 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1.5">Password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
                  className="w-full bg-card border border-border rounded-lg text-sm px-3.5 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition" />
              </div>
              {error && <div className="text-xs text-sell bg-sell/10 border border-sell/20 rounded-lg px-3.5 py-2.5">{error}</div>}
              <button type="submit"
                className="w-full bg-gradient-to-r from-purple-500 to-blue-600 hover:from-purple-600 hover:to-blue-700 text-white font-semibold text-sm py-3 rounded-lg transition-all shadow-lg shadow-purple-500/25 active:scale-[0.98]">
                Sign In
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  const TABS = [
    { key: 'tenants' as const, label: 'Brokers', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
    { key: 'analytics' as const, label: 'Analytics', icon: 'M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z' },
    { key: 'billing' as const, label: 'Billing', icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
    { key: 'monitoring' as const, label: 'Monitoring', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
    { key: 'audit' as const, label: 'Audit Log', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    { key: 'create' as const, label: 'New Broker', icon: 'M12 6v6m0 0v6m0-6h6m-6 0H6' },
    { key: 'settings' as const, label: 'Settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
  ];

  const totalUsers = tenants.reduce((sum: number, t: any) => sum + (t.user_count || 0), 0);
  const totalBalance = tenants.reduce((sum: number, t: any) => sum + (t.total_balance || 0), 0);
  const activeBrokers = tenants.filter((t: any) => t.is_active);

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <div className="w-[220px] surface-sidebar flex flex-col shrink-0 no-select">
        <div className="px-5 py-5 sidebar-border border-b">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
              <span className="text-[10px] font-black text-white">TX</span>
            </div>
            <div>
              <span className="text-sm font-bold block leading-tight">TradeXLabel</span>
              <span className="text-[9px] sidebar-muted">SuperAdmin</span>
            </div>
          </div>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all ${
                tab === t.key ? 'sidebar-active' : 'sidebar-muted sidebar-hover'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={t.icon} />
              </svg>
              {t.label}
            </button>
          ))}
        </nav>

        <div className="px-3 py-3 sidebar-border border-t space-y-1">
          <ThemeToggle />
          <button onClick={() => setIsLoggedIn(false)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[11px] text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign Out
          </button>
        </div>
      </div>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-8 max-w-6xl">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-foreground">{TABS.find(t => t.key === tab)?.label}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {tab === 'tenants' && 'All registered brokers on the platform'}
              {tab === 'monitoring' && 'System health and performance metrics'}
              {tab === 'create' && 'Register a new broker on the platform'}
              {tab === 'settings' && 'Platform configuration and defaults'}
            </p>
          </div>

          {success && (
            <div className="mb-6 text-sm text-buy bg-buy/10 border border-buy/20 rounded-lg px-4 py-3">{success}</div>
          )}
          {error && tab !== 'create' && (
            <div className="mb-6 text-xs text-sell bg-sell/10 border border-sell/20 rounded-lg px-3.5 py-2.5">{error}</div>
          )}

          {/* =================== BROKERS TAB =================== */}
          {tab === 'tenants' && (
            <div className="space-y-5">
              {/* Summary cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-card rounded-xl border border-border p-4">
                  <div className="text-xs text-muted-foreground font-medium">Total Brokers</div>
                  <div className="text-xl font-bold price-value mt-1">{tenants.length}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{activeBrokers.length} active</div>
                </div>
                <div className="bg-card rounded-xl border border-border p-4">
                  <div className="text-xs text-muted-foreground font-medium">Total Users</div>
                  <div className="text-xl font-bold price-value mt-1">{totalUsers.toLocaleString()}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">across all brokers</div>
                </div>
                <div className="bg-card rounded-xl border border-border p-4">
                  <div className="text-xs text-muted-foreground font-medium">Total Balance</div>
                  <div className="text-xl font-bold price-value mt-1">${(totalBalance / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">platform-wide</div>
                </div>
              </div>

              {/* Brokers table */}
              <div className="bg-card rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary/30">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Name</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Slug</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Mode</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Users</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Balance</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenants.map((t: any) => (
                      <tr key={t.id} className="border-b border-border/50 hover:bg-secondary/10 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-semibold">{t.name}</div>
                          <div className="text-[10px] text-muted-foreground">{t.domain}</div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{t.slug}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                            t.execution_mode === 'A_BOOK' ? 'bg-green-500/10 text-green-500' :
                            t.execution_mode === 'B_BOOK' ? 'bg-blue-500/10 text-blue-500' : 'bg-amber-500/10 text-amber-500'
                          }`}>{t.execution_mode}</span>
                        </td>
                        <td className="px-4 py-3 text-center font-medium">{t.user_count ?? 0}</td>
                        <td className="px-4 py-3 text-right font-mono text-xs">${((t.total_balance || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                            t.is_active ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                          }`}>{t.is_active ? 'Active' : 'Inactive'}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleToggleTenant(t)}
                              disabled={togglingTenant === t.id}
                              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                                t.is_active
                                  ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                                  : 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
                              } ${togglingTenant === t.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                              {togglingTenant === t.id ? (
                                <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                              ) : (
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={t.is_active ? 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636' : 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z'} />
                                </svg>
                              )}
                              {t.is_active ? 'Disable' : 'Enable'}
                            </button>
                            <button
                              onClick={() => handleCopyId(t.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground transition-all"
                            >
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={copiedId === t.id ? 'M5 13l4 4L19 7' : 'M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z'} />
                              </svg>
                              {copiedId === t.id ? 'Copied' : 'Copy ID'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {tenants.length === 0 && (
                      <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">No brokers registered</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* =================== MONITORING TAB =================== */}
          {tab === 'monitoring' && monitoring && (
            <div className="space-y-6">
              {/* Top stats row */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-card rounded-xl border border-border p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                      <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5" />
                      </svg>
                    </div>
                  </div>
                  <div className="text-2xl font-bold price-value">{monitoring.total_tenants}</div>
                  <div className="text-xs text-muted-foreground mt-1">Total Brokers</div>
                </div>

                <div className="bg-card rounded-xl border border-border p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                      <svg className="w-5 h-5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                  </div>
                  <div className="text-2xl font-bold price-value">{totalUsers.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground mt-1">Total Users</div>
                </div>

                <div className="bg-card rounded-xl border border-border p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                      <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-500 pulse-live" />
                      <span className="text-[10px] text-green-500 font-medium">ONLINE</span>
                    </div>
                  </div>
                  <div className="text-2xl font-bold price-value">{formatUptime(monitoring.uptime)}</div>
                  <div className="text-xs text-muted-foreground mt-1">Server Uptime</div>
                </div>

                <div className="bg-card rounded-xl border border-border p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center">
                      <svg className="w-5 h-5 text-cyan-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </div>
                  </div>
                  <div className="text-2xl font-bold price-value">{formatUptime(monitoring.uptime)}</div>
                  <div className="text-xs text-muted-foreground mt-1">Since Last Restart</div>
                </div>
              </div>

              {/* CPU & Memory progress bars */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="bg-card rounded-xl border border-border p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                        <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                        </svg>
                      </div>
                      <span className="text-sm font-semibold text-foreground">Memory Usage</span>
                    </div>
                    <span className="text-xs font-mono text-muted-foreground">
                      {(monitoring.memory?.heapUsed / 1024 / 1024).toFixed(0)} / {(monitoring.memory?.heapTotal / 1024 / 1024).toFixed(0)} MB
                    </span>
                  </div>
                  <div className="h-3 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all" style={{
                      width: `${Math.min(100, (monitoring.memory?.heapUsed / monitoring.memory?.heapTotal) * 100)}%`
                    }} />
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-2">
                    {Math.round((monitoring.memory?.heapUsed / monitoring.memory?.heapTotal) * 100)}% used - RSS: {(monitoring.memory?.rss / 1024 / 1024).toFixed(0)} MB
                  </div>
                </div>

                <div className="bg-card rounded-xl border border-border p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                        <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                        </svg>
                      </div>
                      <span className="text-sm font-semibold text-foreground">CPU / External Memory</span>
                    </div>
                    <span className="text-xs font-mono text-muted-foreground">
                      {(monitoring.memory?.external / 1024 / 1024).toFixed(1)} MB ext
                    </span>
                  </div>
                  <div className="h-3 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all" style={{
                      width: `${Math.min(100, (monitoring.memory?.external / monitoring.memory?.heapTotal) * 100)}%`
                    }} />
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-2">
                    External memory relative to heap total
                  </div>
                </div>
              </div>

              {/* System info + Active brokers */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* System info */}
                <div className="bg-card rounded-xl border border-border p-5">
                  <h3 className="text-sm font-semibold text-foreground mb-4">System Information</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Node.js Version</span>
                      <span className="text-xs font-mono text-foreground">{monitoring.node_version || process.env.NODE_VERSION || 'v20.x'}</span>
                    </div>
                    <div className="border-t border-border/50" />
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Platform</span>
                      <span className="text-xs font-mono text-foreground">{monitoring.platform || 'linux-x64'}</span>
                    </div>
                    <div className="border-t border-border/50" />
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Environment</span>
                      <span className="text-xs font-mono text-foreground">{monitoring.environment || 'production'}</span>
                    </div>
                    <div className="border-t border-border/50" />
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Heap Total</span>
                      <span className="text-xs font-mono text-foreground">{(monitoring.memory?.heapTotal / 1024 / 1024).toFixed(0)} MB</span>
                    </div>
                    <div className="border-t border-border/50" />
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">RSS Memory</span>
                      <span className="text-xs font-mono text-foreground">{(monitoring.memory?.rss / 1024 / 1024).toFixed(0)} MB</span>
                    </div>
                  </div>
                </div>

                {/* Active brokers list */}
                <div className="bg-card rounded-xl border border-border p-5">
                  <h3 className="text-sm font-semibold text-foreground mb-4">Active Brokers ({activeBrokers.length})</h3>
                  {activeBrokers.length > 0 ? (
                    <div className="space-y-2.5 max-h-[280px] overflow-y-auto">
                      {activeBrokers.map((t: any) => (
                        <div key={t.id} className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/20 hover:bg-secondary/30 transition-colors">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center">
                              <span className="text-[9px] font-bold text-purple-400">{t.name?.slice(0, 2).toUpperCase()}</span>
                            </div>
                            <div>
                              <div className="text-xs font-semibold text-foreground">{t.name}</div>
                              <div className="text-[10px] text-muted-foreground">{t.slug}</div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs font-semibold text-foreground">{t.user_count ?? 0}</div>
                            <div className="text-[10px] text-muted-foreground">users</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground text-xs">No active brokers</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* =================== CREATE TAB =================== */}
          {tab === 'create' && (
            <div className="bg-card rounded-xl border border-border p-6 max-w-lg">
              <form onSubmit={handleCreateTenant} className="space-y-5">
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-foreground">Broker Details</h3>
                  <div>
                    <label className="text-xs text-muted-foreground font-medium block mb-1.5">Broker Name</label>
                    <input value={newTenant.name} onChange={(e) => setNewTenant({ ...newTenant, name: e.target.value })} required placeholder="e.g. AlphaFX"
                      className="w-full bg-background border border-border rounded-lg text-sm px-3.5 py-2.5 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30 transition" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground font-medium block mb-1.5">Slug</label>
                      <input value={newTenant.slug} onChange={(e) => setNewTenant({ ...newTenant, slug: e.target.value })} required placeholder="alphafx"
                        className="w-full bg-background border border-border rounded-lg text-sm px-3.5 py-2.5 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30 transition" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground font-medium block mb-1.5">Domain</label>
                      <input value={newTenant.domain} onChange={(e) => setNewTenant({ ...newTenant, domain: e.target.value })} required placeholder="alphafx.com"
                        className="w-full bg-background border border-border rounded-lg text-sm px-3.5 py-2.5 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30 transition" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground font-medium block mb-1.5">Execution Mode</label>
                    <select value={newTenant.execution_mode} onChange={(e) => setNewTenant({ ...newTenant, execution_mode: e.target.value })}
                      className="w-full bg-background border border-border rounded-lg text-sm px-3.5 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition">
                      <option value="A_BOOK">A-Book (STP)</option>
                      <option value="B_BOOK">B-Book (Market Maker)</option>
                      <option value="B_BOOK_DEALER">B-Book + Dealer Desk</option>
                    </select>
                  </div>
                </div>

                <div className="border-t border-border pt-5 space-y-4">
                  <h3 className="text-sm font-semibold text-foreground">Admin Account</h3>
                  <div>
                    <label className="text-xs text-muted-foreground font-medium block mb-1.5">Admin Name</label>
                    <input value={newTenant.admin_name} onChange={(e) => setNewTenant({ ...newTenant, admin_name: e.target.value })} required
                      className="w-full bg-background border border-border rounded-lg text-sm px-3.5 py-2.5 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30 transition" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground font-medium block mb-1.5">Admin Email</label>
                    <input type="email" value={newTenant.admin_email} onChange={(e) => setNewTenant({ ...newTenant, admin_email: e.target.value })} required
                      className="w-full bg-background border border-border rounded-lg text-sm px-3.5 py-2.5 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30 transition" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground font-medium block mb-1.5">Admin Password</label>
                    <input type="password" value={newTenant.admin_password} onChange={(e) => setNewTenant({ ...newTenant, admin_password: e.target.value })} required
                      className="w-full bg-background border border-border rounded-lg text-sm px-3.5 py-2.5 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30 transition" />
                  </div>
                </div>

                {error && <div className="text-xs text-sell bg-sell/10 border border-sell/20 rounded-lg px-3.5 py-2.5">{error}</div>}

                <button type="submit"
                  className="w-full bg-gradient-to-r from-purple-500 to-blue-600 hover:from-purple-600 hover:to-blue-700 text-white font-semibold text-sm py-3 rounded-lg transition-all shadow-lg shadow-purple-500/25 active:scale-[0.98]">
                  Create Broker
                </button>
              </form>
            </div>
          )}

          {/* =================== SETTINGS TAB =================== */}
          {tab === 'settings' && (
            <div className="space-y-6 max-w-2xl">
              {/* Platform config */}
              <div className="bg-card rounded-xl border border-border p-6">
                <h3 className="text-sm font-semibold text-foreground mb-5">Platform Configuration</h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-muted-foreground font-medium block mb-1.5">Platform Name</label>
                    <input value={settings.platform_name} onChange={(e) => setSettings({ ...settings, platform_name: e.target.value })}
                      className="w-full bg-background border border-border rounded-lg text-sm px-3.5 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground font-medium block mb-1.5">Default Execution Mode</label>
                    <select value={settings.default_execution_mode} onChange={(e) => setSettings({ ...settings, default_execution_mode: e.target.value })}
                      className="w-full bg-background border border-border rounded-lg text-sm px-3.5 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition">
                      <option value="A_BOOK">A-Book (STP)</option>
                      <option value="B_BOOK">B-Book (Market Maker)</option>
                      <option value="B_BOOK_DEALER">B-Book + Dealer Desk</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground font-medium block mb-1.5">Max Leverage</label>
                    <select value={settings.max_leverage} onChange={(e) => setSettings({ ...settings, max_leverage: e.target.value })}
                      className="w-full bg-background border border-border rounded-lg text-sm px-3.5 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition">
                      <option value="100">1:100</option>
                      <option value="200">1:200</option>
                      <option value="300">1:300</option>
                      <option value="500">1:500</option>
                      <option value="1000">1:1000</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground font-medium block mb-1.5">JWT Token Expiry</label>
                    <input value={settings.jwt_expiry} readOnly
                      className="w-full bg-background border border-border rounded-lg text-sm px-3.5 py-2.5 text-muted-foreground cursor-not-allowed focus:outline-none transition" />
                    <p className="text-[10px] text-muted-foreground mt-1">Configured via environment variable JWT_EXPIRY</p>
                  </div>
                </div>
              </div>

              {/* Runtime config display */}
              <div className="bg-card rounded-xl border border-border p-6">
                <h3 className="text-sm font-semibold text-foreground mb-5">Runtime Configuration</h3>
                <div className="space-y-2.5">
                  {[
                    { label: 'Database', value: 'PostgreSQL 16 (multi-tenant)', color: 'text-blue-400' },
                    { label: 'Cache / Pub-Sub', value: 'Redis', color: 'text-red-400' },
                    { label: 'ORM', value: 'Prisma', color: 'text-purple-400' },
                    { label: 'Queue System', value: 'BullMQ', color: 'text-amber-400' },
                    { label: 'Auth Method', value: 'JWT (access + refresh)', color: 'text-green-400' },
                    { label: 'Validation', value: 'Zod', color: 'text-cyan-400' },
                    { label: 'WebSocket', value: 'ws (native)', color: 'text-pink-400' },
                    { label: 'Logging', value: 'Pino (structured)', color: 'text-orange-400' },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between py-2 px-3 rounded-lg bg-secondary/20">
                      <span className="text-xs text-muted-foreground">{item.label}</span>
                      <span className={`text-xs font-mono font-medium ${item.color}`}>{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Platform stats */}
              <div className="bg-card rounded-xl border border-border p-6">
                <h3 className="text-sm font-semibold text-foreground mb-5">Platform Overview</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-3 rounded-lg bg-secondary/20">
                    <div className="text-lg font-bold price-value">{tenants.length}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">Brokers</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-secondary/20">
                    <div className="text-lg font-bold price-value">{activeBrokers.length}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">Active</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-secondary/20">
                    <div className="text-lg font-bold price-value">{totalUsers.toLocaleString()}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">Users</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-secondary/20">
                    <div className="text-lg font-bold price-value">{monitoring ? formatUptime(monitoring.uptime) : '--'}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">Uptime</div>
                  </div>
                </div>
              </div>
            </div>
          )}
          {/* ─── Analytics Tab ─── */}
          {tab === 'analytics' && (
            <div className="space-y-6">
              {/* Summary cards */}
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-card border border-border rounded-xl p-4">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Revenue</div>
                  <div className="text-2xl font-bold mt-1">${(analytics.reduce((s, a) => s + (a.plan_price_cents || 0), 0) / 100).toLocaleString()}<span className="text-sm text-muted-foreground">/mo</span></div>
                </div>
                <div className="bg-card border border-border rounded-xl p-4">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Users</div>
                  <div className="text-2xl font-bold mt-1">{analytics.reduce((s, a) => s + a.users, 0).toLocaleString()}</div>
                </div>
                <div className="bg-card border border-border rounded-xl p-4">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Open Positions</div>
                  <div className="text-2xl font-bold mt-1">{analytics.reduce((s, a) => s + a.open_positions, 0).toLocaleString()}</div>
                </div>
                <div className="bg-card border border-border rounded-xl p-4">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Balance</div>
                  <div className="text-2xl font-bold mt-1">${(analytics.reduce((s, a) => s + parseInt(a.total_balance_cents || '0'), 0) / 100).toLocaleString()}</div>
                </div>
              </div>

              {/* Per-broker analytics table */}
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-border">
                  <h3 className="text-sm font-bold">Broker Analytics</h3>
                </div>
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-muted-foreground text-left border-b border-border/50">
                      <th className="px-4 py-2.5 font-medium">Broker</th>
                      <th className="px-3 py-2.5 font-medium">Mode</th>
                      <th className="px-3 py-2.5 font-medium">Plan</th>
                      <th className="px-3 py-2.5 font-medium text-right">Users</th>
                      <th className="px-3 py-2.5 font-medium text-right">Balance</th>
                      <th className="px-3 py-2.5 font-medium text-right">Open</th>
                      <th className="px-3 py-2.5 font-medium text-right">Closed</th>
                      <th className="px-3 py-2.5 font-medium text-right">Broker P&L</th>
                      <th className="px-3 py-2.5 font-medium text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.map((a) => (
                      <tr key={a.tenant_id} className="border-b border-border/20 hover:bg-secondary/5">
                        <td className="px-4 py-2.5 font-semibold">{a.name}</td>
                        <td className="px-3 py-2.5">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                            a.execution_mode === 'B_BOOK_DEALER' ? 'bg-purple-500/10 text-purple-400' :
                            a.execution_mode === 'B_BOOK' ? 'bg-blue-500/10 text-blue-400' :
                            'bg-green-500/10 text-green-400'
                          }`}>{a.execution_mode}</span>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">{a.plan}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{a.users}</td>
                        <td className="px-3 py-2.5 text-right font-mono">${(parseInt(a.total_balance_cents) / 100).toLocaleString()}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{a.open_positions}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{a.closed_trades}</td>
                        <td className={`px-3 py-2.5 text-right font-mono font-semibold ${parseInt(a.broker_pnl_cents) >= 0 ? 'text-buy' : 'text-sell'}`}>
                          ${(parseInt(a.broker_pnl_cents) / 100).toLocaleString()}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${a.is_active ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                            {a.is_active ? 'Active' : 'Disabled'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ─── Billing Tab ─── */}
          {tab === 'billing' && (
            <div className="space-y-6">
              {/* Plans */}
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-border flex items-center justify-between">
                  <h3 className="text-sm font-bold">Plans</h3>
                </div>
                <div className="grid grid-cols-3 gap-4 p-5">
                  {plans.map((plan) => (
                    <div key={plan.id} className="border border-border rounded-xl p-5 hover:border-primary/30 transition-colors">
                      <div className="text-sm font-bold">{plan.name}</div>
                      <div className="text-[10px] text-muted-foreground mt-1">{plan.description}</div>
                      <div className="text-2xl font-bold mt-3">
                        ${(plan.price_cents / 100).toLocaleString()}
                        <span className="text-sm text-muted-foreground font-normal">/mo</span>
                      </div>
                      <div className="space-y-1.5 mt-3 text-[11px] text-muted-foreground">
                        <div>Up to {plan.max_users.toLocaleString()} users</div>
                        <div>Up to {plan.max_instruments} instruments</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Assign plan to broker */}
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-border">
                  <h3 className="text-sm font-bold">Assign Plan to Broker</h3>
                </div>
                <div className="p-5 flex gap-3 items-end">
                  <div className="flex-1">
                    <label className="text-[10px] text-muted-foreground block mb-1">Broker</label>
                    <select value={assignPlan.tenant_id} onChange={(e) => setAssignPlan({ ...assignPlan, tenant_id: e.target.value })}
                      className="w-full bg-secondary/20 border border-border rounded-lg text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30">
                      <option value="">Select broker...</option>
                      {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] text-muted-foreground block mb-1">Plan</label>
                    <select value={assignPlan.plan_id} onChange={(e) => setAssignPlan({ ...assignPlan, plan_id: e.target.value })}
                      className="w-full bg-secondary/20 border border-border rounded-lg text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30">
                      <option value="">Select plan...</option>
                      {plans.map((p) => <option key={p.id} value={p.id}>{p.name} (${(p.price_cents / 100)}/mo)</option>)}
                    </select>
                  </div>
                  <label className="flex items-center gap-2 text-[11px]">
                    <input type="checkbox" checked={assignPlan.trial} onChange={(e) => setAssignPlan({ ...assignPlan, trial: e.target.checked })} />
                    14-day trial
                  </label>
                  <button
                    onClick={async () => {
                      if (!assignPlan.tenant_id || !assignPlan.plan_id) return;
                      try {
                        await superAdminApi.createSubscription(token, assignPlan);
                        setSuccess('Plan assigned!'); setTimeout(() => setSuccess(''), 3000);
                        refreshData();
                      } catch (err: any) { setError(err.message); }
                    }}
                    className="px-4 py-2 bg-primary hover:bg-primary/90 text-white text-xs font-bold rounded-lg transition-colors"
                  >Assign</button>
                </div>
              </div>

              {/* Invoices */}
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-border">
                  <h3 className="text-sm font-bold">Invoices</h3>
                </div>
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-muted-foreground text-left border-b border-border/50">
                      <th className="px-4 py-2.5 font-medium">Tenant</th>
                      <th className="px-3 py-2.5 font-medium">Amount</th>
                      <th className="px-3 py-2.5 font-medium">Period</th>
                      <th className="px-3 py-2.5 font-medium">Status</th>
                      <th className="px-3 py-2.5 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => {
                      const tenant = tenants.find((t) => t.id === inv.tenant_id);
                      return (
                        <tr key={inv.id} className="border-b border-border/20 hover:bg-secondary/5">
                          <td className="px-4 py-2.5 font-semibold">{tenant?.name || inv.tenant_id.slice(0, 8)}</td>
                          <td className="px-3 py-2.5 font-mono">${(inv.amount_cents / 100).toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-muted-foreground">{new Date(inv.period_start).toLocaleDateString()} - {new Date(inv.period_end).toLocaleDateString()}</td>
                          <td className="px-3 py-2.5">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                              inv.status === 'PAID' ? 'bg-green-500/10 text-green-400' :
                              inv.status === 'OVERDUE' ? 'bg-red-500/10 text-red-400' :
                              'bg-yellow-500/10 text-yellow-400'
                            }`}>{inv.status}</span>
                          </td>
                          <td className="px-3 py-2.5">
                            {inv.status !== 'PAID' && (
                              <button onClick={async () => {
                                try {
                                  await superAdminApi.markInvoicePaid(token, inv.id);
                                  refreshData();
                                  setSuccess('Invoice marked as paid'); setTimeout(() => setSuccess(''), 3000);
                                } catch (err: any) { setError(err.message); }
                              }} className="text-[10px] px-2 py-1 bg-green-500/10 text-green-400 hover:bg-green-500/20 rounded-md font-medium">
                                Mark Paid
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {invoices.length === 0 && (
                      <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground text-sm">No invoices yet</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ─── Audit Log Tab ─── */}
          {tab === 'audit' && (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-border flex items-center justify-between">
                <h3 className="text-sm font-bold">Audit Log</h3>
                <span className="text-[10px] text-muted-foreground">{auditLogs.length} entries</span>
              </div>
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-muted-foreground text-left border-b border-border/50">
                    <th className="px-4 py-2.5 font-medium">Time</th>
                    <th className="px-3 py-2.5 font-medium">Action</th>
                    <th className="px-3 py-2.5 font-medium">Target</th>
                    <th className="px-3 py-2.5 font-medium">Details</th>
                    <th className="px-3 py-2.5 font-medium">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log) => {
                    let details = {};
                    try { details = JSON.parse(log.details); } catch {}
                    return (
                      <tr key={log.id} className="border-b border-border/20 hover:bg-secondary/5">
                        <td className="px-4 py-2.5 text-muted-foreground font-mono">{new Date(log.created_at).toLocaleString()}</td>
                        <td className="px-3 py-2.5">
                          <span className={`text-[10px] px-2 py-0.5 rounded-md font-semibold ${
                            log.action.includes('CREATE') ? 'bg-green-500/10 text-green-400' :
                            log.action.includes('UPDATE') ? 'bg-blue-500/10 text-blue-400' :
                            log.action.includes('DELETE') || log.action.includes('DISABLE') ? 'bg-red-500/10 text-red-400' :
                            'bg-secondary/30 text-foreground'
                          }`}>{log.action}</span>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-muted-foreground">{log.target}</td>
                        <td className="px-3 py-2.5 text-muted-foreground truncate max-w-[200px]">{JSON.stringify(details).slice(0, 80)}</td>
                        <td className="px-3 py-2.5 font-mono text-muted-foreground">{log.ip_address || '—'}</td>
                      </tr>
                    );
                  })}
                  {auditLogs.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground text-sm">No audit entries yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${Math.floor(seconds % 60)}s`;
}

function ThemeToggle() {
  const { theme, toggleTheme } = useThemeStore();
  return (
    <button
      onClick={toggleTheme}
      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[11px] sidebar-muted sidebar-hover transition-colors"
    >
      {theme === 'dark' ? (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      )}
      {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
    </button>
  );
}
