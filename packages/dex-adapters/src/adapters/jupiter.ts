import { DexAdapter, DexName, TransactionWithMeta, ParsedTradeEvent } from '@copy-trading/shared-types';

const JUPITER_V6_PROGRAM_ID = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';

export class JupiterAdapter implements DexAdapter {
  name = DexName.JUPITER;
  programIds = [JUPITER_V6_PROGRAM_ID];

  canParse(tx: TransactionWithMeta): boolean {
    const accountKeys = tx.transaction.message.accountKeys;
    return accountKeys.includes(JUPITER_V6_PROGRAM_ID);
  }

  async parse(tx: TransactionWithMeta, traderId: string): Promise<ParsedTradeEvent> {
    const meta = tx.meta;
    if (!meta) {
      throw new Error('Transaction meta is null');
    }

    const { tokenIn, tokenOut, amountIn, amountOut } = this.extractTokenDiffs(meta, traderId, tx);

    return {
      traderId,
      signature: tx.signature,
      slot: tx.slot,
      timestamp: new Date(tx.blockTime * 1000),
      tokenIn,
      tokenOut,
      amountIn,
      amountOut,
      dex: DexName.JUPITER,
    };
  }

  private extractTokenDiffs(
    meta: NonNullable<TransactionWithMeta['meta']>,
    owner: string,
    _tx: TransactionWithMeta,
  ) {
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
