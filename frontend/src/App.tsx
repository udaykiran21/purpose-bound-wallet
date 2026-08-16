import { useState } from 'react';
import axios from 'axios';
import { useWalletData } from './useWalletData';
import { Lock, Unlock, CheckCircle, ShieldCheck } from 'lucide-react';

const formatCurrency = (amount: string | number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(amount));
};

function App() {
  const { wallet, contracts, loading, refetch } = useWalletData();
  const [payeeId, setPayeeId] = useState('');
  const [payeeAccountNumber, setPayeeAccountNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [pin, setPin] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalAction, setModalAction] = useState<{ type: 'execute' | 'revoke'; contractId: string } | null>(null);
  const [modalPin, setModalPin] = useState('');

  const availableBalance = wallet ? parseFloat(wallet.total_balance) - parseFloat(wallet.locked_balance) : 0;

  const showMessage = (text: string, type: 'success' | 'error') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  };

  const handleCreateContract = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      await axios.post('/api/pbm/create', {
        payeeId,
        payeeAccountNumber,
        amount: parseFloat(amount),
        vault_pin: pin,
      });
      showMessage(`Funds successfully locked for ${payeeId}.`, 'success');
      setPayeeId('');
      setPayeeAccountNumber('');
      setAmount('');
      setPin('');
      refetch();
    } catch (error: any) {
      showMessage(error.response?.data?.error || 'Failed to create contract', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleExecuteRevoke = async () => {
    if (!modalAction) return;
    setActionLoading(true);
    try {
      if (modalAction.type === 'execute') {
        await axios.post(`/api/pbm/${modalAction.contractId}/execute`, { vault_pin: modalPin });
        showMessage('Contract executed successfully. Target account holder notified.', 'success');
      } else {
        await axios.post(`/api/pbm/${modalAction.contractId}/revoke`, { vault_pin: modalPin });
        showMessage('Contract revoked successfully. Target account holder notified.', 'success');
      }
      setModalOpen(false);
      setModalPin('');
      refetch();
    } catch (error: any) {
      showMessage(error.response?.data?.error || `Failed to ${modalAction.type} contract`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-800">Loading wallet state...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-100 p-8 font-sans text-slate-800">
      <div className="max-w-5xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <ShieldCheck className="text-blue-600" />
              Purpose-Bound Wallet <span className="text-sm font-normal text-slate-500 bg-slate-100 px-2 py-1 rounded ml-2">POC Dashboard</span>
            </h1>
            <p className="text-slate-500 text-sm mt-1">Wallet ID: {wallet?.wallet_id}</p>
          </div>
        </div>

        {/* Panel 1: Ledger Status */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">Total Balance</h2>
            <p className="text-3xl font-bold text-slate-800">{formatCurrency(wallet?.total_balance || 0)}</p>
          </div>
          <div className="bg-blue-50 p-6 rounded-xl shadow-sm border border-blue-100">
            <h2 className="text-sm font-semibold text-blue-600 uppercase tracking-wider mb-2">Available (Liquid)</h2>
            <p className="text-3xl font-bold text-blue-900">{formatCurrency(availableBalance)}</p>
          </div>
          <div className="bg-amber-50 p-6 rounded-xl shadow-sm border border-amber-100">
            <h2 className="text-sm font-semibold text-amber-600 uppercase tracking-wider mb-2 flex items-center gap-2">
              <Lock size={16} /> Locked in Vault
            </h2>
            <p className="text-3xl font-bold text-amber-900">{formatCurrency(wallet?.locked_balance || 0)}</p>
          </div>
        </div>

        {/* Notifications */}
        {message && (
          <div className={`p-4 rounded-lg flex items-center gap-2 ${message.type === 'success' ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'}`}>
            <CheckCircle size={20} />
            {message.text}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Panel 2: Create Contract Form */}
          <div className="lg:col-span-1 bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h2 className="text-lg font-bold mb-4 border-b pb-2">Lock Funds</h2>
            <form onSubmit={handleCreateContract} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Payee Name</label>
                <input required type="text" value={payeeId} onChange={e => setPayeeId(e.target.value)} className="w-full border border-slate-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500" placeholder="e.g. Acme Corp" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Payee Account Number</label>
                <input type="text" value={payeeAccountNumber} onChange={e => setPayeeAccountNumber(e.target.value)} className="w-full border border-slate-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500" placeholder="e.g. 123456789" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Amount</label>
                <input required type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className="w-full border border-slate-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500" placeholder="0.00" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Vault PIN</label>
                <input required type="password" value={pin} onChange={e => setPin(e.target.value)} className="w-full border border-slate-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500" placeholder="******" />
              </div>
              <button disabled={actionLoading} type="submit" className="w-full bg-blue-600 text-white font-medium py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 transition">
                {actionLoading ? 'Processing...' : 'Create Contract'}
              </button>
            </form>
          </div>

          {/* Panel 3: State Machine Viewer */}
          <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h2 className="text-lg font-bold mb-4 border-b pb-2">Contracts Ledger</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-500 uppercase bg-slate-50">
                  <tr>
                    <th className="px-4 py-3">Payee</th>
                    <th className="px-4 py-3">Account Number</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {contracts.map(c => (
                    <tr key={c.contract_id} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium">{c.payee_id}</td>
                      <td className="px-4 py-3 text-slate-500">{c.payee_account_number || '-'}</td>
                      <td className="px-4 py-3">{formatCurrency(c.amount)}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${
                          c.status === 'LOCKED' ? 'bg-amber-100 text-amber-800' :
                          c.status === 'EXECUTED' ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-800'
                        }`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {c.status === 'LOCKED' && (
                          <div className="flex justify-end gap-2">
                            <button onClick={() => { setModalAction({ type: 'execute', contractId: c.contract_id }); setModalOpen(true); }} className="text-green-600 hover:text-green-800 bg-green-50 hover:bg-green-100 px-3 py-1 rounded border border-green-200 transition">
                              Execute
                            </button>
                            <button onClick={() => { setModalAction({ type: 'revoke', contractId: c.contract_id }); setModalOpen(true); }} className="text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 px-3 py-1 rounded border border-red-200 transition flex items-center gap-1">
                              <Unlock size={14} /> Revoke
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {contracts.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-500">No contracts found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Secure Modal for Vault PIN */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-bold mb-2 flex items-center gap-2">
              <Lock className="text-amber-500" />
              Vault Authentication Required
            </h3>
            <p className="text-sm text-slate-500 mb-4">
              Please enter your 6-digit Vault PIN to confirm you want to {modalAction?.type} this contract.
            </p>
            <input
              type="password"
              autoFocus
              value={modalPin}
              onChange={e => setModalPin(e.target.value)}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-center text-2xl tracking-widest focus:ring-blue-500 focus:border-blue-500 mb-4"
              placeholder="••••••"
            />
            <div className="flex gap-3">
              <button onClick={() => setModalOpen(false)} className="flex-1 bg-slate-100 text-slate-700 py-2 rounded-md hover:bg-slate-200 transition">
                Cancel
              </button>
              <button disabled={actionLoading || modalPin.length < 4} onClick={handleExecuteRevoke} className={`flex-1 py-2 rounded-md text-white font-medium transition ${modalAction?.type === 'execute' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'} disabled:opacity-50`}>
                {actionLoading ? '...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
