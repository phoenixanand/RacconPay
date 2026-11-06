/**
 * CSV helpers + the streams export. Cells starting with = + - @ are prefixed with a quote
 * so spreadsheet apps never run them as formulas (CSV injection).
 */
import { formatUsdc } from '../../utils'
import { STATUS_LABEL, streamStatus, type ConsoleStream } from './consoleData'

export function csvCell(value: string | number | bigint | boolean | undefined | null): string {
  let s = value === undefined || value === null ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(header: string[], rows: (string | number | bigint | boolean | undefined | null)[][]): string {
  return [header, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n')
}

export function downloadText(filename: string, text: string, mime = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const iso = (ts: bigint) => new Date(Number(ts) * 1000).toISOString()

export function exportStreamsCsv(streams: ConsoleStream[], nameOf: (addr: string) => string, networkName: string) {
  const now = BigInt(Math.floor(Date.now() / 1000))
  const rows = streams.map(s => {
    const st = s.stream
    const m = s.metrics
    const vested = st.cancelled ? st.finalVested : (m?.vested ?? 0n)
    return [
      networkName,
      s.contract,
      s.id.toString(),
      s.hasYield ? 'yes' : 'no',
      st.grantor, nameOf(st.grantor),
      st.beneficiary, nameOf(st.beneficiary),
      STATUS_LABEL[streamStatus(s, now)],
      formatUsdc(st.totalAmount),
      formatUsdc(vested),
      formatUsdc(st.claimedAmount),
      formatUsdc(st.totalAmount > vested ? st.totalAmount - vested : 0n),
      iso(st.startTime),
      iso(st.endTime),
      m ? iso(m.effectiveEnd) : '',
      m ? m.breaks.length : '',
      s.yieldInfo ? formatUsdc(s.yieldInfo.yieldEarned) : '',
    ]
  })
  const csv = toCsv([
    'network', 'contract', 'stream_id', 'yield_enabled',
    'payer_address', 'payer_label', 'payee_address', 'payee_label', 'status',
    'total_usdc', 'vested_usdc', 'claimed_usdc', 'unvested_usdc',
    'start_utc', 'original_end_utc', 'current_end_utc', 'pauses', 'yield_available_usdc',
  ], rows)
  downloadText(`racconpay-streams-${new Date().toISOString().slice(0, 10)}.csv`, csv)
}
