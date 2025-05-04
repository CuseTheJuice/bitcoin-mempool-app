'use client';

import { useState, useEffect } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

// Interface for error cause
interface ErrorCause {
  status?: number;
  source?: string;
}

interface MempoolStats {
  count: number;
  total_fee: number;
  vsize: number;
  source: string;
}

interface TxData {
  txid: string;
  fee: number;
  size: number;
  status: string;
  confirmations: number;
  version: number;
  locktime: number;
  blockheight?: number;
  walletType: string;
  witness: { count: number; size: number };
  inputs: { address?: string; amount: number; scriptType?: string }[];
  outputs: { address?: string; amount: number; scriptType?: string; opReturn?: string }[];
  source: string;
  timestamp: number;
}

interface ErrorState {
  message: string;
  status?: number;
  source?: string;
}

export default function Home() {
  const [mempoolData, setMempoolData] = useState<MempoolStats | null>(null);
  const [error, setError] = useState<ErrorState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [txidInput, setTxidInput] = useState('');
  const [txHistory, setTxHistory] = useState<TxData[]>([]);
  const [sortField, setSortField] = useState<keyof TxData>('timestamp');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');

  const calculateFeeRate = (fee: number | null | undefined, size: number | null | undefined) => {
    const safeFee = fee ?? 0;
    const safeSize = size ?? 0;
    return safeSize > 0 ? (safeFee / safeSize).toFixed(2) : 'N/A';
  };

  useEffect(() => {
    const saved = localStorage.getItem('txHistory');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setTxHistory(parsed);
      } catch (err) {
        console.error('Failed to parse txHistory from localStorage:', err);
      }
    }

    const fetchMempoolTxs = async () => {
      try {
        const response = await fetch('/api/get-mempool-txs?limit=10');
        const data = await response.json();

        if (!response.ok || data.error) {
          throw new Error(data.error || 'Failed to fetch mempool transactions');
        }

        const newTxs = data.map((tx: TxData) => ({
          ...tx,
          timestamp: Date.now(),
        }));

        setTxHistory((prev) => {
          const existingTxids = new Set(prev.map((tx) => tx.txid));
          const filteredNewTxs = newTxs.filter((tx: TxData) => !existingTxids.has(tx.txid));
          return [...filteredNewTxs, ...prev].slice(0, 20);
        });
      } catch (err) {
        console.error('Error fetching mempool transactions:', err);
      }
    };

    fetchMempoolTxs();
    const interval = setInterval(fetchMempoolTxs, 30_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const fetchMempoolData = async () => {
      setIsLoading(true);
      try {
        const response = await fetch('/api/get-bitcoin-node');
        const data = await response.json();

        if (!response.ok || data.error) {
          throw new Error(data.error || 'Failed to fetch mempool data', {
            cause: { status: data.status, source: data.source },
          });
        }

        setMempoolData({
          count: data.count,
          total_fee: data.total_fee,
          vsize: data.vsize,
          source: data.source,
        });
        setError(null);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An error occurred';
        const errorStatus =
          err instanceof Error && 'cause' in err && typeof (err.cause as ErrorCause).status === 'number'
            ? (err.cause as ErrorCause).status
            : undefined;
        const errorSource =
          err instanceof Error && 'cause' in err ? (err.cause as ErrorCause).source : undefined;

        setError({
          message: errorMessage,
          status: errorStatus,
          source: errorSource,
        });
        setMempoolData(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMempoolData();
    const interval = setInterval(fetchMempoolData, 30_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const searchedTxs = txHistory.filter((tx) => tx.timestamp !== Date.now());
    localStorage.setItem('txHistory', JSON.stringify(searchedTxs));
  }, [txHistory]);

  const fetchTransaction = async (txid: string): Promise<TxData | { error: ErrorState }> => {
    try {
      const response = await fetch(`/api/get-bitcoin-node?txid=${encodeURIComponent(txid)}`);
      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || 'Failed to fetch transaction data', {
          cause: { status: data.status, source: data.source },
        });
      }

      return {
        txid: data.txid,
        fee: data.fee || 0,
        size: data.size || 0,
        status: data.status,
        confirmations: data.confirmations || 0,
        version: data.version || 0,
        locktime: data.locktime || 0,
        blockheight: data.blockheight,
        walletType: data.walletType || 'Unknown',
        witness: data.witness || { count: 0, size: 0 },
        inputs: data.inputs || [],
        outputs: data.outputs || [],
        source: data.source,
        timestamp: Date.now(),
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      const errorStatus =
        err instanceof Error && 'cause' in err && typeof (err.cause as ErrorCause).status === 'number'
          ? (err.cause as ErrorCause).status
          : undefined;
      const errorSource =
        err instanceof Error && 'cause' in err ? (err.cause as ErrorCause).source : undefined;

      return {
        error: {
          message: errorMessage,
          status: errorStatus,
          source: errorSource,
        },
      };
    }
  };

  const renderPopupContent = async (txid: string) => {
    const popup = window.open('', '_blank', 'width=800,height=600');
    if (!popup) {
      alert('Popup blocked. Please allow popups for this site.');
      return;
    }

    const data = await fetchTransaction(txid);

    const styles = `
      body {
        font-family: Arial, sans-serif;
        margin: 0;
        padding: 16px;
        background-color: #f7fafc;
      }
      .container {
        max-width: 768px;
        margin: 0 auto;
      }
      .card {
        background-color: white;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        border-radius: 8px;
        padding: 24px;
        position: relative;
      }
      .card-title {
        font-size: 1.5rem;
        font-weight: bold;
        margin-bottom: 16px;
      }
      .text-sm {
        font-size: 0.875rem;
      }
      .text-gray-500 {
        color: #6b7280;
      }
      .text-red-500 {
        color: #ef4444;
      }
      .text-left {
        text-align: left;
      }
      .space-y-2 > * + * {
        margin-top: 8px;
      }
      .font-semibold {
        font-weight: 600;
      }
      .break-all {
        word-break: break-all;
      }
      .list-disc {
        list-style-type: disc;
      }
      .pl-5 {
        padding-left: 20px;
      }
      .absolute {
        position: absolute;
      }
      .top-4 {
        top: 16px;
      }
      .right-4 {
        right: 16px;
      }
      .flex {
        display: flex;
      }
      .space-x-2 > * + * {
        margin-left: 8px;
      }
      .btn {
        padding: 8px 16px;
        border-radius: 4px;
        font-size: 0.875rem;
        cursor: pointer;
        transition: background-color 0.2s;
      }
      .btn-primary {
        background-color: #3b82f6;
        color: white;
        border: none;
      }
      .btn-primary:hover:not(:disabled) {
        background-color: #2563eb;
      }
      .btn-secondary {
        background-color: #6b7280;
        color: white;
        border: none;
      }
      .btn-secondary:hover {
        background-color: #4b5563;
      }
      .btn:disabled {
        background-color: #d1d5db;
        cursor: not-allowed;
      }
      .loading {
        display: inline-block;
        width: 16px;
        height: 16px;
        border: 2px solid #fff;
        border-top-color: transparent;
        border-radius: 50%;
        animation: spin 1s linear infinite;
      }
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    `;

    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Transaction Details</title>
        <style>${styles}</style>
      </head>
      <body>
        <div class="container">
          <div class="card">
            <div class="absolute top-4 right-4 flex space-x-2">
              <button id="refresh-btn" class="btn btn-primary" aria-label="Refresh transaction details">
                Refresh
              </button>
              <button id="close-btn" class="btn btn-secondary" aria-label="Close window">
                Close
              </button>
            </div>
            <h2 class="card-title">Transaction Details</h2>
            <div id="content"></div>
          </div>
        </div>
        <script>
          const txid = ${JSON.stringify(txid)};
          const contentDiv = document.getElementById('content');
          const refreshBtn = document.getElementById('refresh-btn');
          const closeBtn = document.getElementById('close-btn');
          let isLoading = false;

          const calculateFeeRate = (fee, size) => size > 0 ? (fee / size).toFixed(2) : 'N/A';

          const renderContent = (data) => {
            if (data.error) {
              contentDiv.innerHTML = \`
                <p class="text-red-500" role="alert">
                  \${data.error.message}
                  \${data.error.status ? \` (Status: \${data.error.status})\` : ''}
                  \${data.error.source ? \` from \${data.error.source}\` : ''}
                </p>
              \`;
              return;
            }

            contentDiv.innerHTML = \`
              <p class="text-sm text-gray-500 mb-2">Source: \${data.source}</p>
              <dl class="space-y-2">
                <div>
                  <dt class="font-semibold">TXID:</dt>
                  <dd class="break-all">\${data.txid}</dd>
                </div>
                <div>
                  <dt class="font-semibold">Fee:</dt>
                  <dd>\${data.fee ? data.fee.toLocaleString() : '0'} satoshis</dd>
                </div>
                <div>
                  <dt class="font-semibold">Size:</dt>
                  <dd>\${data.size || '0'} bytes</dd>
                </div>
                <div>
                  <dt class="font-semibold">Fee Rate:</dt>
                  <dd>\${calculateFeeRate(data.fee,

 data.size)} sat/vB</dd>
                </div>
                <div>
                  <dt class="font-semibold">Status:</dt>
                  <dd>
                    \${data.status}
                    \${data.confirmations > 0 ? \` (\${data.confirmations} confirmations)\` : ''}
                  </dd>
                </div>
                <div>
                  <dt class="font-semibold">Version:</dt>
                  <dd>\${data.version}</dd>
                </div>
                <div>
                  <dt class="font-semibold">Locktime:</dt>
                  <dd>\${data.locktime}</dd>
                </div>
                \${data.blockheight ? \`
                  <div>
                    <dt class="font-semibold">Block Height:</dt>
                    <dd>\${data.blockheight.toLocaleString()}</dd>
                  </div>
                \` : ''}
                <div>
                  <dt class="font-semibold">Wallet Type:</dt>
                  <dd>\${data.walletType}</dd>
                </div>
                <div>
                  <dt class="font-semibold">Witness Data:</dt>
                  <dd>
                    \${data.witness.count > 0
                      ? \`\${data.witness.count} items, \${data.witness.size} bytes\`
                      : 'None'}
                  </dd>
                </div>
                <div>
                  <dt class="font-semibold">Inputs:</dt>
                  <dd>
                    \${data.inputs.length > 0 ? \`
                      <ul class="list-disc pl-5">
                        \${data.inputs.map((input, index) => \`
                          <li>
                            \${input.address || 'Unknown address'}: \${input.amount.toLocaleString()} satoshis
                            \${input.scriptType ? \` (\${input.scriptType})\` : ''}
                          </li>
                        \`).join('')}
                      </ul>
                    \` : 'No inputs available'}
                  </dd>
                </div>
                <div>
                  <dt class="font-semibold">Outputs:</dt>
                  <dd>
                    \${data.outputs.length > 0 ? \`
                      <ul class="list-disc pl-5">
                        \${data.outputs.map((output, index) => \`
                          <li>
                            \${output.opReturn
                              ? \`OP_RETURN: \${output.opReturn}\`
                              : \`\${output.address || 'Unknown address'}: \${output.amount.toLocaleString()} satoshis\${output.scriptType ? \` (\${output.scriptType})\` : ''}\`}
                          </li>
                        \`).join('')}
                      </ul>
                    \` : 'No outputs available'}
                  </dd>
                </div>
              </dl>
            \`;
          };

          renderContent(${JSON.stringify(data)});

          refreshBtn.addEventListener('click', async () => {
            if (isLoading) return;
            isLoading = true;
            refreshBtn.innerHTML = '<span class="loading"></span>';
            refreshBtn.disabled = true;

            try {
              const response = await fetch(\`/api/get-bitcoin-node?txid=\${encodeURIComponent(txid)}\`);
              const data = await response.json();

              if (!response.ok || data.error) {
                throw new Error(data.error || 'Failed to fetch transaction data');
              }

              renderContent({
                txid: data.txid,
                fee: data.fee || 0,
                size: data.size || 0,
                status: data.status,
                confirmations: data.confirmations || 0,
                version: data.version || 0,
                locktime: data.locktime || 0,
                blockheight: data.blockheight,
                walletType: data.walletType || 'Unknown',
                witness: data.witness || { count: 0, size: 0 },
                inputs: data.inputs || [],
                outputs: data.outputs || [],
                source: data.source,
                timestamp: Date.now(),
              });
            } catch (err) {
              renderContent({
                error: {
                  message: err.message || 'An error occurred',
                  status: err.cause?.status,
                  source: err.cause?.source,
                },
              });
            } finally {
              isLoading = false;
              refreshBtn.innerHTML = 'Refresh';
              refreshBtn.disabled = false;
            }
          });

          closeBtn.addEventListener('click', () => window.close());
        </script>
      </body>
      </html>
    `;

    popup.document.write(html);
    popup.document.close();
  };

  const handleSearch = async (txid: string) => {
    if (!txid.trim()) {
      setError({ message: 'Please provide a valid TXID', status: undefined, source: undefined });
      return;
    }

    setIsSearching(true);
    setError(null);

    const result = await fetchTransaction(txid);
    if ('error' in result) {
      setError(result.error);
      setIsSearching(false);
      return;
    }

    setTxHistory((prev) => {
      const updated = [result, ...prev.filter((tx) => tx.txid !== result.txid)].slice(0, 20);
      return updated;
    });

    await renderPopupContent(txid);
    setIsSearching(false);
  };

  const handleHistoryClick = async (txid: string) => {
    await renderPopupContent(txid);
  };

  const clearHistory = () => {
    setTxHistory([]);
    localStorage.removeItem('txHistory');
  };

  const handleSort = (field: keyof TxData) => {
    if (field === sortField) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const filteredHistory = txHistory
    .filter((tx) => statusFilter === 'all' || tx.status === statusFilter)
    .filter((tx) => sourceFilter === 'all' || tx.source === sourceFilter)
    .sort((a, b) => {
      const aValue = a[sortField];
      const bValue = b[sortField];
      const direction = sortDirection === 'asc' ? 1 : -1;
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return (aValue - bValue) * direction;
      }
      return String(aValue).localeCompare(String(bValue)) * direction;
    });

  return (
    <ErrorBoundary
      fallback={<div className="text-red-500 text-center">Something went wrong!</div>}
    >
      <div className="container mx-auto p-4 text-center">
        <h1 className="text-4xl font-bold mb-4">A BITCOIN MEMPOOL App</h1>
        <p className="text-lg mb-6">
          Inspect the Bitcoin Mempool in real-time with this Next.js app powered by Tailwind CSS
          and DaisyUI.
        </p>

        <section className="card bg-base-100 shadow-xl mx-auto max-w-md mb-8">
          <div className="card-body">
            <h2 className="card-title">Search Transaction</h2>
            <div className="form-control">
              <label htmlFor="txid" className="label">
                <span className="label-text">Enter TXID</span>
              </label>
              <div className="flex space-x-2">
                <input
                  id="txid"
                  type="text"
                  value={txidInput}
                  onChange={(e) => setTxidInput(e.target.value)}
                  placeholder="e.g., abc123..."
                  className="input input-bordered w-full"
                  aria-label="Transaction ID"
                />
                <button
                  className="btn btn-primary"
                  onClick={() => handleSearch(txidInput)}
                  disabled={isSearching || !txidInput.trim()}
                  aria-label="Search transaction"
                >
                  {isSearching ? (
                    <span className="loading loading-spinner"></span>
                  ) : (
                    'Search'
                  )}
                </button>
              </div>
            </div>
            {error && error.message.includes('Transaction') && (
              <p className="text-red-500 mt-2" role="alert">
                {error.message}
                {error.status && ` (Status: ${error.status})`}
                {error.source && ` from ${error.source}`}
              </p>
            )}
          </div>
        </section>

        {txHistory.length > 0 && (
          <section className="card bg-base-100 shadow-xl mx-auto max-w-5xl mb-8">
            <div className="card-body">
              <div className="flex justify-between items-center">
                <h2 className="card-title">Recent Mempool Transactions</h2>
                <button
                  className="btn btn-warning btn-sm"
                  onClick={clearHistory}
                  aria-label="Clear transaction history"
                >
                  Clear History
                </button>
              </div>
              <p className="text-sm text-gray-500 mb-4">
                Showing recent transactions from the mempool and your manual searches. Updated every
                30 seconds.
              </p>
              <div className="flex space-x-4 mb-4">
                <div className="form-control">
                  <label htmlFor="status-filter" className="label">
                    <span className="label-text">Filter by Status</span>
                  </label>
                  <select
                    id="status-filter"
                    className="select select-bordered"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    aria-label="Filter transactions by status"
                  >
                    <option value="all">All</option>
                    <option value="pending">Pending</option>
                    <option value="confirmed">Confirmed</option>
                  </select>
                </div>
                <div className="form-control">
                  <label htmlFor="source-filter" className="label">
                    <span className="label-text">Filter by Source</span>
                  </label>
                  <select
                    id="source-filter"
                    className="select select-bordered"
                    value={sourceFilter}
                    onChange={(e) => setSourceFilter(e.target.value)}
                    aria-label="Filter transactions by source"
                  >
                    <option value="all">All</option>
                    <option value="Local Bitcoin Node">Local Bitcoin Node</option>
                    <option value="Mempool.space">Mempool.space</option>
                  </select>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="table w-full">
                  <thead>
                    <tr>
                      <th>
                        <button
                          className="btn btn-ghost btn-xs"
                          onClick={() => handleSort('txid')}
                          aria-label="Sort by TXID"
                        >
                          TXID {sortField === 'txid' && (sortDirection === 'asc' ? '↑' : '↓')}
                        </button>
                      </th>
                      <th>
                        <button
                          className="btn btn-ghost btn-xs"
                          onClick={() => handleSort('fee')}
                          aria-label="Sort by Fee"
                        >
                          Fee (sat) {sortField === 'fee' && (sortDirection === 'asc' ? '↑' : '↓')}
                        </button>
                      </th>
                      <th>
                        <button
                          className="btn btn-ghost btn-xs"
                          onClick={() => handleSort('size')}
                          aria-label="Sort by Size"
                        >
                          Size (bytes) {sortField === 'size' && (sortDirection === 'asc' ? '↑' : '↓')}
                        </button>
                      </th>
                      <th>Fee Rate (sat/vB)</th>
                      <th>
                        <button
                          className="btn btn-ghost btn-xs"
                          onClick={() => handleSort('status')}
                          aria-label="Sort by Status"
                        >
                          Status {sortField === 'status' && (sortDirection === 'asc' ? '↑' : '↓')}
                        </button>
                      </th>
                      <th>
                        <button
                          className="btn btn-ghost btn-xs"
                          onClick={() => handleSort('source')}
                          aria-label="Sort by Source"
                        >
                          Source {sortField === 'source' && (sortDirection === 'asc' ? '↑' : '↓')}
                        </button>
                      </th>
                      <th>
                        <button
                          className="btn btn-ghost btn-xs"
                          onClick={() => handleSort('timestamp')}
                          aria-label="Sort by Time"
                        >
                          Time {sortField === 'timestamp' && (sortDirection === 'asc' ? '↑' : '↓')}
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHistory.map((tx) => (
                      <tr key={tx.txid}>
                        <td className="whitespace-nowrap">
                          <button
                            className="text-blue-600 hover:underline"
                            onClick={() => handleHistoryClick(tx.txid)}
                            aria-label={`View details for transaction ${tx.txid}`}
                            title={tx.txid}
                          >
                            {tx.txid}
                          </button>
                        </td>
                        <td>{tx.fee ? tx.fee.toLocaleString() : '0'}</td>
                        <td>{tx.size || '0'}</td>
                        <td>{calculateFeeRate(tx.fee, tx.size)}</td>
                        <td>
                          {tx.status}
                          {tx.confirmations > 0 && ` (${tx.confirmations} confirmations)`}
                        </td>
                        <td>{tx.source}</td>
                        <td>{new Date(tx.timestamp).toLocaleTimeString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {error && !error.message.includes('Transaction') && (
          <p className="text-red-500 mb-4" role="alert">
            {error.message}
            {error.status && ` (Status: ${error.status})`}
            {error.source && ` from ${error.source}`}
          </p>
        )}
        {isLoading && !mempoolData && (
          <div className="flex justify-center mb-4">
            <span className="loading loading-spinner loading-lg text-primary"></span>
          </div>
        )}
        {mempoolData && (
          <section className="card bg-base-100 shadow-xl mx-auto max-w-md mb-8">
            <div className="card-body">
              <h2 className="card-title">Mempool Statistics</h2>
              <p className="text-sm text-gray-500 mb-2">Source: {mempoolData.source} (HTTP)</p>
              <dl className="space-y-2 text-left">
                <div>
                  <dt className="font-semibold">Transaction Count:</dt>
                  <dd>{mempoolData.count.toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="font-semibold">Total Fees:</dt>
                  <dd>{mempoolData.total_fee.toLocaleString()} satoshis</dd>
                </div>
                <div>
                  <dt className="font-semibold">Mempool Size:</dt>
                  <dd>{(mempoolData.vsize / 1_000_000).toFixed(2)} MB</dd>
                </div>
              </dl>
              <div className="card-actions justify-end">
                <button
                  className="btn btn-primary"
                  onClick={async () => {
                    setIsLoading(true);
                    setMempoolData(null);
                    setError(null);
                    try {
                      const response = await fetch('/api/get-bitcoin-node');
                      const data = await response.json();
                      if (!response.ok || data.error) {
                        throw new Error(data.error || 'Failed to refresh mempool data', {
                          cause: { status: data.status, source: data.source },
                        });
                      }
                      setMempoolData({
                        count: data.count,
                        total_fee: data.total_fee,
                        vsize: data.vsize,
                        source: data.source,
                      });
                      setError(null);
                    } catch (err) {
                      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
                      const errorStatus =
                        err instanceof Error && 'cause' in err && typeof (err.cause as ErrorCause).status === 'number'
                          ? (err.cause as ErrorCause).status
                          : undefined;
                      const errorSource =
                        err instanceof Error && 'cause' in err
                          ? (err.cause as ErrorCause).source
                          : undefined;

                      setError({
                        message: errorMessage,
                        status: errorStatus,
                        source: errorSource,
                      });
                    } finally {
                      setIsLoading(false);
                    }
                  }}
                  aria-label="Refresh mempool data"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <span className="loading loading-spinner"></span>
                  ) : (
                    'Refresh'
                  )}
                </button>
              </div>
            </div>
          </section>
        )}

        <section className="card bg-base-100 shadow-xl mx-auto max-w-3xl">
          <div className="card-body text-base-content">
            <h2 className="card-title text-2xl mb-4">About This App</h2>
            <p className="mb-4">
              This application displays real-time Bitcoin mempool data and recent transactions,
              sourced from{' '}
              {mempoolData?.source || error?.source || 'a configured Bitcoin node or Mempool.space'}.
              It shows pending transactions, total fees, mempool size, and detailed transaction
              information including fee rates, inputs/outputs, confirmations, wallet type, witness
              data, and OP_RETURN data. The transaction history includes recent mempool transactions
              (updated every 30 seconds) and your manual searches. Click a TXID to view details in a
              popup window with refresh and close options. Use the refresh button in the mempool
              section for manual updates.
            </p>
            <p>
              For more details, explore the{' '}
              <a
                href="https://mempool.space/api"
                className="link link-primary"
                target="_blank"
                rel="noopener noreferrer"
              >
                Mempool.space API documentation
              </a>{' '}
              or your local node’s API if configured.
            </p>
          </div>
        </section>
      </div>
    </ErrorBoundary>
  );
}