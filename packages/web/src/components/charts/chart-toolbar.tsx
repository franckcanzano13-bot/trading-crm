'use client';
import { useState, useRef, useEffect } from 'react';
import { useTradingStore, ChartType, IndicatorType } from '@/stores/trading-store';

const CHART_TYPES: { value: ChartType; label: string; icon: JSX.Element }[] = [
  {
    value: 'candles', label: 'Candles',
    icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><rect x="5" y="6" width="4" height="12" rx="0.5" /><line x1="7" y1="3" x2="7" y2="6" /><line x1="7" y1="18" x2="7" y2="21" /><rect x="15" y="8" width="4" height="8" rx="0.5" /><line x1="17" y1="4" x2="17" y2="8" /><line x1="17" y1="16" x2="17" y2="20" /></svg>,
  },
  {
    value: 'bars', label: 'Bars',
    icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><line x1="6" y1="4" x2="6" y2="20" /><line x1="3" y1="8" x2="6" y2="8" /><line x1="6" y1="16" x2="9" y2="16" /><line x1="14" y1="6" x2="14" y2="18" /><line x1="11" y1="10" x2="14" y2="10" /><line x1="14" y1="14" x2="17" y2="14" /><line x1="20" y1="5" x2="20" y2="19" /><line x1="17" y1="9" x2="20" y2="9" /><line x1="20" y1="15" x2="23" y2="15" /></svg>,
  },
  {
    value: 'line', label: 'Line',
    icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><polyline points="3,17 8,11 12,14 16,8 21,12" /></svg>,
  },
  {
    value: 'area', label: 'Area',
    icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M3 17 L8 11 L12 14 L16 8 L21 12 L21 20 L3 20 Z" fill="currentColor" opacity="0.15" /><polyline points="3,17 8,11 12,14 16,8 21,12" /></svg>,
  },
];

const INDICATORS: { value: IndicatorType; label: string; category: string }[] = [
  { value: 'sma', label: 'SMA (Simple Moving Average)', category: 'Trend' },
  { value: 'ema', label: 'EMA (Exponential Moving Average)', category: 'Trend' },
  { value: 'bollinger', label: 'Bollinger Bands', category: 'Trend' },
  { value: 'ichimoku', label: 'Ichimoku Cloud', category: 'Trend' },
  { value: 'parabolic_sar', label: 'Parabolic SAR', category: 'Trend' },
  { value: 'macd', label: 'MACD', category: 'Oscillator' },
  { value: 'rsi', label: 'RSI (Relative Strength Index)', category: 'Oscillator' },
  { value: 'stochastic', label: 'Stochastic Oscillator', category: 'Oscillator' },
  { value: 'cci', label: 'CCI (Commodity Channel Index)', category: 'Oscillator' },
  { value: 'williams', label: 'Williams %R', category: 'Oscillator' },
  { value: 'atr', label: 'ATR (Average True Range)', category: 'Volatility' },
  { value: 'adx', label: 'ADX (Average Directional Index)', category: 'Volatility' },
  { value: 'volume', label: 'Volume', category: 'Other' },
];

const DRAWING_TOOLS = [
  { group: 'Lines', items: ['Trend Line', 'Horizontal Line', 'Vertical Line', 'Ray', 'Channel'] },
  { group: 'Fibonacci', items: ['Fib Retracement', 'Fib Extension', 'Fib Fan', 'Fib Time Zones'] },
  { group: 'Gann', items: ['Gann Fan', 'Gann Square', 'Gann Box'] },
  { group: 'Patterns', items: ['XABCD Pattern', 'Head & Shoulders', 'Triangle', 'Rectangle'] },
  { group: 'Shapes', items: ['Arrow', 'Text', 'Rectangle', 'Circle', 'Ellipse'] },
];

const LAYOUTS = [
  { id: 'single', label: 'Single', icon: '[ ]', cols: 1, rows: 1 },
  { id: 'split-v', label: 'Split Vertical', icon: '[ | ]', cols: 2, rows: 1 },
  { id: 'split-h', label: 'Split Horizontal', icon: '[-]', cols: 1, rows: 2 },
  { id: 'triple-v', label: '3 Vertical', icon: '[ | | ]', cols: 3, rows: 1 },
  { id: 'triple-h', label: '3 Horizontal', icon: '[---]', cols: 1, rows: 3 },
  { id: 'quad', label: 'Quad', icon: '[++]', cols: 2, rows: 2 },
];

function useDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  return { open, setOpen, ref };
}

export function ChartToolbar() {
  const chartType = useTradingStore((s) => s.chartType);
  const setChartType = useTradingStore((s) => s.setChartType);
  const activeIndicators = useTradingStore((s) => s.activeIndicators);
  const toggleIndicator = useTradingStore((s) => s.toggleIndicator);
  const clearIndicators = useTradingStore((s) => s.clearIndicators);
  const oneClickTrading = useTradingStore((s) => s.oneClickTrading);
  const setOneClickTrading = useTradingStore((s) => s.setOneClickTrading);

  const chartTypeDD = useDropdown();
  const indicatorsDD = useDropdown();
  const toolsDD = useDropdown();
  const layoutDD = useDropdown();

  const currentChartType = CHART_TYPES.find((c) => c.value === chartType) || CHART_TYPES[0];

  return (
    <div className="flex items-center gap-1 h-full">
      {/* Chart Type */}
      <div ref={chartTypeDD.ref} className="relative">
        <button
          onClick={() => chartTypeDD.setOpen(!chartTypeDD.open)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
            chartTypeDD.open ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/30'
          }`}
        >
          {currentChartType.icon}
          <span>{currentChartType.label}</span>
          <ChevronDown />
        </button>
        {chartTypeDD.open && (
          <div className="absolute top-full left-0 mt-1 w-44 bg-card border border-border rounded-lg shadow-xl z-50 py-1 overflow-hidden">
            {CHART_TYPES.map((ct) => (
              <button
                key={ct.value}
                onClick={() => { setChartType(ct.value); chartTypeDD.setOpen(false); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-[11px] transition-colors ${
                  chartType === ct.value ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-secondary/30'
                }`}
              >
                {ct.icon}
                <span className="font-medium">{ct.label}</span>
                {chartType === ct.value && <Check />}
              </button>
            ))}
          </div>
        )}
      </div>

      <Divider />

      {/* Indicators */}
      <div ref={indicatorsDD.ref} className="relative">
        <button
          onClick={() => indicatorsDD.setOpen(!indicatorsDD.open)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
            indicatorsDD.open || activeIndicators.length > 0 ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/30'
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path d="M3 17l4-4 4 4 4-8 4 4" />
            <circle cx="7" cy="13" r="1.5" fill="currentColor" />
            <circle cx="11" cy="17" r="1.5" fill="currentColor" />
            <circle cx="15" cy="9" r="1.5" fill="currentColor" />
            <circle cx="19" cy="13" r="1.5" fill="currentColor" />
          </svg>
          <span>Indicators</span>
          {activeIndicators.length > 0 && (
            <span className="bg-primary text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
              {activeIndicators.length}
            </span>
          )}
          <ChevronDown />
        </button>
        {indicatorsDD.open && (
          <div className="absolute top-full left-0 mt-1 w-72 bg-card border border-border rounded-lg shadow-xl z-50 py-1 max-h-80 overflow-y-auto">
            {activeIndicators.length > 0 && (
              <div className="px-3 py-1.5 border-b border-border/50">
                <button onClick={clearIndicators} className="text-[10px] text-sell hover:text-sell/80 font-medium">
                  Clear All ({activeIndicators.length})
                </button>
              </div>
            )}
            {['Trend', 'Oscillator', 'Volatility', 'Other'].map((cat) => {
              const items = INDICATORS.filter((i) => i.category === cat);
              if (items.length === 0) return null;
              return (
                <div key={cat}>
                  <div className="px-3 py-1.5 text-[9px] font-bold text-muted-foreground uppercase tracking-wider">{cat}</div>
                  {items.map((ind) => {
                    const active = activeIndicators.includes(ind.value);
                    return (
                      <button
                        key={ind.value}
                        onClick={() => toggleIndicator(ind.value)}
                        className={`w-full flex items-center justify-between px-3 py-1.5 text-[11px] transition-colors ${
                          active ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-secondary/30'
                        }`}
                      >
                        <span className="font-medium">{ind.label}</span>
                        {active && <Check />}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Divider />

      {/* Drawing Tools */}
      <div ref={toolsDD.ref} className="relative">
        <button
          onClick={() => toolsDD.setOpen(!toolsDD.open)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
            toolsDD.open ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/30'
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
          <span>Tools</span>
          <ChevronDown />
        </button>
        {toolsDD.open && (
          <div className="absolute top-full left-0 mt-1 w-56 bg-card border border-border rounded-lg shadow-xl z-50 py-1 max-h-80 overflow-y-auto">
            {DRAWING_TOOLS.map((group) => (
              <div key={group.group}>
                <div className="px-3 py-1.5 text-[9px] font-bold text-muted-foreground uppercase tracking-wider">{group.group}</div>
                {group.items.map((tool) => (
                  <button
                    key={tool}
                    onClick={() => toolsDD.setOpen(false)}
                    className="w-full flex items-center px-3 py-1.5 text-[11px] text-foreground hover:bg-secondary/30 transition-colors"
                  >
                    <span className="font-medium">{tool}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <Divider />

      {/* Multi-screen Layout */}
      <div ref={layoutDD.ref} className="relative">
        <button
          onClick={() => layoutDD.setOpen(!layoutDD.open)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
            layoutDD.open ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/30'
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
          <span>Multiscreen</span>
          <ChevronDown />
        </button>
        {layoutDD.open && (
          <div className="absolute top-full left-0 mt-1 w-56 bg-card border border-border rounded-lg shadow-xl z-50 py-1">
            {LAYOUTS.map((layout) => (
              <button
                key={layout.id}
                onClick={() => layoutDD.setOpen(false)}
                className="w-full flex items-center gap-3 px-3 py-2 text-[11px] text-foreground hover:bg-secondary/30 transition-colors"
              >
                <LayoutIcon cols={layout.cols} rows={layout.rows} />
                <span className="font-medium">{layout.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <Divider />

      {/* Cleaning */}
      <button
        onClick={() => { clearIndicators(); }}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/30 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
        <span>Cleaning</span>
      </button>

      <Divider />

      {/* 1-Click Trading */}
      <button
        onClick={() => setOneClickTrading(!oneClickTrading)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
          oneClickTrading ? 'bg-buy/15 text-buy' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/30'
        }`}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
        </svg>
        <span>1-Click</span>
        <div className={`w-7 h-3.5 rounded-full transition-colors flex items-center px-0.5 ${
          oneClickTrading ? 'bg-buy' : 'bg-secondary/50'
        }`}>
          <div className={`w-2.5 h-2.5 rounded-full bg-white shadow-sm transition-transform ${
            oneClickTrading ? 'translate-x-3' : 'translate-x-0'
          }`} />
        </div>
      </button>
    </div>
  );
}

function ChevronDown() {
  return (
    <svg className="w-3 h-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function Check() {
  return (
    <svg className="w-3.5 h-3.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

function Divider() {
  return <div className="w-px h-4 bg-border/40 mx-0.5" />;
}

function LayoutIcon({ cols, rows }: { cols: number; rows: number }) {
  const cells: JSX.Element[] = [];
  const w = 24, h = 18;
  const gap = 2;
  const cw = (w - gap * (cols - 1)) / cols;
  const ch = (h - gap * (rows - 1)) / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push(
        <rect
          key={`${r}-${c}`}
          x={c * (cw + gap)}
          y={r * (ch + gap)}
          width={cw}
          height={ch}
          rx={1}
          fill="currentColor"
          opacity={0.3}
          stroke="currentColor"
          strokeWidth={0.5}
        />
      );
    }
  }
  return (
    <svg className="w-6 h-[18px]" viewBox={`0 0 ${w} ${h}`}>
      {cells}
    </svg>
  );
}
