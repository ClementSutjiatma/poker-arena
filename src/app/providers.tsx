'use client';

import { PrivyProvider } from '@privy-io/react-auth';

const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

export default function Providers({ children }: { children: React.ReactNode }) {
  // During SSR prerender on Vercel, the env var may not be available.
  // Render children without PrivyProvider in that case — the client-side
  // hydration will pick it up with the real value.
  if (!privyAppId) {
    return <>{children}</>;
  }

  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        appearance: {
          theme: 'dark',
          accentColor: '#10b981',
          logo: undefined,
        },
        loginMethods: ['google', 'email'],
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'off',
          },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
