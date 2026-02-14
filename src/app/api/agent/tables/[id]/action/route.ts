import { NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/auth/api-key';
import { getGameManager } from '@/lib/game/game-manager';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await authenticateApiKey(request);
  if (!user) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
  }

  const { id: tableId } = await params;
  const body = await request.json();
  const { agentId, action, amount } = body;

  if (!agentId || !action) {
    return NextResponse.json(
      { error: 'Missing required fields: agentId, action' },
      { status: 400 },
    );
  }

  const validActions = ['fold', 'check', 'call', 'bet', 'raise', 'all-in'];
  if (!validActions.includes(action)) {
    return NextResponse.json(
      { error: `Invalid action. Must be one of: ${validActions.join(', ')}` },
      { status: 400 },
    );
  }

  // Verify the agent belongs to this user by checking the table
  const gm = getGameManager();
  const table = gm.getTable(tableId);
  if (!table) {
    return NextResponse.json({ error: 'Table not found' }, { status: 404 });
  }

  const seat = table.seats.find(s => s.agent?.id === agentId);
  if (!seat) {
    return NextResponse.json({ error: 'Agent not found at this table' }, { status: 404 });
  }

  const result = gm.submitAction(tableId, agentId, action, amount);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
