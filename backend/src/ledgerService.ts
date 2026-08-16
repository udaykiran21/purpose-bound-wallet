import pool from './db';
import bcrypt from 'bcryptjs';

export class LedgerService {
  /**
   * Helper function to verify the pin
   * It takes a wallet ID and the provided pin, checks attempts, locks if needed, and validates.
   */
  public async verifyPin(walletId: string, providedPin: string): Promise<boolean> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const res = await client.query('SELECT vault_pin_hash, failed_pin_attempts, vault_locked_until FROM wallets WHERE wallet_id = $1 FOR UPDATE', [walletId]);
      if (res.rowCount === 0) {
        throw new Error('Wallet not found');
      }

      const { vault_pin_hash, failed_pin_attempts, vault_locked_until } = res.rows[0];

      if (vault_locked_until && new Date(vault_locked_until) > new Date()) {
        await client.query('COMMIT');
        throw new Error('Vault is temporarily locked due to too many failed attempts');
      }

      const isValid = await bcrypt.compare(providedPin, vault_pin_hash);

      if (!isValid) {
        const newAttempts = failed_pin_attempts + 1;
        let lockUntil = null;
        if (newAttempts >= 5) {
          // Lock for 15 minutes
          lockUntil = new Date(Date.now() + 15 * 60 * 1000);
        }
        await client.query('UPDATE wallets SET failed_pin_attempts = $1, vault_locked_until = $2 WHERE wallet_id = $3', [newAttempts, lockUntil, walletId]);
        await client.query('COMMIT');
        return false;
      }

      // Reset attempts on success
      if (failed_pin_attempts > 0) {
        await client.query('UPDATE wallets SET failed_pin_attempts = 0, vault_locked_until = NULL WHERE wallet_id = $1', [walletId]);
      }

      await client.query('COMMIT');
      return true;

    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public async createContract(walletId: string, payeeId: string, payeeAccountNumber: string, amount: number) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Pessimistic lock
      const walletRes = await client.query('SELECT total_balance, locked_balance, version FROM wallets WHERE wallet_id = $1 FOR UPDATE', [walletId]);
      if (walletRes.rowCount === 0) throw new Error('Wallet not found');

      const wallet = walletRes.rows[0];
      const totalBalance = parseFloat(wallet.total_balance);
      const lockedBalance = parseFloat(wallet.locked_balance);

      if ((totalBalance - lockedBalance) < amount) {
        throw new Error('Insufficient available funds to lock');
      }

      const newLockedBalance = lockedBalance + amount;
      const newVersion = parseInt(wallet.version) + 1;

      // Update wallet
      await client.query('UPDATE wallets SET locked_balance = $1, version = $2 WHERE wallet_id = $3 AND version = $4', [newLockedBalance, newVersion, walletId, wallet.version]);

      // Create contract
      const contractRes = await client.query(
        'INSERT INTO purpose_bound_contracts (wallet_id, payee_id, payee_account_number, amount, status) VALUES ($1, $2, $3, $4, $5) RETURNING contract_id',
        [walletId, payeeId, payeeAccountNumber, amount, 'LOCKED']
      );
      const contractId = contractRes.rows[0].contract_id;

      // Write ledger entry
      await client.query(
        'INSERT INTO ledger_entries (wallet_id, contract_id, transaction_type, amount) VALUES ($1, $2, $3, $4)',
        [walletId, contractId, 'FUNDS_LOCKED', amount]
      );

      await client.query('COMMIT');
      return { contractId };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public async executeContract(walletId: string, contractId: string) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Lock contract
      const contractRes = await client.query('SELECT amount, status FROM purpose_bound_contracts WHERE contract_id = $1 AND wallet_id = $2 FOR UPDATE', [contractId, walletId]);
      if (contractRes.rowCount === 0) throw new Error('Contract not found or does not belong to this wallet');

      const contract = contractRes.rows[0];
      if (contract.status !== 'LOCKED') throw new Error('Contract is not in a locked state');

      const amount = parseFloat(contract.amount);

      // Lock wallet
      const walletRes = await client.query('SELECT total_balance, locked_balance, version FROM wallets WHERE wallet_id = $1 FOR UPDATE', [walletId]);
      const wallet = walletRes.rows[0];

      const newTotalBalance = parseFloat(wallet.total_balance) - amount;
      const newLockedBalance = parseFloat(wallet.locked_balance) - amount;
      const newVersion = parseInt(wallet.version) + 1;

      // Update wallet
      await client.query('UPDATE wallets SET total_balance = $1, locked_balance = $2, version = $3 WHERE wallet_id = $4 AND version = $5', [newTotalBalance, newLockedBalance, newVersion, walletId, wallet.version]);

      // Update contract
      await client.query('UPDATE purpose_bound_contracts SET status = $1 WHERE contract_id = $2', ['EXECUTED', contractId]);

      // Write ledger entry
      await client.query(
        'INSERT INTO ledger_entries (wallet_id, contract_id, transaction_type, amount) VALUES ($1, $2, $3, $4)',
        [walletId, contractId, 'EXECUTE_PAYMENT', amount]
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public async revokeContract(walletId: string, contractId: string) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Lock contract
      const contractRes = await client.query('SELECT amount, status FROM purpose_bound_contracts WHERE contract_id = $1 AND wallet_id = $2 FOR UPDATE', [contractId, walletId]);
      if (contractRes.rowCount === 0) throw new Error('Contract not found or does not belong to this wallet');

      const contract = contractRes.rows[0];
      if (contract.status !== 'LOCKED') throw new Error('Contract is not in a locked state');

      const amount = parseFloat(contract.amount);

      // Lock wallet
      const walletRes = await client.query('SELECT locked_balance, version FROM wallets WHERE wallet_id = $1 FOR UPDATE', [walletId]);
      const wallet = walletRes.rows[0];

      const newLockedBalance = parseFloat(wallet.locked_balance) - amount;
      const newVersion = parseInt(wallet.version) + 1;

      // Update wallet
      await client.query('UPDATE wallets SET locked_balance = $1, version = $2 WHERE wallet_id = $3 AND version = $4', [newLockedBalance, newVersion, walletId, wallet.version]);

      // Update contract
      await client.query('UPDATE purpose_bound_contracts SET status = $1 WHERE contract_id = $2', ['REVOKED', contractId]);

      // Write ledger entry
      await client.query(
        'INSERT INTO ledger_entries (wallet_id, contract_id, transaction_type, amount) VALUES ($1, $2, $3, $4)',
        [walletId, contractId, 'FUNDS_RELEASED', amount]
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public async getWallet(walletId: string) {
    const res = await pool.query('SELECT wallet_id, total_balance, locked_balance FROM wallets WHERE wallet_id = $1', [walletId]);
    return res.rows[0];
  }

  public async getDefaultWallet() {
     const res = await pool.query('SELECT wallet_id, total_balance, locked_balance FROM wallets LIMIT 1');
     return res.rows[0];
  }

  public async getContracts(walletId: string) {
    const res = await pool.query('SELECT * FROM purpose_bound_contracts WHERE wallet_id = $1 ORDER BY created_at DESC', [walletId]);
    return res.rows;
  }
}
