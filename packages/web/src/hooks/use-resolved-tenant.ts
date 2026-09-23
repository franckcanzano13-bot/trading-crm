'use client';
// Phase 1.4 — Resolve the broker (tenant) from the domain the page is served
// on, so clients on a white-label domain never type a tenant id. Falls back to
// the id remembered in localStorage, then to manual entry.
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

export interface ResolvedTenant {
  id: string;
  name: string;
  slug: string;
  branding: { company_name: string; logo_url: string; primary_color: string } | null;
}

const STORAGE_KEY = 'tradexlabel-tenant';

export function useResolvedTenant(): { tenant: ResolvedTenant | null; tenantId: string; setTenantId: (id: string) => void; resolving: boolean } {
  const [tenant, setTenant] = useState<ResolvedTenant | null>(null);
  const [tenantId, setTenantIdState] = useState('');
  const [resolving, setResolving] = useState(true);

  const setTenantId = (id: string) => {
    setTenantIdState(id);
    try { if (id) localStorage.setItem(STORAGE_KEY, id); } catch { /* ignore */ }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const q = new URLSearchParams(window.location.search);
        const fromQuery = q.get('tenant');
        if (fromQuery) { setTenantId(fromQuery); return; }
        const host = window.location.host;
        const t = await apiFetch<ResolvedTenant>(`/api/v1/tenant/resolve?host=${encodeURIComponent(host)}`).catch(() => null);
        if (cancelled) return;
        if (t?.id) { setTenant(t); setTenantId(t.id); return; }
        const remembered = localStorage.getItem(STORAGE_KEY) || '';
        if (remembered) setTenantIdState(remembered);
      } catch { /* ignore */ } finally {
        if (!cancelled) setResolving(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { tenant, tenantId, setTenantId, resolving };
}
