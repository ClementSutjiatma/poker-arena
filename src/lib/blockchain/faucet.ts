const TEMPO_RPC_URL = 'https://rpc.moderato.tempo.xyz';

/**
 * Claim testnet stablecoins from Tempo's faucet RPC.
 * The faucet sends a fixed amount of each testnet stablecoin (aUSD, BetaUSD, ThetaUSD, PathUSD).
 */
export async function mintTestnetTokens(
  walletAddress: string,
): Promise<{ success: boolean; txHashes?: string[]; error?: string }> {
  if (
    !walletAddress ||
    typeof walletAddress !== 'string' ||
    !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)
  ) {
    return { success: false, error: 'Invalid wallet address' };
  }

  const rpcResponse = await fetch(TEMPO_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'tempo_fundAddress',
      params: [walletAddress],
      id: 1,
    }),
  });

  const rpcData = await rpcResponse.json();

  if (rpcData.error) {
    return { success: false, error: rpcData.error.message ?? 'Faucet RPC failed' };
  }

  return { success: true, txHashes: rpcData.result ?? [] };
}
