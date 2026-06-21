import { DexAdapter, TransactionWithMeta, ParsedTradeEvent, DexName } from '@copy-trading/shared-types';
import { JupiterAdapter } from './adapters/jupiter';
import { RaydiumAdapter } from './adapters/raydium';
import { OrcaAdapter } from './adapters/orca';
import { MeteoraAdapter } from './adapters/meteora';

export class DexAdapterRegistry {
  private adapters: DexAdapter[] = [];

  constructor() {
    this.register(new JupiterAdapter());
    this.register(new RaydiumAdapter());
    this.register(new OrcaAdapter());
    this.register(new MeteoraAdapter());
  }

  register(adapter: DexAdapter): void {
    this.adapters.push(adapter);
  }

  findAdapter(tx: TransactionWithMeta): DexAdapter | undefined {
    return this.adapters.find((adapter) => adapter.canParse(tx));
  }

  async parse(tx: TransactionWithMeta, traderId: string): Promise<ParsedTradeEvent | null> {
    const adapter = this.findAdapter(tx);
    if (!adapter) {
      return null;
    }
    return adapter.parse(tx, traderId);
  }

  getAdapterByName(name: DexName): DexAdapter | undefined {
    return this.adapters.find((adapter) => adapter.name === name);
  }

  getAllAdapters(): DexAdapter[] {
    return [...this.adapters];
  }
}

export { JupiterAdapter } from './adapters/jupiter';
export { RaydiumAdapter } from './adapters/raydium';
export { OrcaAdapter } from './adapters/orca';
export { MeteoraAdapter } from './adapters/meteora';
