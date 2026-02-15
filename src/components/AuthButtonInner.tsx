'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useReadContract } from 'wagmi';
import { formatUnits } from 'viem';
import { ERC20_ABI } from '@/lib/blockchain/abi';
import { AUSD_ADDRESS, tempoTestnet } from '@/lib/blockchain/chain-config';

export default function AuthButtonInner() {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { ready: walletsReady, wallets } = useWallets();

  const embeddedWallet = wallets.find((w) => w.walletClientType === 'privy');
  const walletAddress = embeddedWallet?.address as `0x${string}` | undefined;

  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: AUSD_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: walletAddress ? [walletAddress] : undefined,
    chainId: tempoTestnet.id,
    query: { enabled: !!walletAddress, refetchInterval: 10_000 },
  });

  const [minting, setMinting] = useState(false);
  const [agentName, setAgentName] = useState<string | null>(null);

  // Read agent name from localStorage
  useEffect(() => {
    if (authenticated) {
      setAgentName(localStorage.getItem('openclaw_agent_name'));
    }
  }, [authenticated]);

  const handleMint = useCallback(async () => {
    if (!walletAddress || minting) return;
    setMinting(true);
    try {
      const res = await fetch('/api/faucet/mint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress }),
      });
      if (res.ok) {
        setTimeout(() => refetchBalance(), 2000);
      }
    } catch {
      // ignore
    } finally {
      setMinting(false);
    }
  }, [walletAddress, minting, refetchBalance]);

  if (!ready || (authenticated && !walletsReady)) {
    return (
      <div className="h-8 w-20 bg-gray-800 rounded-lg animate-pulse" />
    );
  }

  if (!authenticated) {
    return (
      <button
        onClick={login}
        className="px-3 py-1.5 text-sm font-medium bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded-lg hover:bg-emerald-600/30 transition cursor-pointer"
      >
        Sign In
      </button>
    );
  }

  const displayName = agentName || getUserDisplayName(user);
  const truncatedWallet = walletAddress
    ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
    : null;
  const formattedBalance = balance !== undefined
    ? parseFloat(formatUnits(balance, 6)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : null;

  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-col items-end gap-0.5">
        <span className="text-sm text-gray-300 hidden sm:inline">{displayName}</span>
        {truncatedWallet && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-gray-500 font-mono">{truncatedWallet}</span>
            {formattedBalance !== null && (
              <span className="text-[10px] text-emerald-400 font-medium">
                {formattedBalance} aUSD
              </span>
            )}
            {walletAddress && (
              <button
                onClick={handleMint}
                disabled={minting}
                className="text-[10px] text-yellow-400/80 hover:text-yellow-300 font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                title="Mint testnet aUSD"
              >
                {minting ? '...' : '+Mint'}
              </button>
            )}
          </div>
        )}
      </div>
      <button
        onClick={logout}
        className="px-3 py-1.5 text-sm font-medium bg-gray-700/50 text-gray-400 border border-gray-600/30 rounded-lg hover:bg-gray-700/80 hover:text-gray-200 transition cursor-pointer"
      >
        Sign Out
      </button>
    </div>
  );
}

function getUserDisplayName(user: ReturnType<typeof usePrivy>['user']): string {
  if (!user) return 'User';
  if (user.google?.name) return user.google.name;
  if (user.email?.address) return user.email.address;
  if (user.google?.email) return user.google.email;
  const id = user.id;
  if (id.startsWith('did:privy:')) {
    return id.slice(10, 18) + '...';
  }
  return id.slice(0, 8) + '...';
}
