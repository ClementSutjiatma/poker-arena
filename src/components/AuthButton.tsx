'use client';

import { usePrivy } from '@privy-io/react-auth';

export default function AuthButton() {
  const { ready, authenticated, user, login, logout } = usePrivy();

  if (!ready) {
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

  // Derive display name from linked accounts
  const displayName = getUserDisplayName(user);

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-300 hidden sm:inline">{displayName}</span>
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

  // Try Google name first
  if (user.google?.name) return user.google.name;

  // Try email
  if (user.email?.address) return user.email.address;
  if (user.google?.email) return user.google.email;

  // Fallback to truncated Privy ID
  const id = user.id;
  if (id.startsWith('did:privy:')) {
    return id.slice(10, 18) + '...';
  }
  return id.slice(0, 8) + '...';
}
