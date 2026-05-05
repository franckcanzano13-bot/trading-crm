'use client';
import { crmApi } from '@/lib/api';
import type { Lead } from './types';
import { ago } from './helpers';

export function TopBar({
  tab, department, setMobileMenu, token, tenantId,
  notifications, unreadCount, setUnreadCount,
  showNotifications, setShowNotifications, setSelectedLead, T,
}: {
  tab: string;
  department: 'ALL' | 'SELLER' | 'RETENTION';
  setMobileMenu: (b: boolean) => void;
  token: string;
  tenantId: string;
  notifications: any[];
  unreadCount: number;
  setUnreadCount: (n: number) => void;
  showNotifications: boolean;
  setShowNotifications: (b: boolean) => void;
  setSelectedLead: (l: Lead | null) => void;
  T: (key: string) => string;
}) {
  return (
    <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-lg border-b border-border px-4 lg:px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <button onClick={() => setMobileMenu(true)} className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary/30">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18" /></svg>
        </button>
        <h2 className="text-sm font-bold capitalize">{tab}</h2>
      </div>
      <div className="flex items-center gap-3">
        {/* Notification bell */}
        <div className="relative">
          <button onClick={() => { setShowNotifications(!showNotifications); if (!showNotifications && unreadCount > 0) crmApi.markNotificationsRead(token, tenantId).then(() => setUnreadCount(0)).catch(() => {}); }}
            className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-secondary/30 transition-colors relative">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" /></svg>
            {unreadCount > 0 && <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-white text-[8px] font-bold flex items-center justify-center">{unreadCount}</span>}
          </button>
          {showNotifications && (
            <div className="absolute right-0 top-11 w-[320px] bg-card border border-border rounded-2xl shadow-2xl z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <span className="text-xs font-bold">{T('header.notifications')}</span>
                {unreadCount > 0 && <button onClick={() => { crmApi.markNotificationsRead(token, tenantId).then(() => setUnreadCount(0)); }} className="text-[9px] text-primary font-semibold">{T('header.markAllRead')}</button>}
              </div>
              <div className="max-h-[400px] overflow-y-auto">
                {notifications.length > 0 ? notifications.map((n: any) => (
                  <div key={n.id} className={`px-4 py-3 border-b border-border/30 text-xs hover:bg-secondary/5 cursor-pointer ${!n.is_read ? 'bg-primary/3' : ''}`}
                    onClick={() => { if (n.link) { setSelectedLead({ id: n.link } as any); setShowNotifications(false); } }}>
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${n.type === 'KYC_COMPLETED' ? 'bg-cyan-400' : n.type === 'LEAD_CONVERTED' ? 'bg-green-400' : n.type === 'TRADE_CLOSED' ? 'bg-amber-400' : 'bg-blue-400'}`} />
                      <span className="font-semibold flex-1">{n.title}</span>
                    </div>
                    {n.body && <div className="text-muted-foreground mt-0.5 ml-4">{n.body}</div>}
                    <div className="text-[9px] text-muted-foreground mt-1 ml-4">{ago(n.created_at)}</div>
                  </div>
                )) : <div className="px-4 py-8 text-center text-muted-foreground text-xs">No notifications</div>}
              </div>
            </div>
          )}
        </div>
        <div className="text-[10px] text-muted-foreground">
          {department !== 'ALL' && <span className={`px-2 py-0.5 rounded-lg font-semibold ${department === 'SELLER' ? 'bg-blue-500/10 text-blue-400' : 'bg-purple-500/10 text-purple-400'}`}>{department}</span>}
        </div>
      </div>
    </div>
  );
}
