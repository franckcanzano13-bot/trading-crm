import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(price: number, decimals = 5): string {
  return price.toFixed(decimals);
}

export function formatCurrency(cents: string | number): string {
  const value = typeof cents === 'string' ? parseFloat(cents) : cents;
  return (value / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatPnl(cents: string | number): { text: string; color: string } {
  const value = typeof cents === 'string' ? parseFloat(cents) : cents;
  const dollars = value / 100;
  const text = dollars >= 0 ? `+$${dollars.toFixed(2)}` : `-$${Math.abs(dollars).toFixed(2)}`;
  const color = dollars >= 0 ? 'text-buy' : 'text-sell';
  return { text, color };
}
