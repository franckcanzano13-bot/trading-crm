'use client';
import { create } from 'zustand';

type ClientPage = 'dashboard' | 'trade' | 'deposit' | 'history' | 'profile' | 'feed' | 'copy' | 'alerts' | 'help';

interface NavigationState {
  currentPage: ClientPage;
  setPage: (page: ClientPage) => void;
}

export const useNavigationStore = create<NavigationState>((set) => ({
  currentPage: 'dashboard',
  setPage: (page) => set({ currentPage: page }),
}));
