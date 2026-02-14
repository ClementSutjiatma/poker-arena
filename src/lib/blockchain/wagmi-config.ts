import { createConfig } from '@privy-io/wagmi';
import { http } from 'wagmi';
import { tempoTestnet } from './chain-config';

export const wagmiConfig = createConfig({
  chains: [tempoTestnet],
  transports: {
    [tempoTestnet.id]: http(),
  },
});
