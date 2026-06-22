import { describe, it, expect } from 'vitest';
import { generatePaperResult } from '../index';

describe('Execution - Paper Trading Mode', () => {
  it('generates a synthetic signature with paper_ prefix', () => {
    const result = generatePaperResult(
      'So11111111111111111111111111111111111111112',
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      1.5,
    );

    expect(result.signature).toMatch(/^paper_/);
    expect(result.signature.length).toBeGreaterThan(10);
  });

  it('generates a realistic output amount', () => {
    const result = generatePaperResult(
      'So11111111111111111111111111111111111111112',
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      1.0,
    );

    const amountOut = parseInt(result.amountOut, 10);
    // Should be around 1e9 lamports (1 SOL) with small slippage variation
    expect(amountOut).toBeGreaterThan(0.99 * 1e9);
    expect(amountOut).toBeLessThan(1.01 * 1e9);
  });

  it('generates latency between 50-250ms', () => {
    const results = Array.from({ length: 100 }, () =>
      generatePaperResult('mint1', 'mint2', 1.0),
    );

    for (const result of results) {
      expect(result.latencyMs).toBeGreaterThanOrEqual(50);
      expect(result.latencyMs).toBeLessThan(250);
    }
  });

  it('generates unique signatures for each call', () => {
    const result1 = generatePaperResult('mint1', 'mint2', 1.0);
    const result2 = generatePaperResult('mint1', 'mint2', 1.0);

    expect(result1.signature).not.toBe(result2.signature);
  });

  it('scales output amount proportionally to input amount', () => {
    // Run multiple times and check average is proportional
    const results1Sol = Array.from({ length: 50 }, () =>
      parseInt(generatePaperResult('mint1', 'mint2', 1.0).amountOut, 10),
    );
    const results2Sol = Array.from({ length: 50 }, () =>
      parseInt(generatePaperResult('mint1', 'mint2', 2.0).amountOut, 10),
    );

    const avg1 = results1Sol.reduce((a, b) => a + b, 0) / results1Sol.length;
    const avg2 = results2Sol.reduce((a, b) => a + b, 0) / results2Sol.length;

    // The 2 SOL average should be roughly 2x the 1 SOL average
    const ratio = avg2 / avg1;
    expect(ratio).toBeGreaterThan(1.8);
    expect(ratio).toBeLessThan(2.2);
  });
});
