'use client';
import { useEffect, useRef, useState } from 'react';
import { Position, PriceTick } from '@/stores/trading-store';

export interface SimulatedTrade {
  tradeId: string;
  currentPnlCents: number;
  openPrice: number;
}

/** Seeded PRNG (mulberry32) */
function seededRng(seed: number) {
  let t = seed + 0x6d2b79f5;
  return () => {
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

interface TradeState {
  rng: () => number;
  currentPnl: number;
  startTime: number;
  momentum: number;
}

const TICK_MS = 1000;

/**
 * Dealer trade P&L simulation.
 * Does NOT depend on WebSocket prices — runs purely on time + target.
 */
export function useTradeSimulation(
  positions: Position[],
  _prices: Map<string, PriceTick>,
) {
  const [simulations, setSimulations] = useState<Map<string, SimulatedTrade>>(new Map());
  const stateRef = useRef<Map<string, TradeState>>(new Map());
  const positionsRef = useRef(positions);
  positionsRef.current = positions;

  useEffect(() => {
    const doTick = () => {
      const currentPositions = positionsRef.current;

      setSimulations((prev) => {
        const next = new Map(prev);

        for (const pos of currentPositions) {
          const investCents = parseFloat(pos.swap || '0');
          if (investCents <= 0) continue;

          const openPrice = Number(pos.open_price) / 100000;

          // Init state
          let state = stateRef.current.get(pos.id);
          if (!state) {
            const seed = hashString(pos.id);
            state = { rng: seededRng(seed), currentPnl: 0, startTime: Date.now(), momentum: 0 };
            stateRef.current.set(pos.id, state);
          }

          const rng = state.rng;
          const now = Date.now();

          const hasTarget = pos.pnl_target !== null && pos.pnl_target !== undefined;
          const targetPnl = hasTarget ? parseFloat(pos.pnl_target!) : 0;
          const hasSchedule = pos.scheduled_close_at !== null && pos.scheduled_close_at !== undefined;

          let pnlCents: number;

          if (hasTarget && hasSchedule) {
            // ─── GUIDED: dynamic oscillation toward target ───
            const closeTime = new Date(pos.scheduled_close_at!).getTime();
            const openTime = state.startTime;
            const totalDuration = closeTime - openTime;
            const elapsed = now - openTime;
            const progress = Math.min(elapsed / Math.max(totalDuration, 1000), 1);

            const expectedPnl = targetPnl * progress;

            // Big visible swings — scale with invest amount
            // For $1000 invest → baseSwing = $80, so each tick moves $20-80
            const baseSwing = investCents * 0.08;
            const remainingFactor = Math.max(1 - progress, 0.05);

            // Momentum: 40% carried from previous tick for smooth oscillation
            const newForce = (rng() - 0.5) * baseSwing * remainingFactor;
            state.momentum = state.momentum * 0.4 + newForce * 0.6;

            // Occasional big jumps (10% chance, 3x amplitude)
            const bigJump = rng() < 0.1 ? (rng() - 0.5) * baseSwing * 2 : 0;

            // Pull toward expected path — gentle at start, strong near end
            const pullStrength = 0.05 + progress * 0.15;
            const drift = (expectedPnl - state.currentPnl) * pullStrength;

            state.currentPnl += state.momentum + bigJump + drift;

            // Last 10% of duration: converge to target
            if (progress >= 0.9) {
              const finalBlend = (progress - 0.9) / 0.1;
              state.currentPnl = state.currentPnl * (1 - finalBlend * 0.3) + targetPnl * (finalBlend * 0.3);
            }

            pnlCents = Math.round(state.currentPnl);
          } else {
            // ─── FREE: random walk, no target ───
            const baseSwing = investCents * 0.08;
            const newForce = (rng() - 0.5) * baseSwing;
            state.momentum = state.momentum * 0.4 + newForce * 0.6;
            const revert = -state.currentPnl * 0.02;
            state.currentPnl += state.momentum + revert;

            pnlCents = Math.round(state.currentPnl);
          }

          next.set(pos.id, {
            tradeId: pos.id,
            currentPnlCents: pnlCents,
            openPrice,
          });
        }

        // Clean up closed trades
        const posIds = new Set(currentPositions.map((p) => p.id));
        Array.from(next.keys()).forEach((id) => {
          if (!posIds.has(id)) {
            next.delete(id);
            stateRef.current.delete(id);
          }
        });

        return next;
      });
    };

    doTick();
    const interval = setInterval(doTick, TICK_MS);
    return () => clearInterval(interval);
  }, []);

  return simulations;
}
