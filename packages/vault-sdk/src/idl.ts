import type { Idl } from "@coral-xyz/anchor";

export const VAULT_PROGRAM_ID = "VLT1111111111111111111111111111111111111111";

export const VaultIDL: Idl = {
  version: "0.1.0",
  name: "vault",
  instructions: [
    {
      name: "initializeVault",
      accounts: [
        { name: "vault", isMut: true, isSigner: false },
        { name: "authority", isMut: true, isSigner: true },
        { name: "systemProgram", isMut: false, isSigner: false },
      ],
      args: [{ name: "executor", type: "publicKey" }],
    },
    {
      name: "deposit",
      accounts: [
        { name: "vault", isMut: true, isSigner: false },
        { name: "authority", isMut: true, isSigner: true },
        { name: "systemProgram", isMut: false, isSigner: false },
      ],
      args: [{ name: "amount", type: "u64" }],
    },
    {
      name: "withdraw",
      accounts: [
        { name: "vault", isMut: true, isSigner: false },
        { name: "authority", isMut: true, isSigner: true },
        { name: "systemProgram", isMut: false, isSigner: false },
      ],
      args: [{ name: "amount", type: "u64" }],
    },
    {
      name: "updateRiskParams",
      accounts: [
        { name: "vault", isMut: true, isSigner: false },
        { name: "authority", isMut: false, isSigner: true },
      ],
      args: [
        { name: "maxTradeSize", type: "u64" },
        { name: "maxDailyLoss", type: "u64" },
        { name: "maxSlippageBps", type: "u16" },
        { name: "maxOpenPositions", type: "u8" },
      ],
    },
    {
      name: "updateVaultConfig",
      accounts: [
        { name: "vault", isMut: false, isSigner: false },
        { name: "vaultConfig", isMut: true, isSigner: false },
        { name: "authority", isMut: true, isSigner: true },
        { name: "systemProgram", isMut: false, isSigner: false },
      ],
      args: [
        { name: "allowedDexs", type: { vec: "publicKey" } },
        { name: "tokenBlacklist", type: { vec: "publicKey" } },
      ],
    },
    {
      name: "pauseVault",
      accounts: [
        { name: "vault", isMut: true, isSigner: false },
        { name: "authority", isMut: false, isSigner: true },
      ],
      args: [],
    },
    {
      name: "resumeVault",
      accounts: [
        { name: "vault", isMut: true, isSigner: false },
        { name: "authority", isMut: false, isSigner: true },
      ],
      args: [],
    },
    {
      name: "executeTrade",
      accounts: [
        { name: "vault", isMut: true, isSigner: false },
        { name: "vaultConfig", isMut: false, isSigner: false },
        { name: "executor", isMut: false, isSigner: true },
        { name: "tradeDestination", isMut: true, isSigner: false },
        { name: "systemProgram", isMut: false, isSigner: false },
      ],
      args: [
        { name: "tradeAmount", type: "u64" },
        { name: "tokenMint", type: "publicKey" },
        { name: "dexProgram", type: "publicKey" },
      ],
    },
    {
      name: "closePosition",
      accounts: [
        { name: "vault", isMut: true, isSigner: false },
        { name: "executor", isMut: false, isSigner: true },
        { name: "returnSource", isMut: true, isSigner: false },
        { name: "systemProgram", isMut: false, isSigner: false },
      ],
      args: [{ name: "returnedAmount", type: "u64" }],
    },
  ],
  accounts: [
    {
      name: "VaultAccount",
      type: {
        kind: "struct" as const,
        fields: [
          { name: "authority", type: "publicKey" },
          { name: "executor", type: "publicKey" },
          { name: "depositedSol", type: "u64" },
          { name: "availableSol", type: "u64" },
          { name: "maxTradeSize", type: "u64" },
          { name: "maxDailyLoss", type: "u64" },
          { name: "maxSlippageBps", type: "u16" },
          { name: "maxOpenPositions", type: "u8" },
          { name: "currentOpenPositions", type: "u8" },
          { name: "dailyLossCounter", type: "u64" },
          { name: "dailyLossResetSlot", type: "u64" },
          { name: "isPaused", type: "bool" },
          { name: "bump", type: "u8" },
        ],
      },
    },
    {
      name: "VaultConfig",
      type: {
        kind: "struct" as const,
        fields: [
          { name: "vault", type: "publicKey" },
          { name: "allowedDexs", type: { vec: "publicKey" } },
          { name: "tokenBlacklist", type: { vec: "publicKey" } },
        ],
      },
    },
  ],
  errors: [
    { code: 6000, name: "VaultPaused", msg: "Vault is paused" },
    { code: 6001, name: "UnauthorizedExecutor", msg: "Unauthorized executor" },
    {
      code: 6002,
      name: "MaxTradeSizeExceeded",
      msg: "Trade size exceeds maximum allowed",
    },
    {
      code: 6003,
      name: "DailyLossLimitReached",
      msg: "Daily loss limit reached",
    },
    {
      code: 6004,
      name: "SlippageExceeded",
      msg: "Slippage exceeds maximum allowed",
    },
    {
      code: 6005,
      name: "MaxOpenPositionsReached",
      msg: "Maximum open positions reached",
    },
    { code: 6006, name: "DexNotAllowed", msg: "DEX program not in allowed list" },
    { code: 6007, name: "TokenBlacklisted", msg: "Token is blacklisted" },
    {
      code: 6008,
      name: "InsufficientVaultBalance",
      msg: "Insufficient vault balance",
    },
    { code: 6009, name: "InvalidAuthority", msg: "Invalid authority" },
    {
      code: 6010,
      name: "InvalidTradeDestination",
      msg: "Trade destination not owned by the specified DEX program",
    },
    { code: 6011, name: "NoOpenPositions", msg: "No open positions to close" },
  ],
};
