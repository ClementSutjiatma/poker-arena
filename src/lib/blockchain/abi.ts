/** ABI for the PokerEscrow contract. */
export const POKER_ESCROW_ABI = [
  // Table management
  {
    type: 'function',
    name: 'createTable',
    inputs: [
      { name: 'tableId', type: 'bytes32' },
      { name: 'minBuyIn', type: 'uint256' },
      { name: 'maxBuyIn', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  // Player: deposit (sit down)
  {
    type: 'function',
    name: 'deposit',
    inputs: [
      { name: 'tableId', type: 'bytes32' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  // Player: rebuy (top up)
  {
    type: 'function',
    name: 'rebuy',
    inputs: [
      { name: 'tableId', type: 'bytes32' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  // Owner: settle single player
  {
    type: 'function',
    name: 'settleAndWithdraw',
    inputs: [
      { name: 'tableId', type: 'bytes32' },
      { name: 'player', type: 'address' },
      { name: 'finalStack', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  // Owner: batch settle
  {
    type: 'function',
    name: 'batchSettle',
    inputs: [
      { name: 'tableId', type: 'bytes32' },
      { name: 'players', type: 'address[]' },
      { name: 'finalStacks', type: 'uint256[]' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  // Owner: emergency refund
  {
    type: 'function',
    name: 'emergencyRefund',
    inputs: [{ name: 'tableId', type: 'bytes32' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  // Owner: transfer ownership
  {
    type: 'function',
    name: 'transferOwnership',
    inputs: [{ name: 'newOwner', type: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  // View: player balance
  {
    type: 'function',
    name: 'getPlayerBalance',
    inputs: [
      { name: 'tableId', type: 'bytes32' },
      { name: 'player', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  // View: player seat details
  {
    type: 'function',
    name: 'getPlayerSeat',
    inputs: [
      { name: 'tableId', type: 'bytes32' },
      { name: 'player', type: 'address' },
    ],
    outputs: [
      { name: 'balance', type: 'uint256' },
      { name: 'totalDeposited', type: 'uint256' },
      { name: 'isSeated', type: 'bool' },
    ],
    stateMutability: 'view',
  },
  // View: table info
  {
    type: 'function',
    name: 'getTable',
    inputs: [{ name: 'tableId', type: 'bytes32' }],
    outputs: [
      { name: 'minBuyIn', type: 'uint256' },
      { name: 'maxBuyIn', type: 'uint256' },
      { name: 'exists', type: 'bool' },
      { name: 'playerCount', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
  // View: table players list
  {
    type: 'function',
    name: 'getTablePlayers',
    inputs: [{ name: 'tableId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'address[]' }],
    stateMutability: 'view',
  },
  // View: owner
  {
    type: 'function',
    name: 'owner',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  // View: token
  {
    type: 'function',
    name: 'token',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  // Events
  {
    type: 'event',
    name: 'TableCreated',
    inputs: [
      { name: 'tableId', type: 'bytes32', indexed: true },
      { name: 'minBuyIn', type: 'uint256', indexed: false },
      { name: 'maxBuyIn', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Deposited',
    inputs: [
      { name: 'tableId', type: 'bytes32', indexed: true },
      { name: 'player', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Rebought',
    inputs: [
      { name: 'tableId', type: 'bytes32', indexed: true },
      { name: 'player', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Settled',
    inputs: [
      { name: 'tableId', type: 'bytes32', indexed: true },
      { name: 'player', type: 'address', indexed: true },
      { name: 'finalStack', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'EmergencyRefunded',
    inputs: [
      { name: 'tableId', type: 'bytes32', indexed: true },
      { name: 'playerCount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'OwnershipTransferred',
    inputs: [
      { name: 'previousOwner', type: 'address', indexed: true },
      { name: 'newOwner', type: 'address', indexed: true },
    ],
  },
  // Errors
  { type: 'error', name: 'NotOwner', inputs: [] },
  { type: 'error', name: 'TableAlreadyExists', inputs: [] },
  { type: 'error', name: 'TableDoesNotExist', inputs: [] },
  { type: 'error', name: 'InvalidBuyInRange', inputs: [] },
  { type: 'error', name: 'AmountBelowMinBuyIn', inputs: [] },
  { type: 'error', name: 'AmountAboveMaxBuyIn', inputs: [] },
  { type: 'error', name: 'AlreadySeated', inputs: [] },
  { type: 'error', name: 'NotSeated', inputs: [] },
  { type: 'error', name: 'TransferFailed', inputs: [] },
  { type: 'error', name: 'SettlementExceedsBalance', inputs: [] },
  { type: 'error', name: 'LengthMismatch', inputs: [] },
  { type: 'error', name: 'ZeroAmount', inputs: [] },
  { type: 'error', name: 'ZeroAddress', inputs: [] },
] as const;

/** Standard ERC-20 ABI (subset used for approve + balanceOf). */
export const ERC20_ABI = [
  {
    type: 'function',
    name: 'approve',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'allowance',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'decimals',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'symbol',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  },
] as const;
