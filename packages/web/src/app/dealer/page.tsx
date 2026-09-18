'use client';
import { useState, useEffect, useMemo } from 'react';
import { formatCurrency, formatTimeAgo } from '@/lib/utils';

const API = process.env.NEXT_PUBLIC_API_URL || '';

type TabKey = 'desk' | 'create' | 'positions' | 'interventions' | 'settings';

async function dealerFetch(path: string, token: string, tenantId: string, opts: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Tenant-ID': tenantId,
      ...(opts.headers as Record<string, string>),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data.data;
}

export default function DealerPage() {
  const [token, setToken] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [tenantId, setTenantId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // Load saved tenant_id from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('dealer_tenant_id');
    if (saved) setTenantId(saved);
  }, []);

  const [tab, setTab] = useState<TabKey>('desk');
  const [clients, setClients] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [interventions, setInterventions] = useState<any[]>([]);
  const [instruments, setInstruments] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);

  // Create trade state
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedSymbol, setSelectedSymbol] = useState('');
  const [tradeSide, setTradeSide] = useState<'BUY' | 'SELL'>('BUY');
  const [tradeVolume, setTradeVolume] = useState('0.1');
  const [tradePrice, setTradePrice] = useState('');
  const [investAmount, setInvestAmount] = useState('');
  const [tradeOutcome, setTradeOutcome] = useState<'open' | 'win' | 'lose'>('open');
  const [tradePnl, setTradePnl] = useState('');
  const [tradeDuration, setTradeDuration] = useState(''); // seconds before auto-close
  const [tradeDurationUnit, setTradeDurationUnit] = useState<'s' | 'm' | 'h'>('m');
  const [tradeReason, setTradeReason] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [createResult, setCreateResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Close trade state
  const [closingTrade, setClosingTrade] = useState<any>(null);
  const [closePnl, setClosePnl] = useState('');
  const [closeReason, setCloseReason] = useState('');
  const [closeLoading, setCloseLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    if (!tenantId.trim()) { setLoginError('Tenant ID required'); return; }
    try {
      const data = await dealerFetch('/api/v1/admin/login', '', tenantId, {
        method: 'POST',
        body: JSON.stringify({ email, password, tenant_id: tenantId }),
        headers: {},
      });
      setToken(data.token);
      setIsLoggedIn(true);
      localStorage.setItem('dealer_tenant_id', tenantId);
    } catch (err: any) {
      setLoginError(err.message);
    }
  };

  const loadData = () => {
    if (!isLoggedIn) return;
    dealerFetch('/api/v1/dealer/clients', token, tenantId).then(setClients).catch(() => {});
    dealerFetch('/api/v1/dealer/positions', token, tenantId).then(setPositions).catch(() => {});
    dealerFetch('/api/v1/dealer/interventions', token, tenantId).then(setInterventions).catch(() => {});
    dealerFetch('/api/v1/admin/instruments', token, tenantId).then(setInstruments).catch(() => {});
    dealerFetch('/api/v1/dealer/settings', token, tenantId).then(setSettings).catch(() => {});
  };

  useEffect(() => { loadData(); }, [isLoggedIn, token]);

  // ─── Create Trade ───
  const handleCreateTrade = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateLoading(true);
    setCreateResult(null);
    try {
      const pnlCents = tradeOutcome === 'win'
        ? Math.abs(parseFloat(tradePnl || '0')) * 100
        : tradeOutcome === 'lose'
          ? -Math.abs(parseFloat(tradePnl || '0')) * 100
          : undefined;

      // Calculate close delay in seconds
      let closeAfterSeconds: number | undefined;
      if (pnlCents !== undefined && tradeDuration) {
        const dur = parseFloat(tradeDuration);
        if (dur > 0) {
          closeAfterSeconds = tradeDurationUnit === 'h' ? dur * 3600
            : tradeDurationUnit === 'm' ? dur * 60
            : dur;
        }
      }

      await dealerFetch('/api/v1/dealer/create-trade', token, tenantId, {
        method: 'POST',
        body: JSON.stringify({
          user_id: selectedClient,
          symbol: selectedSymbol,
          side: tradeSide,
          volume: parseFloat(tradeVolume),
          open_price: tradePrice ? parseFloat(tradePrice) : undefined,
          invest_amount: investAmount ? parseFloat(investAmount) * 100 : undefined,
          pnl_target: pnlCents,
          close_after_seconds: closeAfterSeconds,
          reason: tradeReason || 'Dealer intervention',
        }),
      });

      const clientName = clients.find(c => c.id === selectedClient)?.name || 'Client';
      const investStr = investAmount ? ` — Investissement: $${investAmount}` : '';
      const durationStr = closeAfterSeconds ? ` — Fermeture dans ${tradeDuration}${tradeDurationUnit}` : '';
      const outcome = tradeOutcome === 'win' ? `GAGNANT +$${tradePnl}` : tradeOutcome === 'lose' ? `PERDANT -$${tradePnl}` : 'OUVERT';
      setCreateResult({ ok: true, msg: `Trade ${tradeSide} ${tradeVolume} lot ${selectedSymbol} pour ${clientName} — ${outcome}${investStr}${durationStr}` });

      // Reset form
      setSelectedClient('');
      setSelectedSymbol('');
      setTradeVolume('0.1');
      setTradePrice('');
      setInvestAmount('');
      setTradePnl('');
      setTradeDuration('');
      setTradeReason('');
      setTradeOutcome('open');
      loadData();
    } catch (err: any) {
      setCreateResult({ ok: false, msg: err.message });
    }
    setCreateLoading(false);
  };

  // ─── Close Trade ───
  const handleCloseTrade = async () => {
    if (!closingTrade) return;
    setCloseLoading(true);
    try {
      const pnlCents = parseFloat(closePnl) * 100;
      await dealerFetch(`/api/v1/dealer/close-trade/${closingTrade.id}`, token, tenantId, {
        method: 'POST',
        body: JSON.stringify({ pnl: pnlCents, reason: closeReason || 'Dealer close' }),
      });
      setClosingTrade(null);
      setClosePnl('');
      setCloseReason('');
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
    setCloseLoading(false);
  };

  const activeClients = clients.filter(c => c.status === 'ACTIVE');
  const totalExposure = positions.reduce((acc: number, p: any) => acc + (p.volume || 0), 0);

  // ─── LOGIN SCREEN ───
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex bg-background">
        <div className="hidden lg:flex lg:w-[440px] flex-col justify-between p-10 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #1a0a0a 0%, #2d0a0a 50%, #1a0505 100%)' }}>
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-red-500/10 blur-3xl" />
            <div className="absolute -bottom-24 -left-24 w-64 h-64 rounded-full bg-red-800/10 blur-3xl" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center shadow-lg shadow-red-500/25">
                <span className="text-sm font-black text-white">DX</span>
              </div>
              <div>
                <span className="text-xl font-bold text-white block">Dealing Desk</span>
                <span className="text-[11px] text-red-300/60">B-Book Dealer Mode</span>
              </div>
            </div>
          </div>
          <div className="relative z-10 space-y-4">
            <h2 className="text-2xl font-bold text-white leading-tight">
              Control your<br /><span className="text-red-400">execution</span>
            </h2>
            <p className="text-red-200/50 text-sm leading-relaxed max-w-sm">
              Create trades for clients, decide P&L outcomes, manage positions and interventions.
            </p>
          </div>
          <div className="relative z-10">
            <p className="text-[10px] text-red-300/30">TradeXLabel Dealer Desk v1.0 — CONFIDENTIAL</p>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-sm">
            <h1 className="text-2xl font-bold text-foreground mb-1">Dealer Login</h1>
            <p className="text-sm text-muted-foreground mb-8">Access the dealing desk</p>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1.5">Tenant ID</label>
                <input type="text" value={tenantId} onChange={e => setTenantId(e.target.value)} required
                  placeholder="Broker tenant UUID"
                  className="w-full bg-card border border-border rounded-lg text-sm px-3.5 py-2.5 text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-red-500/30 transition" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1.5">Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                  className="w-full bg-card border border-border rounded-lg text-sm px-3.5 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-red-500/30 transition" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1.5">Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                  className="w-full bg-card border border-border rounded-lg text-sm px-3.5 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-red-500/30 transition" />
              </div>
              {loginError && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3.5 py-2.5">{loginError}</div>}
              <button type="submit"
                className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-semibold text-sm py-3 rounded-lg transition-all shadow-lg shadow-red-500/25 active:scale-[0.98]">
                Access Dealing Desk
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  const TABS: { key: TabKey; label: string }[] = [
    { key: 'desk', label: 'Dealing Desk' },
    { key: 'create', label: 'Create Trade' },
    { key: 'positions', label: 'Open Positions' },
    { key: 'interventions', label: 'Audit Log' },
    { key: 'settings', label: 'Settings' },
  ];

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <div className="w-[220px] flex flex-col shrink-0" style={{ background: 'var(--sidebar-bg, #0d0d0d)', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="px-5 py-5 border-b border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center shadow-lg shadow-red-500/20">
              <span className="text-[10px] font-black text-white">DX</span>
            </div>
            <div>
              <span className="text-sm font-bold text-white block leading-tight">Dealing Desk</span>
              <span className="text-[9px] text-red-400/60">B_BOOK_DEALER</span>
            </div>
          </div>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all ${
                tab === t.key ? 'bg-red-500/15 text-red-400' : 'text-white/40 hover:text-white/70 hover:bg-white/5'
              }`}>
              {t.label}
            </button>
          ))}
        </nav>

        {/* Stats */}
        <div className="px-4 py-4 border-t border-white/5 space-y-3">
          <div>
            <div className="text-[10px] text-white/30 uppercase tracking-wider">Active Clients</div>
            <div className="text-lg font-bold text-white">{activeClients.length}</div>
          </div>
          <div>
            <div className="text-[10px] text-white/30 uppercase tracking-wider">Open Positions</div>
            <div className="text-lg font-bold text-red-400">{positions.length}</div>
          </div>
          <div>
            <div className="text-[10px] text-white/30 uppercase tracking-wider">Total Exposure</div>
            <div className="text-lg font-bold text-amber-400">{totalExposure.toFixed(2)} lots</div>
          </div>
        </div>

        <div className="px-3 py-3 border-t border-white/5">
          <button onClick={() => setIsLoggedIn(false)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[11px] text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition-colors">
            Sign Out
          </button>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-8 max-w-6xl">

          {/* ═══ DEALING DESK ═══ */}
          {tab === 'desk' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-foreground">Dealing Desk</h1>
                <p className="text-sm text-muted-foreground mt-1">Vue d'ensemble des positions et clients</p>
              </div>

              {/* Quick stats */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <DealerStat label="Clients actifs" value={String(activeClients.length)} color="blue" />
                <DealerStat label="Positions ouvertes" value={String(positions.length)} color="red" />
                <DealerStat label="Interventions" value={String(interventions.length)} color="amber" />
                <DealerStat label="Exposition totale" value={`${totalExposure.toFixed(2)} lots`} color="purple" />
              </div>

              {/* Clients with balances */}
              <div className="bg-card rounded-xl border border-border overflow-hidden">
                <div className="px-5 py-3 border-b border-border bg-secondary/20">
                  <h3 className="text-sm font-semibold text-foreground">Clients</h3>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary/10">
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">Nom</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">Email</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">Balance</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">Status</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clients.map((c: any) => {
                      const bal = c.accounts?.[0]?.balance ?? 0;
                      return (
                        <tr key={c.id} className="border-b border-border/30 hover:bg-secondary/10 transition-colors">
                          <td className="px-4 py-2.5 font-medium">{c.name}</td>
                          <td className="px-4 py-2.5 text-muted-foreground text-xs">{c.email}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-xs">{formatCurrency(bal)}</td>
                          <td className="px-4 py-2.5">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              c.status === 'ACTIVE' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                            }`}>{c.status}</span>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <button onClick={() => { setTab('create'); setSelectedClient(c.id); }}
                              className="text-[10px] font-semibold px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all">
                              + Trade
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ═══ CREATE TRADE ═══ */}
          {tab === 'create' && (() => {
            const clientData = clients.find(c => c.id === selectedClient);
            const clientBalance = clientData?.accounts?.[0]?.balance ? Number(clientData.accounts[0].balance) : 0;
            const clientEquity = clientData?.accounts?.[0]?.equity ? Number(clientData.accounts[0].equity) : 0;
            const clientMargin = clientData?.accounts?.[0]?.margin_used ? Number(clientData.accounts[0].margin_used) : 0;
            const clientLeverage = clientData?.accounts?.[0]?.leverage ?? 100;
            const availableBalance = clientBalance - clientMargin;
            const investAmountNum = parseFloat(investAmount || '0') * 100; // convert to cents
            const investPercent = availableBalance > 0 ? Math.min((investAmountNum / availableBalance) * 100, 100) : 0;

            return (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-foreground">Creer un Trade</h1>
                <p className="text-sm text-muted-foreground mt-1">Ouvrir une position pour un client et choisir le resultat</p>
              </div>

              <form onSubmit={handleCreateTrade} className="bg-card rounded-xl border border-border p-6 space-y-5 max-w-2xl">
                {/* Client */}
                <div>
                  <label className="text-xs text-muted-foreground font-semibold block mb-1.5">Client</label>
                  <select value={selectedClient} onChange={e => { setSelectedClient(e.target.value); setInvestAmount(''); }} required
                    className="w-full bg-background border border-border rounded-lg text-sm px-3.5 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-red-500/30">
                    <option value="">Selectionner un client...</option>
                    {activeClients.map(c => (
                      <option key={c.id} value={c.id}>{c.name} — {formatCurrency(c.accounts?.[0]?.balance ?? 0)}</option>
                    ))}
                  </select>
                </div>

                {/* Client Balance Card */}
                {selectedClient && clientData && (
                  <div className="rounded-xl border border-border/50 bg-secondary/20 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-xs font-semibold text-foreground">{clientData.name}</div>
                      <div className="text-[10px] text-muted-foreground">Levier: 1:{clientLeverage}</div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <div className="text-[10px] text-muted-foreground">Balance</div>
                        <div className="text-sm font-bold text-foreground">{formatCurrency(clientBalance)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-muted-foreground">Marge utilisee</div>
                        <div className="text-sm font-bold text-amber-400">{formatCurrency(clientMargin)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-muted-foreground">Disponible</div>
                        <div className="text-sm font-bold text-green-400">{formatCurrency(availableBalance)}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Instrument */}
                <div>
                  <label className="text-xs text-muted-foreground font-semibold block mb-1.5">Instrument</label>
                  <select value={selectedSymbol} onChange={e => setSelectedSymbol(e.target.value)} required
                    className="w-full bg-background border border-border rounded-lg text-sm px-3.5 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-red-500/30">
                    <option value="">Selectionner un instrument...</option>
                    {instruments.filter((i: any) => i.is_active).map((i: any) => (
                      <option key={i.id} value={i.symbol}>{i.display_name} ({i.symbol})</option>
                    ))}
                  </select>
                </div>

                {/* Investment Amount */}
                <div>
                  <label className="text-xs text-muted-foreground font-semibold block mb-1.5">Montant a investir (USD)</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                    <input type="number" step="0.01" min="0" value={investAmount} onChange={e => setInvestAmount(e.target.value)}
                      placeholder={availableBalance > 0 ? `Max: ${(availableBalance / 100).toFixed(2)}` : '0.00'}
                      className="w-full bg-background border border-border rounded-lg text-sm pl-8 pr-3.5 py-2.5 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-red-500/30" />
                  </div>
                  {/* Quick amount buttons */}
                  {selectedClient && availableBalance > 0 && (
                    <div className="flex gap-2 mt-2">
                      {[10, 25, 50, 75, 100].map(pct => (
                        <button key={pct} type="button"
                          onClick={() => setInvestAmount(((availableBalance / 100) * pct / 100).toFixed(2))}
                          className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all border ${
                            Math.abs(investPercent - pct) < 1
                              ? 'border-red-500 bg-red-500/10 text-red-400'
                              : 'border-border bg-secondary/30 text-muted-foreground hover:bg-secondary/50'
                          }`}>
                          {pct}%
                        </button>
                      ))}
                    </div>
                  )}
                  {/* Progress bar */}
                  {investAmountNum > 0 && availableBalance > 0 && (
                    <div className="mt-2">
                      <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${
                          investPercent > 80 ? 'bg-red-500' : investPercent > 50 ? 'bg-amber-500' : 'bg-green-500'
                        }`} style={{ width: `${Math.min(investPercent, 100)}%` }} />
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-[10px] text-muted-foreground">{investPercent.toFixed(1)}% du disponible</span>
                        <span className="text-[10px] text-muted-foreground">Reste: {formatCurrency(Math.max(availableBalance - investAmountNum, 0))}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Side + Volume + Price */}
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs text-muted-foreground font-semibold block mb-1.5">Direction</label>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setTradeSide('BUY')}
                        className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all ${
                          tradeSide === 'BUY' ? 'bg-green-500 text-white shadow-lg shadow-green-500/25' : 'bg-secondary text-muted-foreground'
                        }`}>BUY</button>
                      <button type="button" onClick={() => setTradeSide('SELL')}
                        className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all ${
                          tradeSide === 'SELL' ? 'bg-red-500 text-white shadow-lg shadow-red-500/25' : 'bg-secondary text-muted-foreground'
                        }`}>SELL</button>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground font-semibold block mb-1.5">Volume (lots)</label>
                    <input type="number" step="0.01" min="0.01" value={tradeVolume} onChange={e => setTradeVolume(e.target.value)} required
                      className="w-full bg-background border border-border rounded-lg text-sm px-3.5 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-red-500/30" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground font-semibold block mb-1.5">Prix d'ouverture</label>
                    <input type="number" step="any" value={tradePrice} onChange={e => setTradePrice(e.target.value)} placeholder="Auto"
                      className="w-full bg-background border border-border rounded-lg text-sm px-3.5 py-2.5 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-red-500/30" />
                  </div>
                </div>

                {/* Outcome selector */}
                <div>
                  <label className="text-xs text-muted-foreground font-semibold block mb-2">Resultat du trade</label>
                  <div className="grid grid-cols-3 gap-3">
                    <button type="button" onClick={() => setTradeOutcome('open')}
                      className={`py-3 rounded-xl text-xs font-bold border-2 transition-all ${
                        tradeOutcome === 'open' ? 'border-blue-500 bg-blue-500/10 text-blue-400' : 'border-border bg-secondary/30 text-muted-foreground'
                      }`}>
                      <div className="text-lg mb-1">&#8644;</div>
                      Laisser ouvert
                    </button>
                    <button type="button" onClick={() => setTradeOutcome('win')}
                      className={`py-3 rounded-xl text-xs font-bold border-2 transition-all ${
                        tradeOutcome === 'win' ? 'border-green-500 bg-green-500/10 text-green-400' : 'border-border bg-secondary/30 text-muted-foreground'
                      }`}>
                      <div className="text-lg mb-1">&#x2191;</div>
                      Client GAGNE
                    </button>
                    <button type="button" onClick={() => setTradeOutcome('lose')}
                      className={`py-3 rounded-xl text-xs font-bold border-2 transition-all ${
                        tradeOutcome === 'lose' ? 'border-red-500 bg-red-500/10 text-red-400' : 'border-border bg-secondary/30 text-muted-foreground'
                      }`}>
                      <div className="text-lg mb-1">&#x2193;</div>
                      Client PERD
                    </button>
                  </div>
                </div>

                {/* P&L amount (only if win/lose) */}
                {tradeOutcome !== 'open' && (
                  <div>
                    <label className="text-xs text-muted-foreground font-semibold block mb-1.5">
                      Montant P&L (USD) — {tradeOutcome === 'win' ? 'profit pour le client' : 'perte pour le client'}
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                      <input type="number" step="0.01" min="0.01" value={tradePnl} onChange={e => setTradePnl(e.target.value)} required
                        placeholder={tradeOutcome === 'win' ? '500.00' : '300.00'}
                        className="w-full bg-background border border-border rounded-lg text-sm pl-8 pr-3.5 py-2.5 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-red-500/30" />
                    </div>
                  </div>
                )}

                {/* Duration before close (only if win/lose) */}
                {tradeOutcome !== 'open' && (
                  <div>
                    <label className="text-xs text-muted-foreground font-semibold block mb-1.5">
                      Duree avant fermeture
                    </label>
                    <p className="text-[10px] text-muted-foreground/60 mb-2">
                      Le trade s'ouvre, le P&L fluctue en temps reel, puis se ferme automatiquement au resultat choisi.
                    </p>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input type="number" step="1" min="1" value={tradeDuration} onChange={e => setTradeDuration(e.target.value)}
                          placeholder="Ex: 5"
                          className="w-full bg-background border border-border rounded-lg text-sm px-3.5 py-2.5 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-red-500/30" />
                      </div>
                      <div className="flex rounded-lg border border-border overflow-hidden">
                        {([['s', 'Sec'], ['m', 'Min'], ['h', 'Heure']] as const).map(([val, label]) => (
                          <button key={val} type="button" onClick={() => setTradeDurationUnit(val as any)}
                            className={`px-3 py-2 text-[11px] font-medium transition-colors ${
                              tradeDurationUnit === val
                                ? 'bg-red-500/20 text-red-400'
                                : 'bg-background text-muted-foreground hover:bg-secondary/20'
                            }`}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Quick duration presets */}
                    <div className="flex gap-1.5 mt-2">
                      {[
                        { label: '30s', s: 30 },
                        { label: '1min', s: 60 },
                        { label: '5min', s: 300 },
                        { label: '15min', s: 900 },
                        { label: '30min', s: 1800 },
                        { label: '1h', s: 3600 },
                        { label: '4h', s: 14400 },
                      ].map(p => {
                        const currentSec = tradeDuration
                          ? parseFloat(tradeDuration) * (tradeDurationUnit === 'h' ? 3600 : tradeDurationUnit === 'm' ? 60 : 1)
                          : 0;
                        const isActive = Math.abs(currentSec - p.s) < 1;
                        return (
                          <button key={p.label} type="button" onClick={() => {
                            if (p.s >= 3600) { setTradeDuration(String(p.s / 3600)); setTradeDurationUnit('h'); }
                            else if (p.s >= 60) { setTradeDuration(String(p.s / 60)); setTradeDurationUnit('m'); }
                            else { setTradeDuration(String(p.s)); setTradeDurationUnit('s'); }
                          }}
                            className={`flex-1 text-[10px] py-1.5 rounded-md font-semibold transition-all ${
                              isActive
                                ? 'bg-red-500/20 text-red-400 ring-1 ring-red-500/30'
                                : 'bg-secondary/20 text-muted-foreground hover:bg-secondary/40'
                            }`}>
                            {p.label}
                          </button>
                        );
                      })}
                    </div>
                    {!tradeDuration && (
                      <p className="text-[10px] text-amber-400/80 mt-1.5">
                        Sans duree, le trade sera ferme instantanement.
                      </p>
                    )}
                  </div>
                )}

                {/* Reason */}
                <div>
                  <label className="text-xs text-muted-foreground font-semibold block mb-1.5">Raison (audit)</label>
                  <input type="text" value={tradeReason} onChange={e => setTradeReason(e.target.value)}
                    placeholder="Ex: Client VIP, bonus de bienvenue..."
                    className="w-full bg-background border border-border rounded-lg text-sm px-3.5 py-2.5 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-red-500/30" />
                </div>

                {/* Result message */}
                {createResult && (
                  <div className={`text-xs px-4 py-3 rounded-lg border ${
                    createResult.ok ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'
                  }`}>{createResult.msg}</div>
                )}

                {/* Trade Summary */}
                {selectedClient && selectedSymbol && (
                  <div className="rounded-xl border border-border/50 bg-secondary/10 p-4 space-y-1.5">
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Resume du trade</div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Client</span>
                      <span className="font-medium text-foreground">{clientData?.name}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Instrument</span>
                      <span className="font-medium text-foreground">{selectedSymbol} — {tradeSide} {tradeVolume} lot</span>
                    </div>
                    {investAmount && (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Investissement</span>
                        <span className="font-bold text-foreground">${investAmount} ({investPercent.toFixed(1)}%)</span>
                      </div>
                    )}
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Resultat</span>
                      <span className={`font-bold ${tradeOutcome === 'win' ? 'text-green-400' : tradeOutcome === 'lose' ? 'text-red-400' : 'text-blue-400'}`}>
                        {tradeOutcome === 'win' ? `GAGNANT +$${tradePnl || '0'}` : tradeOutcome === 'lose' ? `PERDANT -$${tradePnl || '0'}` : 'Position ouverte'}
                      </span>
                    </div>
                    {tradeOutcome !== 'open' && tradeDuration && (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Fermeture dans</span>
                        <span className="font-bold text-amber-400">{tradeDuration} {tradeDurationUnit === 'h' ? 'heure(s)' : tradeDurationUnit === 'm' ? 'minute(s)' : 'seconde(s)'}</span>
                      </div>
                    )}
                    {tradeOutcome !== 'open' && !tradeDuration && (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Fermeture</span>
                        <span className="font-bold text-muted-foreground">Instantanee</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Submit */}
                <button type="submit" disabled={createLoading}
                  className={`w-full font-semibold text-sm py-3 rounded-lg transition-all shadow-lg active:scale-[0.98] disabled:opacity-50 ${
                    tradeOutcome === 'win'
                      ? 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white shadow-green-500/25'
                      : tradeOutcome === 'lose'
                        ? 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white shadow-red-500/25'
                        : 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-blue-500/25'
                  }`}>
                  {createLoading ? 'Creation en cours...' :
                    tradeOutcome === 'win'
                      ? (tradeDuration ? `Ouvrir Trade — GAGNANT dans ${tradeDuration}${tradeDurationUnit}` : `Creer Trade GAGNANT (+$${tradePnl || '0'})`)
                      : tradeOutcome === 'lose'
                        ? (tradeDuration ? `Ouvrir Trade — PERDANT dans ${tradeDuration}${tradeDurationUnit}` : `Creer Trade PERDANT (-$${tradePnl || '0'})`)
                        : investAmount ? `Investir $${investAmount} — Trade Ouvert` : 'Creer Trade Ouvert'}
                </button>
              </form>
            </div>
            );
          })()}

          {/* ═══ OPEN POSITIONS ═══ */}
          {tab === 'positions' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-foreground">Positions Ouvertes</h1>
                <p className="text-sm text-muted-foreground mt-1">Cliquez sur "Fermer" pour choisir le P&L</p>
              </div>

              <div className="bg-card rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary/20">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Client</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Instrument</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Side</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Volume</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Ouvert</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((p: any) => {
                      const userName = clients.find(c => c.id === p.user_id)?.name || p.user_id?.substring(0, 8);
                      return (
                        <tr key={p.id} className="border-b border-border/30 hover:bg-secondary/10 transition-colors">
                          <td className="px-4 py-3 font-medium">{userName}</td>
                          <td className="px-4 py-3 font-semibold">{p.display_name || p.symbol}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              p.side === 'BUY' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                            }`}>{p.side}</span>
                          </td>
                          <td className="px-4 py-3 text-right font-mono">{p.volume}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{p.open_time ? new Date(p.open_time).toLocaleString() : '-'}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button onClick={() => { setClosingTrade(p); setClosePnl('500'); setCloseReason(''); }}
                                className="text-[10px] font-semibold px-2.5 py-1.5 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-all">
                                Win
                              </button>
                              <button onClick={() => { setClosingTrade(p); setClosePnl('-300'); setCloseReason(''); }}
                                className="text-[10px] font-semibold px-2.5 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all">
                                Lose
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {positions.length === 0 && (
                      <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">Aucune position ouverte</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Close Trade Modal */}
              {closingTrade && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setClosingTrade(null)}>
                  <div className="bg-card border border-border rounded-xl w-full max-w-md p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
                    <h3 className="text-lg font-bold text-foreground mb-1">Fermer la position</h3>
                    <p className="text-xs text-muted-foreground mb-4">
                      {closingTrade.display_name || closingTrade.symbol} — {closingTrade.side} {closingTrade.volume} lot
                    </p>
                    <div className="space-y-4">
                      <div>
                        <label className="text-xs text-muted-foreground font-semibold block mb-1.5">P&L (USD) — positif = client gagne, negatif = client perd</label>
                        <div className="relative">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                          <input type="number" step="0.01" value={closePnl} onChange={e => setClosePnl(e.target.value)}
                            className="w-full bg-background border border-border rounded-lg text-sm pl-8 pr-3.5 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-red-500/30" />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground font-semibold block mb-1.5">Raison</label>
                        <input type="text" value={closeReason} onChange={e => setCloseReason(e.target.value)} placeholder="Market correction..."
                          className="w-full bg-background border border-border rounded-lg text-sm px-3.5 py-2.5 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-red-500/30" />
                      </div>
                      <div className="flex gap-3">
                        <button onClick={() => setClosingTrade(null)}
                          className="flex-1 bg-secondary text-foreground font-semibold text-sm py-2.5 rounded-lg transition-all hover:bg-secondary/80">
                          Annuler
                        </button>
                        <button onClick={handleCloseTrade} disabled={closeLoading}
                          className={`flex-1 font-semibold text-sm py-2.5 rounded-lg transition-all shadow-lg disabled:opacity-50 ${
                            parseFloat(closePnl) >= 0
                              ? 'bg-gradient-to-r from-green-500 to-green-600 text-white shadow-green-500/25'
                              : 'bg-gradient-to-r from-red-500 to-red-600 text-white shadow-red-500/25'
                          }`}>
                          {closeLoading ? '...' : parseFloat(closePnl) >= 0 ? `Fermer +$${closePnl}` : `Fermer -$${Math.abs(parseFloat(closePnl))}`}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══ INTERVENTIONS / AUDIT LOG ═══ */}
          {tab === 'interventions' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-foreground">Audit Log</h1>
                <p className="text-sm text-muted-foreground mt-1">Historique de toutes les interventions dealer</p>
              </div>

              <div className="bg-card rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary/20">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Date</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Action</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Trade</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Raison</th>
                    </tr>
                  </thead>
                  <tbody>
                    {interventions.map((i: any) => (
                      <tr key={i.id} className="border-b border-border/30 hover:bg-secondary/10 transition-colors">
                        <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(i.created_at).toLocaleString()}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            i.action === 'PNL_OVERRIDE' ? 'bg-red-500/10 text-red-400' :
                            i.action === 'TRADE_CREATE' ? 'bg-blue-500/10 text-blue-400' :
                            'bg-amber-500/10 text-amber-400'
                          }`}>{i.action}</span>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {i.trade ? `${i.trade.instrument?.symbol || '?'} ${i.trade.side} ${i.trade.volume}` : i.trade_id?.substring(0, 8)}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground truncate max-w-[300px]">{i.reason}</td>
                      </tr>
                    ))}
                    {interventions.length === 0 && (
                      <tr><td colSpan={4} className="text-center py-12 text-muted-foreground">Aucune intervention</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ═══ SETTINGS ═══ */}
          {tab === 'settings' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-foreground">Dealer Settings</h1>
                <p className="text-sm text-muted-foreground mt-1">Configuration du module dealer</p>
              </div>

              <div className="bg-card rounded-xl border border-border p-6 max-w-lg space-y-4">
                <div>
                  <label className="text-xs text-muted-foreground font-semibold block mb-1.5">Max Slippage (pips)</label>
                  <input type="number" defaultValue={settings?.max_slippage ?? 3}
                    className="w-full bg-background border border-border rounded-lg text-sm px-3.5 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-red-500/30" />
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-xs text-muted-foreground font-semibold">Requote Enabled</label>
                  <div className={`w-10 h-5 rounded-full cursor-pointer transition-colors ${settings?.requote_enabled ? 'bg-red-500' : 'bg-secondary'}`}>
                    <div className={`w-4 h-4 rounded-full bg-white mt-0.5 transition-transform ${settings?.requote_enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground font-semibold block mb-1.5">Spread Multiplier</label>
                  <input type="number" step="0.1" defaultValue={settings?.spread_multiplier ?? 1.0}
                    className="w-full bg-background border border-border rounded-lg text-sm px-3.5 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-red-500/30" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground font-semibold block mb-1.5">Auto Delay (ms)</label>
                  <input type="number" defaultValue={settings?.auto_delay_ms ?? 0}
                    className="w-full bg-background border border-border rounded-lg text-sm px-3.5 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-red-500/30" />
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function DealerStat({ label, value, color }: { label: string; value: string; color: string }) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    red: 'bg-red-500/10 text-red-500 border-red-500/20',
    amber: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    purple: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
    green: 'bg-green-500/10 text-green-500 border-green-500/20',
  };
  return (
    <div className={`rounded-xl border p-4 ${colorMap[color] || colorMap.blue}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-[10px] opacity-70 mt-1">{label}</div>
    </div>
  );
}
