'use client';
import { useState, useEffect, useMemo } from 'react';
import { useResolvedTenant } from '@/hooks/use-resolved-tenant';
import { adminApi } from '@/lib/api';
import { formatCurrency, formatTimeAgo } from '@/lib/utils';

type TabKey = 'dashboard' | 'clients' | 'instruments' | 'positions' | 'transactions' | 'withdrawals';

// ─── Deposit Modal ───
function DepositModal({
  clients,
  onClose,
  onConfirm,
}: {
  clients: any[];
  onClose: () => void;
  onConfirm: (accountId: string, amount: number) => Promise<void>;
}) {
  const [selectedClientId, setSelectedClientId] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const selectedClient = clients.find((c) => c.id === selectedClientId);
  const accountId = selectedClient?.accounts?.[0]?.id || selectedClient?.account_id || '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountId || !amount) return;
    setLoading(true);
    setError('');
    try {
      await onConfirm(accountId, parseFloat(amount));
      onClose();
    } catch (err: any) {
      setError(err.message || 'Deposit failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-full max-w-md p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-foreground mb-4">Deposit Funds</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground font-medium block mb-1.5">Client</label>
            <select
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              required
              className="w-full bg-background border border-border rounded-lg text-sm px-3.5 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
            >
              <option value="">Select a client...</option>
              {clients.filter((c) => c.status === 'ACTIVE').map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.email})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-medium block mb-1.5">Amount (USD)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              placeholder="0.00"
              className="w-full bg-background border border-border rounded-lg text-sm px-3.5 py-2.5 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
            />
          </div>
          {error && (
            <div className="text-xs text-sell bg-sell/10 border border-sell/20 rounded-lg px-3.5 py-2.5">{error}</div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 bg-secondary text-foreground font-semibold text-sm py-2.5 rounded-lg transition-all hover:bg-secondary/80">
              Cancel
            </button>
            <button type="submit" disabled={loading || !accountId}
              className="flex-1 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-semibold text-sm py-2.5 rounded-lg transition-all shadow-lg shadow-green-500/25 disabled:opacity-50">
              {loading ? 'Processing...' : 'Deposit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Component ───
export default function AdminPage() {
  const [token, setToken] = useState('');
  const { tenantId, setTenantId, tenant: resolvedTenant } = useResolvedTenant(); // Phase 1.4
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginTenantId, setLoginTenantId] = useState('c2d081a3-6aa4-415c-b422-4eba6cf7360c');
  const [error, setError] = useState('');

  const [dashboard, setDashboard] = useState<any>(null);
  const [clients, setClients] = useState<any[]>([]);
  const [instruments, setInstruments] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]); // Phase 1.5
  const loadWithdrawals = () => { if (token && tenantId) adminApi.getWithdrawals(token, tenantId).then(setWithdrawals).catch(() => {}); };
  const [tab, setTab] = useState<TabKey>('dashboard');

  // Client tab state
  const [clientSearch, setClientSearch] = useState('');
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Instrument tab state
  const [editingSpread, setEditingSpread] = useState<string | null>(null);
  const [spreadValue, setSpreadValue] = useState('');
  const [instrumentLoading, setInstrumentLoading] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const data = await adminApi.login({ email, password, tenant_id: loginTenantId });
      setToken(data.token);
      setTenantId(loginTenantId);
      setIsLoggedIn(true);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const loadData = () => {
    if (!isLoggedIn) return;
    adminApi.getDashboard(token, tenantId).then(setDashboard).catch(() => {});
    adminApi.getClients(token, tenantId).then(setClients).catch(() => {});
    adminApi.getInstruments(token, tenantId).then(setInstruments).catch(() => {});
    adminApi.getPositions(token, tenantId).then(setPositions).catch(() => {});
    adminApi.getWithdrawals(token, tenantId).then(setWithdrawals).catch(() => {});
    adminApi.getTransactions(token, tenantId).then(setTransactions).catch(() => {});
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, token, tenantId]);

  // ─── Client Actions ───
  const handleToggleBlock = async (client: any) => {
    setActionLoading(client.id);
    try {
      const newStatus = client.status === 'ACTIVE' ? 'BLOCKED' : 'ACTIVE';
      await adminApi.updateClient(token, tenantId, client.id, { status: newStatus });
      setClients((prev) => prev.map((c) => c.id === client.id ? { ...c, status: newStatus } : c));
    } catch {}
    setActionLoading(null);
  };

  const handleKycApprove = async (client: any) => {
    setActionLoading(`kyc-${client.id}`);
    try {
      await adminApi.updateClient(token, tenantId, client.id, { kyc_status: 'VERIFIED' });
      setClients((prev) => prev.map((c) => c.id === client.id ? { ...c, kyc_status: 'VERIFIED' } : c));
    } catch {}
    setActionLoading(null);
  };

  const handleDeposit = async (accountId: string, amount: number) => {
    await adminApi.deposit(token, tenantId, accountId, amount);
    loadData();
  };

  // ─── Instrument Actions ───
  const handleToggleInstrument = async (instrument: any) => {
    setInstrumentLoading(instrument.id);
    try {
      await adminApi.updateInstrument(token, tenantId, instrument.id, { is_active: !instrument.is_active });
      setInstruments((prev) => prev.map((i) => i.id === instrument.id ? { ...i, is_active: !i.is_active } : i));
    } catch {}
    setInstrumentLoading(null);
  };

  const handleSaveSpread = async (instrument: any) => {
    setInstrumentLoading(`spread-${instrument.id}`);
    try {
      const newMarkup = parseFloat(spreadValue);
      if (isNaN(newMarkup) || newMarkup < 0) return;
      await adminApi.updateInstrument(token, tenantId, instrument.id, { spread_markup: newMarkup });
      setInstruments((prev) => prev.map((i) => i.id === instrument.id ? { ...i, spread_markup: newMarkup } : i));
      setEditingSpread(null);
    } catch {}
    setInstrumentLoading(null);
  };

  // ─── Filtered Clients ───
  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return clients;
    const q = clientSearch.toLowerCase();
    return clients.filter(
      (c) => c.name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q) || c.status?.toLowerCase().includes(q)
    );
  }, [clients, clientSearch]);

  // ─── Dashboard helpers ───
  const activeClients = clients.filter((c) => c.status === 'ACTIVE').length;
  const blockedClients = clients.filter((c) => c.status === 'BLOCKED').length;

  // Mock revenue data for bar chart
  const revenueData = [
    { month: 'Oct', value: 65 },
    { month: 'Nov', value: 80 },
    { month: 'Dec', value: 45 },
    { month: 'Jan', value: 90 },
    { month: 'Feb', value: 72 },
    { month: 'Mar', value: 85 },
  ];
  const maxRevenue = Math.max(...revenueData.map((r) => r.value));

  // Recent activity from transactions
  const recentActivity = useMemo(() => {
    return transactions.slice(0, 5).map((t: any) => {
      const amt = typeof t.amount === 'string' ? parseFloat(t.amount) : (t.amount ?? 0);
      return {
        id: t.id,
        type: t.type === 'DEPOSIT' ? 'deposit' : 'withdrawal',
        desc: `${t.type === 'DEPOSIT' ? 'Deposit' : 'Withdrawal'} ${formatCurrency(amt)}`,
        user: t.user_name || '-',
        time: t.created_at ? formatTimeAgo(new Date(t.created_at)) : '-',
        color: t.type === 'DEPOSIT' ? 'text-green-500' : 'text-amber-500',
      };
    });
  }, [transactions]);

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex bg-background">
        {/* Left branding panel */}
        <div className="hidden lg:flex lg:w-[440px] surface-sidebar flex-col justify-between p-10 relative overflow-hidden">
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-blue-500/10 blur-3xl" />
            <div className="absolute -bottom-24 -left-24 w-64 h-64 rounded-full bg-purple-500/8 blur-3xl" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
                <span className="text-sm font-black text-white">TX</span>
              </div>
              <div>
                <span className="text-xl font-bold block">TradeXLabel</span>
                <span className="text-[11px] sidebar-muted">Broker Admin</span>
              </div>
            </div>
          </div>
          <div className="relative z-10 space-y-4">
            <h2 className="text-2xl font-bold leading-tight">
              Manage your<br /><span className="text-blue-400">brokerage</span>
            </h2>
            <p className="sidebar-muted text-sm leading-relaxed max-w-sm">
              Monitor clients, manage instruments, track positions, and control your trading platform.
            </p>
          </div>
          <div className="relative z-10">
            <p className="text-[10px] sidebar-muted">TradeXLabel Admin Panel v1.0</p>
          </div>
        </div>

        {/* Login form */}
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-sm">
            <div className="hidden lg:block mb-8">
              <h1 className="text-2xl font-bold text-foreground">Admin Login</h1>
              <p className="text-sm text-muted-foreground mt-1">Sign in to your broker admin panel</p>
            </div>
            <div className="lg:hidden text-center mb-8">
              <div className="inline-flex items-center gap-2.5 mb-2">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                  <span className="text-sm font-black text-white">TX</span>
                </div>
                <span className="text-lg font-bold">Admin</span>
              </div>
            </div>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1.5">Tenant ID</label>
                <input value={loginTenantId} onChange={(e) => setLoginTenantId(e.target.value)} required placeholder="Broker UUID"
                  className="w-full bg-card border border-border rounded-lg text-sm px-3.5 py-2.5 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30 transition" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1.5">Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                  className="w-full bg-card border border-border rounded-lg text-sm px-3.5 py-2.5 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30 transition" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1.5">Password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
                  className="w-full bg-card border border-border rounded-lg text-sm px-3.5 py-2.5 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30 transition" />
              </div>
              {error && (
                <div className="text-xs text-sell bg-sell/10 border border-sell/20 rounded-lg px-3.5 py-2.5">{error}</div>
              )}
              <button type="submit"
                className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold text-sm py-3 rounded-lg transition-all shadow-lg shadow-blue-500/25 active:scale-[0.98]">
                Sign In
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  const TABS: { key: TabKey; label: string; icon: string }[] = [
    { key: 'dashboard', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
    { key: 'clients', label: 'Clients', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
    { key: 'instruments', label: 'Instruments', icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6' },
    { key: 'positions', label: 'Positions', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
    { key: 'withdrawals', label: 'Withdrawals', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
    { key: 'transactions', label: 'Transactions', icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
  ];

  const tabDescriptions: Record<TabKey, string> = {
    dashboard: 'Overview of your brokerage performance',
    clients: 'Manage your registered traders',
    instruments: 'Configure available trading instruments',
    positions: 'All open positions across clients',
    withdrawals: 'Client withdrawal requests awaiting your decision',
    transactions: 'Deposits and withdrawals history',
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <div className="w-[220px] surface-sidebar flex flex-col shrink-0 no-select">
        <div className="px-5 py-5 sidebar-border border-b">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <span className="text-[10px] font-black text-white">TX</span>
            </div>
            <div>
              <span className="text-sm font-bold block leading-tight">TradeXLabel</span>
              <span className="text-[9px] sidebar-muted">Broker Admin</span>
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

        <div className="px-3 py-3 sidebar-border border-t">
          <button onClick={() => setIsLoggedIn(false)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[11px] text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign Out
          </button>
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-8 max-w-6xl">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-foreground">{TABS.find(t => t.key === tab)?.label}</h1>
            <p className="text-sm text-muted-foreground mt-1">{tabDescriptions[tab]}</p>
          </div>

          {/* ════════════════════════════════════════════ DASHBOARD ════════════════════════════════════════════ */}
          {tab === 'dashboard' && dashboard && (
            <div className="space-y-8">
              {/* Stat cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
                <StatCard label="Total Clients" value={String(dashboard.total_users)} icon="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" color="blue" />
                <StatCard label="Total Balance" value={formatCurrency(dashboard.total_balance_cents)} icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8V7m0 10v1" color="green" />
                <StatCard label="Open Positions" value={String(dashboard.open_positions)} icon="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" color="amber" />
                <StatCard label="Closed Trades" value={String(dashboard.closed_trades)} icon="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" color="purple" />
              </div>

              {/* Active / Blocked counts */}
              <div className="grid grid-cols-2 gap-5">
                <StatCard label="Active Clients" value={String(activeClients)} icon="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" color="green" />
                <StatCard label="Blocked Clients" value={String(blockedClients)} icon="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" color="red" />
              </div>

              {/* Revenue chart + Recent activity */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Revenue Bar Chart */}
                <div className="bg-card rounded-xl border border-border p-5">
                  <h3 className="text-sm font-semibold text-foreground mb-4">Monthly Revenue</h3>
                  <div className="flex items-end gap-3 h-40">
                    {revenueData.map((d) => (
                      <div key={d.month} className="flex-1 flex flex-col items-center gap-2">
                        <div className="w-full relative flex items-end justify-center" style={{ height: '120px' }}>
                          <div
                            className="w-full max-w-[40px] rounded-t-md bg-gradient-to-t from-blue-600 to-blue-400 transition-all"
                            style={{ height: `${(d.value / maxRevenue) * 100}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground">{d.month}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-3 text-center">Monthly Revenue</p>
                </div>

                {/* Recent Activity */}
                <div className="bg-card rounded-xl border border-border p-5">
                  <h3 className="text-sm font-semibold text-foreground mb-4">Recent Activity</h3>
                  <div className="space-y-3">
                    {recentActivity.map((a) => (
                      <div key={a.id} className="flex items-center gap-3 py-2 border-b border-border/30 last:border-0">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold ${
                          a.type === 'trade' ? 'bg-blue-500/10 text-blue-500' :
                          a.type === 'deposit' ? 'bg-green-500/10 text-green-500' :
                          'bg-amber-500/10 text-amber-500'
                        }`}>
                          {a.type === 'trade' ? 'T' : a.type === 'deposit' ? 'D' : 'W'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-medium truncate ${a.color}`}>{a.desc}</p>
                          <p className="text-[10px] text-muted-foreground">{a.user}</p>
                        </div>
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">{a.time}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════ CLIENTS ════════════════════════════════════════════ */}
          {tab === 'clients' && (
            <div className="space-y-4">
              {/* Search + Actions Bar */}
              <div className="flex items-center gap-3">
                <div className="flex-1 relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Search by name, email, or status..."
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                    className="w-full bg-card border border-border rounded-lg text-sm pl-10 pr-3.5 py-2.5 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
                  />
                </div>
                <button
                  onClick={() => setShowDepositModal(true)}
                  className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-semibold text-xs px-4 py-2.5 rounded-lg transition-all shadow-lg shadow-green-500/25 whitespace-nowrap"
                >
                  + Deposit
                </button>
              </div>

              {/* Clients Table */}
              <div className="bg-card rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary/30">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Name</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Email</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Balance</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">KYC</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Joined</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredClients.map((c) => {
                      const balance = c.accounts?.[0]?.balance ?? c.balance_cents ?? 0;
                      return (
                        <tr key={c.id} className="border-b border-border/50 hover:bg-secondary/10 transition-colors">
                          <td className="px-4 py-3 font-medium">{c.name}</td>
                          <td className="px-4 py-3 text-muted-foreground">{c.email}</td>
                          <td className="px-4 py-3 text-right font-mono text-xs">{formatCurrency(balance)}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                              c.status === 'ACTIVE' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                            }`}>{c.status}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                              c.kyc_status === 'VERIFIED' ? 'bg-green-500/10 text-green-500' :
                              c.kyc_status === 'PENDING' ? 'bg-amber-500/10 text-amber-500' : 'bg-secondary text-muted-foreground'
                            }`}>{c.kyc_status}</span>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(c.created_at).toLocaleDateString()}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleToggleBlock(c)}
                                disabled={actionLoading === c.id}
                                className={`text-[10px] font-semibold px-2.5 py-1.5 rounded-lg transition-all ${
                                  c.status === 'ACTIVE'
                                    ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                                    : 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
                                } disabled:opacity-50`}
                              >
                                {actionLoading === c.id ? '...' : c.status === 'ACTIVE' ? 'Block' : 'Unblock'}
                              </button>
                              {c.kyc_status !== 'VERIFIED' && (
                                <button
                                  onClick={() => handleKycApprove(c)}
                                  disabled={actionLoading === `kyc-${c.id}`}
                                  className="text-[10px] font-semibold px-2.5 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-all disabled:opacity-50"
                                >
                                  {actionLoading === `kyc-${c.id}` ? '...' : 'KYC'}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredClients.length === 0 && (
                      <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">No clients found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Deposit Modal */}
              {showDepositModal && (
                <DepositModal
                  clients={clients}
                  onClose={() => setShowDepositModal(false)}
                  onConfirm={handleDeposit}
                />
              )}
            </div>
          )}

          {/* ════════════════════════════════════════════ INSTRUMENTS ════════════════════════════════════════════ */}
          {tab === 'instruments' && (
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/30">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Symbol</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Type</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Base Spread</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Markup</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {instruments.map((i: any) => (
                    <tr key={i.id} className="border-b border-border/50 hover:bg-secondary/10 transition-colors">
                      <td className="px-4 py-3 font-semibold">{i.display_name}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                          i.type === 'FOREX' ? 'bg-blue-500/10 text-blue-500' :
                          i.type === 'CRYPTO' ? 'bg-purple-500/10 text-purple-500' :
                          i.type === 'INDICES' ? 'bg-amber-500/10 text-amber-500' : 'bg-secondary text-muted-foreground'
                        }`}>{i.type}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono">{i.base_spread}</td>
                      <td className="px-4 py-3 text-right">
                        {editingSpread === i.id ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <input
                              type="number"
                              step="0.0001"
                              min="0"
                              value={spreadValue}
                              onChange={(e) => setSpreadValue(e.target.value)}
                              className="w-24 bg-background border border-border rounded-md text-xs px-2 py-1.5 text-right font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveSpread(i);
                                if (e.key === 'Escape') setEditingSpread(null);
                              }}
                            />
                            <button
                              onClick={() => handleSaveSpread(i)}
                              disabled={instrumentLoading === `spread-${i.id}`}
                              className="text-[10px] font-semibold px-2 py-1.5 rounded-md bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-all disabled:opacity-50"
                            >
                              {instrumentLoading === `spread-${i.id}` ? '...' : 'Save'}
                            </button>
                            <button
                              onClick={() => setEditingSpread(null)}
                              className="text-[10px] font-semibold px-2 py-1.5 rounded-md bg-secondary text-muted-foreground hover:bg-secondary/80 transition-all"
                            >
                              X
                            </button>
                          </div>
                        ) : (
                          <span
                            className="font-mono cursor-pointer hover:text-blue-400 transition-colors"
                            onClick={() => { setEditingSpread(i.id); setSpreadValue(String(i.spread_markup)); }}
                            title="Click to edit"
                          >
                            {i.spread_markup}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                          i.is_active ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                        }`}>{i.is_active ? 'Active' : 'Inactive'}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleToggleInstrument(i)}
                          disabled={instrumentLoading === i.id}
                          className={`text-[10px] font-semibold px-3 py-1.5 rounded-lg transition-all disabled:opacity-50 ${
                            i.is_active
                              ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                              : 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
                          }`}
                        >
                          {instrumentLoading === i.id ? '...' : i.is_active ? 'Disable' : 'Enable'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {instruments.length === 0 && (
                    <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">No instruments found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* ════════════════════════════════════════════ POSITIONS ════════════════════════════════════════════ */}
          {tab === 'positions' && (
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/30">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Client</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Instrument</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Side</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Volume</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Open Price</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Current P&L</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Opened</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p: any) => {
                    const pnlValue = typeof p.pnl === 'string' ? parseFloat(p.pnl) : (p.pnl ?? 0);
                    const pnlPositive = pnlValue >= 0;
                    const rawPrice = typeof p.open_price === 'string' ? parseFloat(p.open_price) : (p.open_price ?? 0);
                    const pipSize = p.instrument?.pip_size ?? 0.0001;
                    const priceDisplay = pipSize < 0.001 ? (rawPrice / 100000).toFixed(5) : (rawPrice / 100).toFixed(2);
                    return (
                      <tr key={p.id} className="border-b border-border/50 hover:bg-secondary/10 transition-colors">
                        <td className="px-4 py-3 font-medium">{p.user_name || p.user?.name || '-'}</td>
                        <td className="px-4 py-3 font-semibold">{p.display_name || p.symbol || '-'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                            p.side === 'BUY' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                          }`}>{p.side}</span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono">{p.volume}</td>
                        <td className="px-4 py-3 text-right font-mono">{priceDisplay}</td>
                        <td className={`px-4 py-3 text-right font-mono font-semibold ${pnlPositive ? 'text-green-500' : 'text-red-500'}`}>
                          {pnlPositive ? '+' : ''}{formatCurrency(pnlValue)}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{p.open_time ? new Date(p.open_time).toLocaleString() : '-'}</td>
                      </tr>
                    );
                  })}
                  {positions.length === 0 && (
                    <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">No open positions found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* ════════════════════════════════════════════ TRANSACTIONS ════════════════════════════════════════════ */}
          {tab === 'withdrawals' && (
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/30">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Client</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Amount</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Method</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">KYC</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Requested</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Decision</th>
                  </tr>
                </thead>
                <tbody>
                  {withdrawals.map((w: any) => (
                    <tr key={w.id} className="border-b border-border/50 hover:bg-secondary/10 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium">{w.user?.name || '-'}</div>
                        <div className="text-[11px] text-muted-foreground">{w.user?.email}</div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-amber-500">{formatCurrency(Number(w.amount_cents) / 100)}</td>
                      <td className="px-4 py-3 text-xs">{w.method || '-'}{w.destination ? <div className="text-muted-foreground">{w.destination}</div> : null}</td>
                      <td className="px-4 py-3 text-xs">{w.user?.kyc_status || '-'}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(w.requested_at).toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                          w.status === 'APPROVED' ? 'bg-green-500/10 text-green-500' :
                          w.status === 'REJECTED' ? 'bg-red-500/10 text-red-500' :
                          w.status === 'CANCELLED' ? 'bg-secondary text-muted-foreground' :
                          'bg-amber-500/10 text-amber-500'
                        }`}>{w.status}</span>
                        {w.reason && <div className="text-[11px] text-muted-foreground mt-1">{w.reason}</div>}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {w.status === 'PENDING' && (
                          <>
                            <button className="px-3 py-1.5 rounded-lg bg-green-500/10 text-green-500 text-xs font-semibold hover:bg-green-500/20 mr-2"
                              onClick={() => { if (window.confirm(`Approve withdrawal of ${formatCurrency(Number(w.amount_cents) / 100)}? The balance is debited immediately.`)) adminApi.approveWithdrawal(token, tenantId, w.id).then(() => { loadWithdrawals(); adminApi.getClients(token, tenantId).then(setClients).catch(() => {}); }).catch((e) => alert(e.message)); }}>
                              Approve
                            </button>
                            <button className="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-500 text-xs font-semibold hover:bg-red-500/20"
                              onClick={() => { const reason = window.prompt('Reason shown to the client:'); if (reason) adminApi.rejectWithdrawal(token, tenantId, w.id, reason).then(loadWithdrawals).catch((e) => alert(e.message)); }}>
                              Reject
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                  {withdrawals.length === 0 && (
                    <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">No withdrawal requests</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          {tab === 'transactions' && (
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/30">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Client</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Type</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Amount</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Description</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((t: any) => (
                    <tr key={t.id} className="border-b border-border/50 hover:bg-secondary/10 transition-colors">
                      <td className="px-4 py-3 font-medium">{t.user_name || t.user?.name || t.account_id?.substring(0, 8) || '-'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                          t.type === 'DEPOSIT' ? 'bg-green-500/10 text-green-500' :
                          t.type === 'WITHDRAWAL' ? 'bg-amber-500/10 text-amber-500' :
                          'bg-secondary text-muted-foreground'
                        }`}>{t.type}</span>
                      </td>
                      <td className={`px-4 py-3 text-right font-mono font-semibold ${
                        t.type === 'DEPOSIT' ? 'text-green-500' : 'text-amber-500'
                      }`}>
                        {t.type === 'DEPOSIT' ? '+' : '-'}{formatCurrency(typeof t.amount === 'string' ? parseFloat(t.amount) : (t.amount ?? 0))}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{t.description || '-'}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{t.created_at ? new Date(t.created_at).toLocaleString() : '-'}</td>
                    </tr>
                  ))}
                  {transactions.length === 0 && (
                    <tr><td colSpan={5} className="text-center py-12 text-muted-foreground">No transactions found</td></tr>
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

// ─── Stat Card Component ───
function StatCard({ label, value, icon, color }: { label: string; value: string; icon: string; color: string }) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-500/10 text-blue-500',
    green: 'bg-green-500/10 text-green-500',
    amber: 'bg-amber-500/10 text-amber-500',
    purple: 'bg-purple-500/10 text-purple-500',
    red: 'bg-red-500/10 text-red-500',
  };
  return (
    <div className="bg-card rounded-xl border border-border p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colorMap[color] || colorMap.blue}`}>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={icon} />
          </svg>
        </div>
      </div>
      <div className="text-2xl font-bold price-value">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  );
}
