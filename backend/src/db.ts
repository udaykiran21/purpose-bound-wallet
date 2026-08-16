import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'pbm_user',
  password: process.env.DB_PASSWORD || 'pbm_password',
  database: process.env.DB_NAME || 'pbm_db',
});

export const initDb = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Enable pgcrypto for UUIDs
    await client.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');

    // Create wallets table
    await client.query(`
      CREATE TABLE IF NOT EXISTS wallets (
        wallet_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL DEFAULT gen_random_uuid(),
        total_balance DECIMAL(15,2) NOT NULL DEFAULT 0,
        locked_balance DECIMAL(15,2) NOT NULL DEFAULT 0,
        vault_pin_hash VARCHAR(255) NOT NULL,
        failed_pin_attempts INT NOT NULL DEFAULT 0,
        vault_locked_until TIMESTAMP,
        version INT NOT NULL DEFAULT 1
      );
    `);

    // Create purpose_bound_contracts table
    await client.query(`
      CREATE TABLE IF NOT EXISTS purpose_bound_contracts (
        contract_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        wallet_id UUID NOT NULL REFERENCES wallets(wallet_id),
        payee_id VARCHAR(255) NOT NULL,
        payee_account_number VARCHAR(255),
        amount DECIMAL(15,2) NOT NULL,
        status VARCHAR(50) NOT NULL CHECK (status IN ('LOCKED', 'EXECUTED', 'REVOKED')),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    // Ensure the column exists if the table was created previously
    await client.query(`
      ALTER TABLE purpose_bound_contracts ADD COLUMN IF NOT EXISTS payee_account_number VARCHAR(255);
    `);

    // Create ledger_entries table
    await client.query(`
      CREATE TABLE IF NOT EXISTS ledger_entries (
        entry_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        wallet_id UUID NOT NULL REFERENCES wallets(wallet_id),
        contract_id UUID REFERENCES purpose_bound_contracts(contract_id),
        transaction_type VARCHAR(50) NOT NULL CHECK (transaction_type IN ('FUNDS_LOCKED', 'EXECUTE_PAYMENT', 'FUNDS_RELEASED')),
        amount DECIMAL(15,2) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    // Seed default user if not exists
    const res = await client.query('SELECT COUNT(*) FROM wallets');
    if (parseInt(res.rows[0].count, 10) === 0) {
      console.log('Seeding default wallet...');
      const hashedPin = await bcrypt.hash('123456', 10);

      await client.query(`
        INSERT INTO wallets (user_id, total_balance, locked_balance, vault_pin_hash)
        VALUES (gen_random_uuid(), 10000000.00, 0.00, $1)
      `, [hashedPin]);
      console.log('Default wallet seeded.');
    }

    await client.query('COMMIT');
    console.log('Database initialization successful.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Database initialization failed:', err);
    throw err;
  } finally {
    client.release();
  }
};

export default pool;
