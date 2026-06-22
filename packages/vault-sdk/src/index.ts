import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { Program, AnchorProvider, BN, Idl } from "@coral-xyz/anchor";
import { VaultIDL, VAULT_PROGRAM_ID } from "./idl";

export { VaultIDL, VAULT_PROGRAM_ID } from "./idl";

// ============================================================================
// Constants
// ============================================================================

export const PROGRAM_ID = new PublicKey(VAULT_PROGRAM_ID);

const VAULT_SEED = Buffer.from("vault");
const VAULT_CONFIG_SEED = Buffer.from("vault_config");

// ============================================================================
// PDA Derivation
// ============================================================================

/**
 * Derives the vault PDA address for a given authority.
 * Seeds: [b"vault", authority_pubkey]
 */
export function getVaultPDA(authority: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [VAULT_SEED, authority.toBuffer()],
    PROGRAM_ID
  );
}

/**
 * Derives the vault config PDA address for a given vault.
 * Seeds: [b"vault_config", vault_pubkey]
 */
export function getVaultConfigPDA(vault: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [VAULT_CONFIG_SEED, vault.toBuffer()],
    PROGRAM_ID
  );
}

// ============================================================================
// Program Helper
// ============================================================================

function getProgram(provider: AnchorProvider): Program {
  return new Program(VaultIDL as Idl, PROGRAM_ID, provider);
}

// ============================================================================
// SDK Methods
// ============================================================================

/**
 * Creates a new vault for the connected wallet.
 * @param provider - Anchor provider with wallet and connection
 * @param executor - Public key of the authorized executor
 * @returns Transaction signature
 */
export async function createVault(
  provider: AnchorProvider,
  executor: PublicKey
): Promise<string> {
  const program = getProgram(provider);
  const authority = provider.wallet.publicKey;
  const [vaultPDA] = getVaultPDA(authority);

  const tx = await program.methods
    .initializeVault(executor)
    .accounts({
      vault: vaultPDA,
      authority,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return tx;
}

/**
 * Deposits SOL into the vault.
 * @param provider - Anchor provider with wallet and connection
 * @param amount - Amount in lamports to deposit
 * @returns Transaction signature
 */
export async function deposit(
  provider: AnchorProvider,
  amount: BN
): Promise<string> {
  const program = getProgram(provider);
  const authority = provider.wallet.publicKey;
  const [vaultPDA] = getVaultPDA(authority);

  const tx = await program.methods
    .deposit(amount)
    .accounts({
      vault: vaultPDA,
      authority,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return tx;
}

/**
 * Withdraws SOL from the vault back to the authority.
 * @param provider - Anchor provider with wallet and connection
 * @param amount - Amount in lamports to withdraw
 * @returns Transaction signature
 */
export async function withdraw(
  provider: AnchorProvider,
  amount: BN
): Promise<string> {
  const program = getProgram(provider);
  const authority = provider.wallet.publicKey;
  const [vaultPDA] = getVaultPDA(authority);

  const tx = await program.methods
    .withdraw(amount)
    .accounts({
      vault: vaultPDA,
      authority,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return tx;
}

/**
 * Updates risk parameters for the vault.
 * @param provider - Anchor provider with wallet and connection
 * @param params - Risk parameters
 * @returns Transaction signature
 */
export async function updateRiskParams(
  provider: AnchorProvider,
  params: {
    maxTradeSize: BN;
    maxDailyLoss: BN;
    maxSlippageBps: number;
    maxOpenPositions: number;
  }
): Promise<string> {
  const program = getProgram(provider);
  const authority = provider.wallet.publicKey;
  const [vaultPDA] = getVaultPDA(authority);

  const tx = await program.methods
    .updateRiskParams(
      params.maxTradeSize,
      params.maxDailyLoss,
      params.maxSlippageBps,
      params.maxOpenPositions
    )
    .accounts({
      vault: vaultPDA,
      authority,
    })
    .rpc();

  return tx;
}

/**
 * Updates the vault configuration (allowed DEXs and token blacklist).
 * @param provider - Anchor provider with wallet and connection
 * @param allowedDexs - List of allowed DEX program IDs
 * @param tokenBlacklist - List of blacklisted token mints
 * @returns Transaction signature
 */
export async function updateVaultConfig(
  provider: AnchorProvider,
  allowedDexs: PublicKey[],
  tokenBlacklist: PublicKey[]
): Promise<string> {
  const program = getProgram(provider);
  const authority = provider.wallet.publicKey;
  const [vaultPDA] = getVaultPDA(authority);
  const [vaultConfigPDA] = getVaultConfigPDA(vaultPDA);

  const tx = await program.methods
    .updateVaultConfig(allowedDexs, tokenBlacklist)
    .accounts({
      vault: vaultPDA,
      vaultConfig: vaultConfigPDA,
      authority,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return tx;
}

/**
 * Pauses the vault. Only callable by authority.
 * @param provider - Anchor provider with wallet and connection
 * @returns Transaction signature
 */
export async function pauseVault(provider: AnchorProvider): Promise<string> {
  const program = getProgram(provider);
  const authority = provider.wallet.publicKey;
  const [vaultPDA] = getVaultPDA(authority);

  const tx = await program.methods
    .pauseVault()
    .accounts({
      vault: vaultPDA,
      authority,
    })
    .rpc();

  return tx;
}

/**
 * Resumes the vault. Only callable by authority.
 * @param provider - Anchor provider with wallet and connection
 * @returns Transaction signature
 */
export async function resumeVault(provider: AnchorProvider): Promise<string> {
  const program = getProgram(provider);
  const authority = provider.wallet.publicKey;
  const [vaultPDA] = getVaultPDA(authority);

  const tx = await program.methods
    .resumeVault()
    .accounts({
      vault: vaultPDA,
      authority,
    })
    .rpc();

  return tx;
}

/**
 * Builds the execute_trade instruction without sending it.
 * This is used by the execution service to create trade transactions.
 * @param params - Trade execution parameters
 * @returns TransactionInstruction ready to be included in a transaction
 */
export async function buildExecuteTradeInstruction(
  provider: AnchorProvider,
  params: {
    vaultAuthority: PublicKey;
    tradeAmount: BN;
    tokenMint: PublicKey;
    dexProgram: PublicKey;
    tradeDestination: PublicKey;
  }
): Promise<TransactionInstruction> {
  const program = getProgram(provider);
  const [vaultPDA] = getVaultPDA(params.vaultAuthority);
  const [vaultConfigPDA] = getVaultConfigPDA(vaultPDA);

  const ix = await program.methods
    .executeTrade(params.tradeAmount, params.tokenMint, params.dexProgram)
    .accounts({
      vault: vaultPDA,
      vaultConfig: vaultConfigPDA,
      executor: provider.wallet.publicKey,
      tradeDestination: params.tradeDestination,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  return ix;
}

/**
 * Builds the close_position instruction without sending it.
 * Called by the execution service after a trade settles to decrement
 * current_open_positions and return SOL to available_sol.
 * The return_source must be owned by the specified DEX program (same
 * constraint pattern as execute_trade's trade_destination).
 * @param params - Close position parameters
 * @returns TransactionInstruction ready to be included in a transaction
 */
export async function buildClosePositionInstruction(
  provider: AnchorProvider,
  params: {
    vaultAuthority: PublicKey;
    returnedAmount: BN;
    returnSource: PublicKey;
    dexProgram: PublicKey;
  }
): Promise<TransactionInstruction> {
  const program = getProgram(provider);
  const [vaultPDA] = getVaultPDA(params.vaultAuthority);
  const [vaultConfigPDA] = getVaultConfigPDA(vaultPDA);

  const ix = await program.methods
    .closePosition(params.returnedAmount, params.dexProgram)
    .accounts({
      vault: vaultPDA,
      vaultConfig: vaultConfigPDA,
      executor: provider.wallet.publicKey,
      returnSource: params.returnSource,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  return ix;
}

// Re-export useful types
export { BN } from "@coral-xyz/anchor";
export type { AnchorProvider } from "@coral-xyz/anchor";
export { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
