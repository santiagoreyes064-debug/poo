import { describe, it, expect } from 'vitest';
import { TransactionWithMeta, DexName } from '@copy-trading/shared-types';
import { DexAdapterRegistry } from '@copy-trading/dex-adapters';

const JUPITER_PROGRAM = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';
const RAYDIUM_PROGRAM = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';
const ORCA_PROGRAM = 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc';
const METEORA_PROGRAM = 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo';

function createMockTx(programId: string): TransactionWithMeta {
  return {
    signature: 'test-sig-' + Math.random().toString(36).slice(2),
    slot: 123456,
    blockTime: Math.floor(Date.now() / 1000),
    transaction: {
      message: {
        accountKeys: ['owner-wallet', programId, 'token-program'],
        instructions: [
          { programIdIndex: 1, accounts: [0, 2], data: 'base64data' },
        ],
      },
    },
    meta: {
      preTokenBalances: [
        {
          accountIndex: 0,
          mint: 'So11111111111111111111111111111111111111112',
          owner: 'owner-wallet',
          uiTokenAmount: { amount: '1000000000', decimals: 9, uiAmount: 1.0 },
        },
      ],
      postTokenBalances: [
        {
          accountIndex: 0,
          mint: 'So11111111111111111111111111111111111111112',
          owner: 'owner-wallet',
          uiTokenAmount: { amount: '500000000', decimals: 9, uiAmount: 0.5 },
        },
        {
          accountIndex: 0,
          mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          owner: 'owner-wallet',
          uiTokenAmount: { amount: '50000000', decimals: 6, uiAmount: 50.0 },
        },
      ],
      err: null,
    },
  };
}

describe('DEX Detection Logic', () => {
  const registry = new DexAdapterRegistry();

  it('detects Jupiter transactions', () => {
    const tx = createMockTx(JUPITER_PROGRAM);
    const adapter = registry.findAdapter(tx);
    expect(adapter).toBeDefined();
    expect(adapter!.name).toBe(DexName.JUPITER);
  });

  it('detects Raydium transactions', () => {
    const tx = createMockTx(RAYDIUM_PROGRAM);
    const adapter = registry.findAdapter(tx);
    expect(adapter).toBeDefined();
    expect(adapter!.name).toBe(DexName.RAYDIUM);
  });

  it('detects Orca transactions', () => {
    const tx = createMockTx(ORCA_PROGRAM);
    const adapter = registry.findAdapter(tx);
    expect(adapter).toBeDefined();
    expect(adapter!.name).toBe(DexName.ORCA);
  });

  it('detects Meteora transactions', () => {
    const tx = createMockTx(METEORA_PROGRAM);
    const adapter = registry.findAdapter(tx);
    expect(adapter).toBeDefined();
    expect(adapter!.name).toBe(DexName.METEORA);
  });

  it('returns undefined for unknown DEX', () => {
    const tx = createMockTx('UnknownProgramId111111111111111111111111111');
    const adapter = registry.findAdapter(tx);
    expect(adapter).toBeUndefined();
  });

  it('parses Jupiter trade correctly', async () => {
    const tx = createMockTx(JUPITER_PROGRAM);
    const result = await registry.parse(tx, 'owner-wallet');
    expect(result).toBeDefined();
    expect(result!.dex).toBe(DexName.JUPITER);
    expect(result!.traderId).toBe('owner-wallet');
    expect(result!.tokenIn).toBe('So11111111111111111111111111111111111111112');
    expect(result!.tokenOut).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    expect(result!.amountIn).toBe('500000000');
    expect(result!.amountOut).toBe('50000000');
  });

  it('returns null for non-DEX transactions', async () => {
    const tx = createMockTx('UnknownProgramId111111111111111111111111111');
    const result = await registry.parse(tx, 'trader-1');
    expect(result).toBeNull();
  });
});
