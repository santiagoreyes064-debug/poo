import { DexAdapter, DexName, TransactionWithMeta, ParsedTradeEvent } from '@copy-trading/shared-types';

const ORCA_WHIRLPOOL = 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc';

export class OrcaAdapter implements DexAdapter {
  name = DexName.ORCA;
  programIds = [ORCA_WHIRLPOOL];

  canParse(tx: TransactionWithMeta): boolean {
    const accountKeys = tx.transaction.message.accountKeys;
    return accountKeys.includes(ORCA_WHIRLPOOL);
  }

  async parse(tx: TransactionWithMeta, traderId: string): Promise<ParsedTradeEvent> {
    const meta = tx.meta;
    if (!meta) {
      throw new Error('Transaction meta is null');
    }

    const { tokenIn, tokenOut, amountIn, amountOut } = this.extractTokenDiffs(meta, traderId);

    return {
      traderId,
      signature: tx.signature,
      slot: tx.slot,
      timestamp: new Date(tx.blockTime * 1000),
      tokenIn,
      tokenOut,
      amountIn,
      amountOut,
      dex: DexName.ORCA,
    };
  }

  private extractTokenDiffs(meta: NonNullable<TransactionWithMeta['meta']>, owner: string) {
    const preBalances = meta.preTokenBalances;
    const postBalances = meta.postTokenBalances;

    let tokenIn = '';
    let tokenOut = '';
    let amountIn = '0';
    let amountOut = '0';

    for (const post of postBalances) {
      if (post.owner !== owner) continue;
      const pre = preBalances.find(
        (p) => p.mint === post.mint && p.owner === owner,
      );
      const preAmount = BigInt(pre?.uiTokenAmount.amount ?? '0');
      const postAmount = BigInt(post.uiTokenAmount.amount);
      const diff = postAmount - preAmount;

      if (diff < 0n) {
        tokenIn = post.mint;
        amountIn = (-diff).toString();
      } else if (diff > 0n) {
        tokenOut = post.mint;
        amountOut = diff.toString();
      }
    }

    return { tokenIn, tokenOut, amountIn, amountOut };
  }
}
