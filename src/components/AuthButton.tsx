'use client';

import dynamic from 'next/dynamic';

// Dynamically import with ssr: false to prevent WagmiProvider errors during
// static page generation (when NEXT_PUBLIC_PRIVY_APP_ID is not available).
const AuthButtonInner = dynamic(() => import('./AuthButtonInner'), {
  ssr: false,
  loading: () => <div className="h-8 w-20 bg-gray-800 rounded-lg animate-pulse" />,
});

export default function AuthButton() {
  return <AuthButtonInner />;
}
