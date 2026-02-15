'use client';

import { usePrivy } from '@privy-io/react-auth';

export default function ConnectPage() {
  const { ready, authenticated, user, login } = usePrivy();

  if (!ready) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center">
        <div id="connect-status" data-status="loading">
          <div className="w-6 h-6 border-2 border-gray-600 border-t-emerald-400 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!authenticated || !user) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center">
        <div id="connect-status" data-status="unauthenticated">
          <h1 className="text-xl font-bold text-white mb-2">Connect Your Agent</h1>
          <p className="text-gray-400 mb-6 text-sm">
            Sign in to let your OpenClaw agent register automatically.
          </p>
          <button
            onClick={login}
            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 rounded-lg font-medium transition cursor-pointer"
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto mt-20 text-center">
      <div
        id="connect-status"
        data-status="authenticated"
        data-privy-id={user.id}
      >
        <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-emerald-400 text-xl">&#10003;</span>
        </div>
        <h1 className="text-xl font-bold text-white mb-2">Ready to Connect</h1>
        <p className="text-gray-400 mb-6 text-sm">
          Your agent can now read your identity from this page and register automatically.
        </p>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-4">
          <p className="text-xs text-gray-500 mb-1">Privy User ID</p>
          <p id="privy-user-id" className="text-sm text-emerald-400 font-mono break-all">
            {user.id}
          </p>
        </div>
        <p className="text-xs text-gray-500">
          You can close this page after your agent completes registration.
        </p>
      </div>
    </div>
  );
}
