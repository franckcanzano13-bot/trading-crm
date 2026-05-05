'use client';
import { useState, useCallback, useMemo } from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface PriceAlert {
  id: string;
  symbol: string;
  condition: 'above' | 'below' | 'cross';
  price: string;
  currentPrice: string;
  active: boolean;
  triggered: boolean;
  createdAt: string;
  triggeredAt?: string;
}

type Tab = 'active' | 'triggered';
type Condition = 'above' | 'below' | 'cross';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const POPULAR_INSTRUMENTS = [
  'EURUSD',
  'GBPUSD',
  'USDJPY',
  'XAUUSD',
  'BTCUSD',
  'US500',
] as const;

const CONDITION_OPTIONS: { value: Condition; label: string; color: string; activeBg: string; activeBorder: string }[] = [
  { value: 'above', label: 'Price Above', color: 'text-buy', activeBg: 'bg-buy/15', activeBorder: 'border-buy/30' },
  { value: 'below', label: 'Price Below', color: 'text-sell', activeBg: 'bg-sell/15', activeBorder: 'border-sell/30' },
  { value: 'cross', label: 'Price Crosses', color: 'text-amber-500', activeBg: 'bg-amber-500/15', activeBorder: 'border-amber-500/30' },
];

const MOCK_ALERTS: PriceAlert[] = [
  {
    id: '1',
    symbol: 'EURUSD',
    condition: 'above',
    price: '1.09500',
    currentPrice: '1.08742',
    active: true,
    triggered: false,
    createdAt: '2h ago',
  },
  {
    id: '2',
    symbol: 'XAUUSD',
    condition: 'below',
    price: '2040.00',
    currentPrice: '2063.45',
    active: true,
    triggered: false,
    createdAt: '5h ago',
  },
  {
    id: '3',
    symbol: 'BTCUSD',
    condition: 'above',
    price: '68500.00',
    currentPrice: '69120.00',
    active: false,
    triggered: true,
    createdAt: '1d ago',
    triggeredAt: '6h ago',
  },
  {
    id: '4',
    symbol: 'USDJPY',
    condition: 'cross',
    price: '149.500',
    currentPrice: '150.230',
    active: true,
    triggered: false,
    createdAt: '2d ago',
  },
  {
    id: '5',
    symbol: 'US500',
    condition: 'above',
    price: '5250.00',
    currentPrice: '5283.60',
    active: false,
    triggered: true,
    createdAt: '3d ago',
    triggeredAt: '1d ago',
  },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function conditionMeta(condition: Condition) {
  return CONDITION_OPTIONS.find((c) => c.value === condition) ?? CONDITION_OPTIONS[0];
}

function distanceLabel(alert: PriceAlert): string {
  const target = parseFloat(alert.price);
  const current = parseFloat(alert.currentPrice);
  if (!target || !current) return '';
  const diff = Math.abs(target - current);
  const pct = ((diff / current) * 100).toFixed(2);
  return `${pct}% away`;
}

/* ------------------------------------------------------------------ */
/*  Icons                                                              */
/* ------------------------------------------------------------------ */

function BellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function PauseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
    </svg>
  );
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function ChevronIcon({ className, direction = 'down' }: { className?: string; direction?: 'up' | 'down' }) {
  return (
    <svg
      className={`${className} transition-transform ${direction === 'up' ? 'rotate-180' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ClientAlerts() {
  const [alerts, setAlerts] = useState<PriceAlert[]>(MOCK_ALERTS);
  const [tab, setTab] = useState<Tab>('active');
  const [showCreate, setShowCreate] = useState(false);

  // Form state
  const [newSymbol, setNewSymbol] = useState<string>('EURUSD');
  const [newCondition, setNewCondition] = useState<Condition>('above');
  const [newPrice, setNewPrice] = useState('');

  /* Derived data ---------------------------------------------------- */
  const activeAlerts = useMemo(
    () => alerts.filter((a) => !a.triggered),
    [alerts],
  );
  const triggeredAlerts = useMemo(
    () => alerts.filter((a) => a.triggered),
    [alerts],
  );
  const pausedCount = useMemo(
    () => alerts.filter((a) => !a.active && !a.triggered).length,
    [alerts],
  );
  const displayedAlerts = tab === 'active' ? activeAlerts : triggeredAlerts;

  /* Handlers -------------------------------------------------------- */
  const toggleAlert = useCallback((id: string) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, active: !a.active } : a)),
    );
  }, []);

  const deleteAlert = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const createAlert = useCallback(() => {
    const trimmed = newPrice.trim();
    if (!trimmed || isNaN(Number(trimmed))) return;

    const alert: PriceAlert = {
      id: String(Date.now()),
      symbol: newSymbol,
      condition: newCondition,
      price: trimmed,
      currentPrice: trimmed,
      active: true,
      triggered: false,
      createdAt: 'Just now',
    };
    setAlerts((prev) => [alert, ...prev]);
    setNewPrice('');
    setShowCreate(false);
  }, [newSymbol, newCondition, newPrice]);

  const handlePriceKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') createAlert();
    },
    [createAlert],
  );

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-8 no-select">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Price Alerts</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Get notified when instruments reach your target prices
          </p>
        </div>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-full gradient-primary text-white text-xs font-semibold hover:opacity-90 transition-all btn-soft shadow-md"
        >
          <PlusIcon className="w-4 h-4" />
          Create Alert
        </button>
      </div>

      {/* ── Create Alert Form ──────────────────────────────────── */}
      {showCreate && (
        <div className="bg-card border border-primary/20 rounded-2xl card-modern p-6 space-y-5 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2">
            <BellIcon className="w-5 h-5 text-primary" />
            <h2 className="text-sm font-bold">New Price Alert</h2>
          </div>

          {/* Instrument selection */}
          <div className="space-y-2">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Instrument
            </label>
            <div className="flex flex-wrap gap-2">
              {POPULAR_INSTRUMENTS.map((sym) => (
                <button
                  key={sym}
                  type="button"
                  onClick={() => setNewSymbol(sym)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-semibold transition-all ${
                    newSymbol === sym
                      ? 'bg-primary/15 text-primary border border-primary/30 shadow-sm'
                      : 'bg-secondary/80 text-muted-foreground hover:text-foreground border border-transparent hover:border-border'
                  }`}
                >
                  {sym}
                </button>
              ))}
            </div>
          </div>

          {/* Condition selection */}
          <div className="space-y-2">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Condition
            </label>
            <div className="grid grid-cols-3 gap-2">
              {CONDITION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setNewCondition(opt.value)}
                  className={`py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    newCondition === opt.value
                      ? `${opt.activeBg} ${opt.color} border ${opt.activeBorder}`
                      : 'bg-secondary/80 text-muted-foreground border border-transparent hover:border-border'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Target price */}
          <div className="space-y-2">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Target Price
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
              onKeyDown={handlePriceKeyDown}
              placeholder="e.g. 1.09500"
              className="w-full bg-secondary/50 border border-border rounded-xl text-sm font-mono px-4 py-3 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all"
            />
          </div>

          {/* Form actions */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={createAlert}
              disabled={!newPrice.trim() || isNaN(Number(newPrice.trim()))}
              className="flex-1 py-3 rounded-xl gradient-primary text-white text-sm font-semibold hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
            >
              Create Alert
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="px-6 py-3 rounded-xl bg-secondary text-muted-foreground text-sm font-medium hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Summary Stats ──────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-2xl card-modern p-4 text-center">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-2">
            <BellIcon className="w-4.5 h-4.5 text-primary" />
          </div>
          <div className="text-xl font-bold text-primary price-value">
            {activeAlerts.filter((a) => a.active).length}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Active Alerts</div>
        </div>
        <div className="bg-card border border-border rounded-2xl card-modern p-4 text-center">
          <div className="w-9 h-9 rounded-xl bg-buy/10 flex items-center justify-center mx-auto mb-2">
            <CheckCircleIcon className="w-4.5 h-4.5 text-buy" />
          </div>
          <div className="text-xl font-bold text-buy price-value">
            {triggeredAlerts.length}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Triggered</div>
        </div>
        <div className="bg-card border border-border rounded-2xl card-modern p-4 text-center">
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center mx-auto mb-2">
            <PauseIcon className="w-4.5 h-4.5 text-amber-500" />
          </div>
          <div className="text-xl font-bold text-amber-500 price-value">{pausedCount}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Paused</div>
        </div>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────── */}
      <div className="flex gap-0 border-b border-border">
        <button
          onClick={() => setTab('active')}
          className={`relative px-5 py-2.5 text-sm font-medium transition-colors ${
            tab === 'active'
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Active
          <span className="ml-1.5 text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-semibold">
            {activeAlerts.length}
          </span>
          {tab === 'active' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
          )}
        </button>
        <button
          onClick={() => setTab('triggered')}
          className={`relative px-5 py-2.5 text-sm font-medium transition-colors ${
            tab === 'triggered'
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Triggered
          <span className="ml-1.5 text-[10px] px-2 py-0.5 rounded-full bg-buy/15 text-buy font-semibold">
            {triggeredAlerts.length}
          </span>
          {tab === 'triggered' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
          )}
        </button>
      </div>

      {/* ── Alert Cards ────────────────────────────────────────── */}
      <div className="space-y-3">
        {displayedAlerts.map((alert) => {
          const meta = conditionMeta(alert.condition);
          const isPaused = !alert.active && !alert.triggered;

          return (
            <div
              key={alert.id}
              className={`bg-card border border-border rounded-2xl card-modern p-5 flex items-center gap-4 group transition-all hover:border-primary/20 ${
                isPaused ? 'opacity-60' : ''
              }`}
            >
              {/* Status dot */}
              <div className="shrink-0">
                <div
                  className={`w-3 h-3 rounded-full ${
                    alert.triggered
                      ? 'bg-buy shadow-[0_0_8px_rgba(34,197,94,0.4)]'
                      : alert.active
                        ? 'bg-primary animate-pulse shadow-[0_0_8px_rgba(99,102,241,0.3)]'
                        : 'bg-muted-foreground/40'
                  }`}
                />
              </div>

              {/* Symbol + condition */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="text-sm font-mono font-bold tracking-wide">
                    {alert.symbol}
                  </span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-lg font-semibold ${meta.activeBg} ${meta.color}`}
                  >
                    {meta.label}
                  </span>
                  {isPaused && (
                    <span className="text-[10px] px-2 py-0.5 rounded-lg font-semibold bg-amber-500/15 text-amber-500">
                      Paused
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                  <span>Created {alert.createdAt}</span>
                  {alert.triggeredAt && (
                    <>
                      <span className="text-muted-foreground/30">|</span>
                      <span className="text-buy">Triggered {alert.triggeredAt}</span>
                    </>
                  )}
                  {!alert.triggered && (
                    <>
                      <span className="text-muted-foreground/30">|</span>
                      <span>{distanceLabel(alert)}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Target price */}
              <div className="text-right shrink-0">
                <div className="text-sm font-mono font-bold price-value">
                  {alert.price}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {alert.triggered ? 'Reached' : 'Target'}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-1 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
                {!alert.triggered && (
                  <button
                    onClick={() => toggleAlert(alert.id)}
                    className={`p-2 rounded-xl transition-all ${
                      alert.active
                        ? 'text-amber-500 hover:bg-amber-500/10'
                        : 'text-primary hover:bg-primary/10'
                    }`}
                    title={alert.active ? 'Pause alert' : 'Resume alert'}
                  >
                    {alert.active ? (
                      <PauseIcon className="w-4 h-4" />
                    ) : (
                      <PlayIcon className="w-4 h-4" />
                    )}
                  </button>
                )}
                <button
                  onClick={() => deleteAlert(alert.id)}
                  className="p-2 rounded-xl text-muted-foreground hover:bg-sell/10 hover:text-sell transition-all"
                  title="Delete alert"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}

        {/* ── Empty State ──────────────────────────────────────── */}
        {displayedAlerts.length === 0 && (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-secondary/80 flex items-center justify-center mx-auto mb-4">
              <BellIcon className="w-8 h-8 text-muted-foreground/30" />
            </div>
            <div className="text-sm font-medium text-muted-foreground">
              {tab === 'active'
                ? 'No active alerts yet'
                : 'No triggered alerts yet'}
            </div>
            <p className="text-xs text-muted-foreground/60 mt-1 max-w-xs mx-auto">
              {tab === 'active'
                ? 'Create a price alert to get notified when an instrument reaches your target price.'
                : 'Alerts will appear here once they are triggered by market movements.'}
            </p>
            {tab === 'active' && (
              <button
                onClick={() => setShowCreate(true)}
                className="mt-5 px-5 py-2.5 rounded-full gradient-primary text-white text-xs font-semibold hover:opacity-90 transition-all btn-soft shadow-sm"
              >
                Create Your First Alert
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
