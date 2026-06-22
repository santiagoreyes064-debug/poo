import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import {
  getVaultPDA,
  getVaultConfigPDA,
  PROGRAM_ID,
  VAULT_PROGRAM_ID,
} from "../index";
import { VaultIDL } from "../idl";

describe("Vault SDK", () => {
  const testAuthority = new PublicKey(
    "11111111111111111111111111111111"
  );
  const testAuthority2 = new PublicKey(
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
  );

  describe("Program ID", () => {
    it("should have a valid program ID", () => {
      expect(PROGRAM_ID).toBeInstanceOf(PublicKey);
      expect(VAULT_PROGRAM_ID).toBe(
        "VLT1111111111111111111111111111111111111111"
      );
    });
  });

  describe("getVaultPDA", () => {
    it("should derive a deterministic vault PDA for a given authority", () => {
      const [pda1, bump1] = getVaultPDA(testAuthority);
      const [pda2, bump2] = getVaultPDA(testAuthority);

      expect(pda1.equals(pda2)).toBe(true);
      expect(bump1).toBe(bump2);
    });

    it("should derive different PDAs for different authorities", () => {
      const [pda1] = getVaultPDA(testAuthority);
      const [pda2] = getVaultPDA(testAuthority2);

      expect(pda1.equals(pda2)).toBe(false);
    });

    it("should return a valid public key", () => {
      const [pda, bump] = getVaultPDA(testAuthority);

      expect(pda).toBeInstanceOf(PublicKey);
      expect(bump).toBeGreaterThanOrEqual(0);
      expect(bump).toBeLessThanOrEqual(255);
    });

    it("should use correct seeds for derivation", () => {
      const [expectedPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), testAuthority.toBuffer()],
        PROGRAM_ID
      );
      const [actualPDA] = getVaultPDA(testAuthority);

      expect(actualPDA.equals(expectedPDA)).toBe(true);
    });
  });

  describe("getVaultConfigPDA", () => {
    it("should derive a deterministic config PDA for a given vault", () => {
      const [vaultPDA] = getVaultPDA(testAuthority);
      const [configPDA1, bump1] = getVaultConfigPDA(vaultPDA);
      const [configPDA2, bump2] = getVaultConfigPDA(vaultPDA);

      expect(configPDA1.equals(configPDA2)).toBe(true);
      expect(bump1).toBe(bump2);
    });

    it("should derive different config PDAs for different vaults", () => {
      const [vault1] = getVaultPDA(testAuthority);
      const [vault2] = getVaultPDA(testAuthority2);
      const [config1] = getVaultConfigPDA(vault1);
      const [config2] = getVaultConfigPDA(vault2);

      expect(config1.equals(config2)).toBe(false);
    });

    it("should use correct seeds for derivation", () => {
      const [vaultPDA] = getVaultPDA(testAuthority);
      const [expectedPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault_config"), vaultPDA.toBuffer()],
        PROGRAM_ID
      );
      const [actualPDA] = getVaultConfigPDA(vaultPDA);

      expect(actualPDA.equals(expectedPDA)).toBe(true);
    });

    it("should return a valid public key with bump", () => {
      const [vaultPDA] = getVaultPDA(testAuthority);
      const [configPDA, bump] = getVaultConfigPDA(vaultPDA);

      expect(configPDA).toBeInstanceOf(PublicKey);
      expect(bump).toBeGreaterThanOrEqual(0);
      expect(bump).toBeLessThanOrEqual(255);
    });
  });

  describe("IDL", () => {
    it("should have the correct program name", () => {
      expect(VaultIDL.name).toBe("vault");
    });

    it("should have all expected instructions", () => {
      const instructionNames = VaultIDL.instructions.map((ix) => ix.name);

      expect(instructionNames).toContain("initializeVault");
      expect(instructionNames).toContain("deposit");
      expect(instructionNames).toContain("withdraw");
      expect(instructionNames).toContain("updateRiskParams");
      expect(instructionNames).toContain("updateVaultConfig");
      expect(instructionNames).toContain("pauseVault");
      expect(instructionNames).toContain("resumeVault");
      expect(instructionNames).toContain("executeTrade");
      expect(instructionNames).toHaveLength(8);
    });

    it("should have all expected error codes", () => {
      const errorNames = VaultIDL.errors!.map((e) => e.name);

      expect(errorNames).toContain("VaultPaused");
      expect(errorNames).toContain("UnauthorizedExecutor");
      expect(errorNames).toContain("MaxTradeSizeExceeded");
      expect(errorNames).toContain("DailyLossLimitReached");
      expect(errorNames).toContain("SlippageExceeded");
      expect(errorNames).toContain("MaxOpenPositionsReached");
      expect(errorNames).toContain("DexNotAllowed");
      expect(errorNames).toContain("TokenBlacklisted");
      expect(errorNames).toContain("InsufficientVaultBalance");
      expect(errorNames).toContain("InvalidAuthority");
      expect(errorNames).toHaveLength(10);
    });

    it("should have all expected account definitions", () => {
      const accountNames = VaultIDL.accounts!.map((a) => a.name);

      expect(accountNames).toContain("VaultAccount");
      expect(accountNames).toContain("VaultConfig");
    });

    it("should have correct VaultAccount fields", () => {
      const vaultAccount = VaultIDL.accounts!.find(
        (a) => a.name === "VaultAccount"
      );
      const fields = (vaultAccount!.type as any).fields.map(
        (f: any) => f.name
      );

      expect(fields).toContain("authority");
      expect(fields).toContain("executor");
      expect(fields).toContain("depositedSol");
      expect(fields).toContain("availableSol");
      expect(fields).toContain("maxTradeSize");
      expect(fields).toContain("maxDailyLoss");
      expect(fields).toContain("maxSlippageBps");
      expect(fields).toContain("maxOpenPositions");
      expect(fields).toContain("currentOpenPositions");
      expect(fields).toContain("dailyLossCounter");
      expect(fields).toContain("dailyLossResetSlot");
      expect(fields).toContain("isPaused");
      expect(fields).toContain("bump");
    });

    it("should have correct VaultConfig fields", () => {
      const vaultConfig = VaultIDL.accounts!.find(
        (a) => a.name === "VaultConfig"
      );
      const fields = (vaultConfig!.type as any).fields.map(
        (f: any) => f.name
      );

      expect(fields).toContain("vault");
      expect(fields).toContain("allowedDexs");
      expect(fields).toContain("tokenBlacklist");
    });

    it("should have correct error codes starting at 6000", () => {
      const errors = VaultIDL.errors!;
      expect(errors[0].code).toBe(6000);
      expect(errors[errors.length - 1].code).toBe(6009);
    });

    it("initializeVault instruction should have executor argument", () => {
      const ix = VaultIDL.instructions.find(
        (i) => i.name === "initializeVault"
      );
      expect(ix).toBeDefined();
      expect(ix!.args).toHaveLength(1);
      expect(ix!.args[0].name).toBe("executor");
      expect(ix!.args[0].type).toBe("publicKey");
    });

    it("executeTrade instruction should have correct arguments", () => {
      const ix = VaultIDL.instructions.find((i) => i.name === "executeTrade");
      expect(ix).toBeDefined();
      expect(ix!.args).toHaveLength(3);
      expect(ix!.args[0].name).toBe("tradeAmount");
      expect(ix!.args[1].name).toBe("tokenMint");
      expect(ix!.args[2].name).toBe("dexProgram");
    });

    it("executeTrade instruction should have all required accounts", () => {
      const ix = VaultIDL.instructions.find((i) => i.name === "executeTrade");
      const accountNames = ix!.accounts.map((a: any) => a.name);

      expect(accountNames).toContain("vault");
      expect(accountNames).toContain("vaultConfig");
      expect(accountNames).toContain("executor");
      expect(accountNames).toContain("tradeDestination");
      expect(accountNames).toContain("systemProgram");
    });
  });

  describe("Exported Functions", () => {
    it("should export all SDK functions", async () => {
      const sdk = await import("../index");

      expect(typeof sdk.createVault).toBe("function");
      expect(typeof sdk.deposit).toBe("function");
      expect(typeof sdk.withdraw).toBe("function");
      expect(typeof sdk.updateRiskParams).toBe("function");
      expect(typeof sdk.updateVaultConfig).toBe("function");
      expect(typeof sdk.pauseVault).toBe("function");
      expect(typeof sdk.resumeVault).toBe("function");
      expect(typeof sdk.buildExecuteTradeInstruction).toBe("function");
      expect(typeof sdk.getVaultPDA).toBe("function");
      expect(typeof sdk.getVaultConfigPDA).toBe("function");
    });
  });
});
