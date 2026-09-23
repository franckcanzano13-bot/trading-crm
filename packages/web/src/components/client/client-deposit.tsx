'use client';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { accountApi, withdrawalApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

const QUICK_AMOUNTS = [100, 250, 500, 1000, 2500, 5000];

const PAYMENT_METHODS = [
  {
    id: 'card',
    name: 'Credit / Debit Card',
    description: 'Visa, Mastercard, Amex',
    fee: '0%',
    time: 'Instant',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
      </svg>
    ),
  },
  {
    id: 'bank',
    name: 'Bank Transfer',
    description: 'SWIFT / SEPA',
    fee: '0%',
    time: '1-3 days',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" />
      </svg>
    ),
  },
  {
    id: 'crypto',
    name: 'Crypto (USDT)',
    description: 'TRC-20 / ERC-20',
    fee: '0%',
    time: '~15 min',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.893 13.393l-1.135-1.135a2.252 2.252 0 01-.421-.585l-1.08-2.16a.414.414 0 00-.663-.107.827.827 0 01-.812.21l-1.273-.363a.89.89 0 00-.738 1.595l.587.39c.59.395.674 1.23.172 1.732l-.2.2c-.211.212-.33.498-.33.796v.41c0 .409-.11.809-.32 1.158l-1.315 2.191a2.11 2.11 0 01-1.81 1.025 1.055 1.055 0 01-1.055-1.055v-1.172c0-.92-.56-1.747-1.414-2.089l-.655-.261a2.25 2.25 0 01-1.383-2.46l.007-.042a2.25 2.25 0 01.29-.787l.09-.15a2.25 2.25 0 012.37-1.048l1.178.236a1.125 1.125 0 001.302-.795l.208-.73a1.125 1.125 0 00-.578-1.315l-.665-.332-.091.091a2.25 2.25 0 01-1.591.659h-.18c-.249 0-.487.1-.662.274a.931.931 0 01-1.458-1.137l1.411-2.353a2.25 2.25 0 00.286-.76M11.25 2.25L12 2.25" />
        <circle cx="12" cy="12" r="9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'ewallet',
    name: 'E-Wallet',
    description: 'Skrill, Neteller, PayPal',
    fee: '0%',
    time: 'Instant',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" />
      </svg>
    ),
  },
];

export function ClientDeposit() {
  const { token, tenantId } = useAuthStore();
  const [tab, setTab] = useState<'deposit' | 'withdraw'>('deposit');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('card');
  const [account, setAccount] = useState<any>(null);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // Phase 1.5: real withdrawal requests, decided by the broker's staff.
  const [requests, setRequests] = useState<any[]>([]);
  const loadRequests = () => {
    if (!token || !tenantId) return;
    withdrawalApi.list(token, tenantId).then(setRequests).catch(() => {});
  };

  useEffect(() => {
    if (!token || !tenantId) return;
    accountApi.getAccount(token, tenantId).then(setAccount).catch(() => {});
    withdrawalApi.list(token, tenantId).then(setRequests).catch(() => {});
  }, [token, tenantId]);

  const selectedMethod = PAYMENT_METHODS.find((m) => m.id === method);
  const numericAmount = parseFloat(amount) || 0;
  const isValid = numericAmount >= (tab === 'withdraw' ? 50 : 10);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    setLoading(true);
    setError('');
    try {
      if (tab === 'withdraw') {
        await withdrawalApi.request(token!, tenantId!, { amount: numericAmount, method });
        setSuccess(`Withdrawal of $${numericAmount.toLocaleString()} requested via ${selectedMethod?.name}. Your broker will review it within 1-3 business days.`);
        loadRequests();
        accountApi.getAccount(token!, tenantId!).then(setAccount).catch(() => {});
      } else {
        // Deposits are collected by the broker's payment provider / support desk;
        // the in-app form only records the intent until a PSP is connected (roadmap 2.5).
        await new Promise((r) => setTimeout(r, 400));
        setSuccess(`Deposit of $${numericAmount.toLocaleString()} via ${selectedMethod?.name}: your broker's support desk will send you the payment instructions.`);
      }
      setAmount('');
      setTimeout(() => setSuccess(''), 8000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Manage Funds</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Deposit or withdraw from your trading account securely.
        </p>
      </div>

      {/* Balance Overview Card */}
      {account && (
        <div className="relative overflow-hidden rounded-2xl card-modern">
          <div className={`absolute inset-0 ${tab === 'deposit' ? 'gradient-buy' : 'gradient-sell'} opacity-[0.07]`} />
          <div className="relative border border-border rounded-2xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Available Balance
                </p>
                <p className="text-3xl font-bold price-value mt-1.5 tracking-tight">
                  {formatCurrency(account.balance)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Equity</p>
                <p className="text-xl font-semibold price-value mt-1.5">{formatCurrency(account.equity)}</p>
              </div>
            </div>
            {/* Mini bar showing balance vs margin */}
            {account.marginUsed > 0 && (
              <div className="mt-4">
                <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                  <span>Free Margin</span>
                  <span>{formatCurrency(account.balance - (account.marginUsed || 0))}</span>
                </div>
                <div className="h-1.5 bg-secondary/80 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.max(5, Math.min(100, ((account.balance - (account.marginUsed || 0)) / account.balance) * 100))}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Deposit / Withdraw Tabs */}
      <div className="flex bg-secondary/40 backdrop-blur-sm rounded-2xl p-1.5 gap-1 no-select">
        <button
          onClick={() => setTab('deposit')}
          className={`flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all duration-200 ${
            tab === 'deposit'
              ? 'bg-buy text-white shadow-md shadow-buy/25'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <span className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m0 0l-6-6m6 6l6-6" />
            </svg>
            Deposit
          </span>
        </button>
        <button
          onClick={() => setTab('withdraw')}
          className={`flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all duration-200 ${
            tab === 'withdraw'
              ? 'bg-sell text-white shadow-md shadow-sell/25'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <span className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 20V4m0 0l-6 6m6-6l6 6" />
            </svg>
            Withdraw
          </span>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Amount Section */}
        <div className="bg-card border border-border rounded-2xl card-modern p-5 space-y-4">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Amount (USD)
          </label>

          {/* Amount Input */}
          <div className="relative group">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-muted-foreground/50 group-focus-within:text-primary transition-colors">
              $
            </span>
            <input
              type="number"
              min={tab === 'withdraw' ? 50 : 10}
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full bg-secondary/30 border border-border rounded-xl text-3xl font-bold pl-10 pr-4 py-4 text-foreground placeholder:text-muted-foreground/20 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all"
              required
            />
          </div>

          {/* Quick Amount Buttons */}
          <div className="grid grid-cols-3 gap-2.5">
            {QUICK_AMOUNTS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAmount(String(a))}
                className={`py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 ${
                  amount === String(a)
                    ? tab === 'deposit'
                      ? 'bg-buy/15 text-buy border border-buy/30 shadow-sm'
                      : 'bg-sell/15 text-sell border border-sell/30 shadow-sm'
                    : 'bg-secondary/40 text-muted-foreground hover:text-foreground hover:bg-secondary/70 border border-transparent'
                }`}
              >
                ${a.toLocaleString()}
              </button>
            ))}
          </div>
        </div>

        {/* Payment Method Section */}
        <div className="bg-card border border-border rounded-2xl card-modern p-5 space-y-4">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {tab === 'deposit' ? 'Payment Method' : 'Withdrawal Method'}
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {PAYMENT_METHODS.map((pm) => {
              const isSelected = method === pm.id;
              return (
                <button
                  key={pm.id}
                  type="button"
                  onClick={() => setMethod(pm.id)}
                  className={`relative flex flex-col items-start p-4 rounded-xl border-2 transition-all duration-200 text-left group ${
                    isSelected
                      ? 'border-primary bg-primary/5 shadow-sm shadow-primary/10'
                      : 'border-border hover:border-primary/30 hover:bg-secondary/30'
                  }`}
                >
                  {/* Selected indicator */}
                  {isSelected && (
                    <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}

                  {/* Icon */}
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 transition-colors ${
                      isSelected ? 'bg-primary/15 text-primary' : 'bg-secondary/60 text-muted-foreground group-hover:text-foreground'
                    }`}
                  >
                    {pm.icon}
                  </div>

                  {/* Info */}
                  <span className={`text-sm font-semibold ${isSelected ? 'text-foreground' : 'text-foreground/80'}`}>
                    {pm.name}
                  </span>
                  <span className="text-[11px] text-muted-foreground mt-0.5">{pm.description}</span>

                  {/* Fee & time badges */}
                  <div className="flex items-center gap-2 mt-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-buy/10 text-buy text-[10px] font-semibold">
                      Fee: {pm.fee}
                    </span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-secondary/60 text-muted-foreground text-[10px] font-medium">
                      {pm.time}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Summary before submit */}
        {numericAmount > 0 && (
          <div className="bg-card border border-border rounded-2xl card-modern p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Amount</span>
              <span className="font-semibold">${numericAmount.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between text-sm mt-2">
              <span className="text-muted-foreground">Method</span>
              <span className="font-medium">{selectedMethod?.name}</span>
            </div>
            <div className="flex items-center justify-between text-sm mt-2">
              <span className="text-muted-foreground">Fee</span>
              <span className="font-medium text-buy">{selectedMethod?.fee}</span>
            </div>
            <div className="border-t border-border mt-3 pt-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-muted-foreground">You {tab === 'deposit' ? 'pay' : 'receive'}</span>
              <span className="text-lg font-bold">${numericAmount.toLocaleString()}</span>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-sell/10 border border-sell/20 rounded-xl p-4 text-sm text-sell">{error}</div>
        )}
        {/* Success Message */}
        {success && (
          <div className="flex items-start gap-3 bg-buy/10 border border-buy/20 rounded-xl p-4 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="w-8 h-8 rounded-full bg-buy/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg className="w-4 h-4 text-buy" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-buy">Request Submitted</p>
              <p className="text-xs text-buy/80 mt-0.5 leading-relaxed">{success}</p>
            </div>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={!isValid || loading}
          className={`w-full py-4 rounded-2xl text-white font-bold text-base transition-all duration-200 btn-soft shadow-lg disabled:opacity-40 disabled:cursor-not-allowed ${
            tab === 'deposit'
              ? 'bg-buy hover:bg-buy/90 shadow-buy/20 hover:shadow-buy/30 hover:shadow-xl'
              : 'bg-sell hover:bg-sell/90 shadow-sell/20 hover:shadow-sell/30 hover:shadow-xl'
          }`}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Processing...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              {tab === 'deposit' ? (
                <>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m0 0l-6-6m6 6l6-6" />
                  </svg>
                  Deposit {numericAmount > 0 ? `$${numericAmount.toLocaleString()}` : ''}
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 20V4m0 0l-6 6m6-6l6 6" />
                  </svg>
                  Withdraw {numericAmount > 0 ? `$${numericAmount.toLocaleString()}` : ''}
                </>
              )}
            </span>
          )}
        </button>

        {/* Disclaimer */}
        <div className="flex items-start gap-2 px-1">
          <svg className="w-3.5 h-3.5 text-muted-foreground/50 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v.01M12 12a1.5 1.5 0 00-1.138.541l-.002.003A1.5 1.5 0 0012 15h.008" />
            <circle cx="12" cy="12" r="9" />
          </svg>
          <p className="text-[11px] text-muted-foreground/60 leading-relaxed">
            {tab === 'deposit'
              ? 'Deposits are processed instantly for cards and e-wallets. Bank transfers may take 1-3 business days. All transactions are encrypted and secure.'
              : 'Withdrawals are processed within 1-3 business days. Minimum withdrawal: $50. Funds are returned to the original payment method.'}
          </p>
        </div>
      </form>

      {/* Phase 1.5: withdrawal requests and their status */}
      {requests.length > 0 && (
        <div className="bg-card border border-border rounded-2xl card-modern overflow-hidden">
          <div className="px-5 py-3 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider">Withdrawal requests</div>
          <table className="w-full text-sm">
            <tbody>
              {requests.map((r: any) => (
                <tr key={r.id} className="border-b border-border/50 last:border-0">
                  <td className="px-5 py-3 text-xs text-muted-foreground">{new Date(r.requested_at).toLocaleString()}</td>
                  <td className="px-5 py-3 font-mono font-semibold">${(Number(r.amount_cents) / 100).toLocaleString()}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                      r.status === 'APPROVED' ? 'bg-green-500/10 text-green-500' :
                      r.status === 'REJECTED' ? 'bg-red-500/10 text-red-500' :
                      r.status === 'CANCELLED' ? 'bg-secondary text-muted-foreground' :
                      'bg-amber-500/10 text-amber-500'
                    }`}>{r.status}</span>
                    {r.status === 'REJECTED' && r.reason && <div className="text-[11px] text-muted-foreground mt-1">{r.reason}</div>}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {r.status === 'PENDING' && (
                      <button type="button" className="text-xs text-muted-foreground hover:text-sell transition-colors"
                        onClick={() => withdrawalApi.cancel(token!, tenantId!, r.id).then(loadRequests).catch(() => {})}>
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
