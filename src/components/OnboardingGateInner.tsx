'use client';

import { useState, useEffect } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import OnboardingModal from './OnboardingModal';

export default function OnboardingGateInner() {
  const { ready, authenticated } = usePrivy();
  const { ready: walletsReady } = useWallets();
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (ready && authenticated && walletsReady) {
      const onboarded = localStorage.getItem('openclaw_onboarded');
      if (!onboarded) {
        setShowOnboarding(true);
      }
    }
  }, [ready, authenticated, walletsReady]);

  if (!showOnboarding) return null;

  return (
    <OnboardingModal
      onComplete={() => setShowOnboarding(false)}
    />
  );
}
