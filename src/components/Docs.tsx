/**
 * RacconPay — Documentation Page
 * A beginner-friendly, scrollable in-app docs page.
 */
import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  Send, Clock, Users, Layers, ShieldCheck,
  FileText, TrendingUp, ChevronDown, ChevronRight,
  ExternalLink, Info, CheckCircle2, AlertTriangle,
} from 'lucide-react'
import { PageHeader, Card } from './ui'

/* ── Types ── */
interface Section {
  id: string
  icon: React.ElementType
  accent: string
  title: string
  intro: string
  steps?: { num: number; title: string; body: string }[]
  faqs?: { q: string; a: string }[]
  notes?: string[]
  link?: string
  linkLabel?: string
}

/* ── Doc sections ── */
const SECTIONS: Section[] = [
  {
    id: 'getting-started',
    icon: Info,
    accent: 'var(--accent)',
    title: 'Getting Started',
    intro:
      'RacconPay is a USDC money toolkit built on Arc Mainnet, a blockchain where USDC is the gas token, so you never need ETH. Everything runs on-chain where your money, your receipts, your agreements.',
    steps: [
      {
        num: 1,
        title: 'Get a wallet',
        body: 'Install MetaMask (metamask.io). This is your on-chain identity and think of it as your bank account + ID card in one.',
      },
      {
        num: 2,
        title: 'Add Arc Mainnet',
        body: 'Open MetaMask → Settings → Networks → Add Network manually. Use RPC URL: https://rpc.mainnet.arc.io, Chain ID: 5042, Symbol: USDC.',
      },
      {
        num: 3,
        title: 'Get USDC',
        body: 'You need real USDC on Arc Mainnet to use RacconPay. You can bridge USDC from another chain using Circle CCTP, or acquire it through a supported exchange.',
      },
      {
        num: 4,
        title: 'Connect your wallet',
        body: 'Click the "Connect Wallet" button in the top-right corner of the app. Select MetaMask. Once connected, your wallet address appears and all features unlock.',
      },
    ],
    faqs: [
      {
        q: 'Do I need real money?',
        a: 'Yes. RacconPay runs on Arc Mainnet and uses real USDC. Always double-check addresses and amounts before confirming any transaction.',
      },
      {
        q: 'What is USDC?',
        a: 'USDC is a stablecoin issued by Circle. 1 USDC always equals $1 USD. It\'s the only currency used in RacconPay.',
      },
      {
        q: 'What happens if I make a mistake?',
        a: 'Blockchain transactions are irreversible. If you send to the wrong address, the funds cannot be recovered. Always verify addresses and amounts carefully before confirming.',
      },
      {
        q: 'Does it work in Brave browser?',
        a: 'Yes. If transaction confirmations seem slow with Brave Shields enabled, the app uses HTTP polling instead of WebSockets to detect confirmations, so it works correctly with Shields on. If you still see issues, click the Brave Shields icon and set fingerprinting to Standard.',
      },
      {
        q: 'Why does MetaMask show a phishing warning?',
        a: 'New dapps sometimes trigger MetaMask\'s phishing detector until they are whitelisted. RacconPay is a non-custodial app with no admin keys and it cannot move funds without your explicit MetaMask approval. If you see the warning, click "Connect anyway" so it is safe.',
      },
    ],
  },
  {
    id: 'batch-pay',
    icon: Send,
    accent: 'var(--pay-accent)',
    title: 'Batch Pay',
    intro:
      'Send USDC to any number of recipients in one flow. Upload a CSV, run a blocklist check, approve once, and pay automatically splits large lists into chunks of 100 per transaction. A soul-bound receipt NFT is minted to your wallet as permanent on-chain proof.',
    steps: [
      {
        num: 1,
        title: 'Prepare your recipient list',
        body: 'Each recipient needs a wallet address and an amount. Type them manually, upload a CSV (two columns: address, amount), or click "Download template" to get a pre-formatted example file.',
      },
      {
        num: 2,
        title: 'Run the blocklist check',
        body: 'Click "Check blocklist" before approving. The app reads the Arc USDC contract\'s isBlacklisted() function for every address. Any blocked address is flagged in red and remove it before proceeding. This prevents a failed transaction before it happens.',
      },
      {
        num: 3,
        title: 'Approve USDC',
        body: 'Click "Approve USDC" and confirm in MetaMask. This gives the BatchPayout contract permission to pull the exact total from your wallet and never more.',
      },
      {
        num: 4,
        title: 'Send the batch',
        body: 'Click "Send Batch". For lists over 100, the app automatically splits into chunks and shows a progress indicator (Chunk 1/3, Chunk 2/3…). Each chunk is a separate transaction. One approve covers all chunks.',
      },
      {
        num: 5,
        title: 'Check your receipt',
        body: 'After all chunks confirm, a soul-bound NFT is minted to your wallet recording every recipient, every amount, and the transaction hash and permanently on-chain. View it in Dashboard → Receipts.',
      },
    ],
    faqs: [
      {
        q: 'What is a soul-bound NFT?',
        a: 'A soul-bound token (SBT) is an NFT that cannot be transferred or sold. It stays in your wallet forever as an immutable record. Perfect for payroll receipts.',
      },
      {
        q: 'What is the CSV format?',
        a: 'Two columns, comma-separated: address,amount. Example row: 0x1234...abcd,50.00. The first row can be a header and it is skipped automatically. Click "Download template" for a ready-made example.',
      },
      {
        q: 'Is there a recipient limit?',
        a: 'No hard UI limit. The contract processes up to 100 recipients per transaction. For larger lists the app splits automatically into multiple transactions. One approve covers the full amount.',
      },
      {
        q: 'What if one recipient is on the USDC blocklist?',
        a: 'Use the "Check blocklist" button before approving. Blocked addresses are flagged in red and the approve button is disabled until they are removed. If you skip the check, blocked recipients are skipped on-chain (try/catch) and the amount is refunded to you.',
      },
      {
        q: 'Can I send to myself?',
        a: 'Yes. There are no restrictions on who the recipients are and any valid wallet address works.',
      },
    ],
    link: '/pay',
    linkLabel: 'Open Batch Pay →',
  },
  {
    id: 'multisig',
    icon: ShieldCheck,
    accent: 'var(--pay-accent)',
    title: 'Multi-Sig Payout',
    intro:
      'A safety layer for large payrolls. The proposer nominates two co-signers who must both approve before any funds move. Only the proposer can execute the co-signers can approve or reject but cannot trigger the payout themselves. Proposals are only visible to the three participants.',
    steps: [
      {
        num: 1,
        title: 'Create a proposal',
        body: 'Go to Multi-Sig, fill in a description, add two co-signer wallet addresses, and upload your recipient list. Click "Create Proposal" and this records the proposal on-chain. Use "Copy invite link" to share the proposal URL directly with each co-signer.',
      },
      {
        num: 2,
        title: 'Co-signers review the recipient list',
        body: 'Co-signers open the app (or the invite link), find the proposal card, and expand it to see the full recipient list with amounts. They verify the payment is correct before acting.',
      },
      {
        num: 3,
        title: 'Co-signers approve or reject',
        body: 'Each co-signer clicks "Approve" to sign off, or "Reject" to cancel the proposal immediately. A rejection cancels the proposal and notifies the proposer with a red banner on their card.',
      },
      {
        num: 4,
        title: 'Proposer executes',
        body: 'Once both co-signers have approved, an "Execute Payout" button appears only for the proposer. The proposer approves USDC and confirms the transaction. Funds are distributed via BatchPayout.',
      },
      {
        num: 5,
        title: 'Expiry and cancellation',
        body: 'Proposals expire automatically after 7 days if not executed. The proposer can also cancel at any time before execution. Expired proposals are shown with a red countdown badge.',
      },
    ],
    faqs: [
      {
        q: 'Why can only the proposer execute?',
        a: 'This prevents a co-signer from triggering a payment at an unexpected time. The proposer controls when the funds actually move the co-signers only provide authorisation.',
      },
      {
        q: 'Who can see my proposals?',
        a: 'Only wallets that are the proposer, co-signer 1, or co-signer 2 of a proposal can see it in the list. Other users\' proposals are never shown.',
      },
      {
        q: 'Can I be my own co-signer?',
        a: 'No. The contract rejects proposals where the co-signer is the same address as the proposer. Co-signers must be different wallets.',
      },
      {
        q: 'What if a co-signer never approves?',
        a: 'The proposal expires after 7 days. The proposer\'s USDC is never locked and it stays in their wallet until execution.',
      },
      {
        q: 'What happens when a proposal is rejected?',
        a: 'The proposal is cancelled immediately and the proposer sees a red "Rejected by co-signer" banner on their proposal card. The proposer can create a new proposal with corrected details.',
      },
    ],
    link: '/multisig',
    linkLabel: 'Open Multi-Sig →',
  },
  {
    id: 'vesting',
    icon: Clock,
    accent: 'var(--vest-accent)',
    title: 'Vesting Stream',
    intro:
      'Lock USDC and release it to a recipient linearly over time. Commonly used for employee grants, contractor payments, or token distributions. The recipient can claim their vested amount at any time.',
    steps: [
      {
        num: 1,
        title: 'Create a stream',
        body: 'Enter the recipient\'s wallet address, the total USDC amount, and the duration in days. Click "Approve USDC" then "Create Stream".',
      },
      {
        num: 2,
        title: 'Vesting accumulates over time',
        body: 'The USDC is locked in the contract. Every second, a tiny fraction becomes "vested". After half the duration, half the USDC is claimable. After the full duration, 100% is claimable.',
      },
      {
        num: 3,
        title: 'Recipient claims',
        body: 'The recipient connects their wallet, goes to "My Streams", and sees how much is claimable right now. They click "Claim" and the vested USDC transfers to their wallet immediately.',
      },
      {
        num: 4,
        title: 'Cancel (grantor only)',
        body: 'The grantor can cancel a stream at any time. Already-vested USDC remains claimable by the recipient. Unvested USDC is returned to the grantor. Both parties can withdraw independently.',
      },
    ],
    faqs: [
      {
        q: 'What is vesting?',
        a: 'Vesting means money is earned gradually over time rather than all at once. Example: a 12-month vesting stream means the recipient earns 1/12th of the total each month.',
      },
      {
        q: 'What is a "pull withdrawal"?',
        a: 'Instead of the contract pushing USDC to the recipient automatically, the recipient pulls it themselves by calling "Claim". This prevents issues if the recipient\'s address is a smart contract that cannot receive funds.',
      },
      {
        q: 'Can the recipient see the stream before claiming?',
        a: 'Yes. The "My Streams" page shows every stream where your wallet is the beneficiary, with a live progress bar and the exact claimable amount updated every time you load the page.',
      },
      {
        q: 'What happens to unvested USDC if cancelled?',
        a: 'It goes into a "pendingWithdrawals" balance for the grantor. The grantor then calls "Claim" on their end to withdraw it back. Nothing is lost.',
      },
    ],
    notes: [
      'The grantor (creator) must have enough USDC approved before creating a stream.',
      'Vesting is linear and there is no cliff period in the current version.',
    ],
    link: '/vesting',
    linkLabel: 'Open Vesting →',
  },
  {
    id: 'my-streams',
    icon: TrendingUp,
    accent: 'var(--vest-accent)',
    title: 'My Streams',
    intro:
      'Found inside Dashboard → My Streams. Shows all vesting streams connected to your wallet and both streams you are receiving (Receiving tab) and streams you created for others (Sent tab).',
    steps: [
      {
        num: 1,
        title: 'Switch between Receiving and Sent',
        body: 'The "Receiving" tab shows streams where your wallet is the beneficiary. The "Sent" tab shows streams you created as the grantor. Both counts are shown on the tab labels.',
      },
      {
        num: 2,
        title: 'Review your incoming streams',
        body: 'Each stream card shows: the grantor\'s address, total USDC, vested percentage, claimed so far, and claimable right now.',
      },
      {
        num: 3,
        title: 'Claim your vested USDC',
        body: 'Click "Claim" on any stream with a claimable balance. Confirm in MetaMask. The USDC transfers to your wallet immediately.',
      },
      {
        num: 4,
        title: 'Completed streams',
        body: 'When 100% of a stream is claimed, the grantor\'s Cancel button is replaced with a green "Closed and fully claimed" badge. The stream is done.',
      },
    ],
    faqs: [
      {
        q: 'What is the difference between "vested" and "claimable"?',
        a: '"Vested" is the total that has been earned so far based on time elapsed. "Claimable" is vested minus what you\'ve already claimed. Claimable is what you can actually withdraw right now.',
      },
    ],
    link: '/dashboard?tab=streams',
    linkLabel: 'Open in Dashboard →',
  },
  {
    id: 'bill-split',
    icon: Users,
    accent: 'var(--split-accent)',
    title: 'Bill Splitter',
    intro:
      'A Splitwise-style group expense tracker that settles in USDC. Create a bill with your group, add expenses, and settle debts on-chain. Share a QR code so members can pay from their phones.',
    steps: [
      {
        num: 1,
        title: 'Create a bill with expenses in one form',
        body: 'Click "New Bill". Enter a bill name (e.g. "Weekend Trip"), add all group member wallet addresses, then add your expenses directly — description, amount, and who paid for each one. A live settlement preview shows each member\'s net balance (who owes who, and how much) before you submit.',
      },
      {
        num: 2,
        title: 'Submit — one flow, multiple confirmations',
        body: 'Click "Create Bill & Log N Expenses". The app calls the contract once to create the bill, then once per expense to log it. A progress bar shows "Adding expense 2 of 3…". Each step needs a MetaMask confirmation.',
      },
      {
        num: 3,
        title: 'Share the bill with your group',
        body: 'Each bill has a QR code and a copy-link button. The share link pre-fills the recipient\'s owed amount. Send it in your group chat — members open the link, connect their wallet, and see exactly what they owe.',
      },
      {
        num: 4,
        title: 'Debtors settle',
        body: 'Members who owe money click "Settle" on the bill card. They approve USDC then confirm the settlement. Their share is distributed proportionally into each creditor\'s claimable balance on-chain.',
      },
      {
        num: 5,
        title: 'Creditors withdraw',
        body: 'Members who are owed money see a "Withdraw Claim" button when they have a positive claimable balance. One click pulls their USDC from the contract into their wallet.',
      },
      {
        num: 6,
        title: 'Add more expenses later',
        body: 'Open any existing bill and click the dashed "+ Log another expense" button at the bottom of the card to add expenses after the bill was created.',
      },
    ],
    faqs: [
      {
        q: 'Is this like Splitwise?',
        a: 'Yes, but settlement is on-chain in USDC instead of a bank transfer. The app tracks who paid what, but the actual money movement is recorded on Arc Mainnet blockchain.',
      },
      {
        q: 'How is the split calculated?',
        a: 'Every expense is divided equally among all bill members. The live preview shows each person\'s total paid, their equal share, and their net balance (positive = creditor, negative = debtor) before you submit.',
      },
      {
        q: 'Why do I need to sign multiple transactions when creating a bill?',
        a: 'The BillSplitter contract stores the bill and each expense separately on-chain. Creating a bill with 3 expenses requires 4 transactions (1 bill + 3 expenses). Each one needs your MetaMask approval.',
      },
      {
        q: 'What if a member does not have USDC?',
        a: 'They cannot settle on-chain until they have USDC on Arc Mainnet. They can bridge USDC from another chain via Circle CCTP or acquire it through a supported exchange.',
      },
      {
        q: 'Are the debts enforced?',
        a: 'No. This is trust-based — like Splitwise. The contract tracks balances but cannot force anyone to pay. Members settle voluntarily.',
      },
      {
        q: 'What is a "claimable balance"?',
        a: 'When a debtor settles, the contract does not push USDC directly to creditors (that could fail if a creditor\'s address is a smart contract). Instead it accumulates a claimable balance. Creditors pull it out themselves using "Withdraw Claim" — this is called a pull-withdrawal pattern.',
      },
    ],
    notes: [
      'Bill data is stored on-chain — it persists even if you close the app.',
      'Share the ?bill=N URL to let other members jump directly to their bill.',
      'The settlement preview updates live as you add members and expenses — check it before submitting.',
    ],
    link: '/split',
    linkLabel: 'Open Bill Splitter →',
  },
  {
    id: 'receipts',
    icon: Layers,
    accent: 'var(--receipt-accent)',
    title: 'Receipts',
    intro:
      'Every batch payout mints a soul-bound NFT receipt to your wallet. This page shows all your receipts with the full payout details — who received what, when, and the on-chain proof.',
    steps: [
      {
        num: 1,
        title: 'Receipts are minted automatically',
        body: 'You do not need to do anything. When a batch payout succeeds, the BatchPayout contract calls the ReceiptNFT contract and mints a token to your wallet.',
      },
      {
        num: 2,
        title: 'View your receipts',
        body: 'The Receipts page scans your wallet for ReceiptNFT tokens and displays each one as a card with the payout date, recipient count, and total amount.',
      },
      {
        num: 3,
        title: 'Expand for full details',
        body: 'Click a receipt card to see the complete recipient list — every address and amount — plus a link to the transaction on the Arc Mainnet explorer.',
      },
    ],
    faqs: [
      {
        q: 'Can I transfer or sell a receipt?',
        a: 'No. Receipts are soul-bound — permanently attached to the wallet that sent the payout. The contract overrides all transfer functions to always revert.',
      },
      {
        q: 'What if I lose my wallet?',
        a: 'The receipt stays on the blockchain forever but you would lose access to viewing it through this app (since it filters by your connected wallet). The data is still publicly readable on-chain.',
      },
    ],
    link: '/dashboard?tab=receipts',
    linkLabel: 'Open in Dashboard →',
  },
  {
    id: 'invoices',
    icon: FileText,
    accent: 'var(--receipt-accent)',
    title: 'Invoices',
    intro:
      'Create a USDC payment request and share it as a link or QR code. The payer opens the link, connects their wallet, and pays in one click — no approve step needed. Both parties can download a PDF receipt. The Dashboard → Invoices tab gives you analytics across all your invoices.',
    steps: [
      {
        num: 1,
        title: 'Create an invoice',
        body: 'Enter your name or company, a title, amount, due date, client name (optional), and memo. Click "Create Invoice". Each invoice gets a sequential ID (INV-0001, INV-0002…) saved locally in your browser.',
      },
      {
        num: 2,
        title: 'Share the link or QR code',
        body: 'Click "Share" to copy a payment link or show a QR code. A pre-written message is also generated — paste it into WhatsApp, Telegram, or email.',
      },
      {
        num: 3,
        title: 'Payer opens the link and pays in one click',
        body: 'The payer sees your name, invoice details, amount, and your wallet address. They connect their wallet and click "Pay Now" — one transaction, direct transfer, no separate approve step.',
      },
      {
        num: 4,
        title: 'Payer downloads their receipt',
        body: 'After payment confirms, the payer sees a receipt card with the invoice ID, amount, both wallet addresses, transaction hash, and timestamp. They can download it as a PDF for their records.',
      },
      {
        num: 5,
        title: 'Invoice marked paid automatically',
        body: 'The app scans Arc Mainnet for a USDC Transfer matching the exact amount to your wallet. When found, the invoice is automatically marked "Paid". Overdue invoices (past due date, unpaid) show a red badge.',
      },
      {
        num: 6,
        title: 'Export and import invoices',
        body: 'Use "Export" to download all your invoices as a JSON file. Use "Import" to restore them on any device or browser. This is your backup — invoices are stored locally and not synced to a server.',
      },
    ],
    faqs: [
      {
        q: 'Where are invoices stored?',
        a: 'In your browser\'s localStorage. They persist across refreshes but are tied to this device and browser. Use the Export button to back them up — if you clear browser data without exporting, invoices are lost.',
      },
      {
        q: 'How does paid detection work?',
        a: 'The app scans Arc Mainnet for USDC Transfer events to your wallet matching the invoice amount. It checks when you load the page and auto-refreshes every 30 seconds.',
      },
      {
        q: 'Can I download the invoice as PDF?',
        a: 'Yes. The invoice creator can download a seller PDF (invoice details + QR code). The payer can download a payment receipt PDF after paying (invoice ID, amount, both wallets, tx hash).',
      },
      {
        q: 'What if two invoices have the same amount?',
        a: 'Paid detection matches on amount, so both could be marked paid from one payment. For accuracy use slightly different amounts (100.00 and 100.01) or unique memos.',
      },
      {
        q: 'Can the payer see who sent the invoice?',
        a: 'Yes. If you fill in the "Your name / company" field when creating the invoice, the payer\'s payment page shows "Invoice from [your name]" prominently.',
      },
    ],
    link: '/invoice',
    linkLabel: 'Open Invoices →',
  },
]

/* ── FAQ accordion item ── */
function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: '1px solid var(--border)' }}
    >
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium transition-colors"
        style={{ background: open ? 'var(--surface-strong)' : 'var(--surface)', color: 'var(--ink)' }}
      >
        <span>{q}</span>
        {open ? <ChevronDown size={15} className="shrink-0" /> : <ChevronRight size={15} className="shrink-0" />}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-2 text-sm" style={{ background: 'var(--surface)', color: 'var(--muted)' }}>
          {a}
        </div>
      )}
    </div>
  )
}

/* ── Section component ── */
function DocSection({ section }: { section: Section }) {
  const Icon = section.icon
  return (
    <section id={section.id} className="scroll-mt-24">
      <Card className="p-6 sm:p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: `color-mix(in srgb, ${section.accent} 15%, transparent)` }}
          >
            <Icon size={20} style={{ color: section.accent }} />
          </div>
          <h2 className="font-display font-bold text-xl" style={{ color: 'var(--ink)' }}>
            {section.title}
          </h2>
        </div>

        {/* Intro */}
        <p className="text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>
          {section.intro}
        </p>

        {/* Steps */}
        {section.steps && section.steps.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--muted)' }}>
              How it works
            </p>
            <div className="space-y-3">
              {section.steps.map(step => (
                <div key={step.num} className="flex gap-3">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5"
                    style={{
                      background: `color-mix(in srgb, ${section.accent} 20%, transparent)`,
                      color: section.accent,
                    }}
                  >
                    {step.num}
                  </div>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{step.title}</p>
                    <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>{step.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        {section.notes && section.notes.length > 0 && (
          <div
            className="rounded-xl p-4 space-y-2"
            style={{ background: 'color-mix(in srgb, var(--accent) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)' }}
          >
            {section.notes.map((note, i) => (
              <div key={i} className="flex gap-2 text-sm">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
                <span style={{ color: 'var(--ink)' }}>{note}</span>
              </div>
            ))}
          </div>
        )}

        {/* FAQs */}
        {section.faqs && section.faqs.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--muted)' }}>
              Common questions
            </p>
            <div className="space-y-2">
              {section.faqs.map((faq, i) => (
                <FAQItem key={i} q={faq.q} a={faq.a} />
              ))}
            </div>
          </div>
        )}

        {/* CTA link */}
        {section.link && (
          <div>
            <Link
              to={section.link}
              className="inline-flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-xl transition-all hover:opacity-80"
              style={{
                background: `color-mix(in srgb, ${section.accent} 15%, transparent)`,
                color: section.accent,
                border: `1px solid color-mix(in srgb, ${section.accent} 30%, transparent)`,
              }}
            >
              <CheckCircle2 size={14} />
              {section.linkLabel}
            </Link>
          </div>
        )}
      </Card>
    </section>
  )
}

/* ── Sidebar nav with active highlight ── */
function DocNav({ activeId }: { activeId: string }) {
  const navRef    = useRef<HTMLElement>(null)
  const activeRef = useRef<HTMLAnchorElement>(null)

  // Keep the active link scrolled into the centre of the sidebar whenever it changes
  useEffect(() => {
    const nav    = navRef.current
    const active = activeRef.current
    if (!nav || !active) return
    const navTop    = nav.scrollTop
    const navBottom = navTop + nav.clientHeight
    const elTop     = active.offsetTop
    const elBottom  = elTop + active.clientHeight
    if (elTop < navTop || elBottom > navBottom) {
      active.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [activeId])

  return (
    <nav
      ref={navRef}
      className="hidden lg:flex flex-col sticky top-24 w-52 shrink-0"
      style={{
        maxHeight:    'calc(100vh - 7rem)',
        overflowY:    'auto',
        overflowX:    'hidden',
        scrollbarWidth: 'none',          /* Firefox */
      }}
    >
      {/* hide webkit scrollbar */}
      <style>{`nav::-webkit-scrollbar { display: none; }`}</style>

      <p className="text-xs font-semibold uppercase tracking-wider px-3 mb-3 shrink-0" style={{ color: 'var(--muted)' }}>
        Contents
      </p>

      <div className="flex-1 space-y-0.5">
        {SECTIONS.map(s => {
          const Icon   = s.icon
          const active = activeId === s.id
          return (
            <a
              key={s.id}
              href={`#${s.id}`}
              ref={active ? activeRef : undefined}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all duration-150"
              style={{
                color:      active ? 'var(--ink)'  : 'var(--muted)',
                background: active ? `color-mix(in srgb, ${s.accent} 10%, transparent)` : 'transparent',
                fontWeight: active ? 600 : 400,
                borderLeft: active ? `2px solid ${s.accent}` : '2px solid transparent',
              }}
            >
              <Icon size={14} style={{ color: active ? s.accent : 'var(--muted)' }} />
              {s.title}
            </a>
          )
        })}
      </div>

      <div className="pt-4 px-3 shrink-0">
        <a
          href="https://explorer.arc.io"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 text-xs hover:opacity-70 transition-opacity"
          style={{ color: 'var(--muted)' }}
        >
          <ExternalLink size={11} />
          Arc Mainnet Explorer
        </a>
      </div>
    </nav>
  )
}

/* ── Main page ── */
export default function DocsPage() {
  const [activeId, setActiveId] = useState<string>(SECTIONS[0].id)
  const observerRef = useRef<IntersectionObserver | null>(null)

  useEffect(() => {
    // Track which section is most visible in the viewport
    const sectionEls = SECTIONS.map(s => document.getElementById(s.id)).filter(Boolean) as HTMLElement[]

    observerRef.current = new IntersectionObserver(
      (entries) => {
        // Find the topmost intersecting entry
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible.length > 0) {
          setActiveId(visible[0].target.id)
        }
      },
      {
        rootMargin: '-20% 0px -60% 0px', // triggers when section is ~20% from top
        threshold: 0,
      }
    )

    sectionEls.forEach(el => observerRef.current!.observe(el))
    return () => observerRef.current?.disconnect()
  }, [])

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-5 py-6 pb-24">
      <PageHeader
        title="Documentation"
        subtitle="Everything you need to understand and use RacconPay and written for complete beginners."
      />

      <div className="flex gap-8 mt-6">
        {/* Sidebar */}
        <DocNav activeId={activeId} />

        {/* Content */}
        <div className="flex-1 space-y-6 min-w-0">
          {SECTIONS.map(section => (
            <DocSection key={section.id} section={section} />
          ))}

          {/* Footer note */}
          <div
            className="rounded-2xl p-6 text-center"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <p className="text-sm font-semibold mb-1" style={{ color: 'var(--ink)' }}>
              Built on Arc Mainnet
            </p>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              All contracts are deployed on Arc Mainnet (chain ID 5042). Real USDC is used always verify addresses before transacting.
              Verify transactions at{' '}
              <a
                href="https://explorer.arc.io"
                target="_blank"
                rel="noreferrer"
                className="underline hover:opacity-70"
                style={{ color: 'var(--accent)' }}
              >
                explorer.arc.io
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}