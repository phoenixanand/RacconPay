/** One badge for every status in the app, so the same state always looks the same. */
import { Badge } from '../ui'

export type Status =
  | 'confirmed' | 'pending' | 'failed' | 'submitted'
  | 'active' | 'completed' | 'cancelled' | 'paused'
  | 'paid' | 'unpaid' | 'overdue' | 'draft'
  | 'approved' | 'rejected' | 'executed' | 'expired'
  | 'settled' | 'outstanding'

const TONE: Record<Status, { label: string; variant: 'success' | 'danger' | 'warning' | 'blue' | 'default' }> = {
  confirmed:   { label: 'Confirmed',   variant: 'success' },
  pending:     { label: 'Pending',     variant: 'warning' },
  submitted:   { label: 'Submitted',   variant: 'blue' },
  failed:      { label: 'Failed',      variant: 'danger' },
  active:      { label: 'Active',      variant: 'blue' },
  completed:   { label: 'Completed',   variant: 'success' },
  cancelled:   { label: 'Cancelled',   variant: 'default' },
  paused:      { label: 'Paused',      variant: 'warning' },
  paid:        { label: 'Paid',        variant: 'success' },
  unpaid:      { label: 'Unpaid',      variant: 'warning' },
  overdue:     { label: 'Overdue',     variant: 'danger' },
  draft:       { label: 'Draft',       variant: 'default' },
  approved:    { label: 'Approved',    variant: 'success' },
  rejected:    { label: 'Rejected',    variant: 'danger' },
  executed:    { label: 'Executed',    variant: 'success' },
  expired:     { label: 'Expired',     variant: 'default' },
  settled:     { label: 'Settled',     variant: 'success' },
  outstanding: { label: 'Outstanding', variant: 'warning' },
}

export function StatusBadge({ status, label }: { status: Status; label?: string }) {
  const t = TONE[status]
  return <Badge variant={t.variant}>{label ?? t.label}</Badge>
}
