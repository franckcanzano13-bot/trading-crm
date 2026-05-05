'use client';
import { useState, useMemo } from 'react';
import { useTradingStore } from '@/stores/trading-store';
import { formatPrice } from '@/lib/utils';

function getSparklineData(symbol: string): number[] {
  let seed = 0;
  for (let i = 0; i < symbol.length; i++) seed += symbol.charCodeAt(i) * (i + 1);
  const data: number[] = [];
  let val = 50 + (seed % 50);
  for (let i = 0; i < 20; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    val += ((seed % 11) - 5) * 0.5;
    data.push(val);
  }
  return data;
}

function Sparkline({ data, up }: { data: number[]; up: boolean }) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 48;
  const h = 20;
  const step = w / (data.length - 1);
  const points = data.map((v, i) => `${i * step},${h - ((v - min) / range) * (h - 2) - 1}`).join(' ');

  return (
    <svg width={w} height={h} className="shrink-0">
      <polyline
        points={points}
        fill="none"
        stroke={up ? 'var(--color-buy)' : 'var(--color-sell)'}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function getChange(symbol: string): number {
  let seed = 0;
  for (let i = 0; i < symbol.length; i++) seed += symbol.charCodeAt(i) * (i + 1);
  return ((seed % 300) - 150) / 1000;
}

const CATEGORY_LABELS: Record<string, string> = {
  FOREX: 'Forex',
  CRYPTO: 'Crypto',
  INDICES: 'Indices',
  COMMODITIES: 'Commod.',
};

export function InstrumentSelector() {
  const instruments = useTradingStore((s) => s.instruments);
  const selectedSymbol = useTradingStore((s) => s.selectedSymbol);
  const setSelectedSymbol = useTradingStore((s) => s.setSelectedSymbol);
  const getPrice = useTradingStore((s) => s.getPrice);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const categories = useMemo(() => {
    const cats: Record<string, typeof instruments> = {};
    instruments.forEach((i) => {
      if (!cats[i.type]) cats[i.type] = [];
      cats[i.type].push(i);
    });
    return cats;
  }, [instruments]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const items = activeCategory ? (categories[activeCategory] || []) : instruments;
    if (!q) return items;
    return items.filter(
      (i) => i.symbol.toLowerCase().includes(q) || i.display_name.toLowerCase().includes(q)
    );
  }, [search, activeCategory, categories, instruments]);

  const getDecimals = (symbol: string) =>
    symbol.includes('JPY') ? 3 : symbol.startsWith('BTC') || symbol.startsWith('ETH') ? 2 : 5;

  return (
    <div className="flex flex-col h-full no-select">
      {/* Search */}
      <div className="px-3 pt-3 pb-2">
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-secondary/30 rounded-lg text-xs pl-8 pr-3 py-1.5 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
        </div>
      </div>

      {/* Category filters */}
      <div className="flex gap-1 px-3 pb-2 flex-wrap">
        <FilterPill active={!activeCategory} onClick={() => setActiveCategory(null)}>All</FilterPill>
        {Object.keys(categories).map((cat) => (
          <FilterPill
            key={cat}
            active={activeCategory === cat}
            onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
          >
            {CATEGORY_LABELS[cat] || cat}
          </FilterPill>
        ))}
      </div>

      {/* Column headers */}
      <div className="flex items-center px-3 py-1 text-[9px] text-muted-foreground uppercase tracking-wider border-b border-border/50">
        <span className="flex-1">Instrument</span>
        <span className="w-12 text-center">Chart</span>
        <span className="w-16 text-right">Price</span>
      </div>

      {/* Instrument list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.map((inst) => {
          const price = getPrice(inst.symbol);
          const decimals = getDecimals(inst.symbol);
          const sparkData = getSparklineData(inst.symbol);
          const isUp = sparkData[sparkData.length - 1] >= sparkData[0];
          const change = getChange(inst.symbol);
          const isSelected = selectedSymbol === inst.symbol;

          return (
            <button
              key={inst.symbol}
              onClick={() => setSelectedSymbol(inst.symbol)}
              className={`w-full flex items-center px-3 py-2.5 transition-colors border-b border-border/20 ${
                isSelected ? 'bg-primary/5' : 'hover:bg-secondary/20'
              }`}
            >
              {/* Name + change */}
              <div className="flex-1 min-w-0 text-left">
                <div className={`text-xs font-semibold truncate ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                  {inst.display_name}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] text-muted-foreground">{inst.symbol}</span>
                  <span className={`text-[9px] font-semibold ${change >= 0 ? 'text-buy' : 'text-sell'}`}>
                    {change >= 0 ? '+' : ''}{(change * 100).toFixed(2)}%
                  </span>
                </div>
              </div>

              {/* Sparkline */}
              <div className="w-12 flex justify-center">
                <Sparkline data={sparkData} up={isUp} />
              </div>

              {/* Price */}
              <div className="w-16 text-right">
                {price ? (
                  <span className="text-[11px] font-mono font-semibold price-value">
                    {formatPrice(price.bid, decimals)}
                  </span>
                ) : (
                  <span className="text-[10px] text-muted-foreground">---</span>
                )}
              </div>
            </button>
          );
        })}
        {filtered.length === 0 && search && (
          <div className="text-xs text-muted-foreground text-center py-6">No results</div>
        )}
      </div>

      {/* Footer count */}
      <div className="px-3 py-1.5 border-t border-border text-center">
        <span className="text-[9px] text-muted-foreground">{instruments.length} instruments</span>
      </div>
    </div>
  );
}

function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-0.5 text-[10px] rounded font-medium transition-all ${
        active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}
