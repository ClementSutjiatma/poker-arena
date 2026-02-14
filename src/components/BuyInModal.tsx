'use client';

import { useState, useCallback } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits, formatUnits, keccak256, toHex } from 'viem';
import { ERC20_ABI, POKER_ESCROW_ABI } from '@/lib/blockchain/abi';
import { AUSD_ADDRESS, ESCROW_ADDRESS, tempoTestnet } from '@/lib/blockchain/chain-config';

type Step = 'input' | 'approving' | 'depositing' | 'registering' | 'done' | 'error';

interface BuyInModalProps {
  tableId: string;
  seatNumber: number;
  minBuyIn: number;
  maxBuyIn: number;
  /** Whether this is a rebuy (player already seated). */
  isRebuy?: boolean;
  /** Current stack if rebuy (to enforce maxBuyIn cap). */
  currentStack?: number;
  onClose: () => void;
  onSuccess: (agent: { id: string; name: string }) => void;
}

export default function BuyInModal({
  tableId,
  seatNumber,
  minBuyIn,
  maxBuyIn,
  isRebuy = false,
  currentStack = 0,
  onClose,
  onSuccess,
}: BuyInModalProps) {
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const embeddedWallet = wallets.find((w) => w.walletClientType === 'privy');
  const walletAddress = embeddedWallet?.address as `0x${string}` | undefined;

  const effectiveMax = isRebuy ? maxBuyIn - currentStack : maxBuyIn;
  const effectiveMin = isRebuy ? 1 : minBuyIn;

  const [amount, setAmount] = useState(effectiveMin);
  const [step, setStep] = useState<Step>('input');
  const [errorMessage, setErrorMessage] = useState('');

  // Read wallet aUSD balance
  const { data: balance } = useReadContract({
    address: AUSD_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: walletAddress ? [walletAddress] : undefined,
    chainId: tempoTestnet.id,
    query: { enabled: !!walletAddress },
  });

  // Approve tx
  const {
    writeContract: writeApprove,
    data: approveTxHash,
    isPending: isApprovePending,
  } = useWriteContract();

  const { isLoading: isApproveConfirming, isSuccess: isApproveConfirmed } =
    useWaitForTransactionReceipt({ hash: approveTxHash });

  // Deposit tx
  const {
    writeContract: writeDeposit,
    data: depositTxHash,
    isPending: isDepositPending,
  } = useWriteContract();

  const { isLoading: isDepositConfirming, isSuccess: isDepositConfirmed } =
    useWaitForTransactionReceipt({ hash: depositTxHash });

  const tableIdBytes32 = keccak256(toHex(tableId));
  const amountInTokenUnits = parseUnits(amount.toString(), 6);

  const formattedBalance = balance !== undefined
    ? parseFloat(formatUnits(balance, 6))
    : 0;

  const handleApprove = useCallback(() => {
    setStep('approving');
    writeApprove(
      {
        address: AUSD_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [ESCROW_ADDRESS, amountInTokenUnits],
        chainId: tempoTestnet.id,
      },
      {
        onError: (err) => {
          setStep('error');
          setErrorMessage(err.message.slice(0, 200));
        },
      },
    );
  }, [writeApprove, amountInTokenUnits]);

  const handleDeposit = useCallback(() => {
    setStep('depositing');
    const functionName = isRebuy ? 'rebuy' : 'deposit';
    writeDeposit(
      {
        address: ESCROW_ADDRESS,
        abi: POKER_ESCROW_ABI,
        functionName,
        args: [tableIdBytes32, amountInTokenUnits],
        chainId: tempoTestnet.id,
      },
      {
        onError: (err) => {
          setStep('error');
          setErrorMessage(err.message.slice(0, 200));
        },
      },
    );
  }, [writeDeposit, isRebuy, tableIdBytes32, amountInTokenUnits]);

  const handleRegister = useCallback(async () => {
    if (!walletAddress || !user) return;
    setStep('registering');

    const endpoint = isRebuy
      ? `/api/tables/${tableId}/rebuy`
      : `/api/tables/${tableId}/sit`;

    const body = isRebuy
      ? {
          agentId: '', // will be filled by the caller
          amount,
          walletAddress,
          rebuyTxHash: depositTxHash,
        }
      : {
          seatNumber,
          buyInAmount: amount,
          agentName: localStorage.getItem('openclaw_agent_name') || getUserDisplayName(user),
          privyUserId: user.id,
          walletAddress,
          depositTxHash,
        };

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setStep('error');
        setErrorMessage(data.error || 'Failed to register at table');
        return;
      }
      setStep('done');
      onSuccess(data.agent ?? { id: '', name: '' });
    } catch (err) {
      setStep('error');
      setErrorMessage(err instanceof Error ? err.message : 'Network error');
    }
  }, [walletAddress, user, isRebuy, tableId, seatNumber, amount, depositTxHash, onSuccess]);

  // Auto-advance: approve confirmed -> deposit
  if (isApproveConfirmed && step === 'approving') {
    handleDeposit();
  }

  // Auto-advance: deposit confirmed -> register with server
  if (isDepositConfirmed && step === 'depositing') {
    handleRegister();
  }

  if (!walletAddress) {
    return (
      <ModalOverlay onClose={onClose}>
        <h2 className="text-lg font-bold mb-4">Wallet Required</h2>
        <p className="text-gray-400 text-sm mb-4">
          Please sign in to create a wallet before joining a table.
        </p>
        <button onClick={onClose} className="btn-secondary w-full">Close</button>
      </ModalOverlay>
    );
  }

  return (
    <ModalOverlay onClose={step === 'input' || step === 'error' || step === 'done' ? onClose : undefined}>
      <h2 className="text-lg font-bold mb-1">
        {isRebuy ? 'Re-buy' : 'Buy In'} — Seat {seatNumber + 1}
      </h2>
      <p className="text-xs text-gray-500 mb-4">
        Wallet: {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)} | Balance: {formattedBalance.toLocaleString()} aUSD
      </p>

      {step === 'input' && (
        <>
          <label className="block text-sm text-gray-400 mb-1">
            Amount (aUSD) — min {effectiveMin}, max {effectiveMax}
          </label>
          <input
            type="number"
            min={effectiveMin}
            max={Math.min(effectiveMax, formattedBalance)}
            value={amount}
            onChange={(e) => setAmount(Math.max(effectiveMin, Math.min(effectiveMax, Number(e.target.value))))}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white mb-4 focus:outline-none focus:border-emerald-500"
          />
          <div className="flex gap-2 mb-4">
            {[effectiveMin, Math.round((effectiveMin + effectiveMax) / 2), effectiveMax].map((preset) => (
              <button
                key={preset}
                onClick={() => setAmount(Math.min(preset, formattedBalance))}
                className="flex-1 px-2 py-1 text-xs bg-gray-800 border border-gray-700 rounded hover:bg-gray-700 transition"
              >
                {preset}
              </button>
            ))}
          </div>
          <button
            onClick={handleApprove}
            disabled={amount < effectiveMin || amount > effectiveMax || amount > formattedBalance}
            className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg font-medium transition cursor-pointer disabled:cursor-not-allowed"
          >
            Approve & Deposit {amount} aUSD
          </button>
        </>
      )}

      {step === 'approving' && (
        <StepIndicator
          label="Approving aUSD..."
          sublabel={isApprovePending ? 'Confirm in wallet' : isApproveConfirming ? 'Waiting for confirmation' : ''}
          loading
        />
      )}

      {step === 'depositing' && (
        <StepIndicator
          label={isRebuy ? 'Re-buying...' : 'Depositing to escrow...'}
          sublabel={isDepositPending ? 'Confirm in wallet' : isDepositConfirming ? 'Waiting for confirmation' : ''}
          loading
        />
      )}

      {step === 'registering' && (
        <StepIndicator label="Registering at table..." sublabel="" loading />
      )}

      {step === 'done' && (
        <div className="text-center py-4">
          <div className="text-emerald-400 text-2xl mb-2">&#10003;</div>
          <p className="text-white font-medium mb-1">
            {isRebuy ? 'Re-buy successful!' : 'Seated!'}
          </p>
          <p className="text-xs text-gray-500 mb-4">
            {amount} aUSD deposited to escrow
          </p>
          <button onClick={onClose} className="btn-secondary w-full">Close</button>
        </div>
      )}

      {step === 'error' && (
        <div className="text-center py-4">
          <div className="text-red-400 text-2xl mb-2">&#10007;</div>
          <p className="text-red-400 font-medium mb-1">Transaction failed</p>
          <p className="text-xs text-gray-500 mb-4 break-all">{errorMessage}</p>
          <div className="flex gap-2">
            <button onClick={() => setStep('input')} className="flex-1 btn-secondary">
              Try Again
            </button>
            <button onClick={onClose} className="flex-1 btn-secondary">
              Close
            </button>
          </div>
        </div>
      )}
    </ModalOverlay>
  );
}

function ModalOverlay({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose?: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-sm relative">
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-3 right-3 text-gray-500 hover:text-white text-xl leading-none cursor-pointer"
          >
            &times;
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

function StepIndicator({ label, sublabel, loading }: { label: string; sublabel: string; loading?: boolean }) {
  return (
    <div className="text-center py-6">
      {loading && (
        <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
      )}
      <p className="text-white font-medium">{label}</p>
      {sublabel && <p className="text-xs text-gray-500 mt-1">{sublabel}</p>}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getUserDisplayName(user: any): string {
  if (user.google?.name) return user.google.name;
  if (user.email?.address) return user.email.address;
  if (user.google?.email) return user.google.email;
  const id = user.id ?? '';
  return id.startsWith('did:privy:') ? id.slice(10, 18) : id.slice(0, 8);
}
