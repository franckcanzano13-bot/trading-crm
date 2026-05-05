const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

interface FetchOptions extends RequestInit {
  token?: string;
  tenantId?: string;
}

// Token refresh logic
let isRefreshing = false;
let refreshPromise: Promise<void> | null = null;

function getAuthStore() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('tradexlabel-auth');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function updateAuthStore(token: string, refreshToken: string) {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem('tradexlabel-auth');
    if (!raw) return;
    const store = JSON.parse(raw);
    store.state.token = token;
    store.state.refreshToken = refreshToken;
    localStorage.setItem('tradexlabel-auth', JSON.stringify(store));
  } catch {}
}

function clearAuthStore() {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem('tradexlabel-auth');
    if (!raw) return;
    const store = JSON.parse(raw);
    store.state.token = null;
    store.state.refreshToken = null;
    store.state.user = null;
    store.state.isAuthenticated = false;
    localStorage.setItem('tradexlabel-auth', JSON.stringify(store));
    // Trigger page reload to go back to login
    window.location.reload();
  } catch {}
}

async function tryRefreshToken(): Promise<boolean> {
  const store = getAuthStore();
  if (!store?.state?.refreshToken) return false;

  try {
    const response = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${store.state.refreshToken}`,
      },
    });

    if (!response.ok) return false;

    const data = await response.json();
    if (data.data?.token) {
      updateAuthStore(data.data.token, data.data.refreshToken);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function apiFetch<T = any>(path: string, options: FetchOptions = {}): Promise<T> {
  const { token, tenantId, ...fetchOpts } = options;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  // Use the latest token from store (might have been refreshed)
  const currentStore = getAuthStore();
  const activeToken = token || currentStore?.state?.token;

  if (activeToken) headers['Authorization'] = `Bearer ${activeToken}`;
  if (tenantId) headers['X-Tenant-ID'] = tenantId;

  const response = await fetch(`${API_BASE}${path}`, {
    ...fetchOpts,
    headers,
  });

  // If 401 and we have a refresh token, try to refresh
  if (response.status === 401 && activeToken && !path.includes('/auth/refresh') && !path.includes('/auth/login')) {
    if (!isRefreshing) {
      isRefreshing = true;
      refreshPromise = tryRefreshToken().then((success) => {
        isRefreshing = false;
        refreshPromise = null;
        if (!success) {
          clearAuthStore();
        }
      });
    }

    if (refreshPromise) {
      await refreshPromise;
    }

    // Retry with new token
    const newStore = getAuthStore();
    if (newStore?.state?.token && newStore.state.token !== activeToken) {
      headers['Authorization'] = `Bearer ${newStore.state.token}`;
      const retryResponse = await fetch(`${API_BASE}${path}`, {
        ...fetchOpts,
        headers,
      });
      const retryData = await retryResponse.json();
      if (!retryResponse.ok) {
        throw new Error(retryData.error || 'Request failed');
      }
      return retryData.data;
    }

    // Refresh failed, throw
    const data = await response.json();
    throw new Error(data.error || 'Unauthorized');
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data.data;
}

// ─── Auth API ───
export const authApi = {
  register: (tenantId: string, body: { email: string; password: string; name: string }) =>
    apiFetch('/api/v1/auth/register', { method: 'POST', body: JSON.stringify(body), tenantId }),

  login: (tenantId: string, body: { email: string; password: string }) =>
    apiFetch('/api/v1/auth/login', { method: 'POST', body: JSON.stringify(body), tenantId }),

  me: (token: string, tenantId: string) =>
    apiFetch('/api/v1/auth/me', { token, tenantId }),

  refresh: (token: string) =>
    apiFetch('/api/v1/auth/refresh', { method: 'POST', token }),
};

// ─── Trading API ───
export const tradingApi = {
  getInstruments: (token: string, tenantId: string) =>
    apiFetch('/api/v1/instruments', { token, tenantId }),

  getCandles: (token: string, tenantId: string, symbol: string, timeframe = '1h', limit = 500) =>
    apiFetch(`/api/v1/instruments/${symbol}/candles?timeframe=${timeframe}&limit=${limit}`, { token, tenantId }),

  placeOrder: (token: string, tenantId: string, order: any) =>
    apiFetch('/api/v1/orders', { method: 'POST', body: JSON.stringify(order), token, tenantId }),

  cancelOrder: (token: string, tenantId: string, orderId: string) =>
    apiFetch(`/api/v1/orders/${orderId}`, { method: 'DELETE', token, tenantId }),

  getPositions: (token: string, tenantId: string) =>
    apiFetch('/api/v1/positions', { token, tenantId }),

  closePosition: (token: string, tenantId: string, tradeId: string) =>
    apiFetch(`/api/v1/positions/${tradeId}/close`, { method: 'POST', token, tenantId, body: '{}' }),

  updateSLTP: (token: string, tenantId: string, tradeId: string, data: { stop_loss?: number | null; take_profit?: number | null }) =>
    apiFetch(`/api/v1/positions/${tradeId}/sltp`, { method: 'PATCH', body: JSON.stringify(data), token, tenantId }),

  getTradeHistory: (token: string, tenantId: string) =>
    apiFetch('/api/v1/trades/history', { token, tenantId }),
};

// ─── Account API ───
export const accountApi = {
  getAccount: (token: string, tenantId: string) =>
    apiFetch('/api/v1/account', { token, tenantId }),

  getTransactions: (token: string, tenantId: string) =>
    apiFetch('/api/v1/account/transactions', { token, tenantId }),
};

// ─── Admin API ───
export const adminApi = {
  login: (body: { email: string; password: string; tenant_id: string }) =>
    apiFetch('/api/v1/admin/login', { method: 'POST', body: JSON.stringify(body) }),

  getDashboard: (token: string, tenantId: string) =>
    apiFetch('/api/v1/admin/dashboard', { token, tenantId }),

  getClients: (token: string, tenantId: string) =>
    apiFetch('/api/v1/admin/clients', { token, tenantId }),

  updateClient: (token: string, tenantId: string, id: string, data: any) =>
    apiFetch(`/api/v1/admin/clients/${id}`, { method: 'PATCH', body: JSON.stringify(data), token, tenantId }),

  getInstruments: (token: string, tenantId: string) =>
    apiFetch('/api/v1/admin/instruments', { token, tenantId }),

  updateInstrument: (token: string, tenantId: string, id: string, data: any) =>
    apiFetch(`/api/v1/admin/instruments/${id}`, { method: 'PATCH', body: JSON.stringify(data), token, tenantId }),

  deposit: (token: string, tenantId: string, accountId: string, amount: number) =>
    apiFetch(`/api/v1/admin/accounts/${accountId}/deposit`, { method: 'POST', body: JSON.stringify({ amount }), token, tenantId }),

  withdraw: (token: string, tenantId: string, accountId: string, amount: number) =>
    apiFetch(`/api/v1/admin/accounts/${accountId}/withdraw`, { method: 'POST', body: JSON.stringify({ amount }), token, tenantId }),

  getPositions: (token: string, tenantId: string) =>
    apiFetch('/api/v1/admin/positions', { token, tenantId }),

  getTransactions: (token: string, tenantId: string) =>
    apiFetch('/api/v1/admin/transactions', { token, tenantId }),

  getTrades: (token: string, tenantId: string) =>
    apiFetch('/api/v1/admin/trades', { token, tenantId }),
};

// ─── SuperAdmin API ───
export const superAdminApi = {
  login: (body: { email: string; password: string }) =>
    apiFetch('/api/v1/super/login', { method: 'POST', body: JSON.stringify(body) }),

  getTenants: (token: string) =>
    apiFetch('/api/v1/super/tenants', { token }),

  createTenant: (token: string, data: any) =>
    apiFetch('/api/v1/super/tenants', { method: 'POST', body: JSON.stringify(data), token }),

  updateTenant: (token: string, id: string, data: any) =>
    apiFetch(`/api/v1/super/tenants/${id}`, { method: 'PATCH', body: JSON.stringify(data), token }),

  getMonitoring: (token: string) =>
    apiFetch('/api/v1/super/monitoring', { token }),

  getAnalytics: (token: string) =>
    apiFetch('/api/v1/super/analytics', { token }),

  getPlans: (token: string) =>
    apiFetch('/api/v1/super/plans', { token }),

  createPlan: (token: string, data: any) =>
    apiFetch('/api/v1/super/plans', { method: 'POST', body: JSON.stringify(data), token }),

  getSubscriptions: (token: string) =>
    apiFetch('/api/v1/super/subscriptions', { token }),

  createSubscription: (token: string, data: any) =>
    apiFetch('/api/v1/super/subscriptions', { method: 'POST', body: JSON.stringify(data), token }),

  getInvoices: (token: string) =>
    apiFetch('/api/v1/super/invoices', { token }),

  markInvoicePaid: (token: string, id: string) =>
    apiFetch(`/api/v1/super/invoices/${id}/pay`, { method: 'PATCH', token }),

  getAuditLogs: (token: string) =>
    apiFetch('/api/v1/super/audit-logs', { token }),
};

// ─── CRM API ───

export const crmApi = {
  // Dashboard
  getDashboard: (token: string, tenantId: string, department?: string) =>
    apiFetch(`/api/v1/crm/dashboard${department ? `?department=${department}` : ''}`, { token, tenantId }),

  // Leads
  getLeads: (token: string, tenantId: string, params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return apiFetch(`/api/v1/crm/leads${qs}`, { token, tenantId });
  },
  getLead: (token: string, tenantId: string, id: string) =>
    apiFetch(`/api/v1/crm/leads/${id}`, { token, tenantId }),
  createLead: (token: string, tenantId: string, data: any) =>
    apiFetch('/api/v1/crm/leads', { method: 'POST', body: JSON.stringify(data), token, tenantId }),
  updateLead: (token: string, tenantId: string, id: string, data: any) =>
    apiFetch(`/api/v1/crm/leads/${id}`, { method: 'PATCH', body: JSON.stringify(data), token, tenantId }),
  deleteLead: (token: string, tenantId: string, id: string) =>
    apiFetch(`/api/v1/crm/leads/${id}`, { method: 'DELETE', token, tenantId }),
  convertLead: (token: string, tenantId: string, id: string, data: any) =>
    apiFetch(`/api/v1/crm/leads/${id}/convert`, { method: 'POST', body: JSON.stringify(data), token, tenantId }),
  bulkAssign: (token: string, tenantId: string, data: any) =>
    apiFetch('/api/v1/crm/leads/bulk-assign', { method: 'POST', body: JSON.stringify(data), token, tenantId }),

  // Notes
  createNote: (token: string, tenantId: string, data: any) =>
    apiFetch('/api/v1/crm/notes', { method: 'POST', body: JSON.stringify(data), token, tenantId }),

  // Calls
  getCalls: (token: string, tenantId: string, params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return apiFetch(`/api/v1/crm/calls${qs}`, { token, tenantId });
  },
  logCall: (token: string, tenantId: string, data: any) =>
    apiFetch('/api/v1/crm/calls', { method: 'POST', body: JSON.stringify(data), token, tenantId }),

  // Tasks
  getTasks: (token: string, tenantId: string, params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return apiFetch(`/api/v1/crm/tasks${qs}`, { token, tenantId });
  },
  createTask: (token: string, tenantId: string, data: any) =>
    apiFetch('/api/v1/crm/tasks', { method: 'POST', body: JSON.stringify(data), token, tenantId }),
  updateTask: (token: string, tenantId: string, id: string, data: any) =>
    apiFetch(`/api/v1/crm/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data), token, tenantId }),

  // Affiliates
  getAffiliates: (token: string, tenantId: string) =>
    apiFetch('/api/v1/crm/affiliates', { token, tenantId }),
  createAffiliate: (token: string, tenantId: string, data: any) =>
    apiFetch('/api/v1/crm/affiliates', { method: 'POST', body: JSON.stringify(data), token, tenantId }),
  updateAffiliate: (token: string, tenantId: string, id: string, data: any) =>
    apiFetch(`/api/v1/crm/affiliates/${id}`, { method: 'PATCH', body: JSON.stringify(data), token, tenantId }),
  getCommissions: (token: string, tenantId: string, affiliateId: string) =>
    apiFetch(`/api/v1/crm/affiliates/${affiliateId}/commissions`, { token, tenantId }),
  updateCommission: (token: string, tenantId: string, id: string, data: any) =>
    apiFetch(`/api/v1/crm/commissions/${id}`, { method: 'PATCH', body: JSON.stringify(data), token, tenantId }),

  // Campaigns
  getCampaigns: (token: string, tenantId: string) =>
    apiFetch('/api/v1/crm/campaigns', { token, tenantId }),
  createCampaign: (token: string, tenantId: string, data: any) =>
    apiFetch('/api/v1/crm/campaigns', { method: 'POST', body: JSON.stringify(data), token, tenantId }),

  // Agents
  getAgents: (token: string, tenantId: string) =>
    apiFetch('/api/v1/crm/agents', { token, tenantId }),

  // KYC
  sendKyc: (token: string, tenantId: string, leadId: string) =>
    apiFetch(`/api/v1/crm/kyc/send/${leadId}`, { method: 'POST', token, tenantId }),
  getKycStatus: (token: string, tenantId: string, leadId: string) =>
    apiFetch(`/api/v1/crm/kyc/status/${leadId}`, { token, tenantId }),
  approveKyc: (token: string, tenantId: string, leadId: string) =>
    apiFetch(`/api/v1/crm/kyc/approve/${leadId}`, { method: 'POST', token, tenantId }),
  rejectKyc: (token: string, tenantId: string, leadId: string, reason: string) =>
    apiFetch(`/api/v1/crm/kyc/reject/${leadId}`, { method: 'POST', body: JSON.stringify({ reason }), token, tenantId }),
  resendKyc: (token: string, tenantId: string, leadId: string, requiredDocuments?: string[]) =>
    apiFetch(`/api/v1/crm/kyc/resend/${leadId}`, { method: 'POST', body: JSON.stringify({ requiredDocuments }), token, tenantId }),

  // Broker Config
  getBrokerConfig: (token: string, tenantId: string) =>
    apiFetch('/api/v1/crm/broker-config', { token, tenantId }),
  updateBrokerConfig: (token: string, tenantId: string, data: any) =>
    apiFetch('/api/v1/crm/broker-config', { method: 'PATCH', body: JSON.stringify(data), token, tenantId }),

  // Email Templates
  getEmailTemplates: (token: string, tenantId: string) =>
    apiFetch('/api/v1/crm/email-templates', { token, tenantId }),
  createEmailTemplate: (token: string, tenantId: string, data: any) =>
    apiFetch('/api/v1/crm/email-templates', { method: 'POST', body: JSON.stringify(data), token, tenantId }),
  updateEmailTemplate: (token: string, tenantId: string, id: string, data: any) =>
    apiFetch(`/api/v1/crm/email-templates/${id}`, { method: 'PATCH', body: JSON.stringify(data), token, tenantId }),
  deleteEmailTemplate: (token: string, tenantId: string, id: string) =>
    apiFetch(`/api/v1/crm/email-templates/${id}`, { method: 'DELETE', token, tenantId }),
  seedEmailTemplates: (token: string, tenantId: string) =>
    apiFetch('/api/v1/crm/email-templates/seed', { method: 'POST', token, tenantId }),

  // Send Email
  sendEmail: (token: string, tenantId: string, data: any) =>
    apiFetch('/api/v1/crm/email/send', { method: 'POST', body: JSON.stringify(data), token, tenantId }),
  getEmailHistory: (token: string, tenantId: string, leadId?: string) => {
    const qs = leadId ? `?lead_id=${leadId}` : '';
    return apiFetch(`/api/v1/crm/email/history${qs}`, { token, tenantId });
  },
  getEmailVariables: (token: string, tenantId: string) =>
    apiFetch('/api/v1/crm/email/variables', { token, tenantId }),

  // Notifications
  getNotifications: (token: string, tenantId: string) =>
    apiFetch('/api/v1/crm/notifications', { token, tenantId }),
  markNotificationsRead: (token: string, tenantId: string, ids?: string[]) =>
    apiFetch('/api/v1/crm/notifications/read', { method: 'PATCH', body: JSON.stringify({ ids }), token, tenantId }),

  // Trades (for Lead Detail)
  getUserTrades: (token: string, tenantId: string, userId: string) =>
    apiFetch(`/api/v1/crm/trades/${userId}`, { token, tenantId }),

  // CSV Export — returns raw text (not JSON)
  exportLeadsCsv: async (token: string, tenantId: string, params?: Record<string, string>) => {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'X-Tenant-ID': tenantId,
    };
    const qs = new URLSearchParams({ format: 'csv', ...(params || {}) }).toString();
    const res = await fetch(`${API_BASE}/api/v1/crm/leads/export?${qs}`, { headers });
    if (!res.ok) throw new Error('Export failed');
    return res.text();
  },

  // IP Geolocation
  getGeo: (token: string, tenantId: string, ip: string) =>
    apiFetch(`/api/v1/crm/geo/${encodeURIComponent(ip)}`, { token, tenantId }),

  // CSV Import — accepts mapped lead objects array
  importLeadsCsv: (token: string, tenantId: string, csv_data: string) =>
    apiFetch('/api/v1/crm/leads/import', { method: 'POST', body: JSON.stringify({ csv_data }), token, tenantId }),
  importLeadsMapped: (token: string, tenantId: string, leads: Record<string, string>[]) =>
    apiFetch('/api/v1/crm/leads/import', { method: 'POST', body: JSON.stringify({ leads }), token, tenantId }),

  // Reports
  getReports: (token: string, tenantId: string) =>
    apiFetch('/api/v1/crm/reports', { token, tenantId }),

  // Bulk Trade
  bulkTrade: (token: string, tenantId: string, data: any) =>
    apiFetch('/api/v1/crm/bulk-trade', { method: 'POST', body: JSON.stringify(data), token, tenantId }),

  // Trade Programs
  getPrograms: (token: string, tenantId: string) =>
    apiFetch('/api/v1/crm/programs', { token, tenantId }),
  createProgram: (token: string, tenantId: string, data: any) =>
    apiFetch('/api/v1/crm/programs', { method: 'POST', body: JSON.stringify(data), token, tenantId }),
  updateProgram: (token: string, tenantId: string, id: string, data: any) =>
    apiFetch(`/api/v1/crm/programs/${id}`, { method: 'PATCH', body: JSON.stringify(data), token, tenantId }),
  executePrograms: (token: string, tenantId: string) =>
    apiFetch('/api/v1/crm/programs/execute', { method: 'POST', token, tenantId }),
};
