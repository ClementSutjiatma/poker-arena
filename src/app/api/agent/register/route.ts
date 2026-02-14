import { NextResponse } from 'next/server';
import { PrivyClient, isEmbeddedWalletLinkedAccount } from '@privy-io/node';
import type { User as PrivyUser } from '@privy-io/node';
import { getDb } from '@/lib/db/index';
import { generateApiKey } from '@/lib/auth/api-key';

export const dynamic = 'force-dynamic';

function getPrivyClient(): PrivyClient {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error('Missing Privy env vars');
  }
  return new PrivyClient({ appId, appSecret });
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing Authorization header with Privy user ID' },
        { status: 401 },
      );
    }

    // The agent sends their Privy user ID (did:privy:...)
    // We verify by fetching the user from Privy's API (requires valid app credentials)
    const privyUserId = authHeader.slice(7).trim();
    if (!privyUserId.startsWith('did:privy:')) {
      return NextResponse.json(
        { error: 'Invalid Privy user ID format. Expected did:privy:...' },
        { status: 401 },
      );
    }

    const privy = getPrivyClient();

    // Verify user exists in our Privy app by fetching them
    let privyUser: PrivyUser;
    try {
      privyUser = await privy.users()._get(privyUserId);
    } catch {
      return NextResponse.json(
        { error: 'User not found in Privy. Please sign in first at the Poker Arena website.' },
        { status: 401 },
      );
    }

    // Find the embedded wallet
    const embeddedWallet = privyUser.linked_accounts.find(
      (a) => isEmbeddedWalletLinkedAccount(a) && a.chain_type === 'ethereum',
    );

    const walletAddress = embeddedWallet && 'address' in embeddedWallet ? embeddedWallet.address : null;
    const privyWalletId = embeddedWallet && 'id' in embeddedWallet ? (embeddedWallet.id ?? null) : null;

    // Extract email and display name from linked accounts
    const emailAccount = privyUser.linked_accounts.find((a) => a.type === 'email') as { address?: string } | undefined;
    const googleAccount = privyUser.linked_accounts.find((a) => a.type === 'google_oauth') as { email?: string; name?: string | null } | undefined;

    const email = emailAccount?.address ?? googleAccount?.email ?? null;
    const displayName = googleAccount?.name ?? email ?? null;

    const db = getDb();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    }

    // Parse optional display name from body
    let bodyName: string | null = null;
    try {
      const body = await request.json();
      if (body.displayName && typeof body.displayName === 'string') {
        bodyName = body.displayName.trim().slice(0, 128);
      }
    } catch {
      // No body or invalid JSON — that's fine
    }

    const userId = `user_${privyUserId.replace('did:privy:', '')}`;
    const finalDisplayName = bodyName || displayName;

    // Upsert user
    const { error: upsertError } = await db
      .from('users')
      .upsert(
        {
          id: userId,
          privy_user_id: privyUserId,
          email,
          display_name: finalDisplayName,
          wallet_address: walletAddress,
          privy_wallet_id: privyWalletId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'privy_user_id' },
      );

    if (upsertError) {
      console.error('[agent/register] Failed to upsert user:', upsertError);
      return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
    }

    // Check if user already has an active API key
    const { data: existingKey } = await db
      .from('api_keys')
      .select('id, key_prefix')
      .eq('user_id', userId)
      .eq('is_active', true)
      .limit(1)
      .single();

    if (existingKey) {
      // Deactivate old key so we can issue a new one
      await db
        .from('api_keys')
        .update({ is_active: false })
        .eq('id', existingKey.id);
    }

    // Generate new API key
    const { apiKey, keyHash, keyPrefix } = generateApiKey();
    const keyId = `key_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

    const { error: keyError } = await db.from('api_keys').insert({
      id: keyId,
      user_id: userId,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      name: 'default',
      is_active: true,
    });

    if (keyError) {
      console.error('[agent/register] Failed to create API key:', keyError);
      return NextResponse.json({ error: 'Failed to create API key' }, { status: 500 });
    }

    return NextResponse.json({
      userId,
      apiKey,
      walletAddress,
      displayName: finalDisplayName,
      message: 'Registration successful. Store your API key — it will not be shown again.',
    });
  } catch (err) {
    console.error('[agent/register] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
