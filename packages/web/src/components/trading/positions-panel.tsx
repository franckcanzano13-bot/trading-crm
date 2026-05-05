'use client';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useTradingStore } from '@/stores/trading-store';
import { tradingApi } from '@/lib/api';
import { formatPnl, formatCurrency, formatPrice } from '@/lib/utils';
import { useTradeSimulation } from '@/hooks/use-trade-simulation';

/** Calculate unrealized P&L from live price (for non-dealer trades) */
function calcUnrealizedPnl(pos: any, currentPrice: { bid: number; ask: number } | undefined): number {
  if (!currentPrice) return parseFloat(pos.pnl) || 0;
  const openPrice = Number(pos.open_price) / 100000;
  const closePrice = pos.side === 'BUY' ? currentPrice.bid : currentPrice.ask;
  const direction = pos.side === 'BUY' ? 1 : -1;
  const lotSize = pos.lot_size || 1;
  const pnlDollars = (closePrice - openPrice) * pos.volume * lotSize * direction;
  return Math.round(pnlDollars * 100);
}

function getDecimals(symbol: string) {
  if (symbol.includes('JPY')) return 3;
  if (symbol.startsWith('BTC') || symbol.startsWith('ETH')) return 2;
  if (['US500', 'US100', 'US30', 'UK100', 'DE40'].includes(symbol)) return 2;
  if (['XAUUSD', 'XAGUSD'].includes(symbol)) return 2;
  return 5;
}

export function PositionsPanel() {
  const { token, tenantId } = useAuthStore();
  const positions = useTradingStore((s) => s.positions);
  const prices = useTradingStore((s) => s.prices);
  const setPositions = useTradingStore((s) => s.setPositions);
  const selectedTradeId = useTradingStore((s) => s.selectedTradeId);
  const setSelectedTradeId = useTradingStore((s) => s.setSelectedTradeId);
  const [closing, setClosing] = useState<string | null>(null);
  const [editingSLTP, setEditingSLTP] = useState<string | null>(null);
  const [editSL, setEditSL] = useState('');
  const [editTP, setEditTP] = useState('');
  const [sltpError, setSltpError] = useState('');

  // Simulated P&L for dealer trades
  const simulations = useTradeSimulation(positions, prices);

  const loadPositions = async () => {
    if (!token || !tenantId) return;
    try {
      const data = await tradingApi.getPositions(token, tenantId);
      setPositions(data);
    } catch {}
  };

  useEffect(() => {
    loadPositions();
    const interval = setInterval(loadPositions, 3000);
    return () => clearInterval(interval);
  }, [token, tenantId]);

  const handleClose = async (tradeId: string) => {
    if (!token || !tenantId) return;
    setClosing(tradeId);
    try {
      await tradingApi.closePosition(token, tenantId, tradeId);
      await loadPositions();
    } catch {}
    setClosing(null);
  };

  const handleCloseAll = async () => {
    if (!token || !tenantId || positions.length === 0) return;
    for (const pos of positions) {
      try { await tradingApi.closePosition(token, tenantId, pos.id); } catch {}
    }
    await loadPositions();
  };

  const handleEditSLTP = (pos: any) => {
    setEditingSLTP(pos.id);
    setEditSL(pos.stop_loss ? String(pos.stop_loss) : '');
    setEditTP(pos.take_profit ? String(pos.take_profit) : '');
    setSltpError('');
  };

  const handleSaveSLTP = async (posId: string) => {
    if (!token || !tenantId) return;
    setSltpError('');
    try {
      await tradingApi.updateSLTP(token, tenantId, posId, {
        stop_loss: editSL ? parseFloat(editSL) : null,
        take_profit: editTP ? parseFloat(editTP) : null,
      });
      setEditingSLTP(null);
      await loadPositions();
    } catch (err: any) {
      setSltpError(err.message || 'Failed to update SL/TP');
    }
  };

  const handleCancelEdit = () => {
    setEditingSLTP(null);
    setSltpError('');
  };

  /** Get P&L for a position — simulated for dealer trades, live for regular */
  const getPnl = (pos: any): number => {
    const investCents = parseFloat(pos.swap || '0');
    if (investCents > 0) {
      const sim = simulations.get(pos.id);
      return sim ? sim.currentPnlCents : 0;
    }
    return calcUnrealizedPnl(pos, prices.get(pos.symbol));
  };

  const totalPnl = positions.reduce((sum, p) => sum + getPnl(p), 0);

  if (positions.length === 0) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-muted-foreground">
        <svg className="w-5 h-5 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
        <span className="text-xs">No open positions — place a trade to get started</span>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Summary bar */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-secondary/10 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-muted-foreground">
            {positions.length} position{positions.length > 1 ? 's' : ''}
          </span>
          <span className={`text-xs font-mono font-semibold ${totalPnl >= 0 ? 'text-buy' : 'text-sell'}`}>
            {totalPnl >= 0 ? '+' : ''}{(totalPnl / 100).toFixed(2)} USD
          </span>
        </div>
        <button
          onClick={handleCloseAll}
          className="text-[10px] px-2.5 py-1 rounded-lg bg-sell/10 text-sell hover:bg-sell/20 font-medium transition-colors"
        >
          Close All
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 bg-card/80 backdrop-blur-sm">
            <tr className="text-muted-foreground">
              <th className="text-left font-medium px-4 py-1.5">Instrument</th>
              <th className="text-left font-medium px-2 py-1.5">Side</th>
              <th className="text-right font-medium px-2 py-1.5">Invested</th>
              <th className="text-center font-medium px-2 py-1.5">SL / TP</th>
              <th className="text-right font-medium px-2 py-1.5">P&L</th>
              <th className="text-right font-medium px-4 py-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {positions.map((pos) => {
              const pnlCents = getPnl(pos);
              const pnl = formatPnl(pnlCents);
              const investCents = parseFloat(pos.swap || '0');
              const isDealerTrade = investCents > 0;
              const isSelected = selectedTradeId === pos.id;
              const isEditing = editingSLTP === pos.id;
              const decimals = getDecimals(pos.symbol);

              return (
                <tr
                  key={pos.id}
                  onClick={() => !isEditing && setSelectedTradeId(isSelected ? null : pos.id)}
                  className={`transition-colors group cursor-pointer ${
                    isSelected
                      ? 'bg-primary/10 hover:bg-primary/15'
                      : 'hover:bg-secondary/10'
                  }`}
                >
                  <td className="px-4 py-2 font-semibold">
                    {pos.symbol.replace(/([A-Z]{3})([A-Z]{3,})/, '$1/$2')}
                  </td>
                  <td className="px-2 py-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold ${
                      pos.side === 'BUY' ? 'bg-buy/10 text-buy' : 'bg-sell/10 text-sell'
                    }`}>
                      {pos.side}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right font-mono">
                    {isDealerTrade
                      ? formatCurrency(investCents)
                      : `${pos.volume} lot`
                    }
                  </td>
                  <td className="px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                    {isEditing ? (
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1 justify-center">
                          <span className="text-[9px] text-sell w-5">SL</span>
                          <input
                            type="number"
                            step="0.00001"
                            value={editSL}
                            onChange={(e) => setEditSL(e.target.value)}
                            placeholder="—"
                            className="w-20 text-[10px] font-mono bg-secondary/30 rounded px-1.5 py-0.5 text-center focus:outline-none focus:ring-1 focus:ring-primary/50"
                          />
                        </div>
                        <div className="flex items-center gap-1 justify-center">
                          <span className="text-[9px] text-buy w-5">TP</span>
                          <input
                            type="number"
                            step="0.00001"
                            value={editTP}
                            onChange={(e) => setEditTP(e.target.value)}
                            placeholder="—"
                            className="w-20 text-[10px] font-mono bg-secondary/30 rounded px-1.5 py-0.5 text-center focus:outline-none focus:ring-1 focus:ring-primary/50"
                          />
                        </div>
                        {sltpError && <div className="text-[9px] text-sell">{sltpError}</div>}
                        <div className="flex gap-1 justify-center">
                          <button
                            onClick={() => handleSaveSLTP(pos.id)}
                            className="text-[9px] px-2 py-0.5 rounded bg-primary/20 text-primary hover:bg-primary/30 font-medium"
                          >
                            Save
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="text-[9px] px-2 py-0.5 rounded bg-secondary/30 text-muted-foreground hover:bg-secondary/50 font-medium"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-0.5">
                        {(pos.stop_loss || pos.take_profit) ? (
                          <button
                            onClick={() => handleEditSLTP(pos)}
                            className="text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors"
                            title="Click to edit SL/TP"
                          >
                            <span className="text-sell">{pos.stop_loss ? formatPrice(pos.stop_loss, decimals) : '—'}</span>
                            {' / '}
                            <span className="text-buy">{pos.take_profit ? formatPrice(pos.take_profit, decimals) : '—'}</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => handleEditSLTP(pos)}
                            className="text-[10px] px-2.5 py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 font-medium transition-colors"
                          >
                            + SL/TP
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                  <td className={`px-2 py-2 text-right font-mono font-semibold ${pnl.color}`}>
                    {pnl.text}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleClose(pos.id); }}
                      disabled={closing === pos.id}
                      className="opacity-0 group-hover:opacity-100 text-[10px] px-2 py-1 rounded-lg bg-sell/10 text-sell hover:bg-sell/20 font-medium transition-all disabled:opacity-50"
                    >
                      {closing === pos.id ? '...' : 'Close'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
