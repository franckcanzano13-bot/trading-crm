'use client';
import { useEffect, useRef, useState, memo } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useTradingStore } from '@/stores/trading-store';
import { tradingApi } from '@/lib/api';
import { formatPnl, formatCurrency, formatPrice } from '@/lib/utils';
import { SimulatedTrade } from '@/hooks/use-trade-simulation';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

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

function formatDuration(openTime: string): string {
  const ms = Date.now() - new Date(openTime).getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hours < 24) return `${hours}h ${remMins}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

interface Props {
  simulations?: Map<string, SimulatedTrade>;
}

// ─── Mini Sparkline (SVG — no TradingView logo) ───
const MiniSparkline = memo(function MiniSparkline({ symbol, pnlPositive }: { symbol: string; pnlPositive: boolean }) {
  const [points, setPoints] = useState<string>('');
  const [areaPoints, setAreaPoints] = useState<string>('');
  const W = 100, H = 28;

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/candles?symbol=${symbol}&timeframe=1m&limit=60`)
      .then(r => r.json())
      .then(data => {
        if (!data.candles || data.candles.length < 2) return;
        const closes = data.candles.map((c: any) => c.close);
        const min = Math.min(...closes);
        const max = Math.max(...closes);
        const range = max - min || 1;
        const pts = closes.map((c: number, i: number) => {
          const x = (i / (closes.length - 1)) * W;
          const y = H - ((c - min) / range) * (H - 4) - 2;
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        });
        setPoints(pts.join(' '));
        setAreaPoints(`0,${H} ${pts.join(' ')} ${W},${H}`);
      })
      .catch(() => {});
  }, [symbol]);

  const color = pnlPositive ? '#22c55e' : '#ef4444';
  const fillColor = pnlPositive ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)';

  return (
    <svg width={W} height={H} className="block">
      {areaPoints && <polygon points={areaPoints} fill={fillColor} />}
      {points && <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" />}
    </svg>
  );
});

// ─── SL/TP Popup Modal ───
function SLTPModal({ pos, onClose, onSaved }: { pos: any; onClose: () => void; onSaved: () => void }) {
  const { token, tenantId } = useAuthStore();
  const prices = useTradingStore((s) => s.prices);
  const decimals = getDecimals(pos.symbol);
  const [sl, setSl] = useState(pos.stop_loss ? String(pos.stop_loss) : '');
  const [tp, setTp] = useState(pos.take_profit ? String(pos.take_profit) : '');
  const [slAmount, setSlAmount] = useState('');
  const [tpAmount, setTpAmount] = useState('');
  const [slMode, setSlMode] = useState<'price' | 'amount'>('amount');
  const [tpMode, setTpMode] = useState<'price' | 'amount'>('amount');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!token || !tenantId) return;
    setSaving(true);
    setError('');
    try {
      await tradingApi.updateSLTP(token, tenantId, pos.id, {
        stop_loss: sl ? parseFloat(sl) : null,
        take_profit: tp ? parseFloat(tp) : null,
      });
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update');
    }
    setSaving(false);
  };

  const handleRemove = async () => {
    if (!token || !tenantId) return;
    setSaving(true);
    try {
      await tradingApi.updateSLTP(token, tenantId, pos.id, { stop_loss: null, take_profit: null });
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to remove');
    }
    setSaving(false);
  };

  const openPriceFloat = Number(pos.open_price) / 100000;
  const displaySymbol = pos.symbol.replace(/([A-Z]{3})([A-Z]{3,})/, '$1/$2');
  const investCents = parseFloat(pos.swap || '0');
  const isDealerTrade = investCents > 0;
  const positionSize = isDealerTrade ? (investCents / 100) : (pos.volume * (pos.lot_size || 1));

  const amountToPrice = (amount: number, isSL: boolean): number => {
    if (positionSize <= 0 || openPriceFloat <= 0) return 0;
    const priceDelta = amount / positionSize;
    if (isSL) return pos.side === 'BUY' ? openPriceFloat - priceDelta : openPriceFloat + priceDelta;
    return pos.side === 'BUY' ? openPriceFloat + priceDelta : openPriceFloat - priceDelta;
  };
  const priceToAmount = (targetPrice: number): number => {
    if (positionSize <= 0) return 0;
    return Math.abs(targetPrice - openPriceFloat) * positionSize;
  };

  const handleSlAmountChange = (val: string) => {
    setSlAmount(val);
    const a = parseFloat(val);
    if (!isNaN(a) && a > 0) setSl(formatPrice(amountToPrice(a, true), decimals));
  };
  const handleTpAmountChange = (val: string) => {
    setTpAmount(val);
    const a = parseFloat(val);
    if (!isNaN(a) && a > 0) setTp(formatPrice(amountToPrice(a, false), decimals));
  };
  const handleSlPriceChange = (val: string) => {
    setSl(val);
    const p = parseFloat(val);
    if (!isNaN(p) && p > 0) setSlAmount(priceToAmount(p).toFixed(2));
  };
  const handleTpPriceChange = (val: string) => {
    setTp(val);
    const p = parseFloat(val);
    if (!isNaN(p) && p > 0) setTpAmount(priceToAmount(p).toFixed(2));
  };

  // Init amounts from existing prices
  useState(() => {
    if (pos.stop_loss) setSlAmount(priceToAmount(pos.stop_loss).toFixed(2));
    if (pos.take_profit) setTpAmount(priceToAmount(pos.take_profit).toFixed(2));
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative bg-card border border-border rounded-2xl shadow-2xl w-[340px] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
          <div>
            <div className="text-sm font-bold">{displaySymbol}</div>
            <div className="text-[10px] text-muted-foreground">
              {pos.side} · Open: {formatPrice(openPriceFloat, decimals)}
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary/50 text-muted-foreground">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Stop Loss */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs font-semibold text-sell">
                <div className="w-2 h-2 rounded-full bg-sell" />
                Stop Loss
              </label>
              <div className="inline-flex bg-secondary/20 rounded-md p-0.5 text-[9px]">
                <button onClick={() => setSlMode('amount')} className={`px-2 py-0.5 rounded font-semibold transition-all ${slMode === 'amount' ? 'bg-sell/20 text-sell' : 'text-muted-foreground'}`}>$ Amount</button>
                <button onClick={() => setSlMode('price')} className={`px-2 py-0.5 rounded font-semibold transition-all ${slMode === 'price' ? 'bg-sell/20 text-sell' : 'text-muted-foreground'}`}>Price</button>
              </div>
            </div>
            {slMode === 'amount' ? (
              <div className="flex items-center gap-2">
                <button onClick={() => { const v = parseFloat(slAmount) || 50; handleSlAmountChange(String(Math.max(1, v - 10))); }}
                  className="w-9 h-9 flex items-center justify-center rounded-lg bg-sell/10 hover:bg-sell/20 text-sell font-bold text-lg transition-colors">−</button>
                <div className="flex-1 flex items-center justify-center h-9 bg-secondary/20 rounded-lg px-2">
                  <span className="text-sm font-bold text-sell mr-1">-$</span>
                  <input type="number" step="10" min="1" value={slAmount} onChange={(e) => handleSlAmountChange(e.target.value)} placeholder="50"
                    className="w-20 bg-transparent text-sm font-mono font-bold text-center text-foreground focus:outline-none placeholder:text-muted-foreground/30" />
                </div>
                <button onClick={() => { const v = parseFloat(slAmount) || 50; handleSlAmountChange(String(v + 10)); }}
                  className="w-9 h-9 flex items-center justify-center rounded-lg bg-sell/10 hover:bg-sell/20 text-sell font-bold text-lg transition-colors">+</button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button onClick={() => { const v = parseFloat(sl) || openPriceFloat * 0.99; handleSlPriceChange((v - Math.pow(10, -decimals)).toFixed(decimals)); }}
                  className="w-9 h-9 flex items-center justify-center rounded-lg bg-sell/10 hover:bg-sell/20 text-sell font-bold text-lg transition-colors">−</button>
                <input type="number" step={Math.pow(10, -decimals)} value={sl} onChange={(e) => handleSlPriceChange(e.target.value)}
                  placeholder={formatPrice(pos.side === 'BUY' ? openPriceFloat * 0.99 : openPriceFloat * 1.01, decimals)}
                  className="flex-1 h-9 bg-secondary/20 rounded-lg px-3 text-sm font-mono font-bold text-center text-foreground focus:outline-none focus:ring-2 focus:ring-sell/30 placeholder:text-muted-foreground/30" />
                <button onClick={() => { const v = parseFloat(sl) || openPriceFloat * 0.99; handleSlPriceChange((v + Math.pow(10, -decimals)).toFixed(decimals)); }}
                  className="w-9 h-9 flex items-center justify-center rounded-lg bg-sell/10 hover:bg-sell/20 text-sell font-bold text-lg transition-colors">+</button>
              </div>
            )}
            {sl && (
              <div className="text-[10px] text-muted-foreground text-center">
                Close at {sl} · Loss: <span className="text-sell font-semibold">-${slAmount || '0'}</span>
              </div>
            )}
          </div>

          {/* Take Profit */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs font-semibold text-buy">
                <div className="w-2 h-2 rounded-full bg-buy" />
                Take Profit
              </label>
              <div className="inline-flex bg-secondary/20 rounded-md p-0.5 text-[9px]">
                <button onClick={() => setTpMode('amount')} className={`px-2 py-0.5 rounded font-semibold transition-all ${tpMode === 'amount' ? 'bg-buy/20 text-buy' : 'text-muted-foreground'}`}>$ Amount</button>
                <button onClick={() => setTpMode('price')} className={`px-2 py-0.5 rounded font-semibold transition-all ${tpMode === 'price' ? 'bg-buy/20 text-buy' : 'text-muted-foreground'}`}>Price</button>
              </div>
            </div>
            {tpMode === 'amount' ? (
              <div className="flex items-center gap-2">
                <button onClick={() => { const v = parseFloat(tpAmount) || 100; handleTpAmountChange(String(Math.max(1, v - 10))); }}
                  className="w-9 h-9 flex items-center justify-center rounded-lg bg-buy/10 hover:bg-buy/20 text-buy font-bold text-lg transition-colors">−</button>
                <div className="flex-1 flex items-center justify-center h-9 bg-secondary/20 rounded-lg px-2">
                  <span className="text-sm font-bold text-buy mr-1">+$</span>
                  <input type="number" step="10" min="1" value={tpAmount} onChange={(e) => handleTpAmountChange(e.target.value)} placeholder="100"
                    className="w-20 bg-transparent text-sm font-mono font-bold text-center text-foreground focus:outline-none placeholder:text-muted-foreground/30" />
                </div>
                <button onClick={() => { const v = parseFloat(tpAmount) || 100; handleTpAmountChange(String(v + 10)); }}
                  className="w-9 h-9 flex items-center justify-center rounded-lg bg-buy/10 hover:bg-buy/20 text-buy font-bold text-lg transition-colors">+</button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button onClick={() => { const v = parseFloat(tp) || openPriceFloat * 1.01; handleTpPriceChange((v - Math.pow(10, -decimals)).toFixed(decimals)); }}
                  className="w-9 h-9 flex items-center justify-center rounded-lg bg-buy/10 hover:bg-buy/20 text-buy font-bold text-lg transition-colors">−</button>
                <input type="number" step={Math.pow(10, -decimals)} value={tp} onChange={(e) => handleTpPriceChange(e.target.value)}
                  placeholder={formatPrice(pos.side === 'BUY' ? openPriceFloat * 1.01 : openPriceFloat * 0.99, decimals)}
                  className="flex-1 h-9 bg-secondary/20 rounded-lg px-3 text-sm font-mono font-bold text-center text-foreground focus:outline-none focus:ring-2 focus:ring-buy/30 placeholder:text-muted-foreground/30" />
                <button onClick={() => { const v = parseFloat(tp) || openPriceFloat * 1.01; handleTpPriceChange((v + Math.pow(10, -decimals)).toFixed(decimals)); }}
                  className="w-9 h-9 flex items-center justify-center rounded-lg bg-buy/10 hover:bg-buy/20 text-buy font-bold text-lg transition-colors">+</button>
              </div>
            )}
            {tp && (
              <div className="text-[10px] text-muted-foreground text-center">
                Close at {tp} · Profit: <span className="text-buy font-semibold">+${tpAmount || '0'}</span>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="text-[11px] text-sell bg-sell/10 rounded-lg px-3 py-2 text-center font-medium">{error}</div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border/50 flex gap-2">
          {(pos.stop_loss || pos.take_profit) && (
            <button
              onClick={handleRemove}
              disabled={saving}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-secondary/20 text-muted-foreground hover:bg-secondary/40 transition-colors disabled:opacity-50"
            >
              Remove All
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-white text-xs font-bold bg-primary hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function TradingBottomBar({ simulations }: Props) {
  const { token, tenantId } = useAuthStore();
  const positions = useTradingStore((s) => s.positions);
  const prices = useTradingStore((s) => s.prices);
  const setPositions = useTradingStore((s) => s.setPositions);
  const selectedTradeId = useTradingStore((s) => s.selectedTradeId);
  const setSelectedTradeId = useTradingStore((s) => s.setSelectedTradeId);
  const setSelectedSymbol = useTradingStore((s) => s.setSelectedSymbol);
  const [closing, setClosing] = useState<string | null>(null);
  const [sltpModalPos, setSltpModalPos] = useState<any>(null);
  const [, forceUpdate] = useState(0); // for duration refresh

  const prevPosIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!token || !tenantId) return;
    const load = async () => {
      try {
        const data = await tradingApi.getPositions(token, tenantId);
        try { setPositions(data); } catch {}

        const newIds = new Set<string>(data.map((p: any) => p.id));
        const prevIds = prevPosIdsRef.current;
        for (const pos of data) {
          if (!prevIds.has(pos.id) && parseFloat(pos.swap || '0') > 0) {
            setSelectedTradeId(pos.id);
            setSelectedSymbol(pos.symbol);
            break;
          }
        }
        prevPosIdsRef.current = newIds;

        const currentSelected = useTradingStore.getState().selectedTradeId;
        if (currentSelected && !newIds.has(currentSelected)) {
          setSelectedTradeId(null);
        }
      } catch (err: any) {
        console.warn('[TradingBottomBar] Failed to load positions:', err.message);
      }
    };
    load();
    const interval = setInterval(load, 1500);
    return () => clearInterval(interval);
  }, [token, tenantId]);

  // Refresh duration every second
  useEffect(() => {
    if (positions.length === 0) return;
    const interval = setInterval(() => forceUpdate((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, [positions.length]);

  const handleClose = async (tradeId: string) => {
    if (!token || !tenantId) return;
    setClosing(tradeId);
    try {
      await tradingApi.closePosition(token, tenantId, tradeId);
    } catch (err: any) {
      console.error('[Close] Failed:', err?.message || err);
    }
    try {
      const data = await tradingApi.getPositions(token, tenantId);
      setPositions(data);
    } catch {}
    setClosing(null);
  };

  const handleCloseAll = async () => {
    if (!token || !tenantId || positions.length === 0) return;
    for (const pos of positions) {
      try { await tradingApi.closePosition(token, tenantId, pos.id); } catch {}
    }
    try {
      const data = await tradingApi.getPositions(token, tenantId);
      setPositions(data);
    } catch {}
  };

  const getPnl = (pos: any): number => {
    const investCents = parseFloat(pos.swap || '0');
    if (investCents > 0 && simulations) {
      const sim = simulations.get(pos.id);
      return sim ? sim.currentPnlCents : 0;
    }
    return calcUnrealizedPnl(pos, prices.get(pos.symbol));
  };

  const totalPnl = positions.reduce((sum, p) => sum + getPnl(p), 0);

  if (positions.length === 0) {
    return (
      <div className="h-10 bg-card border-t border-border flex items-center justify-center px-4 shrink-0 no-select">
        <span className="text-[11px] text-muted-foreground">No open positions</span>
      </div>
    );
  }

  return (
    <div className="bg-card border-t border-border shrink-0 no-select">
      {/* Header row */}
      <div className="h-8 flex items-center justify-between px-4 border-b border-border/50 bg-secondary/5">
        <div className="flex items-center gap-4">
          <span className="text-[11px] font-semibold">
            <span className="text-muted-foreground">Positions:</span> {positions.length}
          </span>
          <span className={`text-[11px] font-mono font-bold ${totalPnl >= 0 ? 'text-buy' : 'text-sell'}`}>
            P&L: {totalPnl >= 0 ? '+' : ''}{(totalPnl / 100).toFixed(2)} USD
          </span>
        </div>
        <button
          onClick={handleCloseAll}
          className="text-[10px] px-2.5 py-0.5 rounded-md bg-sell/10 text-sell hover:bg-sell/20 font-medium transition-colors"
        >
          Close All
        </button>
      </div>

      {/* Column headers */}
      <div className="flex items-center px-4 py-1 text-[10px] text-muted-foreground font-medium border-b border-border/30 bg-secondary/3">
        <span className="w-10">Side</span>
        <span className="w-24">Symbol</span>
        <span className="w-[100px]">Chart</span>
        <span className="w-20">Size</span>
        <span className="w-24">Open Price</span>
        <span className="w-24">Current</span>
        <span className="w-28">SL / TP</span>
        <span className="w-24 text-right">P&L</span>
        <span className="w-16 text-right">P&L %</span>
        <span className="w-16 text-right">Duration</span>
        <span className="flex-1" />
      </div>

      {/* Positions list */}
      <div className="max-h-36 overflow-y-auto scrollbar-none">
        {positions.map((pos) => {
          const pnlCents = getPnl(pos);
          const pnl = formatPnl(pnlCents);
          const investCents = parseFloat(pos.swap || '0');
          const isDealerTrade = investCents > 0;
          const isSelected = selectedTradeId === pos.id;
          const decimals = getDecimals(pos.symbol);
          const openPriceFloat = Number(pos.open_price) / 100000;
          const currentPrice = prices.get(pos.symbol);
          const currentPriceValue = currentPrice
            ? (pos.side === 'BUY' ? currentPrice.bid : currentPrice.ask)
            : 0;

          // P&L percentage
          let pnlPercent = '0.00';
          if (isDealerTrade && investCents > 0) {
            pnlPercent = ((pnlCents / investCents) * 100).toFixed(2);
          } else if (openPriceFloat > 0) {
            const direction = pos.side === 'BUY' ? 1 : -1;
            pnlPercent = (((currentPriceValue - openPriceFloat) / openPriceFloat) * 100 * direction).toFixed(2);
          }
          const pnlPercentNum = parseFloat(pnlPercent);

          return (
            <div
              key={pos.id}
              onClick={() => {
                setSelectedTradeId(pos.id);
                setSelectedSymbol(pos.symbol);
              }}
              className={`flex items-center px-4 py-1.5 text-[11px] border-b border-border/20 transition-colors group cursor-pointer ${
                isSelected ? 'bg-primary/10' : 'hover:bg-secondary/5'
              }`}
            >
              {/* Side */}
              <span className={`w-10 text-[10px] font-bold ${pos.side === 'BUY' ? 'text-buy' : 'text-sell'}`}>
                {pos.side}
              </span>

              {/* Symbol */}
              <span className="w-24 font-semibold">
                {pos.symbol.replace(/([A-Z]{3})([A-Z]{3,})/, '$1/$2')}
              </span>

              {/* Mini Chart */}
              <div
                className="w-[100px] h-[30px] cursor-pointer rounded overflow-hidden hover:ring-1 hover:ring-primary/30 transition-all"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedTradeId(pos.id);
                  setSelectedSymbol(pos.symbol);
                }}
                title={`View ${pos.symbol} chart`}
              >
                <MiniSparkline symbol={pos.symbol} pnlPositive={pnlCents >= 0} />
              </div>

              {/* Size */}
              <span className="w-20 text-muted-foreground font-mono">
                {isDealerTrade ? formatCurrency(investCents) : `${pos.volume} lot`}
              </span>

              {/* Open Price */}
              <span className="w-24 font-mono text-muted-foreground">
                {formatPrice(openPriceFloat, decimals)}
              </span>

              {/* Current Price */}
              <span className={`w-24 font-mono font-medium ${
                currentPriceValue > openPriceFloat
                  ? (pos.side === 'BUY' ? 'text-buy' : 'text-sell')
                  : currentPriceValue < openPriceFloat
                    ? (pos.side === 'BUY' ? 'text-sell' : 'text-buy')
                    : 'text-foreground'
              }`}>
                {currentPriceValue > 0 ? formatPrice(currentPriceValue, decimals) : '—'}
              </span>

              {/* SL / TP — clickable to open modal */}
              <span
                className="w-28 text-[10px] font-mono cursor-pointer rounded-md px-1.5 py-0.5 hover:bg-secondary/30 transition-colors"
                onClick={(e) => { e.stopPropagation(); setSltpModalPos(pos); }}
                title="Click to set/edit SL/TP"
              >
                {(pos.stop_loss || pos.take_profit) ? (
                  <>
                    {pos.stop_loss ? <span className="text-sell">SL {formatPrice(pos.stop_loss, Math.min(decimals, 4))}</span> : <span className="text-muted-foreground/40">—</span>}
                    <span className="text-muted-foreground/40 mx-0.5">/</span>
                    {pos.take_profit ? <span className="text-buy">TP {formatPrice(pos.take_profit, Math.min(decimals, 4))}</span> : <span className="text-muted-foreground/40">—</span>}
                  </>
                ) : (
                  <span className="text-primary/70 hover:text-primary font-semibold">+ SL/TP</span>
                )}
              </span>

              {/* P&L $ */}
              <span className={`w-24 text-right font-mono font-semibold ${pnl.color}`}>
                {pnl.text}
              </span>

              {/* P&L % */}
              <span className={`w-16 text-right text-[10px] font-mono font-semibold ${pnlPercentNum >= 0 ? 'text-buy' : 'text-sell'}`}>
                {pnlPercentNum >= 0 ? '+' : ''}{pnlPercent}%
              </span>

              {/* Duration */}
              <span className="w-16 text-right text-[10px] text-muted-foreground font-mono">
                {formatDuration(pos.open_time)}
              </span>

              {/* Close button — always visible */}
              <div className="flex-1 flex justify-end">
                <button
                  onClick={(e) => { e.stopPropagation(); handleClose(pos.id); }}
                  disabled={closing === pos.id}
                  className="text-[10px] px-3 py-1 rounded-md bg-sell/10 text-sell hover:bg-sell/20 font-semibold transition-all disabled:opacity-50 ml-3"
                >
                  {closing === pos.id ? '...' : 'Close'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* SL/TP Modal */}
      {sltpModalPos && (
        <SLTPModal
          pos={sltpModalPos}
          onClose={() => setSltpModalPos(null)}
          onSaved={async () => {
            if (!token || !tenantId) return;
            try {
              const data = await tradingApi.getPositions(token, tenantId);
              setPositions(data);
            } catch {}
          }}
        />
      )}
    </div>
  );
}
