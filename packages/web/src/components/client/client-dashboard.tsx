'use client';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useNavigationStore } from '@/stores/navigation-store';
import { accountApi, tradingApi } from '@/lib/api';
import { formatCurrency, formatPnl } from '@/lib/utils';

export function ClientDashboard() {
  const { token, tenantId, user } = useAuthStore();
  const setPage = useNavigationStore((s) => s.setPage);
  const [account, setAccount] = useState<any>(null);
  const [trades, setTrades] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);

  useEffect(() => {
    if (!token || !tenantId) return;
    accountApi.getAccount(token, tenantId).then(setAccount).catch(() => {});
    tradingApi.getTradeHistory(token, tenantId).then(setTrades).catch(() => {});
    accountApi.getTransactions(token, tenantId).then(setTransactions).catch(() => {});
  }, [token, tenantId]);

  const totalPnl = trades.reduce((sum: number, t: any) => sum + (parseFloat(t.pnl) || 0), 0);
  const winTrades = trades.filter((t: any) => parseFloat(t.pnl) > 0).length;
  const winRate = trades.length > 0 ? ((winTrades / trades.length) * 100).toFixed(1) : '0.0';

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      {/* Welcome Hero Banner */}
      <div className="gradient-hero rounded-3xl p-8 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-black/10" />
        <div className="relative z-10">
          <p className="text-white/70 text-sm">Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'},</p>
          <h1 className="text-2xl font-bold mt-1">{user?.name || 'Trader'}</h1>
          <p className="text-white/60 text-sm mt-2 max-w-md">Your portfolio is looking good. Check your positions or explore new opportunities.</p>
          <div className="flex gap-3 mt-6">
            <button
              onClick={() => setPage('trade')}
              className="px-6 py-2.5 bg-white text-gray-900 rounded-full text-sm font-semibold hover:bg-white/90 transition-all btn-soft shadow-lg"
            >
              Start Trading
            </button>
            <button
              onClick={() => setPage('deposit')}
              className="px-6 py-2.5 bg-white/20 text-white rounded-full text-sm font-semibold hover:bg-white/30 transition-all btn-soft backdrop-blur-sm"
            >
              Deposit Funds
            </button>
          </div>
        </div>
        {/* Decorative circles */}
        <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-white/10" />
        <div className="absolute right-20 -bottom-8 w-24 h-24 rounded-full bg-white/5" />
      </div>

      {/* Portfolio Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-card rounded-2xl card-modern p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
            </div>
            <span className="text-sm text-muted-foreground">Balance</span>
          </div>
          <div className="text-2xl font-bold price-value">{account ? formatCurrency(account.balance) : '$0.00'}</div>
        </div>

        <div className="bg-card rounded-2xl card-modern p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-2xl bg-buy/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-buy" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <span className="text-sm text-muted-foreground">Equity</span>
          </div>
          <div className="text-2xl font-bold price-value text-buy">{account ? formatCurrency(account.equity) : '$0.00'}</div>
        </div>

        <div className="bg-card rounded-2xl card-modern p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-10 h-10 rounded-2xl ${totalPnl >= 0 ? 'bg-buy/10' : 'bg-sell/10'} flex items-center justify-center`}>
              <svg className={`w-5 h-5 ${totalPnl >= 0 ? 'text-buy' : 'text-sell'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <span className="text-sm text-muted-foreground">Total P&L</span>
          </div>
          <div className={`text-2xl font-bold price-value ${totalPnl >= 0 ? 'text-buy' : 'text-sell'}`}>{formatPnl(totalPnl).text}</div>
        </div>

        <div className="bg-card rounded-2xl card-modern p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
            </div>
            <span className="text-sm text-muted-foreground">Win Rate</span>
          </div>
          <div className="text-2xl font-bold price-value">{winRate}%</div>
          <div className="mt-2 h-1.5 rounded-full bg-secondary overflow-hidden">
            <div className="h-full rounded-full gradient-buy transition-all" style={{ width: `${winRate}%` }} />
          </div>
        </div>
      </div>

      {/* Quick Actions — pill-style */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => setPage('copy')}
          className="flex items-center gap-2.5 px-5 py-3 bg-card rounded-2xl card-modern hover:shadow-lg transition-all btn-soft"
        >
          <div className="w-8 h-8 rounded-xl bg-purple-500/10 flex items-center justify-center">
            <svg className="w-4 h-4 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div className="text-left">
            <div className="text-sm font-semibold">Copy Traders</div>
            <div className="text-[11px] text-muted-foreground">Auto-copy the best</div>
          </div>
        </button>

        <button
          onClick={() => setPage('feed')}
          className="flex items-center gap-2.5 px-5 py-3 bg-card rounded-2xl card-modern hover:shadow-lg transition-all btn-soft"
        >
          <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a2 2 0 01-2-2V10a2 2 0 012-2h8z" />
            </svg>
          </div>
          <div className="text-left">
            <div className="text-sm font-semibold">Social Feed</div>
            <div className="text-[11px] text-muted-foreground">Trade ideas</div>
          </div>
        </button>

        <button
          onClick={() => setPage('alerts')}
          className="flex items-center gap-2.5 px-5 py-3 bg-card rounded-2xl card-modern hover:shadow-lg transition-all btn-soft"
        >
          <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center">
            <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </div>
          <div className="text-left">
            <div className="text-sm font-semibold">Price Alerts</div>
            <div className="text-[11px] text-muted-foreground">Set notifications</div>
          </div>
        </button>

        <button
          onClick={() => setPage('deposit')}
          className="flex items-center gap-2.5 px-5 py-3 bg-card rounded-2xl card-modern hover:shadow-lg transition-all btn-soft"
        >
          <div className="w-8 h-8 rounded-xl bg-sell/10 flex items-center justify-center">
            <svg className="w-4 h-4 text-sell" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </div>
          <div className="text-left">
            <div className="text-sm font-semibold">Withdraw</div>
            <div className="text-[11px] text-muted-foreground">Cash out</div>
          </div>
        </button>

        <button
          onClick={() => setPage('history')}
          className="flex items-center gap-2.5 px-5 py-3 bg-card rounded-2xl card-modern hover:shadow-lg transition-all btn-soft"
        >
          <div className="w-8 h-8 rounded-xl bg-secondary flex items-center justify-center">
            <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <div className="text-left">
            <div className="text-sm font-semibold">Statements</div>
            <div className="text-[11px] text-muted-foreground">View history</div>
          </div>
        </button>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent trades */}
        <div className="bg-card rounded-2xl card-modern overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4">
            <h3 className="text-base font-semibold">Recent Trades</h3>
            <button onClick={() => setPage('history')} className="text-xs text-primary font-medium hover:underline">
              View all
            </button>
          </div>
          <div className="px-2 pb-2">
            {trades.slice(0, 5).map((t: any) => {
              const pnl = formatPnl(t.pnl);
              return (
                <div key={t.id} className="flex items-center justify-between px-4 py-3 rounded-xl hover:bg-secondary/40 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                      t.side === 'BUY' ? 'bg-buy/10' : 'bg-sell/10'
                    }`}>
                      <svg className={`w-4 h-4 ${t.side === 'BUY' ? 'text-buy' : 'text-sell'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={t.side === 'BUY' ? 'M5 10l7-7m0 0l7 7m-7-7v18' : 'M19 14l-7 7m0 0l-7-7m7 7V3'} />
                      </svg>
                    </div>
                    <div>
                      <div className="text-sm font-semibold">{t.symbol}</div>
                      <div className="text-[11px] text-muted-foreground">{t.side} {t.volume} lot</div>
                    </div>
                  </div>
                  <span className={`text-sm font-bold font-mono ${pnl.color}`}>{pnl.text}</span>
                </div>
              );
            })}
            {trades.length === 0 && (
              <div className="text-center py-10">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-secondary/50 flex items-center justify-center">
                  <svg className="w-8 h-8 text-muted-foreground/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
                <p className="text-sm text-muted-foreground">No trades yet</p>
                <button onClick={() => setPage('trade')} className="mt-3 text-sm text-primary font-medium hover:underline">
                  Start trading
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Recent transactions */}
        <div className="bg-card rounded-2xl card-modern overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4">
            <h3 className="text-base font-semibold">Recent Transactions</h3>
            <button onClick={() => setPage('history')} className="text-xs text-primary font-medium hover:underline">
              View all
            </button>
          </div>
          <div className="px-2 pb-2">
            {transactions.slice(0, 5).map((tx: any) => (
              <div key={tx.id} className="flex items-center justify-between px-4 py-3 rounded-xl hover:bg-secondary/40 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                    tx.type === 'DEPOSIT' ? 'bg-buy/10' : 'bg-sell/10'
                  }`}>
                    {tx.type === 'DEPOSIT' ? (
                      <svg className="w-4 h-4 text-buy" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v12m0-12l-4 4m4-4l4 4" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-sell" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18V6m0 12l-4-4m4 4l4-4" />
                      </svg>
                    )}
                  </div>
                  <div>
                    <div className="text-sm font-semibold">{tx.type}</div>
                    <div className="text-[11px] text-muted-foreground">{tx.description || 'Transaction'}</div>
                  </div>
                </div>
                <span className={`text-sm font-bold font-mono ${
                  tx.type === 'DEPOSIT' ? 'text-buy' : 'text-sell'
                }`}>
                  {tx.type === 'DEPOSIT' ? '+' : '-'}{formatCurrency(tx.amount)}
                </span>
              </div>
            ))}
            {transactions.length === 0 && (
              <div className="text-center py-10">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-secondary/50 flex items-center justify-center">
                  <svg className="w-8 h-8 text-muted-foreground/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8V7m0 10v1" />
                  </svg>
                </div>
                <p className="text-sm text-muted-foreground">No transactions yet</p>
                <button onClick={() => setPage('deposit')} className="mt-3 text-sm text-primary font-medium hover:underline">
                  Make a deposit
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
