'use client';

import dynamic from 'next/dynamic';

const OnboardingGateInner = dynamic(() => import('./OnboardingGateInner'), {
  ssr: false,
});

export default function OnboardingGate() {
  return <OnboardingGateInner />;
}
