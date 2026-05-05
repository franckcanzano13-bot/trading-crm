'use client';
import { useEffect } from 'react';
import { useNavigationStore } from '@/stores/navigation-store';
import { useAuthStore } from '@/stores/auth-store';
import { useThemeStore } from '@/stores/theme-store';
import { ClientSidebar } from '@/components/client/client-sidebar';
import { ClientDashboard } from '@/components/client/client-dashboard';
import { ClientDeposit } from '@/components/client/client-deposit';
import { ClientHistory } from '@/components/client/client-history';
import { ClientProfile } from '@/components/client/client-profile';
import { ClientFeed } from '@/components/client/client-feed';
import { ClientCopy } from '@/components/client/client-copy';
import { ClientAlerts } from '@/components/client/client-alerts';
import { ClientHelp } from '@/components/client/client-help';
import { TradingTerminal } from '@/components/trading/trading-terminal';

export function ClientLayout() {
  const currentPage = useNavigationStore((s) => s.currentPage);
  const setPage = useNavigationStore((s) => s.setPage);
  const isDealerManaged = useAuthStore((s) => s.isDealerManaged);

  // Dealer-managed clients go straight to trading terminal
  useEffect(() => {
    if (isDealerManaged && currentPage === 'dashboard') {
      setPage('trade');
    }
  }, [isDealerManaged, currentPage, setPage]);

  // Trading terminal has its own full layout — also catch dealer-managed during render
  if (currentPage === 'trade' || (isDealerManaged && currentPage === 'dashboard')) {
    return <TradingTerminal />;
  }

  return (
    <div className="h-screen flex overflow-hidden">
      <ClientSidebar />
      <main className="flex-1 overflow-y-auto bg-background">
        {currentPage === 'dashboard' && <ClientDashboard />}
        {currentPage === 'deposit' && <ClientDeposit />}
        {currentPage === 'history' && <ClientHistory />}
        {currentPage === 'profile' && <ClientProfile />}
        {currentPage === 'feed' && <ClientFeed />}
        {currentPage === 'copy' && <ClientCopy />}
        {currentPage === 'alerts' && <ClientAlerts />}
        {currentPage === 'help' && <ClientHelp />}
      </main>
    </div>
  );
}
