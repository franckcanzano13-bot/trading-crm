'use client';
import { useEffect, useRef, useCallback } from 'react';
import { useTradingStore } from '@/stores/trading-store';

export function usePriceWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const updatePrice = useTradingStore((s) => s.updatePrice);
  const setPrices = useTradingStore((s) => s.setPrices);

  const connect = useCallback(() => {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
    let wsUrl: string;
    if (apiBase) {
      // Use the API server for WebSocket (e.g. http://localhost:3001 → ws://localhost:3001)
      wsUrl = apiBase.replace(/^http/, 'ws') + '/ws/prices';
    } else {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${protocol}//${window.location.host}/ws/prices`;
    }

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('Price WebSocket connected');
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'snapshot' && Array.isArray(msg.data)) {
          setPrices(msg.data);
        } else if (msg.type === 'tick' && msg.data) {
          updatePrice(msg.data);
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      console.log('Price WebSocket disconnected, reconnecting...');
      setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [updatePrice, setPrices]);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect]);

  const subscribe = useCallback((symbols: string[]) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'subscribe', symbols }));
    }
  }, []);

  return { subscribe };
}
