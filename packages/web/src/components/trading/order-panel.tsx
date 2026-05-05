'use client';
import { useState, useMemo } from 'react';
import { useTradingStore } from '@/stores/trading-store';
import { useAuthStore } from '@/stores/auth-store';
import { tradingApi } from '@/lib/api';
import { formatPrice } from '@/lib/utils';

const QUICK_VOLUMES = [0.01, 0.05, 0.1, 0.5, 1.0, 5.0];
const QUICK_AMOUNTS = [50, 100, 250, 500, 1000, 5000];

function getSentiment(symbol: string): number {
  let seed = 0;
  for (let i = 0; i < symbol.length; i++) seed += symbol.charCodeAt(i) * (i + 1);
  return 30 + (seed % 40);
}

interface OrderPanelProps {
  onClose?: () => void;
}

export function OrderPanel({ onClose }: OrderPanelProps) {
  const [volume, setVolume] = useState('0.10');
  const [investAmount, setInvestAmount] = useState('100');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showSL, setShowSL] = useState(false);
  const [showTP, setShowTP] = useState(false);
  const [slMode, setSlMode] = useState<'price' | 'amount'>('amount');
  const [tpMode, setTpMode] = useState<'price' | 'amount'>('amount');
  const [slAmount, setSlAmount] = useState('');
  const [tpAmount, setTpAmount] = useState('');

  const selectedSymbol = useTradingStore((s) => s.selectedSymbol);
  const getPrice = useTradingStore((s) => s.getPrice);
  const instruments = useTradingStore((s) => s.instruments);
  const positions = useTradingStore((s) => s.positions);
  const { token, tenantId, isDealerManaged } = useAuthStore();

  const price = getPrice(selectedSymbol);
  const instrument = instruments.find((i) => i.symbol === selectedSymbol);
  const bid = price?.bid || 0;
  const ask = price?.ask || 0;
  const decimals = selectedSymbol.includes('JPY') ? 3 : selectedSymbol.startsWith('BTC') ? 2 : 5;
  const displaySymbol = selectedSymbol.replace(/([A-Z]{3})([A-Z]{3,})/, '$1/$2');

  const vol = parseFloat(volume) || 0;
  const lotSize = instrument?.lot_size || 100000;
  const marginEstimate = vol * lotSize * ((bid + ask) / 2) / 100;
  const pipValue = vol * lotSize * (instrument?.pip_size || 0.0001);
  const amt = parseFloat(investAmount) || 0;

  // Convert between amount ($) and price for SL/TP
  const entryPrice = side === 'BUY' ? ask : bid;
  const positionSize = isDealerManaged ? (amt / 100) : (vol * lotSize); // dealer: invest in dollars, regular: volume * lotSize

  const amountToPrice = (amount: number, isSL: boolean): number => {
    if (positionSize <= 0 || entryPrice <= 0) return 0;
    const priceDelta = amount / positionSize;
    if (isSL) return side === 'BUY' ? entryPrice - priceDelta : entryPrice + priceDelta;
    return side === 'BUY' ? entryPrice + priceDelta : entryPrice - priceDelta;
  };

  const priceToAmount = (targetPrice: number, isSL: boolean): number => {
    if (positionSize <= 0 || entryPrice <= 0) return 0;
    const priceDelta = Math.abs(targetPrice - entryPrice);
    return priceDelta * positionSize;
  };

  // Sync amount → price
  const handleSlAmountChange = (val: string) => {
    setSlAmount(val);
    const a = parseFloat(val);
    if (!isNaN(a) && a > 0) {
      setStopLoss(formatPrice(amountToPrice(a, true), decimals));
    }
  };
  const handleTpAmountChange = (val: string) => {
    setTpAmount(val);
    const a = parseFloat(val);
    if (!isNaN(a) && a > 0) {
      setTakeProfit(formatPrice(amountToPrice(a, false), decimals));
    }
  };
  // Sync price → amount
  const handleSlPriceChange = (val: string) => {
    setStopLoss(val);
    const p = parseFloat(val);
    if (!isNaN(p) && p > 0) {
      setSlAmount(priceToAmount(p, true).toFixed(2));
    }
  };
  const handleTpPriceChange = (val: string) => {
    setTakeProfit(val);
    const p = parseFloat(val);
    if (!isNaN(p) && p > 0) {
      setTpAmount(priceToAmount(p, false).toFixed(2));
    }
  };

  // SL/TP validation
  const slError = useMemo(() => {
    if (!showSL || !stopLoss) return '';
    const sl = parseFloat(stopLoss);
    if (isNaN(sl)) return '';
    const refPrice = side === 'BUY' ? bid : ask;
    if (refPrice <= 0) return '';
    if (side === 'BUY' && sl >= refPrice) return 'SL must be below current price for BUY';
    if (side === 'SELL' && sl <= refPrice) return 'SL must be above current price for SELL';
    return '';
  }, [showSL, stopLoss, side, bid, ask]);

  const tpError = useMemo(() => {
    if (!showTP || !takeProfit) return '';
    const tp = parseFloat(takeProfit);
    if (isNaN(tp)) return '';
    const refPrice = side === 'BUY' ? ask : bid;
    if (refPrice <= 0) return '';
    if (side === 'BUY' && tp <= refPrice) return 'TP must be above current price for BUY';
    if (side === 'SELL' && tp >= refPrice) return 'TP must be below current price for SELL';
    return '';
  }, [showTP, takeProfit, side, bid, ask]);

  const handleOrder = async () => {
    if (!token || !tenantId) return;
    if (slError || tpError) { setError(slError || tpError); return; }
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      await tradingApi.placeOrder(token, tenantId, {
        symbol: selectedSymbol,
        side,
        type: 'MARKET',
        volume: isDealerManaged ? 0.01 : parseFloat(volume),
        stop_loss: stopLoss ? parseFloat(stopLoss) : undefined,
        take_profit: takeProfit ? parseFloat(takeProfit) : undefined,
        ...(isDealerManaged ? { invest_amount: Math.round(amt * 100) } : {}),
      });
      setSuccess(isDealerManaged
        ? `${side} $${amt} ${displaySymbol}`
        : `${side} ${volume} lot ${displaySymbol}`
      );
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message);
      setTimeout(() => setError(''), 5000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full no-select">
      {/* Header with close */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div>
          <span className="text-sm font-bold">{displaySymbol}</span>
          {price && (
            <span className="text-[10px] text-muted-foreground ml-2">
              {formatPrice(bid, decimals)} / {formatPrice(ask, decimals)}
            </span>
          )}
        </div>
        {onClose && (
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-4 space-y-5">
          {/* Buy / Sell toggle */}
          <div className="flex bg-secondary/20 rounded-xl p-1">
            <button
              onClick={() => setSide('SELL')}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                side === 'SELL' ? 'bg-sell text-white' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Sell
            </button>
            <button
              onClick={() => setSide('BUY')}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                side === 'BUY' ? 'bg-buy text-white' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Buy
            </button>
          </div>

          {isDealerManaged ? (
            /* ── Investment Amount mode (dealer-managed clients) ── */
            <>
              <div className="text-center">
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={() => setInvestAmount(String(Math.max(10, amt - 50)))}
                    className="w-10 h-10 flex items-center justify-center rounded-xl bg-secondary/30 hover:bg-secondary/50 text-lg font-bold transition-colors"
                  >
                    −
                  </button>
                  <div className="flex items-center">
                    <span className="text-xl font-bold text-muted-foreground mr-1">$</span>
                    <input
                      type="number"
                      step="10"
                      min="10"
                      max="100000"
                      value={investAmount}
                      onChange={(e) => setInvestAmount(e.target.value)}
                      className="w-28 bg-transparent text-2xl font-bold text-center font-mono text-foreground focus:outline-none"
                    />
                  </div>
                  <button
                    onClick={() => setInvestAmount(String(Math.min(100000, amt + 50)))}
                    className="w-10 h-10 flex items-center justify-center rounded-xl bg-secondary/30 hover:bg-secondary/50 text-lg font-bold transition-colors"
                  >
                    +
                  </button>
                </div>
                <span className="text-[10px] text-muted-foreground mt-1 block">Investment Amount</span>
              </div>

              {/* Quick amounts */}
              <div className="flex justify-center gap-1.5 flex-wrap">
                {QUICK_AMOUNTS.map((a) => (
                  <button
                    key={a}
                    onClick={() => setInvestAmount(String(a))}
                    className={`text-[10px] px-2.5 py-1 rounded-full font-medium transition-all ${
                      amt === a
                        ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
                        : 'bg-secondary/20 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    ${a.toLocaleString()}
                  </button>
                ))}
              </div>

              {/* Trade info */}
              <div className="space-y-2 py-2 border-y border-border/30">
                <InfoRow label="Investment" value={`$${amt.toLocaleString()}`} />
                <InfoRow label="Instrument" value={displaySymbol} />
              </div>
            </>
          ) : (
            /* ── Volume (lots) mode (regular clients) ── */
            <>
              <div className="text-center">
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={() => setVolume(String(Math.max(0.01, parseFloat(volume) - 0.01).toFixed(2)))}
                    className="w-10 h-10 flex items-center justify-center rounded-xl bg-secondary/30 hover:bg-secondary/50 text-lg font-bold transition-colors"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="50"
                    value={volume}
                    onChange={(e) => setVolume(e.target.value)}
                    className="w-28 bg-transparent text-2xl font-bold text-center font-mono text-foreground focus:outline-none"
                  />
                  <button
                    onClick={() => setVolume(String(Math.min(50, parseFloat(volume) + 0.01).toFixed(2)))}
                    className="w-10 h-10 flex items-center justify-center rounded-xl bg-secondary/30 hover:bg-secondary/50 text-lg font-bold transition-colors"
                  >
                    +
                  </button>
                </div>
                <span className="text-[10px] text-muted-foreground mt-1 block">Lots</span>
              </div>

              {/* Quick volumes */}
              <div className="flex justify-center gap-1.5">
                {QUICK_VOLUMES.map((v) => (
                  <button
                    key={v}
                    onClick={() => setVolume(v.toFixed(2))}
                    className={`text-[10px] px-2.5 py-1 rounded-full font-medium transition-all ${
                      parseFloat(volume) === v
                        ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
                        : 'bg-secondary/20 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>

              {/* Trade info */}
              <div className="space-y-2 py-2 border-y border-border/30">
                <InfoRow label="Required Margin" value={`$${marginEstimate.toFixed(2)}`} />
                <InfoRow label="Pip Value" value={`$${pipValue.toFixed(2)}`} />
                <InfoRow label="Leverage" value="1:100" />
              </div>
            </>
          )}

          {/* SL / TP buttons — side by side like Buy/Sell */}
          <div className="flex rounded-xl p-1 gap-2">
            <button
              onClick={() => {
                setShowSL(!showSL);
                if (!showSL && !stopLoss) {
                  setStopLoss(formatPrice(side === 'BUY' ? bid * 0.99 : ask * 1.01, decimals));
                }
              }}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all border-2 ${
                showSL
                  ? 'bg-sell text-white border-sell shadow-lg shadow-sell/20'
                  : 'bg-sell/10 text-sell border-sell/30 hover:bg-sell/20'
              }`}
            >
              Stop Loss
            </button>
            <button
              onClick={() => {
                setShowTP(!showTP);
                if (!showTP && !takeProfit) {
                  setTakeProfit(formatPrice(side === 'BUY' ? ask * 1.01 : bid * 0.99, decimals));
                }
              }}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all border-2 ${
                showTP
                  ? 'bg-buy text-white border-buy shadow-lg shadow-buy/20'
                  : 'bg-buy/10 text-buy border-buy/30 hover:bg-buy/20'
              }`}
            >
              Take Profit
            </button>
          </div>

          {/* SL input (shown when SL active) */}
          {showSL && (
            <div className="space-y-2">
              {/* Mode toggle */}
              <div className="flex justify-center">
                <div className="inline-flex bg-secondary/20 rounded-lg p-0.5 text-[10px]">
                  <button onClick={() => setSlMode('amount')} className={`px-3 py-1 rounded-md font-semibold transition-all ${slMode === 'amount' ? 'bg-sell/20 text-sell' : 'text-muted-foreground'}`}>
                    $ Amount
                  </button>
                  <button onClick={() => setSlMode('price')} className={`px-3 py-1 rounded-md font-semibold transition-all ${slMode === 'price' ? 'bg-sell/20 text-sell' : 'text-muted-foreground'}`}>
                    Price
                  </button>
                </div>
              </div>
              {slMode === 'amount' ? (
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={() => { const v = parseFloat(slAmount) || 50; handleSlAmountChange(String(Math.max(1, v - 10))); }}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-sell/10 hover:bg-sell/20 text-sell font-bold transition-colors"
                  >−</button>
                  <div className="flex items-center">
                    <span className="text-lg font-bold text-sell mr-1">-$</span>
                    <input
                      type="number"
                      step="10"
                      min="1"
                      value={slAmount}
                      onChange={(e) => handleSlAmountChange(e.target.value)}
                      placeholder="50"
                      className="w-24 bg-transparent text-lg font-mono font-bold text-center text-foreground focus:outline-none placeholder:text-muted-foreground/30"
                    />
                  </div>
                  <button
                    onClick={() => { const v = parseFloat(slAmount) || 50; handleSlAmountChange(String(v + 10)); }}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-sell/10 hover:bg-sell/20 text-sell font-bold transition-colors"
                  >+</button>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={() => { const v = parseFloat(stopLoss) || (side === 'BUY' ? bid - 0.001 : ask + 0.001); handleSlPriceChange((v - 0.0001).toFixed(decimals)); }}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-sell/10 hover:bg-sell/20 text-sell font-bold transition-colors"
                  >−</button>
                  <input
                    type="number"
                    step="0.00001"
                    value={stopLoss}
                    onChange={(e) => handleSlPriceChange(e.target.value)}
                    placeholder={formatPrice(side === 'BUY' ? bid * 0.99 : ask * 1.01, decimals)}
                    className="w-32 bg-transparent text-lg font-mono font-bold text-center text-foreground focus:outline-none placeholder:text-muted-foreground/30"
                  />
                  <button
                    onClick={() => { const v = parseFloat(stopLoss) || (side === 'BUY' ? bid - 0.001 : ask + 0.001); handleSlPriceChange((v + 0.0001).toFixed(decimals)); }}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-sell/10 hover:bg-sell/20 text-sell font-bold transition-colors"
                  >+</button>
                </div>
              )}
              {stopLoss && !slError && (
                <div className="text-[10px] text-center text-muted-foreground">
                  Close at {stopLoss} · Loss: -${slAmount || '0'}
                </div>
              )}
              {slError && <div className="text-[10px] text-center text-sell font-medium">{slError}</div>}
            </div>
          )}

          {/* TP input (shown when TP active) */}
          {showTP && (
            <div className="space-y-2">
              {/* Mode toggle */}
              <div className="flex justify-center">
                <div className="inline-flex bg-secondary/20 rounded-lg p-0.5 text-[10px]">
                  <button onClick={() => setTpMode('amount')} className={`px-3 py-1 rounded-md font-semibold transition-all ${tpMode === 'amount' ? 'bg-buy/20 text-buy' : 'text-muted-foreground'}`}>
                    $ Amount
                  </button>
                  <button onClick={() => setTpMode('price')} className={`px-3 py-1 rounded-md font-semibold transition-all ${tpMode === 'price' ? 'bg-buy/20 text-buy' : 'text-muted-foreground'}`}>
                    Price
                  </button>
                </div>
              </div>
              {tpMode === 'amount' ? (
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={() => { const v = parseFloat(tpAmount) || 100; handleTpAmountChange(String(Math.max(1, v - 10))); }}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-buy/10 hover:bg-buy/20 text-buy font-bold transition-colors"
                  >−</button>
                  <div className="flex items-center">
                    <span className="text-lg font-bold text-buy mr-1">+$</span>
                    <input
                      type="number"
                      step="10"
                      min="1"
                      value={tpAmount}
                      onChange={(e) => handleTpAmountChange(e.target.value)}
                      placeholder="100"
                      className="w-24 bg-transparent text-lg font-mono font-bold text-center text-foreground focus:outline-none placeholder:text-muted-foreground/30"
                    />
                  </div>
                  <button
                    onClick={() => { const v = parseFloat(tpAmount) || 100; handleTpAmountChange(String(v + 10)); }}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-buy/10 hover:bg-buy/20 text-buy font-bold transition-colors"
                  >+</button>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={() => { const v = parseFloat(takeProfit) || (side === 'BUY' ? ask + 0.001 : bid - 0.001); handleTpPriceChange((v - 0.0001).toFixed(decimals)); }}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-buy/10 hover:bg-buy/20 text-buy font-bold transition-colors"
                  >−</button>
                  <input
                    type="number"
                    step="0.00001"
                    value={takeProfit}
                    onChange={(e) => handleTpPriceChange(e.target.value)}
                    placeholder={formatPrice(side === 'BUY' ? ask * 1.01 : bid * 0.99, decimals)}
                    className="w-32 bg-transparent text-lg font-mono font-bold text-center text-foreground focus:outline-none placeholder:text-muted-foreground/30"
                  />
                  <button
                    onClick={() => { const v = parseFloat(takeProfit) || (side === 'BUY' ? ask + 0.001 : bid - 0.001); handleTpPriceChange((v + 0.0001).toFixed(decimals)); }}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-buy/10 hover:bg-buy/20 text-buy font-bold transition-colors"
                  >+</button>
                </div>
              )}
              {takeProfit && !tpError && (
                <div className="text-[10px] text-center text-muted-foreground">
                  Close at {takeProfit} · Profit: +${tpAmount || '0'}
                </div>
              )}
              {tpError && <div className="text-[10px] text-center text-sell font-medium">{tpError}</div>}
            </div>
          )}

          {/* Sentiment */}
          <SentimentBar symbol={selectedSymbol} />

          {/* Feedback */}
          {success && (
            <div className="text-[11px] text-buy bg-buy/10 rounded-xl px-3 py-2 text-center font-medium">
              {success}
            </div>
          )}
          {error && (
            <div className="text-[11px] text-sell bg-sell/10 rounded-xl px-3 py-2 text-center font-medium">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Bottom: Execute button — always visible */}
      <div className="px-4 py-3 border-t border-border/50">
        <button
          onClick={handleOrder}
          disabled={loading || (side === 'BUY' ? ask === 0 : bid === 0) || !!slError || !!tpError}
          className={`w-full py-3 rounded-xl text-white font-bold text-sm transition-all disabled:opacity-40 active:scale-[0.98] ${
            side === 'BUY'
              ? 'bg-buy hover:bg-buy/90'
              : 'bg-sell hover:bg-sell/90'
          }`}
        >
          {loading ? 'Executing...' : isDealerManaged
            ? `${side === 'BUY' ? 'Buy' : 'Sell'} $${amt} ${displaySymbol}`
            : `${side === 'BUY' ? 'Buy' : 'Sell'} ${displaySymbol}`
          }
        </button>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-medium">{value}</span>
    </div>
  );
}

function ToggleSection({ label, enabled, onToggle, children }: {
  label: string; enabled: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div>
      <button onClick={onToggle} className="flex items-center justify-between w-full">
        <span className="text-xs font-medium text-foreground">{label}</span>
        <div className={`w-9 h-5 rounded-full transition-colors flex items-center px-0.5 ${
          enabled ? 'bg-primary' : 'bg-secondary/50'
        }`}>
          <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
            enabled ? 'translate-x-4' : 'translate-x-0'
          }`} />
        </div>
      </button>
      {enabled && children}
    </div>
  );
}

function SentimentBar({ symbol }: { symbol: string }) {
  const buyers = useMemo(() => getSentiment(symbol), [symbol]);
  const sellers = 100 - buyers;

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px]">
        <span className="text-sell font-medium">{sellers}% Sell</span>
        <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Sentiment</span>
        <span className="text-buy font-medium">{buyers}% Buy</span>
      </div>
      <div className="flex h-1.5 rounded-full overflow-hidden gap-0.5">
        <div className="bg-sell/70 rounded-l-full transition-all duration-500" style={{ width: `${sellers}%` }} />
        <div className="bg-buy/70 rounded-r-full transition-all duration-500" style={{ width: `${buyers}%` }} />
      </div>
    </div>
  );
}
