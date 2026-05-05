'use client';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useTradingStore } from '@/stores/trading-store';
import { accountApi } from '@/lib/api';

export function AccountMetricsBar() {
  const { token, tenantId } = useAuthStore();
  const [account, setAccount] = useState<any>(null);
  const positions = useTradingStore((s) => s.positions);
  const prices = useTradingStore((s) => s.prices);

  useEffect(() => {
    if (!token || !tenantId) return;
    const load = () => accountApi.getAccount(token, tenantId).then(setAccount).catch(() => {});
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [token, tenantId]);

  if (!account) return null;

  const balance = Number(account.balance) / 100;
  const equity = Number(account.equity) / 100;
  const marginUsed = Number(account.margin_used) / 100;
  const freeMargin = equity - marginUsed;
  const marginLevel = marginUsed > 0 ? (equity / marginUsed) * 100 : 0;
  const credit = 0; // No credit system yet

  // Compute open P/L from positions
  let openPnl = 0;
  positions.forEach((pos) => {
    const price = prices.get(pos.symbol);
    if (!price) return;
    // open_price stored with precision 5 (priceToInt(price, 5))
    const openPrice = Number(pos.open_price) / 100000;
    const closePrice = pos.side === 'BUY' ? price.bid : price.ask;
    const direction = pos.side === 'BUY' ? 1 : -1;
    openPnl += (closePrice - openPrice) * pos.volume * (pos.lot_size || 1) * direction;
  });

  return (
    <div className="h-8 bg-card border-t border-border flex items-center px-4 shrink-0 no-select gap-6 text-[10px]">
      <Metric label="Balance" value={`$${balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} />
      <Metric label="Equity" value={`$${equity.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} />
      <Metric label="Free Margin" value={`$${freeMargin.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} highlight={freeMargin < 100} />
      <Metric label="Used Margin" value={`$${marginUsed.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} warning={marginUsed > 0} />
      <Metric
        label="Open P/L"
        value={`${openPnl >= 0 ? '+' : ''}$${openPnl.toFixed(2)}`}
        positive={openPnl >= 0}
        negative={openPnl < 0}
      />
      <Metric
        label="Margin Level"
        value={marginUsed > 0 ? `${marginLevel.toFixed(1)}%` : '---'}
        warning={marginLevel > 0 && marginLevel < 150}
      />
      <Metric label="Credit" value={`$${credit.toFixed(2)}`} />

      <div className="flex-1" />

      <div className="flex items-center gap-1.5">
        <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
        <span className="text-muted-foreground">Connected</span>
      </div>
    </div>
  );
}

function Metric({ label, value, highlight, warning, positive, negative }: {
  label: string;
  value: string;
  highlight?: boolean;
  warning?: boolean;
  positive?: boolean;
  negative?: boolean;
}) {
  let color = 'text-foreground/80';
  if (positive) color = 'text-buy';
  if (negative) color = 'text-sell';
  if (warning) color = 'text-amber-500';
  if (highlight) color = 'text-sell';

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground uppercase tracking-wider">{label}:</span>
      <span className={`font-mono font-semibold ${color}`}>{value}</span>
    </div>
  );
}
