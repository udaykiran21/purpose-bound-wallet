import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initDb } from './db';
import { LedgerService } from './ledgerService';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const ledgerService = new LedgerService();

app.use(cors());
app.use(express.json());

// Middleware to mock authentication and attach walletId
const authenticate = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  let walletId = req.headers['x-wallet-id'] as string;
  if (!walletId) {
    // For POC simplicity, if no wallet ID is provided, grab the default one
    try {
      const defaultWallet = await ledgerService.getDefaultWallet();
      if (defaultWallet) {
        walletId = defaultWallet.wallet_id;
        req.headers['x-wallet-id'] = walletId;
      } else {
        return res.status(401).json({ error: 'Unauthorized: No wallet found' });
      }
    } catch (e) {
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
  next();
};

app.use(authenticate);

// API Endpoints

app.get('/api/pbm/wallet', async (req, res) => {
  try {
    const walletId = req.headers['x-wallet-id'] as string;
    const wallet = await ledgerService.getWallet(walletId);
    if (!wallet) return res.status(404).json({ error: 'Wallet not found' });
    res.json(wallet);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/pbm/contracts', async (req, res) => {
  try {
    const walletId = req.headers['x-wallet-id'] as string;
    const contracts = await ledgerService.getContracts(walletId);
    res.json(contracts);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/pbm/create', async (req, res) => {
  try {
    const walletId = req.headers['x-wallet-id'] as string;
    const { payeeId, amount, vault_pin } = req.body;

    if (!payeeId || !amount || !vault_pin) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const isValidPin = await ledgerService.verifyPin(walletId, vault_pin);
    if (!isValidPin) {
      return res.status(401).json({ error: 'Invalid Vault PIN' });
    }

    const result = await ledgerService.createContract(walletId, payeeId, amount);
    res.status(201).json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/pbm/:id/execute', async (req, res) => {
  try {
    const walletId = req.headers['x-wallet-id'] as string;
    const contractId = req.params.id;
    const { vault_pin } = req.body;

    if (!vault_pin) {
      return res.status(400).json({ error: 'Missing vault_pin' });
    }

    const isValidPin = await ledgerService.verifyPin(walletId, vault_pin);
    if (!isValidPin) {
      return res.status(401).json({ error: 'Invalid Vault PIN' });
    }

    await ledgerService.executeContract(walletId, contractId);
    res.status(200).json({ message: 'Contract executed successfully' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/pbm/:id/revoke', async (req, res) => {
  try {
    const walletId = req.headers['x-wallet-id'] as string;
    const contractId = req.params.id;
    const { vault_pin } = req.body;

    if (!vault_pin) {
      return res.status(400).json({ error: 'Missing vault_pin' });
    }

    const isValidPin = await ledgerService.verifyPin(walletId, vault_pin);
    if (!isValidPin) {
      return res.status(401).json({ error: 'Invalid Vault PIN' });
    }

    await ledgerService.revokeContract(walletId, contractId);
    res.status(200).json({ message: 'Contract revoked successfully' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Initialize DB and start server
initDb()
  .then(() => {
    app.listen(port, () => {
      console.log(`Backend listening on port ${port}`);
    });
  })
  .catch((err) => {
    console.error('Failed to start backend due to DB initialization error', err);
    process.exit(1);
  });
