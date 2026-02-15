import { NextResponse } from 'next/server';
import { getPlayerOnChainBalance, settlePlayer } from '@/lib/blockchain/escrow-client';

export const dynamic = 'force-dynamic';

/**
 * Emergency refund: returns a player's escrowed funds when their agent
 * has been lost (e.g. due to a server restart).
 *
 * Reads the player's on-chain escrow balance and settles it back to their wallet.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: tableId } = await params;
  const body = await request.json();
  const { walletAddress } = body;

  if (!walletAddress) {
    return NextResponse.json({ error: 'Missing walletAddress' }, { status: 400 });
  }

  try {
    // Read the player's on-chain escrow balance
    const balanceTokenUnits = await getPlayerOnChainBalance(tableId, walletAddress);

    if (balanceTokenUnits <= BigInt(0)) {
      return NextResponse.json({
        success: true,
        message: 'No funds to refund — balance is zero',
        refundedChips: 0,
      });
    }

    // Convert token units (6 decimals) back to chip amount
    const chipAmount = Number(balanceTokenUnits / BigInt(1_000_000));

    // Settle: sends the full escrowed balance back to the player's wallet
    const tx = await settlePlayer(tableId, walletAddress, chipAmount);

    return NextResponse.json({
      success: true,
      refundedChips: chipAmount,
      txHash: tx.hash,
    });
  } catch (err) {
    console.error('[emergency-refund] Failed for', walletAddress, err);
    return NextResponse.json(
      { error: 'Refund failed — please try again or contact support' },
      { status: 500 },
    );
  }
}
