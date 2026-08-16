import { useState, useEffect } from 'react';
import axios from 'axios';

// Mock headers to simplify authentication
const MOCK_HEADERS = {
  // We can let the backend choose the default wallet since we set that logic up
};

interface Wallet {
  wallet_id: string;
  total_balance: string;
  locked_balance: string;
}

interface Contract {
  contract_id: string;
  wallet_id: string;
  payee_id: string;
  payee_account_number?: string;
  amount: string;
  status: 'LOCKED' | 'EXECUTED' | 'REVOKED';
  created_at: string;
}

export const useWalletData = () => {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const [walletRes, contractsRes] = await Promise.all([
        axios.get('/api/pbm/wallet', { headers: MOCK_HEADERS }),
        axios.get('/api/pbm/contracts', { headers: MOCK_HEADERS }),
      ]);
      setWallet(walletRes.data);
      setContracts(contractsRes.data);
    } catch (error) {
      console.error('Failed to fetch data', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return { wallet, contracts, loading, refetch: fetchData };
};
