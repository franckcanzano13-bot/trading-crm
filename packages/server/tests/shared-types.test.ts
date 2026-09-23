import { describe, it, expect } from 'vitest';
import {
  RegisterSchema,
  LoginSchema,
  CreateOrderSchema,
  DealerInterventionSchema,
} from '@tradexlabel/shared';

describe('Validation Schemas', () => {
  describe('RegisterSchema', () => {
    it('accepts valid registration data', () => {
      const result = RegisterSchema.safeParse({
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
        accept_terms: true, // Phase 1.13
      });
      expect(result.success).toBe(true);
    });

    it('rejects registration without explicit terms acceptance (Phase 1.13)', () => {
      expect(RegisterSchema.safeParse({ email: 'test@example.com', password: 'password123', name: 'Test User' }).success).toBe(false);
      expect(RegisterSchema.safeParse({ email: 'test@example.com', password: 'password123', name: 'Test User', accept_terms: false }).success).toBe(false);
    });

    it('rejects invalid email', () => {
      const result = RegisterSchema.safeParse({
        email: 'invalid',
        password: 'password123',
        name: 'Test User',
      });
      expect(result.success).toBe(false);
    });

    it('rejects short password', () => {
      const result = RegisterSchema.safeParse({
        email: 'test@example.com',
        password: '123',
        name: 'Test User',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('LoginSchema', () => {
    it('accepts valid login data', () => {
      const result = LoginSchema.safeParse({
        email: 'test@example.com',
        password: 'password123',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('CreateOrderSchema', () => {
    it('accepts valid market order', () => {
      const result = CreateOrderSchema.safeParse({
        symbol: 'EURUSD',
        side: 'BUY',
        type: 'MARKET',
        volume: 1.0,
      });
      expect(result.success).toBe(true);
    });

    it('accepts order with SL/TP', () => {
      const result = CreateOrderSchema.safeParse({
        symbol: 'EURUSD',
        side: 'SELL',
        type: 'LIMIT',
        volume: 0.5,
        price: 1.0900,
        stop_loss: 1.0950,
        take_profit: 1.0800,
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid volume', () => {
      const result = CreateOrderSchema.safeParse({
        symbol: 'EURUSD',
        side: 'BUY',
        type: 'MARKET',
        volume: -1,
      });
      expect(result.success).toBe(false);
    });

    it('rejects volume over 100', () => {
      const result = CreateOrderSchema.safeParse({
        symbol: 'EURUSD',
        side: 'BUY',
        type: 'MARKET',
        volume: 101,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('DealerInterventionSchema', () => {
    it('accepts valid intervention', () => {
      const result = DealerInterventionSchema.safeParse({
        action: 'SLIPPAGE',
        modified_price: 1.0855,
        reason: 'Market volatility',
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing reason', () => {
      const result = DealerInterventionSchema.safeParse({
        action: 'SLIPPAGE',
      });
      expect(result.success).toBe(false);
    });
  });
});
