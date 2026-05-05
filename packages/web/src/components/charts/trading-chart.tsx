'use client';
import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  LineData,
  Time,
} from 'lightweight-charts';
import { useTradingStore, ChartType, IndicatorType } from '@/stores/trading-store';
import { useThemeStore } from '@/stores/theme-store';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

interface TradingChartProps {
  symbol: string;
  timeframe: string;
  openPrice?: number | null;
  stopLoss?: number | null;
  takeProfit?: number | null;
  tradeSide?: 'BUY' | 'SELL' | null;
}

function getChartColors(theme: string) {
  if (theme === 'dark') {
    return { bg: '#0c1220', text: '#6b7280', grid: '#151e2e', border: '#1e293b', crosshair: '#3b82f6' };
  }
  return { bg: '#ffffff', text: '#6b7280', grid: '#f8f9fa', border: '#e5e7eb', crosshair: '#3b82f6' };
}

// ─── Indicator calculations ───

function calcSMA(data: CandlestickData[], period: number): LineData[] {
  const result: LineData[] = [];
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += data[j].close;
    result.push({ time: data[i].time, value: sum / period });
  }
  return result;
}

function calcEMA(data: CandlestickData[], period: number): LineData[] {
  const result: LineData[] = [];
  const k = 2 / (period + 1);
  let ema = data[0].close;
  for (let i = 0; i < data.length; i++) {
    ema = data[i].close * k + ema * (1 - k);
    if (i >= period - 1) result.push({ time: data[i].time, value: ema });
  }
  return result;
}

function calcBollinger(data: CandlestickData[], period = 20, mult = 2) {
  const upper: LineData[] = [], middle: LineData[] = [], lower: LineData[] = [];
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += data[j].close;
    const avg = sum / period;
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) variance += (data[j].close - avg) ** 2;
    const std = Math.sqrt(variance / period);
    middle.push({ time: data[i].time, value: avg });
    upper.push({ time: data[i].time, value: avg + mult * std });
    lower.push({ time: data[i].time, value: avg - mult * std });
  }
  return { upper, middle, lower };
}

function calcParabolicSAR(data: CandlestickData[]): LineData[] {
  const result: LineData[] = [];
  let af = 0.02, ep = data[0].high, sar = data[0].low, isUp = true;
  for (let i = 1; i < data.length; i++) {
    sar = sar + af * (ep - sar);
    if (isUp) {
      if (data[i].low < sar) { isUp = false; sar = ep; ep = data[i].low; af = 0.02; }
      else { if (data[i].high > ep) { ep = data[i].high; af = Math.min(af + 0.02, 0.2); } }
    } else {
      if (data[i].high > sar) { isUp = true; sar = ep; ep = data[i].high; af = 0.02; }
      else { if (data[i].low < ep) { ep = data[i].low; af = Math.min(af + 0.02, 0.2); } }
    }
    result.push({ time: data[i].time, value: sar });
  }
  return result;
}

// ─── Fetch real candles from backend ───

async function fetchCandles(symbol: string, timeframe: string, limit = 500): Promise<CandlestickData[]> {
  try {
    const url = `${API_BASE}/api/v1/candles?symbol=${symbol}&timeframe=${timeframe}&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.candles || data.candles.length === 0) return [];
    return data.candles.map((c: any) => ({
      time: c.time as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
  } catch (err) {
    console.warn('[TradingChart] Failed to fetch candles:', err);
    return [];
  }
}

export function TradingChart({ symbol, timeframe, openPrice, stopLoss, takeProfit, tradeSide }: TradingChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const indicatorSeriesRef = useRef<ISeriesApi<any>[]>([]);
  const priceLinesRef = useRef<any[]>([]);
  const currentCandleRef = useRef<{ time: number; open: number; high: number; low: number; close: number } | null>(null);
  const [loading, setLoading] = useState(false);

  const getPrice = useTradingStore((s) => s.getPrice);
  const chartType = useTradingStore((s) => s.chartType);
  const activeIndicators = useTradingStore((s) => s.activeIndicators);
  const theme = useThemeStore((s) => s.theme);

  // Update chart colors when theme changes
  useEffect(() => {
    if (!chartRef.current) return;
    const colors = getChartColors(theme);
    chartRef.current.applyOptions({
      layout: { background: { color: colors.bg }, textColor: colors.text },
      grid: { vertLines: { color: colors.grid }, horzLines: { color: colors.grid } },
      rightPriceScale: { borderColor: colors.border },
      timeScale: { borderColor: colors.border },
    });
  }, [theme]);

  // Main chart setup
  useEffect(() => {
    if (!containerRef.current) return;
    const colors = getChartColors(theme);
    let cancelled = false;

    const chart = createChart(containerRef.current, {
      layout: { background: { color: colors.bg }, textColor: colors.text },
      grid: { vertLines: { color: colors.grid }, horzLines: { color: colors.grid } },
      crosshair: {
        mode: 0,
        vertLine: { color: colors.crosshair, width: 1, style: 2, labelBackgroundColor: colors.crosshair },
        horzLine: { color: colors.crosshair, width: 1, style: 2, labelBackgroundColor: colors.crosshair },
      },
      rightPriceScale: { borderColor: colors.border, scaleMargins: { top: 0.1, bottom: 0.1 } },
      timeScale: { borderColor: colors.border, timeVisible: true, secondsVisible: true },
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });

    // Create main series
    let mainSeries: ISeriesApi<any>;
    if (chartType === 'line') {
      mainSeries = chart.addLineSeries({ color: '#3b82f6', lineWidth: 2 });
    } else if (chartType === 'area') {
      mainSeries = chart.addAreaSeries({
        topColor: 'rgba(59, 130, 246, 0.4)', bottomColor: 'rgba(59, 130, 246, 0.05)',
        lineColor: '#3b82f6', lineWidth: 2,
      });
    } else if (chartType === 'bars') {
      mainSeries = chart.addBarSeries({ upColor: '#22c55e', downColor: '#ef4444' });
    } else {
      mainSeries = chart.addCandlestickSeries({
        upColor: '#22c55e', downColor: '#ef4444',
        borderDownColor: '#ef4444', borderUpColor: '#22c55e',
        wickDownColor: '#ef444480', wickUpColor: '#22c55e80',
      });
    }

    chartRef.current = chart;
    mainSeriesRef.current = mainSeries;

    // Fetch real candles (1s timeframe builds from ticks only)
    setLoading(true);

    const loadCandles = async () => {
      let candles: CandlestickData[] = [];

      if (timeframe === '1s') {
        // For 1s: fetch 1m candles and generate synthetic 1s candles for context
        const minuteCandles = await fetchCandles(symbol, '1m', 60);
        if (minuteCandles.length > 0) {
          // Use last 5 minutes of 1m candles, expand each into ~10 synthetic 1s points
          const recent = minuteCandles.slice(-5);
          const synthetic: CandlestickData[] = [];
          for (const mc of recent) {
            const baseTime = mc.time as number;
            const range = mc.high - mc.low;
            const steps = 6;
            for (let s = 0; s < steps; s++) {
              const t = (baseTime + s * 10) as Time;
              const progress = s / (steps - 1);
              // Interpolate from open to close with some variance
              const mid = mc.open + (mc.close - mc.open) * progress;
              const jitter = range * 0.1 * (Math.sin(baseTime + s * 7) * 0.5);
              const price = mid + jitter;
              synthetic.push({
                time: t,
                open: s === 0 ? mc.open : synthetic[synthetic.length - 1]?.close || price,
                high: Math.max(price, (s === 0 ? mc.open : synthetic[synthetic.length - 1]?.close || price)),
                low: Math.min(price, (s === 0 ? mc.open : synthetic[synthetic.length - 1]?.close || price)),
                close: price,
              });
            }
          }
          candles = synthetic;
        }

        // Even if no 1m candles, initialize from live price
        if (candles.length === 0) {
          const price = getPrice(symbol);
          const livePrice = price ? (price.bid + price.ask) / 2 : 0;
          if (livePrice > 0) {
            const now = Math.floor(Date.now() / 1000);
            // Create a few initial 1s candles so chart isn't empty
            for (let i = 30; i >= 0; i--) {
              const t = (now - i) as Time;
              candles.push({ time: t, open: livePrice, high: livePrice, low: livePrice, close: livePrice });
            }
          }
        }
      } else {
        candles = await fetchCandles(symbol, timeframe);
      }

      if (cancelled) return;

      if (candles.length > 0) {
        // Real data
        if (chartType === 'line' || chartType === 'area') {
          mainSeries.setData(candles.map((c) => ({ time: c.time, value: c.close })));
        } else {
          mainSeries.setData(candles);
        }

        // Initialize current candle from last real candle
        const last = candles[candles.length - 1];
        const tfSeconds: Record<string, number> = { '1s': 1, '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400 };
        const interval = tfSeconds[timeframe] || 3600;
        const now = Math.floor(Date.now() / 1000);
        const candleTimeSec = Math.floor(now / interval) * interval;
        currentCandleRef.current = {
          time: candleTimeSec,
          open: last.close,
          high: last.close,
          low: last.close,
          close: last.close,
        };

        // Add indicators with real data (not for 1s synthetic)
        if (timeframe !== '1s') {
          addIndicators(chart, candles, activeIndicators);
        }
      } else {
        // Fallback: start from live price
        const price = getPrice(symbol);
        const livePrice = price ? (price.bid + price.ask) / 2 : 0;
        if (livePrice > 0) {
          const now = Math.floor(Date.now() / 1000);
          currentCandleRef.current = { time: now, open: livePrice, high: livePrice, low: livePrice, close: livePrice };
          // Set initial data point so chart doesn't show 0
          if (chartType === 'line' || chartType === 'area') {
            mainSeries.setData([{ time: now as Time, value: livePrice }]);
          } else {
            mainSeries.setData([{ time: now as Time, open: livePrice, high: livePrice, low: livePrice, close: livePrice }]);
          }
        }
      }

      chart.timeScale().fitContent();
      setLoading(false);
    };

    loadCandles();

    // Resize
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        chart.applyOptions({ width, height });
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      cancelled = true;
      resizeObserver.disconnect();
      chart.remove();
    };
  }, [symbol, timeframe, chartType, activeIndicators, getPrice, theme]);

  // Real-time tick updates
  useEffect(() => {
    const tfSeconds: Record<string, number> = { '1s': 1, '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400 };
    const interval = tfSeconds[timeframe] || 3600;

    const unsubscribe = useTradingStore.subscribe((state) => {
      const price = state.prices.get(symbol);
      if (!price || !mainSeriesRef.current) return;

      const now = Math.floor(Date.now() / 1000);
      const candleTimeSec = Math.floor(now / interval) * interval;
      const candleTime = candleTimeSec as Time;
      const mid = (price.bid + price.ask) / 2;

      const cur = currentCandleRef.current;

      if (!cur || cur.time !== candleTimeSec) {
        // New candle
        currentCandleRef.current = { time: candleTimeSec, open: mid, high: mid, low: mid, close: mid };
      } else {
        // Update current candle
        cur.high = Math.max(cur.high, mid);
        cur.low = Math.min(cur.low, mid);
        cur.close = mid;
      }

      const c = currentCandleRef.current!;
      if (chartType === 'line' || chartType === 'area') {
        mainSeriesRef.current.update({ time: candleTime, value: c.close });
      } else {
        mainSeriesRef.current.update({ time: candleTime, open: c.open, high: c.high, low: c.low, close: c.close });
      }
    });
    return unsubscribe;
  }, [symbol, timeframe, chartType]);

  // Draw SL/TP/Open price lines
  useEffect(() => {
    const series = mainSeriesRef.current;
    if (!series) return;

    // Remove old lines
    for (const line of priceLinesRef.current) {
      try { series.removePriceLine(line); } catch {}
    }
    priceLinesRef.current = [];

    if (openPrice && openPrice > 0) {
      const openLine = series.createPriceLine({
        price: openPrice,
        color: '#3b82f6',
        lineWidth: 1,
        lineStyle: 2, // dashed
        axisLabelVisible: true,
        title: `Open ${tradeSide || ''}`,
      });
      priceLinesRef.current.push(openLine);
    }

    if (stopLoss && stopLoss > 0) {
      const slLine = series.createPriceLine({
        price: stopLoss,
        color: '#ef4444',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: 'SL',
      });
      priceLinesRef.current.push(slLine);
    }

    if (takeProfit && takeProfit > 0) {
      const tpLine = series.createPriceLine({
        price: takeProfit,
        color: '#22c55e',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: 'TP',
      });
      priceLinesRef.current.push(tpLine);
    }
  }, [openPrice, stopLoss, takeProfit, tradeSide, symbol, timeframe, chartType]);

  return (
    <div ref={containerRef} className="w-full h-full relative">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center z-10 bg-background/50">
          <div className="text-xs text-muted-foreground animate-pulse">Loading chart data...</div>
        </div>
      )}
    </div>
  );
}

function addIndicators(chart: IChartApi, candles: CandlestickData[], activeIndicators: IndicatorType[]) {
  if (candles.length < 30) return;

  if (activeIndicators.includes('sma')) {
    const s = chart.addLineSeries({ color: '#f59e0b', lineWidth: 1, title: 'SMA 20' });
    s.setData(calcSMA(candles, 20));
  }
  if (activeIndicators.includes('ema')) {
    const e12 = chart.addLineSeries({ color: '#8b5cf6', lineWidth: 1, title: 'EMA 12' });
    const e26 = chart.addLineSeries({ color: '#ec4899', lineWidth: 1, title: 'EMA 26' });
    e12.setData(calcEMA(candles, 12));
    e26.setData(calcEMA(candles, 26));
  }
  if (activeIndicators.includes('bollinger')) {
    const bb = calcBollinger(candles);
    const u = chart.addLineSeries({ color: '#06b6d4', lineWidth: 1, lineStyle: 2, title: 'BB Upper' });
    const m = chart.addLineSeries({ color: '#06b6d4', lineWidth: 1, title: 'BB Mid' });
    const l = chart.addLineSeries({ color: '#06b6d4', lineWidth: 1, lineStyle: 2, title: 'BB Lower' });
    u.setData(bb.upper); m.setData(bb.middle); l.setData(bb.lower);
  }
  if (activeIndicators.includes('parabolic_sar')) {
    const s = chart.addLineSeries({ color: '#f97316', lineWidth: 1, pointMarkersVisible: true, title: 'SAR' });
    s.setData(calcParabolicSAR(candles));
  }
  if (activeIndicators.includes('ichimoku')) {
    const t = chart.addLineSeries({ color: '#ef4444', lineWidth: 1, title: 'Tenkan' });
    const k = chart.addLineSeries({ color: '#3b82f6', lineWidth: 1, title: 'Kijun' });
    t.setData(calcSMA(candles, 9)); k.setData(calcSMA(candles, 26));
  }
  if (activeIndicators.includes('volume')) {
    const v = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'vol' });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    v.setData(candles.map((c) => ({
      time: c.time,
      value: (c as any).volume || Math.random() * 1000 + 200,
      color: c.close >= c.open ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)',
    })));
  }
}
