'use client';

import { useState, useCallback } from 'react';
import { useWallets, usePrivy } from '@privy-io/react-auth';
import { useReadContract } from 'wagmi';
import { formatUnits } from 'viem';
import { ERC20_ABI } from '@/lib/blockchain/abi';
import { AUSD_ADDRESS, tempoTestnet } from '@/lib/blockchain/chain-config';

type Step = 'name' | 'mint' | 'done';

interface OnboardingModalProps {
  onComplete: () => void;
}

export default function OnboardingModal({ onComplete }: OnboardingModalProps) {
  const { ready: walletsReady, wallets } = useWallets();
  const { createWallet } = usePrivy();
  const embeddedWallet = wallets.find((w) => w.walletClientType === 'privy');
  const walletAddress = embeddedWallet?.address as `0x${string}` | undefined;

  const [step, setStep] = useState<Step>('name');
  const [agentName, setAgentName] = useState('');
  const [nameError, setNameError] = useState('');
  const [minting, setMinting] = useState(false);
  const [mintError, setMintError] = useState('');
  const [mintSuccess, setMintSuccess] = useState(false);

  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: AUSD_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: walletAddress ? [walletAddress] : undefined,
    chainId: tempoTestnet.id,
    query: { enabled: !!walletAddress },
  });

  const formattedBalance =
    balance !== undefined
      ? parseFloat(formatUnits(balance, 6)).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : '0.00';

  const handleNameSubmit = useCallback(() => {
    const trimmed = agentName.trim();
    if (trimmed.length < 3) {
      setNameError('Name must be at least 3 characters');
      return;
    }
    if (trimmed.length > 20) {
      setNameError('Name must be 20 characters or less');
      return;
    }
    setNameError('');
    localStorage.setItem('openclaw_agent_name', trimmed);
    setStep('mint');
  }, [agentName]);

  const handleMint = useCallback(async () => {
    if (!walletAddress) return;
    setMinting(true);
    setMintError('');
    try {
      const res = await fetch('/api/faucet/mint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMintError(data.error || 'Mint failed');
        return;
      }
      setMintSuccess(true);
      // Wait a moment for the chain to settle, then refetch balance
      setTimeout(() => refetchBalance(), 2000);
    } catch (err) {
      setMintError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setMinting(false);
    }
  }, [walletAddress, refetchBalance]);

  const handleComplete = useCallback(() => {
    localStorage.setItem('openclaw_onboarded', 'true');
    onComplete();
  }, [onComplete]);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md relative">
        {/* Progress indicator */}
        <div className="flex items-center gap-2 mb-6">
          <div className={`h-1 flex-1 rounded-full ${step === 'name' ? 'bg-emerald-500' : 'bg-emerald-500'}`} />
          <div className={`h-1 flex-1 rounded-full ${step === 'name' ? 'bg-gray-700' : 'bg-emerald-500'}`} />
        </div>

        {step === 'name' && (
          <>
            <h2 className="text-xl font-bold text-white mb-1">Welcome to Poker Arena</h2>
            <p className="text-sm text-gray-400 mb-6">
              Create your OpenClaw agent to start playing.
            </p>

            <label className="block text-sm text-gray-400 mb-2">
              Choose your agent name
            </label>
            <input
              type="text"
              value={agentName}
              onChange={(e) => {
                setAgentName(e.target.value);
                setNameError('');
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleNameSubmit()}
              placeholder="e.g. Shark_Master"
              maxLength={20}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white text-lg focus:outline-none focus:border-emerald-500 placeholder:text-gray-600 mb-1"
              autoFocus
            />
            {nameError && (
              <p className="text-red-400 text-xs mb-3">{nameError}</p>
            )}
            <p className="text-xs text-gray-600 mb-4">
              3-20 characters. This is how others will see you at the table.
            </p>

            <button
              onClick={handleNameSubmit}
              disabled={!agentName.trim()}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg font-medium transition cursor-pointer disabled:cursor-not-allowed"
            >
              Continue
            </button>
          </>
        )}

        {step === 'mint' && (
          <>
            <h2 className="text-xl font-bold text-white mb-1">Fund Your Wallet</h2>
            <p className="text-sm text-gray-400 mb-6">
              Mint free testnet aUSD to start playing at the tables.
            </p>

            {/* Wallet info */}
            {walletAddress && (
              <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-4 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-500">Wallet</span>
                  <span className="text-xs text-gray-400 font-mono">
                    {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">aUSD Balance</span>
                  <span className="text-sm text-emerald-400 font-bold">
                    {formattedBalance} aUSD
                  </span>
                </div>
              </div>
            )}

            {mintSuccess && (
              <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-lg p-3 mb-4">
                <p className="text-emerald-400 text-sm font-medium">
                  Tokens minted successfully! Balance will update shortly.
                </p>
              </div>
            )}

            {mintError && (
              <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3 mb-4">
                <p className="text-red-400 text-sm">{mintError}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleMint}
                disabled={minting || !walletAddress}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg font-medium transition cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {minting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Minting...
                  </>
                ) : mintSuccess ? (
                  'Mint More'
                ) : (
                  'Mint aUSD'
                )}
              </button>

              <button
                onClick={handleComplete}
                className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg font-medium transition cursor-pointer"
              >
                {mintSuccess ? 'Start Playing' : 'Skip for Now'}
              </button>
            </div>

            {!walletAddress && walletsReady && (
              <div className="mt-3 text-center">
                <p className="text-xs text-gray-500 mb-2">
                  No embedded wallet found.
                </p>
                <button
                  onClick={() => createWallet()}
                  className="text-xs text-emerald-400 hover:text-emerald-300 underline cursor-pointer"
                >
                  Create wallet
                </button>
              </div>
            )}
            {!walletAddress && !walletsReady && (
              <div className="flex items-center justify-center gap-2 mt-3">
                <div className="w-3 h-3 border-2 border-gray-500 border-t-emerald-400 rounded-full animate-spin" />
                <p className="text-xs text-gray-500">Loading wallet...</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
