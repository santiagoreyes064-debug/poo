import { describe, it, expect } from 'vitest';
import {
  calculateWinRate,
  calculateSharpeRatio,
  calculateMaxDrawdown,
  calculateAvgHoldTimeSec,
} from '../index';

describe('Analytics Calculations', () => {
  describe('calculateWinRate', () => {
    it('returns 0 for empty array', () => {
      expect(calculateWinRate([])).toBe(0);
    });

    it('returns 1.0 when all trades are profitable', () => {
      expect(calculateWinRate([0.5, 1.0, 0.3, 2.1])).toBe(1.0);
    });

    it('returns 0 when no trades are profitable', () => {
      expect(calculateWinRate([-0.5, -1.0, -0.3])).toBe(0);
    });

    it('calculates correctly for mixed results', () => {
      expect(calculateWinRate([1.0, -0.5, 0.3, -0.2, 0.8])).toBe(3 / 5);
    });

    it('does not count zero PnL as a win', () => {
      expect(calculateWinRate([0, 1.0, -0.5])).toBeCloseTo(1 / 3);
    });
  });

  describe('calculateSharpeRatio', () => {
    it('returns 0 for fewer than 5 data points', () => {
      expect(calculateSharpeRatio([0.01, 0.02, 0.03, -0.01])).toBe(0);
    });

    it('returns 0 when standard deviation is 0', () => {
      expect(calculateSharpeRatio([0.01, 0.01, 0.01, 0.01, 0.01])).toBe(0);
    });

    it('returns positive Sharpe for consistently positive returns', () => {
      const returns = [0.02, 0.03, 0.01, 0.04, 0.02, 0.03, 0.01, 0.02];
      const sharpe = calculateSharpeRatio(returns);
      expect(sharpe).toBeGreaterThan(0);
    });

    it('returns negative Sharpe for consistently negative returns', () => {
      const returns = [-0.02, -0.03, -0.01, -0.04, -0.02, -0.03, -0.01, -0.02];
      const sharpe = calculateSharpeRatio(returns);
      expect(sharpe).toBeLessThan(0);
    });

    it('annualizes using sqrt(252)', () => {
      // With known values we can calculate expected Sharpe
      const returns = [0.01, 0.02, 0.03, 0.01, 0.02]; // mean = 0.018
      const mean = 0.018;
      const variance =
        returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (returns.length - 1);
      const stdDev = Math.sqrt(variance);
      const expectedSharpe = (mean / stdDev) * Math.sqrt(252);

      const result = calculateSharpeRatio(returns);
      expect(result).toBeCloseTo(expectedSharpe, 5);
    });
  });

  describe('calculateMaxDrawdown', () => {
    it('returns 0 for empty array', () => {
      expect(calculateMaxDrawdown([])).toBe(0);
    });

    it('returns 0 for continuously rising returns', () => {
      const returns = [0.1, 0.1, 0.1, 0.1, 0.1];
      expect(calculateMaxDrawdown(returns)).toBe(0);
    });

    it('calculates drawdown for a single drop', () => {
      // Start at 1, goes to 1.1, then drops to 0.99
      const returns = [0.1, -0.1]; // 1 -> 1.1 -> 0.99
      const drawdown = calculateMaxDrawdown(returns);
      // peak = 1.1, trough = 0.99, drawdown = (1.1-0.99)/1.1 = 0.11/1.1 = 0.1
      expect(drawdown).toBeCloseTo((1.1 - 0.99) / 1.1, 5);
    });

    it('calculates correct max drawdown for a complex series', () => {
      // 1 -> 1.1 -> 1.21 -> 0.847 -> 0.9317
      const returns = [0.1, 0.1, -0.3, 0.1];
      const drawdown = calculateMaxDrawdown(returns);
      // Peak at 1.21, trough at 0.847, drawdown = (1.21-0.847)/1.21 = 0.3/1.21 ~ 0.3
      expect(drawdown).toBeCloseTo((1.21 - 0.847) / 1.21, 3);
    });

    it('returns ~1 for total loss', () => {
      const returns = [-0.5, -0.5, -0.5, -0.5]; // approaches 0
      const drawdown = calculateMaxDrawdown(returns);
      expect(drawdown).toBeGreaterThan(0.9);
    });
  });

  describe('calculateAvgHoldTimeSec', () => {
    it('returns 0 for empty array', () => {
      expect(calculateAvgHoldTimeSec([])).toBe(0);
    });

    it('calculates average correctly', () => {
      expect(calculateAvgHoldTimeSec([60, 120, 180])).toBe(120);
    });

    it('handles single element', () => {
      expect(calculateAvgHoldTimeSec([300])).toBe(300);
    });
  });
});
