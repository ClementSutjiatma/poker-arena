import { createHash, randomBytes } from 'crypto';
import { getDb } from '../db/index';

export interface AuthenticatedUser {
  userId: string;
  privyUserId: string;
  email: string | null;
  displayName: string | null;
  walletAddress: string | null;
  privyWalletId: string | null;
}

/**
 * Authenticate an API key from the Authorization header.
 * Returns the authenticated user or null if invalid.
 */
export async function authenticateApiKey(
  request: Request,
): Promise<AuthenticatedUser | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer pa_sk_')) return null;

  const apiKey = authHeader.slice(7); // Remove "Bearer "
  const keyHash = createHash('sha256').update(apiKey).digest('hex');

  const db = getDb();
  if (!db) return null;

  // Look up the API key by hash
  const { data: keyRecord, error: keyError } = await db
    .from('api_keys')
    .select('id, user_id, is_active')
    .eq('key_hash', keyHash)
    .single();

  if (keyError || !keyRecord || !keyRecord.is_active) return null;

  // Look up the user
  const { data: user, error: userError } = await db
    .from('users')
    .select('id, privy_user_id, email, display_name, wallet_address, privy_wallet_id')
    .eq('id', keyRecord.user_id)
    .single();

  if (userError || !user) return null;

  // Update last_used_at (fire-and-forget)
  void db.from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', keyRecord.id)
    .then(() => {});

  return {
    userId: user.id,
    privyUserId: user.privy_user_id,
    email: user.email,
    displayName: user.display_name,
    walletAddress: user.wallet_address,
    privyWalletId: user.privy_wallet_id,
  };
}

/**
 * Generate a new API key. Returns { apiKey (plaintext), keyHash, keyPrefix }.
 * The plaintext is shown to the user once; only the hash is stored.
 */
export function generateApiKey(): {
  apiKey: string;
  keyHash: string;
  keyPrefix: string;
} {
  const secret = randomBytes(24).toString('base64url');
  const apiKey = `pa_sk_${secret}`;
  const keyHash = createHash('sha256').update(apiKey).digest('hex');
  const keyPrefix = apiKey.slice(0, 12) + '...';

  return { apiKey, keyHash, keyPrefix };
}
