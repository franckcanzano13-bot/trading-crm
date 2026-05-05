'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type AccountMode = 'real' | 'demo';

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: { id: string; email: string; name: string; role?: string } | null;
  tenantId: string | null;
  executionMode: string | null; // A_BOOK, B_BOOK, B_BOOK_DEALER
  isAuthenticated: boolean;
  accountMode: AccountMode;
  demoBalance: number;
  isDealerManaged: boolean;
  login: (data: { token: string; refreshToken: string; user: any; tenantId: string; execution_mode?: string }) => void;
  logout: () => void;
  setTenantId: (id: string) => void;
  setAccountMode: (mode: AccountMode) => void;
  setExecutionMode: (mode: string) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      refreshToken: null,
      user: null,
      tenantId: null,
      executionMode: null,
      isAuthenticated: false,
      accountMode: 'real',
      demoBalance: 10000000, // $100,000 in cents
      isDealerManaged: false,
      login: (data) =>
        set({
          token: data.token,
          refreshToken: data.refreshToken,
          user: data.user,
          tenantId: data.tenantId,
          executionMode: data.execution_mode || null,
          isDealerManaged: data.execution_mode === 'B_BOOK_DEALER',
          isAuthenticated: true,
        }),
      logout: () =>
        set({
          token: null,
          refreshToken: null,
          user: null,
          executionMode: null,
          isDealerManaged: false,
          isAuthenticated: false,
        }),
      setTenantId: (id) => set({ tenantId: id }),
      setAccountMode: (mode) => set({ accountMode: mode }),
      setExecutionMode: (mode) => set({ executionMode: mode, isDealerManaged: mode === 'B_BOOK_DEALER' }),
    }),
    { name: 'tradexlabel-auth' }
  )
);
