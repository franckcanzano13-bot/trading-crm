'use client';
import type { JSX } from 'react';
import { useState, useMemo } from 'react';

type SortBy = 'copiers' | 'profit' | 'winRate' | 'risk';

interface Trader {
  id: string;
  name: string;
  avatar: string;
  verified: boolean;
  profit: number;
  winRate: number;
  copiers: number;
  risk: number;
  trades: number;
  avgTrade: string;
  maxDrawdown: number;
  description: string;
  topSymbols: string[];
  monthlyReturns: number[];
  joinedAgo: string;
}

const MOCK_TRADERS: Trader[] = [
  {
    id: '1',
    name: 'Alex Trading',
    avatar: 'A',
    verified: true,
    profit: 142.5,
    winRate: 72,
    copiers: 234,
    risk: 4,
    trades: 1847,
    avgTrade: '+$38.20',
    maxDrawdown: 12.3,
    description: 'Forex specialist focused on EUR/USD and GBP/USD. 5+ years experience with consistent returns.',
    topSymbols: ['EURUSD', 'GBPUSD', 'USDJPY'],
    monthlyReturns: [8.2, -2.1, 12.4, 5.6, -1.3, 15.8, 9.2, -3.4, 18.1, 7.5, 11.2, 6.8],
    joinedAgo: '2 years ago',
  },
  {
    id: '2',
    name: 'FX Master',
    avatar: 'F',
    verified: true,
    profit: 215.8,
    winRate: 76,
    copiers: 512,
    risk: 3,
    trades: 3241,
    avgTrade: '+$52.40',
    maxDrawdown: 8.7,
    description: 'Conservative approach with strict risk management. Focus on major pairs and low drawdowns.',
    topSymbols: ['USDJPY', 'EURUSD', 'AUDUSD'],
    monthlyReturns: [5.1, 7.3, 4.8, 9.2, 6.1, 3.7, 8.4, 5.9, 7.2, 4.3, 6.8, 9.1],
    joinedAgo: '3 years ago',
  },
  {
    id: '3',
    name: 'Sarah Markets',
    avatar: 'S',
    verified: true,
    profit: 98.3,
    winRate: 68,
    copiers: 189,
    risk: 5,
    trades: 956,
    avgTrade: '+$85.60',
    maxDrawdown: 18.5,
    description: 'Gold and commodities swing trader. Higher reward targets with disciplined risk management.',
    topSymbols: ['XAUUSD', 'US500', 'BTCUSD'],
    monthlyReturns: [15.2, -8.1, 22.4, -3.6, 18.3, 12.8, -5.2, 25.1, 9.7, -2.4, 14.6, 8.3],
    joinedAgo: '1 year ago',
  },
  {
    id: '4',
    name: 'CryptoWhale',
    avatar: 'C',
    verified: false,
    profit: 312.4,
    winRate: 55,
    copiers: 87,
    risk: 8,
    trades: 2103,
    avgTrade: '+$124.80',
    maxDrawdown: 35.2,
    description: 'High-risk crypto trader. BTC and ETH momentum strategies with aggressive position sizing.',
    topSymbols: ['BTCUSD', 'ETHUSD', 'XRPUSD'],
    monthlyReturns: [45.2, -18.1, 32.4, -12.6, 28.3, -8.8, 55.2, -25.1, 39.7, -15.4, 44.6, 18.3],
    joinedAgo: '8 months ago',
  },
  {
    id: '5',
    name: 'Index Trader Pro',
    avatar: 'I',
    verified: true,
    profit: 67.9,
    winRate: 64,
    copiers: 156,
    risk: 3,
    trades: 1423,
    avgTrade: '+$29.10',
    maxDrawdown: 9.8,
    description: 'Index specialist. S&P 500 and NASDAQ with disciplined entries and tight stop losses.',
    topSymbols: ['US500', 'US100', 'DE40'],
    monthlyReturns: [4.2, 3.1, 5.4, 2.6, 6.3, 4.8, 3.2, 5.1, 4.7, 3.3, 5.8, 4.1],
    joinedAgo: '4 years ago',
  },
  {
    id: '6',
    name: 'Macro Vision',
    avatar: 'M',
    verified: true,
    profit: 185.2,
    winRate: 71,
    copiers: 341,
    risk: 4,
    trades: 2567,
    avgTrade: '+$45.30',
    maxDrawdown: 14.1,
    description: 'Macro-fundamental analysis. Trades based on central bank policies and economic data releases.',
    topSymbols: ['EURUSD', 'XAUUSD', 'USDJPY'],
    monthlyReturns: [7.8, 5.2, 9.1, -2.3, 11.4, 6.7, 8.3, -1.8, 12.5, 4.9, 7.6, 10.2],
    joinedAgo: '2 years ago',
  },
];

const SORT_OPTIONS: { key: SortBy; label: string; icon: JSX.Element }[] = [
  {
    key: 'copiers',
    label: 'Top Copiers',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    key: 'profit',
    label: 'Most Profitable',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    ),
  },
  {
    key: 'winRate',
    label: 'Best Win Rate',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    key: 'risk',
    label: 'Low Risk',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
  },
];

const AVATAR_GRADIENTS = [
  'from-blue-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-orange-500 to-rose-600',
  'from-violet-500 to-purple-600',
  'from-cyan-500 to-blue-600',
  'from-amber-500 to-orange-600',
];

function RiskBadge({ level }: { level: number }) {
  const config =
    level <= 3
      ? { color: 'text-buy bg-buy/10 border-buy/20', label: 'Low' }
      : level <= 6
        ? { color: 'text-amber-500 bg-amber-500/10 border-amber-500/20', label: 'Medium' }
        : { color: 'text-sell bg-sell/10 border-sell/20', label: 'High' };

  return (
    <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold border ${config.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${level <= 3 ? 'bg-buy' : level <= 6 ? 'bg-amber-500' : 'bg-sell'}`} />
      {level}/10
    </span>
  );
}

function MiniChart({ data, width = 140, height = 40 }: { data: number[]; width?: number; height?: number }) {
  const max = Math.max(...data.map(Math.abs));
  const step = width / (data.length - 1);
  const midY = height / 2;
  const scale = (height / 2 - 4) / (max || 1);

  const points = data.map((v, i) => `${i * step},${midY - v * scale}`).join(' ');

  const lastPositive = data[data.length - 1] >= 0;
  const strokeColor = lastPositive ? 'var(--color-buy)' : 'var(--color-sell)';

  // Build gradient fill path
  const fillPoints = `0,${midY} ${points} ${width},${midY}`;

  return (
    <svg width={width} height={height} className="shrink-0">
      <defs>
        <linearGradient id={`chart-grad-${lastPositive ? 'up' : 'down'}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={strokeColor} stopOpacity="0.2" />
          <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1="0" y1={midY} x2={width} y2={midY} stroke="currentColor" strokeOpacity="0.06" strokeWidth="1" />
      <polygon
        points={fillPoints}
        fill={`url(#chart-grad-${lastPositive ? 'up' : 'down'})`}
      />
      <polyline
        points={points}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* End dot */}
      <circle
        cx={width}
        cy={midY - data[data.length - 1] * scale}
        r="2.5"
        fill={strokeColor}
      />
    </svg>
  );
}

function StatItem({ label, value, className = '' }: { label: string; value: string | number; className?: string }) {
  return (
    <div className="text-center">
      <div className={`text-sm font-bold ${className}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

function VerifiedBadge() {
  return (
    <svg className="w-4 h-4 text-primary shrink-0" fill="currentColor" viewBox="0 0 20 20">
      <path
        fillRule="evenodd"
        d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function ClientCopy() {
  const [sortBy, setSortBy] = useState<SortBy>('copiers');
  const [search, setSearch] = useState('');
  const [copyingIds, setCopyingIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleCopy = (id: string) => {
    setCopyingIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredTraders = useMemo(() => {
    const q = search.toLowerCase().trim();
    return [...MOCK_TRADERS]
      .filter((t) => !q || t.name.toLowerCase().includes(q) || t.topSymbols.some((s) => s.toLowerCase().includes(q)))
      .sort((a, b) => {
        switch (sortBy) {
          case 'profit':
            return b.profit - a.profit;
          case 'copiers':
            return b.copiers - a.copiers;
          case 'winRate':
            return b.winRate - a.winRate;
          case 'risk':
            return a.risk - b.risk;
          default:
            return 0;
        }
      });
  }, [search, sortBy]);

  const avgProfit = (MOCK_TRADERS.reduce((s, t) => s + t.profit, 0) / MOCK_TRADERS.length).toFixed(1);
  const avgWinRate = (MOCK_TRADERS.reduce((s, t) => s + t.winRate, 0) / MOCK_TRADERS.length).toFixed(0);
  const totalCopiers = MOCK_TRADERS.reduce((s, t) => s + t.copiers, 0);

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 no-select">
      {/* Hero Header */}
      <div className="gradient-hero rounded-3xl p-8 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-black/10" />
        <div className="relative z-10">
          <h1 className="text-2xl font-bold">Copy Trading</h1>
          <p className="text-white/60 text-sm mt-2 max-w-lg">
            Discover top-performing traders and automatically replicate their strategies. Start copying with one click.
          </p>
          <div className="flex items-center gap-6 mt-6">
            <div>
              <div className="text-xl font-bold">{MOCK_TRADERS.length}</div>
              <div className="text-white/50 text-xs">Traders</div>
            </div>
            <div className="w-px h-8 bg-white/20" />
            <div>
              <div className="text-xl font-bold text-green-300">+{avgProfit}%</div>
              <div className="text-white/50 text-xs">Avg. Return</div>
            </div>
            <div className="w-px h-8 bg-white/20" />
            <div>
              <div className="text-xl font-bold">{totalCopiers.toLocaleString()}</div>
              <div className="text-white/50 text-xs">Active Copiers</div>
            </div>
          </div>
        </div>
        <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-white/10" />
        <div className="absolute right-20 -bottom-8 w-24 h-24 rounded-full bg-white/5" />
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-card rounded-2xl card-modern p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <span className="text-sm text-muted-foreground">Available</span>
          </div>
          <div className="text-2xl font-bold price-value">{MOCK_TRADERS.length}</div>
          <div className="text-xs text-muted-foreground mt-1">Verified traders</div>
        </div>

        <div className="bg-card rounded-2xl card-modern p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-2xl bg-buy/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-buy" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <span className="text-sm text-muted-foreground">Avg. Profit</span>
          </div>
          <div className="text-2xl font-bold price-value text-buy">+{avgProfit}%</div>
          <div className="text-xs text-muted-foreground mt-1">Past 12 months</div>
        </div>

        <div className="bg-card rounded-2xl card-modern p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span className="text-sm text-muted-foreground">Avg. Win Rate</span>
          </div>
          <div className="text-2xl font-bold price-value">{avgWinRate}%</div>
          <div className="text-xs text-muted-foreground mt-1">Across all traders</div>
        </div>

        <div className="bg-card rounded-2xl card-modern p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-2xl bg-violet-500/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </div>
            <span className="text-sm text-muted-foreground">You Copy</span>
          </div>
          <div className="text-2xl font-bold price-value">{copyingIds.size}</div>
          <div className="text-xs text-muted-foreground mt-1">{copyingIds.size === 0 ? 'Start copying today' : 'Active strategies'}</div>
        </div>
      </div>

      {/* Search & Sort Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
        {/* Search */}
        <div className="relative flex-1">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or instrument..."
            className="w-full bg-card border border-border rounded-xl text-sm pl-10 pr-4 py-2.5 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all"
          />
        </div>

        {/* Sort Tabs */}
        <div className="flex bg-card border border-border rounded-xl p-1 gap-1 shrink-0">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setSortBy(opt.key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium rounded-lg transition-all ${
                sortBy === opt.key
                  ? 'gradient-primary text-white shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
              }`}
            >
              {opt.icon}
              <span className="hidden md:inline">{opt.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Results Count */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Showing <span className="font-semibold text-foreground">{filteredTraders.length}</span> trader{filteredTraders.length !== 1 ? 's' : ''}
          {search && <span> matching &ldquo;{search}&rdquo;</span>}
        </p>
        {copyingIds.size > 0 && (
          <p className="text-xs text-buy font-medium">
            Copying {copyingIds.size} trader{copyingIds.size !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* Trader Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
        {filteredTraders.map((trader, idx) => {
          const isCopying = copyingIds.has(trader.id);
          const isExpanded = expandedId === trader.id;
          const gradientClass = AVATAR_GRADIENTS[idx % AVATAR_GRADIENTS.length];

          return (
            <div
              key={trader.id}
              className={`bg-card border rounded-2xl card-modern transition-all duration-200 overflow-hidden ${
                isExpanded ? 'border-primary/50 shadow-lg shadow-primary/5' : 'border-border hover:border-border/60 hover:shadow-md'
              } ${isCopying ? 'ring-1 ring-buy/30' : ''}`}
            >
              {/* Card Header */}
              <div className="p-5">
                <div className="flex items-start gap-3.5">
                  {/* Avatar */}
                  <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${gradientClass} flex items-center justify-center shrink-0 shadow-sm`}>
                    <span className="text-lg font-bold text-white">{trader.avatar}</span>
                  </div>

                  {/* Name & Description */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold truncate">{trader.name}</span>
                      {trader.verified && <VerifiedBadge />}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{trader.description}</p>
                    <div className="flex items-center gap-1.5 mt-2">
                      {trader.topSymbols.map((s) => (
                        <span key={s} className="text-[9px] px-1.5 py-0.5 rounded-md bg-secondary/80 font-mono font-semibold text-muted-foreground">
                          {s}
                        </span>
                      ))}
                      <RiskBadge level={trader.risk} />
                    </div>
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-4 gap-2 mt-5 py-3 px-2 rounded-xl bg-secondary/30">
                  <StatItem
                    label="Profit (1Y)"
                    value={`${trader.profit >= 0 ? '+' : ''}${trader.profit}%`}
                    className={trader.profit >= 0 ? 'text-buy' : 'text-sell'}
                  />
                  <StatItem label="Win Rate" value={`${trader.winRate}%`} />
                  <StatItem label="Copiers" value={trader.copiers.toLocaleString()} />
                  <StatItem label="Trades" value={trader.trades.toLocaleString()} />
                </div>

                {/* Sparkline Chart */}
                <div className="mt-4 flex items-center justify-between">
                  <div className="text-[10px] text-muted-foreground">12-month performance</div>
                  <MiniChart data={trader.monthlyReturns} />
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 mt-4">
                  <button
                    onClick={() => toggleCopy(trader.id)}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all btn-soft ${
                      isCopying
                        ? 'bg-sell/10 text-sell border border-sell/20 hover:bg-sell/20'
                        : 'gradient-buy text-white shadow-sm hover:shadow-md'
                    }`}
                  >
                    {isCopying ? 'Stop Copying' : 'Copy Trader'}
                  </button>
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : trader.id)}
                    className="p-2.5 rounded-xl border border-border text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all"
                    title="View details"
                  >
                    <svg
                      className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Expandable Details */}
              {isExpanded && (
                <div className="border-t border-border bg-secondary/20 p-5 space-y-4">
                  {/* Detail Stats */}
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg. Trade</div>
                      <div className="text-sm font-bold mt-1 text-buy">{trader.avgTrade}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Max Drawdown</div>
                      <div className="text-sm font-bold mt-1 text-sell">-{trader.maxDrawdown}%</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Joined</div>
                      <div className="text-sm font-bold mt-1">{trader.joinedAgo}</div>
                    </div>
                  </div>

                  {/* Monthly Returns Bar Chart */}
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Monthly Returns</div>
                    <div className="flex items-end gap-1 h-10">
                      {trader.monthlyReturns.map((r, i) => {
                        const maxAbs = Math.max(...trader.monthlyReturns.map(Math.abs));
                        const barH = Math.max(3, (Math.abs(r) / (maxAbs || 1)) * 36);
                        return (
                          <div key={i} className="flex-1 flex flex-col items-center justify-end" title={`${r >= 0 ? '+' : ''}${r}%`}>
                            <div
                              className={`w-full rounded-sm transition-all ${r >= 0 ? 'bg-buy/70' : 'bg-sell/70'}`}
                              style={{ height: `${barH}px` }}
                            />
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex gap-1 mt-1">
                      {['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'].map((m, i) => (
                        <div key={i} className="flex-1 text-center text-[8px] text-muted-foreground/50">{m}</div>
                      ))}
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-muted-foreground leading-relaxed">{trader.description}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {filteredTraders.length === 0 && (
        <div className="bg-card rounded-2xl card-modern p-12 text-center">
          <svg className="w-12 h-12 text-muted-foreground/30 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <h3 className="text-sm font-semibold mt-4">No traders found</h3>
          <p className="text-xs text-muted-foreground mt-1">Try adjusting your search or filters</p>
          <button
            onClick={() => { setSearch(''); setSortBy('copiers'); }}
            className="mt-4 px-4 py-2 text-xs font-medium text-primary hover:bg-primary/10 rounded-lg transition-all"
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}
