import { NextResponse } from 'next/server';

interface MempoolStats {
  count: number;
  total_fee: number;
  vsize: number;
  source: string;
}

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
  blockheight?: number;
  status?: { confirmed: boolean; block_height?: number; confirmations?: number };
}

/**
 * API Route: /api/get-bitcoin-node
 *
 * Fetches Bitcoin mempool data or searches for a specific transaction by TXID.
 *
 * Query Parameters:
 * - txid (optional): Transaction ID to search for (e.g., abc123...)
 *
 * Environment Variables (in .env.local):
 * - BITCOIN_NODE_URL: URL of the local Bitcoin node's endpoint (e.g., http://localhost:8332)
 * - BITCOIN_NODE_AUTH: Basic auth credentials (e.g., username:password)
 *
 * Expected Response Formats:
 * - Mempool Stats (no txid): { count: number, total_fee: number, vsize: number, source: string }
 * - Transaction Search (with txid): { txid, fee, size, status, confirmations, version, locktime, blockheight?, walletType, witness, inputs, outputs, source }
 * - Error: { error, source, status? }
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const txid = searchParams.get('txid');

  let apiUrl = 'https://mempool.space/api/mempool';
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

    if (txid) {
      if (isRpc && nodeUrl) {
        let fee = 0;
        let size = 0;
        let status = 'pending';
        let confirmations = 0;
        let version = 0;
        let locktime = 0;
        let inputs: { address?: string; amount: number; scriptType?: string }[] = [];
        let outputs: { address?: string; amount: number; scriptType?: string; opReturn?: string }[] = [];
        const witness = { count: 0, size: 0 };

        const mempoolResponse = await fetch(nodeUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({ jsonrpc: '2.0', method: 'getmempoolentry', params: [txid], id: 1 }),
          signal: controller.signal,
        });

        if (mempoolResponse.ok) {
          const mempoolData = await mempoolResponse.json();
          if (mempoolData.result) {
            fee = Number((mempoolData.result.fee * 1e8).toFixed(0)) || 0;
            size = mempoolData.result.vsize || 0;
          }
        }

        const txResponse = await fetch(nodeUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({ jsonrpc: '2.0', method: 'getrawtransaction', params: [txid, true], id: 2 }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!txResponse.ok) {
          throw new Error(`HTTP ${txResponse.status}: Failed to fetch transaction ${txid} from ${source}`);
        }

        const txData = await txResponse.json();
        if (txData.error || !txData.result) {
          return NextResponse.json(
            { error: `Transaction ${txid} not found`, source, status: 404 },
            { status: 404 }
          );
        }

        const tx: RawTransaction = txData.result;
        status = tx.confirmations && tx.confirmations > 0 ? 'confirmed' : status;
        confirmations = tx.confirmations || 0;
        version = tx.version || 0;
        locktime = tx.locktime || 0;
        const blockheight: number | undefined = tx.blockheight;

        inputs = tx.vin.map((input: RawInput) => ({
          address: input.prevout?.scriptPubKey?.address || undefined,
          amount: input.prevout?.value ? Number((input.prevout.value * 1e8).toFixed(0)) : 0,
          scriptType: input.prevout?.scriptPubKey?.type || undefined,
        }));

        outputs = tx.vout.map((output: RawOutput) => {
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
            amount: Number(((output.value ?? 0) * 1e8).toFixed(0)) || 0,
            scriptType: output.scriptPubKey?.type || undefined,
            opReturn,
          };
        });

        witness.count = tx.vin.reduce((sum: number, input: RawInput) => sum + (input.txinwitness?.length || 0), 0);
        witness.size = tx.vin.reduce((sum: number, input: RawInput) => {
          if (input.txinwitness) {
            const hex = input.txinwitness.join('');
            return sum + Math.ceil(hex.length / 2);
          }
          return sum;
        }, 0);

        if (fee === 0 && inputs.length > 0 && outputs.length > 0) {
          const inputTotal = inputs.reduce((sum, input) => sum + input.amount, 0);
          const outputTotal = outputs.reduce((sum, output) => sum + output.amount, 0);
          fee = inputTotal - outputTotal >= 0 ? inputTotal - outputTotal : 0;
        }

        const scriptTypes = Array.from(
          new Set([
            ...inputs.map((i) => i.scriptType),
            ...outputs.map((o) => o.scriptType), // Fixed: Replaced i with o
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

        const normalizedData: TransactionResponse = {
          txid,
          fee,
          size,
          status,
          confirmations,
          version,
          locktime,
          blockheight,
          walletType,
          witness,
          inputs,
          outputs,
          source,
        };

        return NextResponse.json(normalizedData, {
          headers: {
            'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=59',
          },
        });
      } else {
        apiUrl = `https://mempool.space/api/tx/${txid}`;
        const response = await fetch(apiUrl, { headers, signal: controller.signal });

        clearTimeout(timeoutId);

        if (!response.ok) {
          return NextResponse.json(
            { error: `Transaction ${txid} not found in mempool`, source, status: 404 },
            { status: 404 }
          );
        }

        const data: RawTransaction = await response.json();

        const inputs: { address?: string; amount: number; scriptType?: string }[] = data.vin.map((input: RawInput) => ({
          address: input.prevout?.scriptpubkey_address || input.prevout?.scriptPubKey?.address || undefined,
          amount: input.prevout?.value ? Number((input.prevout.value * 1e8).toFixed(0)) : 0,
          scriptType: input.prevout?.scriptpubkey_type || input.prevout?.scriptPubKey?.type || undefined,
        }));

        const outputs: { address?: string; amount: number; scriptType?: string; opReturn?: string }[] = data.vout.map(
          (output: RawOutput) => {
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
              address: output.scriptpubkey_address || output.scriptPubKey?.address || undefined,
              amount: Number(((output.value ?? 0) * 1e8).toFixed(0)) || 0,
              scriptType: output.scriptpubkey_type || output.scriptPubKey?.type || undefined,
              opReturn,
            };
          }
        );

        const witness = {
          count: data.vin.reduce((sum: number, input: RawInput) => sum + ((input.witness || input.txinwitness)?.length || 0), 0),
          size: data.vin.reduce((sum: number, input: RawInput) => {
            if (input.witness || input.txinwitness) {
              const hex = (input.witness || input.txinwitness)!.join('');
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

        const normalizedData: TransactionResponse = {
          txid: data.txid,
          fee: data.fee || 0,
          size: data.size || 0,
          status: data.status?.confirmed ? 'confirmed' : 'pending',
          confirmations: data.status?.confirmations || 0,
          version: data.version || 0,
          locktime: data.locktime || 0,
          blockheight: data.status?.block_height,
          walletType,
          witness,
          inputs,
          outputs,
          source,
        };

        return NextResponse.json(normalizedData, {
          headers: {
            'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=59',
          },
        });
      }
    } else {
      const response = await fetch(apiUrl, {
        headers,
        signal: controller.signal,
        ...(isRpc
          ? {
              method: 'POST',
              body: JSON.stringify({ jsonrpc: '2.0', method: 'getmempoolinfo', id: 1 }),
            }
          : {}),
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to fetch mempool data from ${source}`);
      }

      const data = await response.json();

      if (!data || (isRpc && !data.result)) {
        throw new Error(`Invalid response from ${source}: Empty or malformed data`);
      }

      let normalizedData: MempoolStats;
      if (isRpc) {
        const mempoolInfo = data.result;
        normalizedData = {
          count: mempoolInfo.size || 0,
          total_fee: 0,
          vsize: mempoolInfo.bytes || 0,
          source,
        };
      } else {
        normalizedData = {
          count: data.count || 0,
          total_fee: data.total_fee || 0,
          vsize: data.vsize || 0,
          source,
        };
      }

      return NextResponse.json(normalizedData, {
        headers: {
          'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=59',
        },
      });
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