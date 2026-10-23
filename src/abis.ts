/**
 * Minimal ABIs for RacconPay contracts — only the functions the frontend calls.
 */


export const BATCH_PAYOUT_ABI = [
  {
    type: 'function',
    name: 'batchPay',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'recipients',
        type: 'tuple[]',
        components: [
          { name: 'addr',   type: 'address' },
          { name: 'amount', type: 'uint256' },
        ],
      },
    ],
    outputs: [],
  },
  {
    type: 'event',
    name: 'BatchPaid',
    inputs: [
      { indexed: true,  name: 'payer',          type: 'address' },
      { indexed: false, name: 'total',           type: 'uint256' },
      { indexed: false, name: 'recipientCount',  type: 'uint256' },
      { indexed: false, name: 'receiptTokenId',  type: 'uint256' },
    ],
  },
] as const

export const RECEIPT_NFT_ABI = [
  {
    type: 'function',
    name: 'receiptsOf',
    stateMutability: 'view',
    inputs: [{ name: 'wallet', type: 'address' }],
    outputs: [{ name: '', type: 'uint256[]' }],
  },
  {
    type: 'function',
    name: 'getReceipt',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'batchTotal',      type: 'uint256' },
          { name: 'recipientCount',  type: 'uint256' },
          { name: 'timestamp',       type: 'uint256' },
          { name: 'listHash',        type: 'bytes32' },
        ],
      },
    ],
  },
] as const

export const VESTING_STREAM_ABI = [
  // --- state-changing ---
  {
    type: 'function',
    name: 'createStream',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'beneficiary', type: 'address' },
      { name: 'amount',      type: 'uint256' },
      { name: 'duration',    type: 'uint256' },
    ],
    outputs: [{ name: 'streamId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'claim',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'streamId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'cancel',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'streamId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'withdraw',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  // --- views ---
  {
    type: 'function',
    name: 'vestedAmount',
    stateMutability: 'view',
    inputs: [{ name: 'streamId', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'claimableAmount',
    stateMutability: 'view',
    inputs: [{ name: 'streamId', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getStream',
    stateMutability: 'view',
    inputs: [{ name: 'streamId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'grantor',       type: 'address' },
          { name: 'beneficiary',   type: 'address' },
          { name: 'totalAmount',   type: 'uint256' },
          { name: 'claimedAmount', type: 'uint256' },
          { name: 'startTime',     type: 'uint256' },
          { name: 'endTime',       type: 'uint256' },
          { name: 'cancelled',     type: 'bool'    },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'streamsOf',
    stateMutability: 'view',
    inputs: [{ name: 'wallet', type: 'address' }],
    outputs: [{ name: '', type: 'uint256[]' }],
  },
  {
    type: 'function',
    name: 'pendingWithdrawals',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  // --- events ---
  {
    type: 'event',
    name: 'StreamCreated',
    inputs: [
      { indexed: true,  name: 'streamId',    type: 'uint256' },
      { indexed: true,  name: 'grantor',     type: 'address' },
      { indexed: true,  name: 'beneficiary', type: 'address' },
      { indexed: false, name: 'totalAmount', type: 'uint256' },
      { indexed: false, name: 'startTime',   type: 'uint256' },
      { indexed: false, name: 'endTime',     type: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'Claimed',
    inputs: [
      { indexed: true,  name: 'streamId',    type: 'uint256' },
      { indexed: true,  name: 'beneficiary', type: 'address' },
      { indexed: false, name: 'amount',      type: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'StreamCancelled',
    inputs: [
      { indexed: true,  name: 'streamId',          type: 'uint256' },
      { indexed: false, name: 'returnedToGrantor',  type: 'uint256' },
      { indexed: false, name: 'paidToBeneficiary',  type: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'Withdrawn',
    inputs: [
      { indexed: true,  name: 'recipient', type: 'address' },
      { indexed: false, name: 'amount',    type: 'uint256' },
    ],
  },
] as const

export const BILL_SPLITTER_ABI = [
  // --- state-changing ---
  {
    type: 'function',
    name: 'createBill',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'name',    type: 'string' },
      { name: 'members', type: 'address[]' },
    ],
    outputs: [{ name: 'billId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'addExpense',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'billId',      type: 'uint256' },
      { name: 'amount',      type: 'uint256' },
      { name: 'description', type: 'string' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'finalize',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'billId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'settle',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'billId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'withdrawClaim',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'billId', type: 'uint256' }],
    outputs: [],
  },
  // --- views ---
  {
    type: 'function',
    name: 'getBill',
    stateMutability: 'view',
    inputs: [{ name: 'billId', type: 'uint256' }],
    outputs: [
      { name: 'name',      type: 'string' },
      { name: 'members',   type: 'address[]' },
      { name: 'finalized', type: 'bool' },
    ],
  },
  {
    type: 'function',
    name: 'getExpenses',
    stateMutability: 'view',
    inputs: [{ name: 'billId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'paidBy',      type: 'address' },
          { name: 'amount',      type: 'uint256' },
          { name: 'description', type: 'string'  },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'getMemberBalance',
    stateMutability: 'view',
    inputs: [
      { name: 'billId', type: 'uint256' },
      { name: 'member', type: 'address' },
    ],
    outputs: [{ name: '', type: 'int256' }],
  },
  {
    type: 'function',
    name: 'getSettlementStatus',
    stateMutability: 'view',
    inputs: [{ name: 'billId', type: 'uint256' }],
    outputs: [
      { name: 'members',       type: 'address[]' },
      { name: 'balances',      type: 'int256[]'  },
      { name: 'settledStatus', type: 'bool[]'    },
    ],
  },
  {
    type: 'function',
    name: 'billsOf',
    stateMutability: 'view',
    inputs: [{ name: 'wallet', type: 'address' }],
    outputs: [{ name: '', type: 'uint256[]' }],
  },
  {
    type: 'function',
    name: 'claimsOf',
    stateMutability: 'view',
    inputs: [
      { name: 'billId',   type: 'uint256' },
      { name: 'creditor', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'settled',
    stateMutability: 'view',
    inputs: [
      { name: 'billId', type: 'uint256' },
      { name: 'wallet', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  // --- events ---
  {
    type: 'event',
    name: 'BillCreated',
    inputs: [
      { indexed: true,  name: 'billId',  type: 'uint256'   },
      { indexed: true,  name: 'creator', type: 'address'   },
      { indexed: false, name: 'members', type: 'address[]' },
    ],
  },
  {
    type: 'event',
    name: 'ExpenseAdded',
    inputs: [
      { indexed: true,  name: 'billId',      type: 'uint256' },
      { indexed: true,  name: 'paidBy',      type: 'address' },
      { indexed: false, name: 'amount',      type: 'uint256' },
      { indexed: false, name: 'description', type: 'string'  },
    ],
  },
  {
    type: 'event',
    name: 'BillFinalized',
    inputs: [{ indexed: true, name: 'billId', type: 'uint256' }],
  },
  {
    type: 'event',
    name: 'Settled',
    inputs: [
      { indexed: true,  name: 'billId',  type: 'uint256' },
      { indexed: true,  name: 'settler', type: 'address' },
      { indexed: false, name: 'amount',  type: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'ClaimWithdrawn',
    inputs: [
      { indexed: true,  name: 'billId',   type: 'uint256' },
      { indexed: true,  name: 'creditor', type: 'address' },
      { indexed: false, name: 'amount',   type: 'uint256' },
    ],
  },
] as const

// ── BillSplitterV2 ─────────────────────────────────────────────────────────
export const BILL_SPLITTER_V2_ABI = [
  // state-changing
  { type: 'function', name: 'createBill', stateMutability: 'nonpayable',
    inputs: [{ name: 'name', type: 'string' }, { name: 'members', type: 'address[]' }, { name: 'expiresAt', type: 'uint256' }],
    outputs: [{ name: 'billId', type: 'uint256' }] },
  { type: 'function', name: 'createBillWithShares', stateMutability: 'nonpayable',
    inputs: [{ name: 'name', type: 'string' }, { name: 'members', type: 'address[]' }, { name: 'shares', type: 'uint256[]' }, { name: 'expiresAt', type: 'uint256' }],
    outputs: [{ name: 'billId', type: 'uint256' }] },
  { type: 'function', name: 'createBillWithExpenses', stateMutability: 'nonpayable',
    inputs: [
      { name: 'name', type: 'string' }, { name: 'members', type: 'address[]' },
      { name: 'shares', type: 'uint256[]' }, { name: 'expiresAt', type: 'uint256' },
      { name: 'expenseAmounts', type: 'uint256[]' }, { name: 'expenseDescs', type: 'string[]' }, { name: 'expensePayers', type: 'address[]' },
    ],
    outputs: [{ name: 'billId', type: 'uint256' }] },
  { type: 'function', name: 'addExpense', stateMutability: 'nonpayable',
    inputs: [{ name: 'billId', type: 'uint256' }, { name: 'amount', type: 'uint256' }, { name: 'description', type: 'string' }],
    outputs: [] },
  { type: 'function', name: 'finalize', stateMutability: 'nonpayable',
    inputs: [{ name: 'billId', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'forceFinalize', stateMutability: 'nonpayable',
    inputs: [{ name: 'billId', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'settle', stateMutability: 'nonpayable',
    inputs: [{ name: 'billId', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'settlePartial', stateMutability: 'nonpayable',
    inputs: [{ name: 'billId', type: 'uint256' }, { name: 'amount', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'withdrawClaim', stateMutability: 'nonpayable',
    inputs: [{ name: 'billId', type: 'uint256' }], outputs: [] },
  // views
  { type: 'function', name: 'getBill', stateMutability: 'view',
    inputs: [{ name: 'billId', type: 'uint256' }],
    outputs: [{ name: 'name', type: 'string' }, { name: 'members', type: 'address[]' }, { name: 'shares', type: 'uint256[]' }, { name: 'finalized', type: 'bool' }, { name: 'expiresAt', type: 'uint256' }] },
  { type: 'function', name: 'getExpenses', stateMutability: 'view',
    inputs: [{ name: 'billId', type: 'uint256' }],
    outputs: [{ name: '', type: 'tuple[]', components: [{ name: 'paidBy', type: 'address' }, { name: 'amount', type: 'uint256' }, { name: 'description', type: 'string' }] }] },
  { type: 'function', name: 'getSettlementStatus', stateMutability: 'view',
    inputs: [{ name: 'billId', type: 'uint256' }],
    outputs: [
      { name: 'members', type: 'address[]' },
      { name: 'grossDebts', type: 'uint256[]' },
      { name: 'paidAmounts', type: 'uint256[]' },
      { name: 'remainingDebts', type: 'uint256[]' },
    ] },
  { type: 'function', name: 'claimsOf', stateMutability: 'view',
    inputs: [{ name: 'billId', type: 'uint256' }, { name: 'creditor', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'billsOf', stateMutability: 'view',
    inputs: [{ name: 'wallet', type: 'address' }],
    outputs: [{ name: '', type: 'uint256[]' }] },
  { type: 'function', name: 'billCount', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  // events
  { type: 'event', name: 'BillCreated', inputs: [
    { indexed: true, name: 'billId', type: 'uint256' }, { indexed: true, name: 'creator', type: 'address' },
    { indexed: false, name: 'members', type: 'address[]' }, { indexed: false, name: 'expiresAt', type: 'uint256' }] },
  { type: 'event', name: 'ExpenseAdded', inputs: [
    { indexed: true, name: 'billId', type: 'uint256' }, { indexed: true, name: 'paidBy', type: 'address' },
    { indexed: false, name: 'amount', type: 'uint256' }, { indexed: false, name: 'description', type: 'string' }] },
  { type: 'event', name: 'BillFinalized', inputs: [{ indexed: true, name: 'billId', type: 'uint256' }] },
  { type: 'event', name: 'Settled', inputs: [
    { indexed: true, name: 'billId', type: 'uint256' }, { indexed: true, name: 'settler', type: 'address' },
    { indexed: false, name: 'amount', type: 'uint256' }, { indexed: false, name: 'remaining', type: 'uint256' }] },
  { type: 'event', name: 'ClaimWithdrawn', inputs: [
    { indexed: true, name: 'billId', type: 'uint256' }, { indexed: true, name: 'creditor', type: 'address' },
    { indexed: false, name: 'amount', type: 'uint256' }] },
] as const

export const ERC20_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount',  type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner',   type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to',     type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'isBlacklisted',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

export const MULTISIG_ABI = [
  // ── Write ──────────────────────────────────────────────────────
  {
    type: 'function',
    name: 'propose',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'recipients',
        type: 'tuple[]',
        components: [
          { name: 'addr',   type: 'address' },
          { name: 'amount', type: 'uint256' },
        ],
      },
      { name: 'coSigner1',   type: 'address' },
      { name: 'coSigner2',   type: 'address' },
      { name: 'description', type: 'string'  },
    ],
    outputs: [{ name: 'proposalId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'proposalId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'execute',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'proposalId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'cancel',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'proposalId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'reject',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'proposalId', type: 'uint256' }],
    outputs: [],
  },
  // ── Views ───────────────────────────────────────────────────────
  {
    type: 'function',
    name: 'getProposal',
    stateMutability: 'view',
    inputs: [{ name: 'proposalId', type: 'uint256' }],
    outputs: [
      { name: 'proposer',       type: 'address' },
      { name: 'coSigner1',      type: 'address' },
      { name: 'coSigner2',      type: 'address' },
      { name: 'approved1',      type: 'bool'    },
      { name: 'approved2',      type: 'bool'    },
      { name: 'totalAmount',    type: 'uint256' },
      { name: 'recipientCount', type: 'uint256' },
      { name: 'status',         type: 'uint8'   },
      { name: 'description',    type: 'string'  },
      { name: 'createdAt',      type: 'uint256' },
      { name: 'expired',        type: 'bool'    },
    ],
  },
  {
    type: 'function',
    name: 'getRecipient',
    stateMutability: 'view',
    inputs: [
      { name: 'proposalId', type: 'uint256' },
      { name: 'index',      type: 'uint256' },
    ],
    outputs: [
      { name: 'addr',   type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'isReadyToExecute',
    stateMutability: 'view',
    inputs: [{ name: 'proposalId', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'proposalCount',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'EXPIRY_SECONDS',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  // ── Events ──────────────────────────────────────────────────────
  {
    type: 'event',
    name: 'ProposalCreated',
    inputs: [
      { indexed: true,  name: 'proposalId',    type: 'uint256' },
      { indexed: true,  name: 'proposer',       type: 'address' },
      { indexed: true,  name: 'coSigner1',      type: 'address' },
      { indexed: false, name: 'coSigner2',      type: 'address' },
      { indexed: false, name: 'totalAmount',    type: 'uint256' },
      { indexed: false, name: 'recipientCount', type: 'uint256' },
      { indexed: false, name: 'description',    type: 'string'  },
    ],
  },
  {
    type: 'event',
    name: 'ProposalApproved',
    inputs: [
      { indexed: true,  name: 'proposalId', type: 'uint256' },
      { indexed: true,  name: 'signer',     type: 'address' },
      { indexed: false, name: 'approved1',  type: 'bool'    },
      { indexed: false, name: 'approved2',  type: 'bool'    },
    ],
  },
  {
    type: 'event',
    name: 'ProposalExecuted',
    inputs: [
      { indexed: true, name: 'proposalId', type: 'uint256' },
      { indexed: true, name: 'executor',   type: 'address' },
    ],
  },
  {
    type: 'event',
    name: 'ProposalCancelled',
    inputs: [
      { indexed: true, name: 'proposalId', type: 'uint256' },
      { indexed: true, name: 'canceller',  type: 'address' },
    ],
  },
] as const