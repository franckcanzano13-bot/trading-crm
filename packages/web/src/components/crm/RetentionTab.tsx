'use client';
import { useRef } from 'react';
import { crmApi } from '@/lib/api';
import { fmtTime, avatarColor, PlusIcon } from './helpers';

export interface RetentionTabProps {
  token: string;
  tenantId: string;
  // Dealer data
  dealerClients: any[];
  dealerPositions: any[];
  dealerInstruments: any[];
  programs: any[];
  // Single-trade state
  dealerSelectedClient: string;
  setDealerSelectedClient: (s: string) => void;
  dealerSymbol: string;
  setDealerSymbol: (s: string) => void;
  dealerSide: 'BUY' | 'SELL';
  setDealerSide: (s: 'BUY' | 'SELL') => void;
  dealerInvestAmount: string;
  setDealerInvestAmount: (s: string) => void;
  dealerOutcome: 'open' | 'win' | 'lose';
  setDealerOutcome: (s: 'open' | 'win' | 'lose') => void;
  dealerPnl: string;
  setDealerPnl: (s: string) => void;
  dealerDuration: string;
  setDealerDuration: (s: string) => void;
  dealerDurationUnit: 's' | 'm' | 'h';
  setDealerDurationUnit: (s: 's' | 'm' | 'h') => void;
  dealerReason: string;
  setDealerReason: (s: string) => void;
  dealerLoading: boolean;
  dealerResult: { ok: boolean; msg: string } | null;
  // Bulk-trade state
  bulkSelectedMap: Record<string, boolean>;
  setBulkSelectedMap: (s: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => void;
  bulkSymbol: string;
  setBulkSymbol: (s: string) => void;
  bulkSide: 'BUY' | 'SELL';
  setBulkSide: (s: 'BUY' | 'SELL') => void;
  bulkInvestPct: string;
  setBulkInvestPct: (s: string) => void;
  bulkOutcome: 'open' | 'win' | 'lose';
  setBulkOutcome: (s: 'open' | 'win' | 'lose') => void;
  bulkPnlPct: string;
  setBulkPnlPct: (s: string) => void;
  bulkDuration: string;
  setBulkDuration: (s: string) => void;
  bulkDurationUnit: 's' | 'm' | 'h';
  setBulkDurationUnit: (s: 's' | 'm' | 'h') => void;
  bulkLoading: boolean;
  bulkResult: any;
  // Tabs
  retentionTab: 'single' | 'bulk' | 'programs';
  setRetentionTab: (s: 'single' | 'bulk' | 'programs') => void;
  // Filter
  filterClientId: string | null;
  setFilterClientId: (s: string | null) => void;
  // Actions
  onShowNewProgram: () => void;
  onDealerTrade: () => void;
  onCloseDealerTrade: (tradeId: string, pnlOverride?: number) => void;
  onBulkTrade: () => void;
  onLoadDealerData: () => void;
}

export function RetentionTab(props: RetentionTabProps) {
  const {
    token, tenantId, dealerClients, dealerPositions, dealerInstruments, programs,
    dealerSelectedClient, setDealerSelectedClient, dealerSymbol, setDealerSymbol,
    dealerSide, setDealerSide, dealerInvestAmount, setDealerInvestAmount,
    dealerOutcome, setDealerOutcome, dealerPnl, setDealerPnl,
    dealerDuration, setDealerDuration, dealerDurationUnit, setDealerDurationUnit,
    dealerReason, setDealerReason, dealerLoading, dealerResult,
    bulkSelectedMap, setBulkSelectedMap, bulkSymbol, setBulkSymbol,
    bulkSide, setBulkSide, bulkInvestPct, setBulkInvestPct,
    bulkOutcome, setBulkOutcome, bulkPnlPct, setBulkPnlPct,
    bulkDuration, setBulkDuration, bulkDurationUnit, setBulkDurationUnit,
    bulkLoading, bulkResult,
    retentionTab, setRetentionTab,
    filterClientId, setFilterClientId,
    onShowNewProgram, onDealerTrade, onCloseDealerTrade, onBulkTrade, onLoadDealerData,
  } = props;

  const clientListRef = useRef<HTMLDivElement>(null);
  const bulkSelectedCount = Object.values(bulkSelectedMap).filter(Boolean).length;
  const filteredPositions = filterClientId ? dealerPositions.filter(p => p.user_id === filterClientId) : dealerPositions;
  const filterClientName = filterClientId ? dealerClients.find(c => c.id === filterClientId)?.name || 'Client' : null;

  const toggleBulkClient = (id: string) => {
    const scrollPos = clientListRef.current?.scrollTop || 0;
    setBulkSelectedMap(prev => ({ ...prev, [id]: !prev[id] }));
    requestAnimationFrame(() => { if (clientListRef.current) clientListRef.current.scrollTop = scrollPos; });
  };
  const selectAllClients = () => {
    const scrollPos = clientListRef.current?.scrollTop || 0;
    const allSelected = dealerClients.length > 0 && dealerClients.every(c => bulkSelectedMap[c.id]);
    if (allSelected) setBulkSelectedMap({});
    else setBulkSelectedMap(Object.fromEntries(dealerClients.map(c => [c.id, true])));
    requestAnimationFrame(() => { if (clientListRef.current) clientListRef.current.scrollTop = scrollPos; });
  };

  const selectedClientData = dealerClients.find(c => c.id === dealerSelectedClient);
  const clientBalance = selectedClientData?.accounts?.[0] ? Number(selectedClientData.accounts[0].balance) / 100 : 0;
  const clientAvailable = selectedClientData?.accounts?.[0] ? (Number(selectedClientData.accounts[0].balance) - Number(selectedClientData.accounts[0].margin_used)) / 100 : 0;
  const activeInstruments = dealerInstruments.filter((i: any) => i.is_active);

  return (
    <div className="space-y-6">
      {/* Sub-tabs */}
      <div className="flex items-center gap-1 bg-secondary/10 rounded-xl p-1 w-fit">
        {[
          { key: 'bulk' as const, label: 'Bulk Trade', icon: '📊' },
          { key: 'programs' as const, label: 'Auto-Trader', icon: '🤖' },
          { key: 'single' as const, label: 'Single Trade', icon: '🎯' },
        ].map(t => (
          <button key={t.key} onClick={() => setRetentionTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${retentionTab === t.key ? 'bg-primary text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
            <span>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {/* ═══ BULK TRADE ═══ */}
      {retentionTab === 'bulk' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Client selection */}
          <div className="lg:col-span-1 bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-border flex items-center justify-between">
              <h3 className="text-sm font-bold">Select Clients</h3>
              <button onClick={selectAllClients} className="text-[10px] text-primary font-semibold hover:underline">
                {dealerClients.length > 0 && dealerClients.every(c => bulkSelectedMap[c.id]) ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            <div ref={clientListRef} className="max-h-[500px] overflow-y-auto p-2 space-y-1">
              {dealerClients.map(c => {
                const bal = Number(c.accounts?.[0]?.balance || 0) / 100;
                const checked = !!bulkSelectedMap[c.id];
                return (
                  <div key={c.id} className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-all ${checked ? 'bg-primary/10 border border-primary/20' : filterClientId === c.id ? 'bg-orange-500/10 border border-orange-500/20' : 'hover:bg-secondary/5 border border-transparent'}`}>
                    <input type="checkbox" checked={checked} onChange={() => toggleBulkClient(c.id)}
                      className="w-4 h-4 rounded accent-primary cursor-pointer" />
                    <div className={`w-7 h-7 rounded-lg ${avatarColor(c.id)} flex items-center justify-center text-white text-[9px] font-bold shrink-0`}>{c.name?.[0]}</div>
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setFilterClientId(filterClientId === c.id ? null : c.id)}>
                      <div className="text-[11px] font-semibold truncate">{c.name}</div>
                      <div className="text-[9px] text-muted-foreground">{c.email}</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {dealerPositions.some(p => p.user_id === c.id) && (
                        <button onClick={() => setFilterClientId(filterClientId === c.id ? null : c.id)}
                          className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${filterClientId === c.id ? 'bg-orange-500/20 text-orange-400' : 'bg-secondary/20 text-muted-foreground hover:text-foreground'}`}>
                          {dealerPositions.filter(p => p.user_id === c.id).length} pos
                        </button>
                      )}
                      <span className="text-[10px] font-mono font-semibold">${bal.toLocaleString()}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="px-5 py-3 border-t border-border bg-secondary/5">
              <span className="text-xs font-bold text-primary">{bulkSelectedCount}</span>
              <span className="text-xs text-muted-foreground"> clients selected</span>
            </div>
          </div>

          {/* Right: Trade config */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-card border border-border rounded-2xl p-6">
              <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-orange-400" /> Bulk Trade Configuration
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {/* Instrument */}
                <div>
                  <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1.5 block">Instrument</label>
                  <select value={bulkSymbol} onChange={e => setBulkSymbol(e.target.value)}
                    className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20">
                    {activeInstruments.map((i: any) => <option key={i.symbol} value={i.symbol}>{i.display_name || i.symbol}</option>)}
                  </select>
                </div>
                {/* Direction */}
                <div>
                  <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1.5 block">Direction</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setBulkSide('BUY')} className={`py-2.5 rounded-xl text-xs font-bold transition-all ${bulkSide === 'BUY' ? 'bg-green-500 text-white' : 'bg-secondary/10 text-muted-foreground'}`}>BUY</button>
                    <button onClick={() => setBulkSide('SELL')} className={`py-2.5 rounded-xl text-xs font-bold transition-all ${bulkSide === 'SELL' ? 'bg-red-500 text-white' : 'bg-secondary/10 text-muted-foreground'}`}>SELL</button>
                  </div>
                </div>
                {/* Invest % */}
                <div>
                  <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1.5 block">Invest % of Balance</label>
                  <input type="number" value={bulkInvestPct} onChange={e => setBulkInvestPct(e.target.value)} min={1} max={100}
                    className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/20" />
                  <div className="flex gap-1.5 mt-2">
                    {[5, 10, 15, 25, 50].map(v => (
                      <button key={v} onClick={() => setBulkInvestPct(String(v))} className={`text-[9px] px-2.5 py-1 rounded-lg font-semibold ${parseFloat(bulkInvestPct) === v ? 'bg-primary/15 text-primary ring-1 ring-primary/30' : 'bg-secondary/10 text-muted-foreground'}`}>{v}%</button>
                    ))}
                  </div>
                </div>
                {/* Outcome */}
                <div>
                  <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1.5 block">Outcome</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { key: 'open' as const, label: 'Open', bg: '#3b82f6' },
                      { key: 'win' as const, label: 'Win', bg: '#22c55e' },
                      { key: 'lose' as const, label: 'Lose', bg: '#ef4444' },
                    ].map(o => (
                      <button key={o.key} onClick={() => setBulkOutcome(o.key)}
                        className={`py-2 rounded-xl text-[10px] font-bold transition-all ${bulkOutcome === o.key ? 'text-white shadow-lg' : 'bg-secondary/10 text-muted-foreground'}`}
                        style={bulkOutcome === o.key ? { backgroundColor: o.bg } : {}}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
                {/* P&L % and Duration */}
                {bulkOutcome !== 'open' && (
                  <>
                    <div>
                      <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1.5 block">{bulkOutcome === 'win' ? 'Gain %' : 'Loss %'} of Invested</label>
                      <input type="number" value={bulkPnlPct} onChange={e => setBulkPnlPct(e.target.value)} min={1} max={100}
                        className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/20" />
                      <div className="flex gap-1.5 mt-2">
                        {[5, 10, 15, 25, 50].map(v => (
                          <button key={v} onClick={() => setBulkPnlPct(String(v))} className={`text-[9px] px-2.5 py-1 rounded-lg font-semibold ${parseFloat(bulkPnlPct) === v ? 'bg-primary/15 text-primary ring-1 ring-primary/30' : 'bg-secondary/10 text-muted-foreground'}`}>{v}%</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1.5 block">Duration</label>
                      <div className="flex gap-2">
                        <input type="number" value={bulkDuration} onChange={e => setBulkDuration(e.target.value)} className="flex-1 bg-background border border-border rounded-xl px-3 py-2.5 text-xs font-mono focus:outline-none" />
                        <select value={bulkDurationUnit} onChange={e => setBulkDurationUnit(e.target.value as any)} className="bg-background border border-border rounded-xl px-3 py-2.5 text-xs"><option value="s">Sec</option><option value="m">Min</option><option value="h">Hr</option></select>
                      </div>
                      <div className="flex gap-1.5 mt-2">
                        {[{ l: '30s', v: '30', u: 's' }, { l: '1m', v: '1', u: 'm' }, { l: '5m', v: '5', u: 'm' }, { l: '15m', v: '15', u: 'm' }, { l: '1h', v: '1', u: 'h' }].map(p => (
                          <button key={p.l} onClick={() => { setBulkDuration(p.v); setBulkDurationUnit(p.u as any); }} className="text-[9px] px-2.5 py-1 rounded-lg bg-secondary/10 text-muted-foreground hover:bg-secondary/20 font-semibold">{p.l}</button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Summary */}
              <div className="mt-5 bg-secondary/5 rounded-xl p-4 text-xs space-y-1">
                <div className="font-bold text-sm mb-2">Trade Summary</div>
                <div className="flex justify-between"><span className="text-muted-foreground">Clients</span><span className="font-bold">{bulkSelectedCount}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Instrument</span><span className="font-bold">{bulkSymbol} {bulkSide}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Invest</span><span className="font-bold">{bulkInvestPct}% of each balance</span></div>
                {bulkOutcome !== 'open' && <div className="flex justify-between"><span className="text-muted-foreground">Target</span><span className={`font-bold ${bulkOutcome === 'win' ? 'text-green-400' : 'text-red-400'}`}>{bulkOutcome === 'win' ? '+' : '-'}{bulkPnlPct}% P&L</span></div>}
              </div>

              {bulkResult && (
                <div className={`mt-3 text-xs px-4 py-3 rounded-xl ${bulkResult.error ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>
                  {bulkResult.error || `${bulkResult.succeeded}/${bulkResult.total} trades executed successfully`}
                </div>
              )}

              <button onClick={onBulkTrade} disabled={bulkLoading || bulkSelectedCount === 0}
                className="mt-4 w-full py-3 rounded-xl bg-gradient-to-r from-orange-500 to-red-600 text-white font-bold text-xs disabled:opacity-40 hover:from-orange-600 hover:to-red-700 transition-all shadow-lg shadow-orange-500/25">
                {bulkLoading ? 'Executing...' : `Execute ${bulkSide} for ${bulkSelectedCount} Clients`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ AUTO-TRADER PROGRAMS ═══ */}
      {retentionTab === 'programs' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold">Auto-Trader Programs</h3>
            <button onClick={onShowNewProgram} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 text-white text-xs font-semibold shadow-lg shadow-purple-500/20">
              <PlusIcon /> New Program
            </button>
          </div>
          {/* Active programs */}
          {programs.map((p: any) => {
            const clientCount = p.client_ids_parsed?.length || 0;
            const pct = p.target_pct > 0 ? Math.min(100, (p.progress_pct / p.target_pct) * 100) : 0;
            return (
              <div key={p.id} className="bg-card border border-border rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-sm font-bold">{p.name}</div>
                    <div className="text-[10px] text-muted-foreground">{clientCount} clients · {p.instrument_type} · {p.trades_per_day} trades/day · {p.period}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-2.5 py-1 rounded-lg font-bold ${p.status === 'ACTIVE' ? 'bg-green-500/10 text-green-400' : p.status === 'COMPLETED' ? 'bg-blue-500/10 text-blue-400' : 'bg-red-500/10 text-red-400'}`}>{p.status}</span>
                    {p.status === 'ACTIVE' && (
                      <button onClick={async () => { await crmApi.updateProgram(token, tenantId, p.id, { status: 'PAUSED' }); onLoadDealerData(); }} className="text-[10px] px-2.5 py-1 rounded-lg bg-yellow-500/10 text-yellow-400 font-semibold">Pause</button>
                    )}
                    {p.status === 'PAUSED' && (
                      <button onClick={async () => { await crmApi.updateProgram(token, tenantId, p.id, { status: 'ACTIVE' }); onLoadDealerData(); }} className="text-[10px] px-2.5 py-1 rounded-lg bg-green-500/10 text-green-400 font-semibold">Resume</button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-3 text-center mb-3">
                  <div className="bg-secondary/5 rounded-lg py-2"><div className="text-sm font-bold">{p.target_pct}%</div><div className="text-[9px] text-muted-foreground">Target</div></div>
                  <div className="bg-secondary/5 rounded-lg py-2"><div className={`text-sm font-bold ${p.progress_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>{p.progress_pct?.toFixed(1)}%</div><div className="text-[9px] text-muted-foreground">Progress</div></div>
                  <div className="bg-secondary/5 rounded-lg py-2"><div className="text-sm font-bold">{p.total_trades}</div><div className="text-[9px] text-muted-foreground">Trades</div></div>
                  <div className="bg-secondary/5 rounded-lg py-2"><div className="text-sm font-bold">{p.days_remaining}d</div><div className="text-[9px] text-muted-foreground">Remaining</div></div>
                </div>
                <div className="h-2 bg-secondary/10 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full transition-all" style={{ width: `${Math.max(2, pct)}%` }} />
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">{pct.toFixed(0)}% of target achieved · Invest {p.invest_pct}% per trade</div>
              </div>
            );
          })}
          {programs.length === 0 && <div className="text-center py-12 text-muted-foreground text-sm">No programs yet. Create one to auto-trade for your clients.</div>}
          {programs.some((p: any) => p.status === 'ACTIVE') && (
            <button onClick={async () => { await crmApi.executePrograms(token, tenantId); onLoadDealerData(); }}
              className="px-4 py-2.5 rounded-xl bg-purple-500/15 text-purple-400 text-xs font-semibold border border-purple-500/20 hover:bg-purple-500/25">
              Run Daily Trades Now
            </button>
          )}
        </div>
      )}

      {/* ═══ SINGLE TRADE ═══ */}
      {retentionTab === 'single' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-5 py-3 bg-gradient-to-r from-red-500/10 to-orange-500/10 border-b border-border">
              <h3 className="text-sm font-bold flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-red-400" /> Dealer Trade</h3>
            </div>
            <div className="p-5 space-y-4">
              <div><label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1.5 block">Client</label>
                <select value={dealerSelectedClient} onChange={e => setDealerSelectedClient(e.target.value)} className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-red-500/20">
                  <option value="">Select client...</option>
                  {dealerClients.map(c => <option key={c.id} value={c.id}>{c.name} — ${(Number(c.accounts?.[0]?.balance || 0) / 100).toLocaleString()}</option>)}
                </select>
              </div>
              {selectedClientData && <div className="grid grid-cols-2 gap-2 text-center">
                <div className="bg-secondary/5 rounded-lg py-2"><div className="text-xs font-bold">${clientBalance.toLocaleString()}</div><div className="text-[9px] text-muted-foreground">Balance</div></div>
                <div className="bg-secondary/5 rounded-lg py-2"><div className="text-xs font-bold text-green-400">${clientAvailable.toLocaleString()}</div><div className="text-[9px] text-muted-foreground">Available</div></div>
              </div>}
              <div><label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1.5 block">Instrument</label>
                <select value={dealerSymbol} onChange={e => setDealerSymbol(e.target.value)} className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-red-500/20">
                  <option value="">Select...</option>
                  {activeInstruments.map((i: any) => <option key={i.symbol} value={i.symbol}>{i.display_name || i.symbol}</option>)}
                </select>
              </div>
              <div><label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1.5 block">Direction</label>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setDealerSide('BUY')} className={`py-2.5 rounded-xl text-xs font-bold ${dealerSide === 'BUY' ? 'bg-green-500 text-white' : 'bg-secondary/10 text-muted-foreground'}`}>BUY</button>
                  <button onClick={() => setDealerSide('SELL')} className={`py-2.5 rounded-xl text-xs font-bold ${dealerSide === 'SELL' ? 'bg-red-500 text-white' : 'bg-secondary/10 text-muted-foreground'}`}>SELL</button>
                </div>
              </div>
              <div><label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1.5 block">Investment ($)</label>
                <input type="number" value={dealerInvestAmount} onChange={e => setDealerInvestAmount(e.target.value)} className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-xs font-mono focus:outline-none" />
                <div className="flex gap-1.5 mt-2">{[50, 100, 250, 500, 1000].map(v => <button key={v} onClick={() => setDealerInvestAmount(String(v))} className={`text-[9px] px-2 py-1 rounded-lg font-semibold ${parseFloat(dealerInvestAmount) === v ? 'bg-red-500/15 text-red-400' : 'bg-secondary/10 text-muted-foreground'}`}>${v}</button>)}</div>
              </div>
              <div><label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1.5 block">Outcome</label>
                <div className="grid grid-cols-3 gap-2">
                  {[{ key: 'open' as const, label: 'Open', bg: '#3b82f6' }, { key: 'win' as const, label: 'Win', bg: '#22c55e' }, { key: 'lose' as const, label: 'Lose', bg: '#ef4444' }].map(o =>
                    <button key={o.key} onClick={() => setDealerOutcome(o.key)} className={`py-2 rounded-xl text-[10px] font-bold ${dealerOutcome === o.key ? 'text-white' : 'bg-secondary/10 text-muted-foreground'}`} style={dealerOutcome === o.key ? { backgroundColor: o.bg } : {}}>{o.label}</button>
                  )}
                </div>
              </div>
              {dealerOutcome !== 'open' && <>
                <div><label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1.5 block">{dealerOutcome === 'win' ? 'Profit ($)' : 'Loss ($)'}</label>
                  <input type="number" value={dealerPnl} onChange={e => setDealerPnl(e.target.value)} placeholder={dealerOutcome === 'win' ? '500' : '300'} className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-xs font-mono focus:outline-none" />
                </div>
                <div><label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1.5 block">Duration</label>
                  <div className="flex gap-2">
                    <input type="number" value={dealerDuration} onChange={e => setDealerDuration(e.target.value)} className="flex-1 bg-background border border-border rounded-xl px-3 py-2.5 text-xs font-mono focus:outline-none" />
                    <select value={dealerDurationUnit} onChange={e => setDealerDurationUnit(e.target.value as any)} className="bg-background border border-border rounded-xl px-3 py-2.5 text-xs"><option value="s">Sec</option><option value="m">Min</option><option value="h">Hr</option></select>
                  </div>
                </div>
              </>}
              <div><label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1.5 block">Reason</label>
                <input value={dealerReason} onChange={e => setDealerReason(e.target.value)} className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-xs focus:outline-none" />
              </div>
              {dealerResult && <div className={`text-xs px-4 py-3 rounded-xl ${dealerResult.ok ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>{dealerResult.msg}</div>}
              <button onClick={onDealerTrade} disabled={dealerLoading || !dealerSelectedClient || !dealerSymbol}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-red-500 to-orange-600 text-white font-bold text-xs disabled:opacity-40 shadow-lg shadow-red-500/25">
                {dealerLoading ? 'Executing...' : `Execute ${dealerSide} Trade`}
              </button>
            </div>
          </div>
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-border flex items-center justify-between">
                <h3 className="text-sm font-bold">Active Positions</h3>
                <span className="text-[10px] bg-red-500/10 text-red-400 px-2 py-0.5 rounded-lg font-bold">{dealerPositions.length} open</span>
              </div>
              <table className="w-full text-xs">
                <thead><tr className="border-b border-border bg-secondary/5">
                  <th className="text-left px-4 py-2.5 text-[10px] uppercase text-muted-foreground font-semibold">Client</th>
                  <th className="text-left px-3 py-2.5 text-[10px] uppercase text-muted-foreground font-semibold">Symbol</th>
                  <th className="text-left px-3 py-2.5 text-[10px] uppercase text-muted-foreground font-semibold">Side</th>
                  <th className="text-right px-3 py-2.5 text-[10px] uppercase text-muted-foreground font-semibold">Target P&L</th>
                  <th className="text-center px-3 py-2.5 text-[10px] uppercase text-muted-foreground font-semibold">Action</th>
                </tr></thead>
                <tbody>
                  {dealerPositions.map(pos => {
                    const client = dealerClients.find(c => c.id === pos.user_id);
                    const target = pos.pnl_target ? Number(pos.pnl_target) / 100 : null;
                    return (
                      <tr key={pos.id} className="border-b border-border/30 hover:bg-secondary/5">
                        <td className="px-4 py-2.5 font-semibold">{client?.name || '?'}</td>
                        <td className="px-3 py-2.5 font-mono">{pos.symbol}</td>
                        <td className="px-3 py-2.5"><span className={`text-[10px] px-2 py-0.5 rounded-lg font-bold ${pos.side === 'BUY' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>{pos.side}</span></td>
                        <td className="px-3 py-2.5 text-right font-mono">{target !== null ? <span className={target >= 0 ? 'text-green-400' : 'text-red-400'}>{target >= 0 ? '+' : ''}${target.toFixed(2)}</span> : '—'}</td>
                        <td className="px-3 py-2.5 text-center"><button onClick={() => onCloseDealerTrade(pos.id)} className="text-[10px] px-3 py-1 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 font-semibold">Close</button></td>
                      </tr>
                    );
                  })}
                  {dealerPositions.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">No active positions</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Positions table (shared, always visible at bottom) */}
      {retentionTab === 'bulk' && (dealerPositions.length > 0 || filterClientId) && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold">{filterClientName ? `Positions — ${filterClientName}` : 'All Dealer Positions'}</h3>
              {filterClientId && (
                <button onClick={() => setFilterClientId(null)} className="text-[10px] px-2 py-0.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 font-semibold">Show All</button>
              )}
            </div>
            <span className="text-[10px] bg-red-500/10 text-red-400 px-2 py-0.5 rounded-lg font-bold">{filteredPositions.length} open</span>
          </div>
          <table className="w-full text-xs">
            <thead><tr className="border-b border-border bg-secondary/5">
              <th className="text-left px-4 py-2.5 text-[10px] uppercase text-muted-foreground font-semibold">Client</th>
              <th className="text-left px-3 py-2.5 text-[10px] uppercase text-muted-foreground font-semibold">Symbol</th>
              <th className="text-left px-3 py-2.5 text-[10px] uppercase text-muted-foreground font-semibold">Side</th>
              <th className="text-right px-3 py-2.5 text-[10px] uppercase text-muted-foreground font-semibold">Invest</th>
              <th className="text-right px-3 py-2.5 text-[10px] uppercase text-muted-foreground font-semibold">Target P&L</th>
              <th className="text-right px-3 py-2.5 text-[10px] uppercase text-muted-foreground font-semibold">Closes At</th>
              <th className="text-center px-3 py-2.5 text-[10px] uppercase text-muted-foreground font-semibold">Action</th>
            </tr></thead>
            <tbody>
              {filteredPositions.map(pos => {
                const client = dealerClients.find(c => c.id === pos.user_id);
                const invest = Number(pos.swap || 0);
                const target = pos.pnl_target ? Number(pos.pnl_target) / 100 : null;
                const closeAt = pos.scheduled_close_at;
                return (
                  <tr key={pos.id} className="border-b border-border/30 hover:bg-secondary/5 cursor-pointer" onClick={() => setFilterClientId(pos.user_id)}>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-lg ${avatarColor(pos.user_id)} flex items-center justify-center text-white text-[8px] font-bold`}>{client?.name?.[0] || '?'}</div>
                        <span className="font-semibold">{client?.name || '?'}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-mono font-semibold">{pos.symbol}</td>
                    <td className="px-3 py-2.5"><span className={`text-[10px] px-2 py-0.5 rounded-lg font-bold ${pos.side === 'BUY' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>{pos.side}</span></td>
                    <td className="px-3 py-2.5 text-right font-mono">${(invest / 100).toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{target !== null ? <span className={target >= 0 ? 'text-green-400' : 'text-red-400'}>{target >= 0 ? '+' : ''}${target.toFixed(2)}</span> : '—'}</td>
                    <td className="px-3 py-2.5 text-right text-muted-foreground text-[10px]">{closeAt ? fmtTime(closeAt) : '—'}</td>
                    <td className="px-3 py-2.5 text-center" onClick={e => e.stopPropagation()}><button onClick={() => onCloseDealerTrade(pos.id)} className="text-[10px] px-3 py-1 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 font-semibold">Close</button></td>
                  </tr>
                );
              })}
              {filteredPositions.length === 0 && <tr><td colSpan={7} className="text-center py-6 text-muted-foreground">{filterClientId ? 'No positions for this client' : 'No active positions'}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
