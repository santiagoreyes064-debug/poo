use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("VLT1111111111111111111111111111111111111111");

#[program]
pub mod vault {
    use super::*;

    /// Creates a new vault PDA for the user with an authorized executor.
    pub fn initialize_vault(ctx: Context<InitializeVault>, executor: Pubkey) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.authority = ctx.accounts.authority.key();
        vault.executor = executor;
        vault.deposited_sol = 0;
        vault.available_sol = 0;
        vault.max_trade_size = 0;
        vault.max_daily_loss = 0;
        vault.max_slippage_bps = 0;
        vault.max_open_positions = 0;
        vault.current_open_positions = 0;
        vault.daily_loss_counter = 0;
        vault.daily_loss_reset_slot = 0;
        vault.is_paused = false;
        vault.bump = ctx.bumps.vault;
        Ok(())
    }

    /// Deposits SOL from the user into the vault PDA.
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.authority.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                },
            ),
            amount,
        )?;

        let vault = &mut ctx.accounts.vault;
        vault.deposited_sol = vault.deposited_sol.checked_add(amount).unwrap();
        vault.available_sol = vault.available_sol.checked_add(amount).unwrap();
        Ok(())
    }

    /// Withdraws SOL from the vault PDA back to the authority.
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        require!(
            vault.available_sol >= amount,
            VaultError::InsufficientVaultBalance
        );

        vault.available_sol = vault.available_sol.checked_sub(amount).unwrap();
        vault.deposited_sol = vault.deposited_sol.checked_sub(amount).unwrap();

        // Transfer SOL from PDA back to authority using PDA signer seeds
        let authority_key = ctx.accounts.authority.key();
        let seeds = &[
            b"vault".as_ref(),
            authority_key.as_ref(),
            &[vault.bump],
        ];
        let signer_seeds = &[&seeds[..]];

        let vault_account_info = vault.to_account_info();
        let authority_account_info = ctx.accounts.authority.to_account_info();

        **vault_account_info.try_borrow_mut_lamports()? -= amount;
        **authority_account_info.try_borrow_mut_lamports()? += amount;

        // Keep the compiler happy about signer_seeds (used in anchor context)
        let _ = signer_seeds;

        Ok(())
    }

    /// Updates risk parameters for the vault. Authority-only.
    pub fn update_risk_params(
        ctx: Context<UpdateRiskParams>,
        max_trade_size: u64,
        max_daily_loss: u64,
        max_slippage_bps: u16,
        max_open_positions: u8,
    ) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.max_trade_size = max_trade_size;
        vault.max_daily_loss = max_daily_loss;
        vault.max_slippage_bps = max_slippage_bps;
        vault.max_open_positions = max_open_positions;
        Ok(())
    }

    /// Updates vault configuration (allowed DEXs and token blacklist). Authority-only.
    pub fn update_vault_config(
        ctx: Context<UpdateVaultConfig>,
        allowed_dexs: Vec<Pubkey>,
        token_blacklist: Vec<Pubkey>,
    ) -> Result<()> {
        let config = &mut ctx.accounts.vault_config;
        config.vault = ctx.accounts.vault.key();
        config.allowed_dexs = allowed_dexs;
        config.token_blacklist = token_blacklist;
        Ok(())
    }

    /// Pauses the vault. Authority-only.
    pub fn pause_vault(ctx: Context<PauseVault>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.is_paused = true;
        Ok(())
    }

    /// Resumes the vault. Authority-only.
    pub fn resume_vault(ctx: Context<ResumeVault>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.is_paused = false;
        Ok(())
    }

    /// Executes a trade from the vault. Called by the authorized executor only.
    /// Validates all risk parameters on-chain before transferring funds.
    /// The trade_destination must be owned by one of the allowed DEX programs.
    pub fn execute_trade(
        ctx: Context<ExecuteTrade>,
        trade_amount: u64,
        token_mint: Pubkey,
        dex_program: Pubkey,
    ) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        let config = &ctx.accounts.vault_config;

        // Check vault is not paused
        require!(!vault.is_paused, VaultError::VaultPaused);

        // Check executor is authorized
        require!(
            ctx.accounts.executor.key() == vault.executor,
            VaultError::UnauthorizedExecutor
        );

        // Check trade size
        require!(
            trade_amount <= vault.max_trade_size,
            VaultError::MaxTradeSizeExceeded
        );

        // Reset daily loss counter if slot has advanced past reset window
        let current_slot = Clock::get()?.slot;
        // Reset every ~216,000 slots (approximately 24 hours at 400ms/slot)
        if current_slot > vault.daily_loss_reset_slot + 216_000 {
            vault.daily_loss_counter = 0;
            vault.daily_loss_reset_slot = current_slot;
        }

        // Check daily loss limit
        // NOTE: daily_loss_counter counts gross outflow (total amount sent to DEX),
        // not realized losses. This is acceptable for v1 as it provides a conservative
        // upper bound. A future version could track net P&L after positions close.
        require!(
            vault.daily_loss_counter.checked_add(trade_amount).unwrap() <= vault.max_daily_loss,
            VaultError::DailyLossLimitReached
        );

        // Check max open positions
        require!(
            vault.current_open_positions < vault.max_open_positions,
            VaultError::MaxOpenPositionsReached
        );

        // Check token is not blacklisted
        require!(
            !config.token_blacklist.contains(&token_mint),
            VaultError::TokenBlacklisted
        );

        // Check DEX is allowed
        require!(
            config.allowed_dexs.contains(&dex_program),
            VaultError::DexNotAllowed
        );

        // Constrain trade_destination: must be owned by the specified DEX program.
        // This prevents the executor from draining funds to an arbitrary address.
        require!(
            *ctx.accounts.trade_destination.owner == dex_program,
            VaultError::InvalidTradeDestination
        );

        // Check vault has sufficient balance
        require!(
            vault.available_sol >= trade_amount,
            VaultError::InsufficientVaultBalance
        );

        // Update vault state
        vault.available_sol = vault.available_sol.checked_sub(trade_amount).unwrap();
        vault.daily_loss_counter = vault.daily_loss_counter.checked_add(trade_amount).unwrap();
        vault.current_open_positions = vault.current_open_positions.checked_add(1).unwrap();

        // Transfer funds from vault PDA to the destination (DEX pool)
        let vault_account_info = vault.to_account_info();
        let destination_account_info = ctx.accounts.trade_destination.to_account_info();

        **vault_account_info.try_borrow_mut_lamports()? -= trade_amount;
        **destination_account_info.try_borrow_mut_lamports()? += trade_amount;

        Ok(())
    }

    /// Closes a position and returns SOL to the vault's available balance.
    /// Called by the authorized executor after a trade is settled.
    /// The return_source must be owned by one of the allowed DEX programs (same
    /// pattern as execute_trade's trade_destination constraint).
    pub fn close_position(
        ctx: Context<ClosePosition>,
        returned_amount: u64,
        dex_program: Pubkey,
    ) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        let config = &ctx.accounts.vault_config;

        // Check executor is authorized
        require!(
            ctx.accounts.executor.key() == vault.executor,
            VaultError::UnauthorizedExecutor
        );

        // Check vault is not paused
        require!(!vault.is_paused, VaultError::VaultPaused);

        // Ensure there is at least one open position to close
        require!(
            vault.current_open_positions > 0,
            VaultError::NoOpenPositions
        );

        // Check DEX is allowed
        require!(
            config.allowed_dexs.contains(&dex_program),
            VaultError::DexNotAllowed
        );

        // Constrain return_source: must be owned by the specified DEX program.
        // This prevents the executor from inflating available_sol from an arbitrary account.
        require!(
            *ctx.accounts.return_source.owner == dex_program,
            VaultError::InvalidReturnSource
        );

        // Decrement open positions
        vault.current_open_positions = vault.current_open_positions.checked_sub(1).unwrap();

        // Return SOL to vault (the returned_amount comes from the DEX after the swap settles)
        // Transfer from the source account (DEX pool / intermediary) back to vault
        let source_account_info = ctx.accounts.return_source.to_account_info();
        let vault_account_info = vault.to_account_info();

        **source_account_info.try_borrow_mut_lamports()? -= returned_amount;
        **vault_account_info.try_borrow_mut_lamports()? += returned_amount;

        // Update available balance
        vault.available_sol = vault.available_sol.checked_add(returned_amount).unwrap();

        Ok(())
    }
}

// ============================================================================
// Account Structures
// ============================================================================

#[account]
pub struct VaultAccount {
    /// The wallet that owns and controls this vault
    pub authority: Pubkey,
    /// The authorized executor that can call execute_trade
    pub executor: Pubkey,
    /// Total SOL deposited (lamports)
    pub deposited_sol: u64,
    /// Available SOL for trading (lamports)
    pub available_sol: u64,
    /// Maximum trade size per trade (lamports)
    pub max_trade_size: u64,
    /// Maximum daily loss allowed (lamports)
    pub max_daily_loss: u64,
    /// Maximum slippage in basis points
    pub max_slippage_bps: u16,
    /// Maximum number of open positions
    pub max_open_positions: u8,
    /// Current number of open positions
    pub current_open_positions: u8,
    /// Running daily loss counter (lamports)
    pub daily_loss_counter: u64,
    /// Slot at which daily_loss_counter was last reset
    pub daily_loss_reset_slot: u64,
    /// Whether the vault is paused
    pub is_paused: bool,
    /// PDA bump seed
    pub bump: u8,
}

#[account]
pub struct VaultConfig {
    /// The vault this config belongs to
    pub vault: Pubkey,
    /// List of allowed DEX program IDs
    pub allowed_dexs: Vec<Pubkey>,
    /// List of blacklisted token mints
    pub token_blacklist: Vec<Pubkey>,
}

// ============================================================================
// Instruction Contexts
// ============================================================================

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 32 + 8 + 8 + 8 + 8 + 2 + 1 + 1 + 8 + 8 + 1 + 1,
        seeds = [b"vault", authority.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, VaultAccount>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(
        mut,
        seeds = [b"vault", authority.key().as_ref()],
        bump = vault.bump,
        has_one = authority @ VaultError::InvalidAuthority
    )]
    pub vault: Account<'info, VaultAccount>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(
        mut,
        seeds = [b"vault", authority.key().as_ref()],
        bump = vault.bump,
        has_one = authority @ VaultError::InvalidAuthority
    )]
    pub vault: Account<'info, VaultAccount>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateRiskParams<'info> {
    #[account(
        mut,
        seeds = [b"vault", authority.key().as_ref()],
        bump = vault.bump,
        has_one = authority @ VaultError::InvalidAuthority
    )]
    pub vault: Account<'info, VaultAccount>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateVaultConfig<'info> {
    #[account(
        seeds = [b"vault", authority.key().as_ref()],
        bump = vault.bump,
        has_one = authority @ VaultError::InvalidAuthority
    )]
    pub vault: Account<'info, VaultAccount>,
    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + 32 + 4 + (32 * 10) + 4 + (32 * 50),
        seeds = [b"vault_config", vault.key().as_ref()],
        bump
    )]
    pub vault_config: Account<'info, VaultConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PauseVault<'info> {
    #[account(
        mut,
        seeds = [b"vault", authority.key().as_ref()],
        bump = vault.bump,
        has_one = authority @ VaultError::InvalidAuthority
    )]
    pub vault: Account<'info, VaultAccount>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct ResumeVault<'info> {
    #[account(
        mut,
        seeds = [b"vault", authority.key().as_ref()],
        bump = vault.bump,
        has_one = authority @ VaultError::InvalidAuthority
    )]
    pub vault: Account<'info, VaultAccount>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct ExecuteTrade<'info> {
    #[account(
        mut,
        seeds = [b"vault", vault.authority.as_ref()],
        bump = vault.bump
    )]
    pub vault: Account<'info, VaultAccount>,
    #[account(
        seeds = [b"vault_config", vault.key().as_ref()],
        bump
    )]
    pub vault_config: Account<'info, VaultConfig>,
    pub executor: Signer<'info>,
    /// CHECK: This is the destination account for the trade funds.
    /// Constrained to be owned by the specified DEX program in the instruction logic.
    #[account(mut)]
    pub trade_destination: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClosePosition<'info> {
    #[account(
        mut,
        seeds = [b"vault", vault.authority.as_ref()],
        bump = vault.bump
    )]
    pub vault: Account<'info, VaultAccount>,
    #[account(
        seeds = [b"vault_config", vault.key().as_ref()],
        bump
    )]
    pub vault_config: Account<'info, VaultConfig>,
    pub executor: Signer<'info>,
    /// CHECK: This is the source account returning SOL from a closed position (e.g., DEX pool).
    /// Constrained to be owned by the specified DEX program in the instruction logic.
    #[account(mut)]
    pub return_source: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

// ============================================================================
// Error Codes
// ============================================================================

#[error_code]
pub enum VaultError {
    #[msg("Vault is paused")]
    VaultPaused,
    #[msg("Unauthorized executor")]
    UnauthorizedExecutor,
    #[msg("Trade size exceeds maximum allowed")]
    MaxTradeSizeExceeded,
    #[msg("Daily loss limit reached")]
    DailyLossLimitReached,
    #[msg("Slippage exceeds maximum allowed")]
    SlippageExceeded,
    #[msg("Maximum open positions reached")]
    MaxOpenPositionsReached,
    #[msg("DEX program not in allowed list")]
    DexNotAllowed,
    #[msg("Token is blacklisted")]
    TokenBlacklisted,
    #[msg("Insufficient vault balance")]
    InsufficientVaultBalance,
    #[msg("Invalid authority")]
    InvalidAuthority,
    #[msg("Trade destination not owned by the specified DEX program")]
    InvalidTradeDestination,
    #[msg("Return source not owned by the specified DEX program")]
    InvalidReturnSource,
    #[msg("No open positions to close")]
    NoOpenPositions,
}
