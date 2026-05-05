'use client';
import { useEffect, useState, useMemo } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { accountApi, tradingApi } from '@/lib/api';
import { formatCurrency, formatPnl } from '@/lib/utils';

type Tab = 'trades' | 'transactions';

export function ClientHistory() {
  const { token, tenantId } = useAuthStore();
  const [tab, setTab] = useState<Tab>('trades');
  const [trades, setTrades] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token || !tenantId) return;
    setLoading(true);
    Promise.allSettled([
      tradingApi.getTradeHistory(token, tenantId).then(setTrades),
      accountApi.getTransactions(token, tenantId).then(setTransactions),
    ]).finally(() => setLoading(false));
  }, [token, tenantId]);

  const totalPnl = useMemo(
    () => trades.reduce((sum: number, t: any) => sum + (parseFloat(t.pnl) || 0), 0),
    [trades],
  );
  const totalPnlFmt = formatPnl(totalPnl);

  const deposits = useMemo(
    () => transactions.filter((t: any) => t.type === 'DEPOSIT'),
    [transactions],
  );
  const withdrawals = useMemo(
    () => transactions.filter((t: any) => t.type === 'WITHDRAWAL'),
    [transactions],
  );

  const totalDeposits = useMemo(
    () => deposits.reduce((sum: number, t: any) => sum + (parseFloat(t.amount) || 0), 0),
    [deposits],
  );
  const totalWithdrawals = useMemo(
    () => withdrawals.reduce((sum: number, t: any) => sum + (parseFloat(t.amount) || 0), 0),
    [withdrawals],
  );

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">History</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Review your past trades and account transactions
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        {/* Total P&L */}
        <div className="bg-card rounded-2xl card-modern p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
              totalPnl >= 0 ? 'bg-buy/10' : 'bg-sell/10'
            }`}>
              <svg className={`w-5 h-5 ${totalPnl >= 0 ? 'text-buy' : 'text-sell'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <span className="text-sm text-muted-foreground">Total P&L</span>
          </div>
          <div className={`text-2xl font-bold price-value ${totalPnlFmt.color}`}>
            {loading ? '---' : totalPnlFmt.text}
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">
            {trades.length} closed trade{trades.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Total Deposits */}
        <div className="bg-card rounded-2xl card-modern p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-2xl bg-buy/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-buy" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v12m0-12l-4 4m4-4l4 4" />
              </svg>
            </div>
            <span className="text-sm text-muted-foreground">Total Deposits</span>
          </div>
          <div className="text-2xl font-bold price-value text-buy">
            {loading ? '---' : formatCurrency(totalDeposits)}
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">
            {deposits.length} deposit{deposits.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Total Withdrawals */}
        <div className="bg-card rounded-2xl card-modern p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-2xl bg-sell/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-sell" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18V6m0 12l-4-4m4 4l4-4" />
              </svg>
            </div>
            <span className="text-sm text-muted-foreground">Total Withdrawals</span>
          </div>
          <div className="text-2xl font-bold price-value text-sell">
            {loading ? '---' : formatCurrency(totalWithdrawals)}
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">
            {withdrawals.length} withdrawal{withdrawals.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        <button
          onClick={() => setTab('trades')}
          className={`relative px-5 py-2.5 text-sm font-medium transition-colors ${
            tab === 'trades' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            Trade History
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold tabular-nums">
              {trades.length}
            </span>
          </span>
          {tab === 'trades' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
          )}
        </button>
        <button
          onClick={() => setTab('transactions')}
          className={`relative px-5 py-2.5 text-sm font-medium transition-colors ${
            tab === 'transactions' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8V7m0 10v1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Transactions
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold tabular-nums">
              {transactions.length}
            </span>
          </span>
          {tab === 'transactions' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
          )}
        </button>
      </div>

      {/* Trades Tab */}
      {tab === 'trades' && (
        <>
          {loading ? (
            <div className="bg-card rounded-2xl card-modern p-10">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                <p className="text-sm text-muted-foreground">Loading trades...</p>
              </div>
            </div>
          ) : trades.length === 0 ? (
            <div className="bg-card rounded-2xl card-modern p-10">
              <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-secondary/50 flex items-center justify-center">
                  <svg className="w-8 h-8 text-muted-foreground/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-muted-foreground">No trades yet</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    Your closed trades will appear here once you start trading.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-card rounded-2xl card-modern overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-secondary/30 text-muted-foreground border-b border-border/50">
                      <th className="text-left font-medium px-5 py-3">Symbol</th>
                      <th className="text-left font-medium px-3 py-3">Side</th>
                      <th className="text-right font-medium px-3 py-3">Volume</th>
                      <th className="text-right font-medium px-3 py-3">Open Price</th>
                      <th className="text-right font-medium px-3 py-3">Close Price</th>
                      <th className="text-right font-medium px-3 py-3">P&L</th>
                      <th className="text-center font-medium px-3 py-3">Status</th>
                      <th className="text-right font-medium px-5 py-3">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {trades.map((t: any) => {
                      const pnl = formatPnl(t.pnl);
                      return (
                        <tr key={t.id} className="hover:bg-secondary/20 transition-colors">
                          <td className="px-5 py-3">
                            <span className="font-semibold">{t.symbol}</span>
                          </td>
                          <td className="px-3 py-3">
                            <span className={`inline-flex items-center text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wide ${
                              t.side === 'BUY'
                                ? 'bg-buy/10 text-buy'
                                : 'bg-sell/10 text-sell'
                            }`}>
                              {t.side}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right font-mono tabular-nums">
                            {t.volume}
                          </td>
                          <td className="px-3 py-3 text-right font-mono tabular-nums">
                            {(Number(t.open_price) / 100000).toFixed(5)}
                          </td>
                          <td className="px-3 py-3 text-right font-mono tabular-nums">
                            {t.close_price
                              ? (Number(t.close_price) / 100000).toFixed(5)
                              : '---'}
                          </td>
                          <td className={`px-3 py-3 text-right font-mono font-semibold tabular-nums ${pnl.color}`}>
                            {pnl.text}
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className={`inline-flex items-center text-[10px] px-2 py-0.5 rounded-md font-semibold ${
                              t.status === 'CLOSED'
                                ? 'bg-secondary text-muted-foreground'
                                : t.status === 'OPEN'
                                  ? 'bg-primary/10 text-primary'
                                  : 'bg-amber-500/10 text-amber-500'
                            }`}>
                              {t.status}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right text-muted-foreground whitespace-nowrap">
                            {t.close_time
                              ? new Date(t.close_time).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                })
                              : t.open_time
                                ? new Date(t.open_time).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                  })
                                : '---'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {/* Footer summary row */}
              <div className="flex items-center justify-between px-5 py-3 bg-secondary/20 border-t border-border/50 text-xs text-muted-foreground">
                <span>{trades.length} trade{trades.length !== 1 ? 's' : ''} total</span>
                <span className={`font-semibold font-mono ${totalPnlFmt.color}`}>
                  Net P&L: {totalPnlFmt.text}
                </span>
              </div>
            </div>
          )}
        </>
      )}

      {/* Transactions Tab */}
      {tab === 'transactions' && (
        <>
          {loading ? (
            <div className="bg-card rounded-2xl card-modern p-10">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                <p className="text-sm text-muted-foreground">Loading transactions...</p>
              </div>
            </div>
          ) : transactions.length === 0 ? (
            <div className="bg-card rounded-2xl card-modern p-10">
              <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-secondary/50 flex items-center justify-center">
                  <svg className="w-8 h-8 text-muted-foreground/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8V7m0 10v1" />
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-muted-foreground">No transactions yet</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    Deposits and withdrawals will be listed here.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-card rounded-2xl card-modern overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-secondary/30 text-muted-foreground border-b border-border/50">
                      <th className="text-left font-medium px-5 py-3">Type</th>
                      <th className="text-left font-medium px-3 py-3">Description</th>
                      <th className="text-right font-medium px-3 py-3">Amount</th>
                      <th className="text-right font-medium px-5 py-3">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {transactions.map((tx: any) => (
                      <tr key={tx.id} className="hover:bg-secondary/20 transition-colors">
                        <td className="px-5 py-3">
                          <span className={`inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wide ${
                            tx.type === 'DEPOSIT'
                              ? 'bg-buy/10 text-buy'
                              : tx.type === 'WITHDRAWAL'
                                ? 'bg-sell/10 text-sell'
                                : 'bg-primary/10 text-primary'
                          }`}>
                            {tx.type === 'DEPOSIT' ? (
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                              </svg>
                            ) : tx.type === 'WITHDRAWAL' ? (
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                              </svg>
                            ) : null}
                            {tx.type}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-muted-foreground">
                          {tx.description || '---'}
                        </td>
                        <td className={`px-3 py-3 text-right font-mono font-semibold tabular-nums ${
                          tx.type === 'DEPOSIT' ? 'text-buy' : 'text-sell'
                        }`}>
                          {tx.type === 'DEPOSIT' ? '+' : '-'}{formatCurrency(tx.amount)}
                        </td>
                        <td className="px-5 py-3 text-right text-muted-foreground whitespace-nowrap">
                          {tx.created_at
                            ? new Date(tx.created_at).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })
                            : '---'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Footer summary */}
              <div className="flex items-center justify-between px-5 py-3 bg-secondary/20 border-t border-border/50 text-xs text-muted-foreground">
                <span>{transactions.length} transaction{transactions.length !== 1 ? 's' : ''} total</span>
                <div className="flex items-center gap-4">
                  <span className="text-buy font-semibold font-mono">
                    In: {formatCurrency(totalDeposits)}
                  </span>
                  <span className="text-sell font-semibold font-mono">
                    Out: {formatCurrency(totalWithdrawals)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
