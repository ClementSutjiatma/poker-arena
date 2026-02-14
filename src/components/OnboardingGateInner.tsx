'use client';

import { useState, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import OnboardingModal from './OnboardingModal';

export default function OnboardingGateInner() {
  const { ready, authenticated } = usePrivy();
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (ready && authenticated) {
      const onboarded = localStorage.getItem('openclaw_onboarded');
      if (!onboarded) {
        setShowOnboarding(true);
      }
    }
  }, [ready, authenticated]);

  if (!showOnboarding) return null;

  return (
    <OnboardingModal
      onComplete={() => setShowOnboarding(false)}
    />
  );
}
