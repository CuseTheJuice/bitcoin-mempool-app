import { NextResponse } from 'next/server';

interface TransactionResponse {
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
}

interface RawInput {
  prevout?: {
    scriptPubKey?: { address?: string; type?: string };
    scriptpubkey_address?: string;
    scriptpubkey_type?: string;
    value?: number;
  };
  txinwitness?: string[];
  witness?: string[];
}

interface RawOutput {
  scriptPubKey?: { address?: string; type?: string; asm?: string };
  scriptpubkey_address?: string;
  scriptpubkey_type?: string;
  scriptpubkey_asm?: string;
  value?: number;
}

interface RawTransaction {
  txid: string;
  fee?: number;
  size?: number;
  vin: RawInput[];
  vout: RawOutput[];
  confirmations?: number;
  version?: number;
  locktime?: number;
  status?: { confirmed: boolean; block_height?: number };
}

/**
 * API Route: /api/get-mempool-txs
 *
 * Fetches recent transactions from the Bitcoin mempool.
 *
 * Query Parameters:
 * - limit (optional): Number of transactions to return (default: 10)
 *
 * Environment Variables (in .env.local):
 * - BITCOIN_NODE_URL: URL of the local Bitcoin node's endpoint (e.g., http://localhost:8332)
 * - BITCOIN_NODE_AUTH: Basic auth credentials (e.g., username:password)
 *
 * Expected Response Format:
 * - 200: [{ txid, fee, size, status, confirmations, version, locktime, blockheight?, walletType, witness, inputs, outputs, source }, ...]
 * - 500: { error, source, status? }
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '10', 10);

  let apiUrl = `https://mempool.space/api/mempool/recent?limit=${limit}`;
  let headers: HeadersInit = {};
  let source = 'Mempool.space';
  let isRpc = false;

  const nodeUrl = process.env.BITCOIN_NODE_URL;
  const nodeAuth = process.env.BITCOIN_NODE_AUTH;

  if (nodeUrl) {
    apiUrl = nodeUrl.endsWith('/mempool') ? nodeUrl : nodeUrl;
    isRpc = !nodeUrl.includes('/mempool');
    source = 'Local Bitcoin Node';
    if (nodeAuth) {
      headers = {
        Authorization: `Basic ${btoa(nodeAuth)}`,
        ...(isRpc ? { 'Content-Type': 'application/json' } : {}),
      };
    }
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    if (isRpc && nodeUrl) {
      const mempoolResponse = await fetch(nodeUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ jsonrpc: '2.0', method: 'getrawmempool', params: [true], id: 1 }),
        signal: controller.signal,
      });

      if (!mempoolResponse.ok) {
        throw new Error(`HTTP ${mempoolResponse.status}: Failed to fetch mempool from ${source}`);
      }

      const mempoolData = await mempoolResponse.json();
      if (mempoolData.error || !mempoolData.result) {
        throw new Error(`Invalid mempool data from ${source}`);
      }

      const txids = Object.keys(mempoolData.result).slice(0, limit);
      const transactions: TransactionResponse[] = [];

      for (const txid of txids) {
        try {
          const txResponse = await fetch(nodeUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({ jsonrpc: '2.0', method: 'getrawtransaction', params: [txid, true], id: 2 }),
            signal: controller.signal,
          });

          if (!txResponse.ok) continue;

          const txData = await txResponse.json();
          if (txData.error || !txData.result) continue;

          const tx: RawTransaction = txData.result;

          const inputs = tx.vin.map((input: RawInput) => ({
            address: input.prevout?.scriptPubKey?.address || undefined,
            amount: input.prevout?.value ? Number((input.prevout.value * 1e8).toFixed(0)) : 0,
            scriptType: input.prevout?.scriptPubKey?.type || undefined,
          }));

          const outputs = tx.vout.map((output: RawOutput) => {
            let opReturn: string | undefined;
            if (output.scriptPubKey?.type === 'nulldata' && output.scriptPubKey?.asm) {
              const asmParts = output.scriptPubKey.asm.split(' ');
              if (asmParts[0] === 'OP_RETURN' && asmParts[1]) {
                try {
                  const hex = asmParts[1];
                  const buffer = Buffer.from(hex, 'hex');
                  opReturn = buffer.toString('utf8').replace(/[^\x20-\x7E]/g, '') || hex;
                } catch {
                  opReturn = output.scriptPubKey.asm;
                }
              }
            }
            return {
              address: output.scriptPubKey?.address || undefined,
              amount: output.value !== undefined ? Number((output.value * 1e8).toFixed(0)) : 0,
              scriptType: output.scriptPubKey?.type || undefined,
              opReturn,
            };
          });

          const witness = {
            count: tx.vin.reduce((sum: number, input: RawInput) => sum + (input.txinwitness?.length || 0), 0),
            size: tx.vin.reduce((sum: number, input: RawInput) => {
              if (input.txinwitness) {
                const hex = input.txinwitness.join('');
                return sum + Math.ceil(hex.length / 2);
              }
              return sum;
            }, 0),
          };

          let fee = 0;
          if (mempoolData.result[txid]) {
            fee = Number((mempoolData.result[txid].fee * 1e8).toFixed(0)) || 0;
          }
          if (fee === 0 && inputs.length > 0 && outputs.length > 0) {
            const inputTotal = inputs.reduce((sum, input) => sum + input.amount, 0);
            const outputTotal = outputs.reduce((sum, output) => sum + output.amount, 0);
            fee = inputTotal - outputTotal >= 0 ? inputTotal - outputTotal : 0;
          }

          const scriptTypes = Array.from(
            new Set([
              ...inputs.map((i) => i.scriptType),
              ...outputs.map((o) => o.scriptType),
            ])
          ).filter((type): type is string => type !== undefined);
          let walletType = 'Unknown';
          if (scriptTypes.includes('p2tr')) {
            walletType = 'Taproot';
          } else if (scriptTypes.includes('v0_p2wpkh') || scriptTypes.includes('v0_p2wsh')) {
            walletType = 'SegWit';
          } else if (scriptTypes.includes('p2pkh') || scriptTypes.includes('p2sh')) {
            walletType = 'Legacy';
          }

          const blockheight = tx.confirmations && tx.confirmations > 0 ? tx.status?.block_height : undefined;

          transactions.push({
            txid,
            fee,
            size: tx.size || 0,
            status: tx.confirmations && tx.confirmations > 0 ? 'confirmed' : 'pending',
            confirmations: tx.confirmations || 0,
            version: tx.version || 0,
            locktime: tx.locktime || 0,
            blockheight,
            walletType,
            witness,
            inputs,
            outputs,
            source,
          });
        } catch (txError) {
          console.error(`Error fetching transaction ${txid}:`, txError);
          continue;
        }
      }

      clearTimeout(timeoutId);
      return NextResponse.json(transactions);
    } else {
      const response = await fetch(apiUrl, { headers, signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to fetch mempool transactions from ${source}`);
      }

      const data: RawTransaction[] = await response.json();

      const transactions: TransactionResponse[] = data.map((tx) => {
        const inputs = tx.vin.map((input: RawInput) => ({
          address: input.prevout?.scriptpubkey_address || undefined,
          amount: input.prevout?.value || 0,
          scriptType: input.prevout?.scriptpubkey_type || undefined,
        }));

        const outputs = tx.vout.map((output: RawOutput) => {
          let opReturn: string | undefined;
          if (output.scriptpubkey_type === 'nulldata' && output.scriptpubkey_asm) {
            const asmParts = output.scriptpubkey_asm.split(' ');
            if (asmParts[0] === 'OP_RETURN' && asmParts[1]) {
              try {
                const hex = asmParts[1];
                const buffer = Buffer.from(hex, 'hex');
                opReturn = buffer.toString('utf8').replace(/[^\x20-\x7E]/g, '') || hex;
              } catch {
                opReturn = output.scriptpubkey_asm;
              }
            }
          }
          return {
            address: output.scriptpubkey_address || undefined,
            amount: output.value || 0,
            scriptType: output.scriptpubkey_type || undefined,
            opReturn,
          };
        });

        const witness = {
          count: tx.vin.reduce((sum: number, input: RawInput) => sum + (input.witness?.length || 0), 0),
          size: tx.vin.reduce((sum: number, input: RawInput) => {
            if (input.witness) {
              const hex = input.witness.join('');
              return sum + Math.ceil(hex.length / 2);
            }
            return sum;
          }, 0),
        };

        const scriptTypes = Array.from(
          new Set([
            ...inputs.map((i) => i.scriptType),
            ...outputs.map((o) => o.scriptType),
          ])
        ).filter((type): type is string => type !== undefined);
        let walletType = 'Unknown';
        if (scriptTypes.includes('p2tr')) {
          walletType = 'Taproot';
        } else if (scriptTypes.includes('v0_p2wpkh') || scriptTypes.includes('v0_p2wsh')) {
          walletType = 'SegWit';
        } else if (scriptTypes.includes('p2pkh') || scriptTypes.includes('p2sh')) {
          walletType = 'Legacy';
        }

        return {
          txid: tx.txid,
          fee: tx.fee || 0,
          size: tx.size || 0,
          status: tx.status?.confirmed ? 'confirmed' : 'pending',
          confirmations: tx.status?.confirmed ? 1 : 0,
          version: tx.version || 0,
          locktime: tx.locktime || 0,
          blockheight: tx.status?.block_height,
          walletType,
          witness,
          inputs,
          outputs,
          source,
        };
      });

      return NextResponse.json(transactions);
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'An error occurred';
    const status = err instanceof Error && errorMessage.includes('HTTP') ? parseInt(errorMessage.split(':')[0].replace('HTTP', '').trim()) : undefined;

    return NextResponse.json(
      {
        error: errorMessage,
        source,
        status,
      },
      { status: status || 500 }
    );
  }
}