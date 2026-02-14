import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const TEMPO_RPC_URL = 'https://rpc.moderato.tempo.xyz';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { walletAddress } = body;

    if (
      !walletAddress ||
      typeof walletAddress !== 'string' ||
      !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)
    ) {
      return NextResponse.json(
        { error: 'Invalid wallet address' },
        { status: 400 },
      );
    }

    // Call Tempo's built-in testnet faucet RPC method.
    // This sends 1M of each testnet stablecoin (AlphaUSD, BetaUSD, ThetaUSD, PathUSD).
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
      return NextResponse.json(
        { error: rpcData.error.message ?? 'Faucet RPC failed' },
        { status: 502 },
      );
    }

    return NextResponse.json({
      success: true,
      txHashes: rpcData.result ?? [],
    });
  } catch (err) {
    console.error('[faucet] Mint error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
