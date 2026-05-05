'use client';
import { useAuthStore } from '@/stores/auth-store';
import { LoginPage } from '@/components/auth/login-page';
import { ClientLayout } from '@/components/client/client-layout';

export default function Home() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return <ClientLayout />;
}
