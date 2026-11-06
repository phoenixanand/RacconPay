/**
 * Local-only address labels and leave notes.
 *
 * Names, departments and leave notes can be personal data. They are kept in this
 * browser's localStorage and are NEVER written on-chain.
 */
import { useSyncExternalStore } from 'react'
import { shortAddr } from '../../utils'

export interface AddressLabel { name: string; dept?: string }
type LabelMap = Record<string, AddressLabel>

const LABEL_KEY = 'racconpay.labels.v1'
const NOTE_KEY = 'racconpay.leaveNotes.v1'

let cache: LabelMap | null = null
const listeners = new Set<() => void>()

function readLabels(): LabelMap {
  if (cache) return cache
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(LABEL_KEY) ?? '{}')
    cache = parsed && typeof parsed === 'object' ? (parsed as LabelMap) : {}
  } catch {
    cache = {}
  }
  return cache
}

function writeLabels(next: LabelMap) {
  cache = next
  try { localStorage.setItem(LABEL_KEY, JSON.stringify(next)) } catch { /* storage full or blocked */ }
  listeners.forEach(l => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

const isAddr = (a: string) => /^0x[0-9a-fA-F]{40}$/.test(a)

export function useLabels() {
  const labels = useSyncExternalStore(subscribe, readLabels, readLabels)

  return {
    labels,
    /** Label name, or a shortened address when there is none. */
    nameOf: (addr: string): string => labels[addr.toLowerCase()]?.name || shortAddr(addr),
    labelOf: (addr: string): AddressLabel | undefined => labels[addr.toLowerCase()],
    setLabel: (addr: string, label: AddressLabel) => {
      if (!isAddr(addr)) return
      const name = label.name.trim().slice(0, 80)
      if (!name) return
      writeLabels({ ...readLabels(), [addr.toLowerCase()]: { name, dept: label.dept?.trim().slice(0, 60) || undefined } })
    },
    removeLabel: (addr: string) => {
      const next = { ...readLabels() }
      delete next[addr.toLowerCase()]
      writeLabels(next)
    },
    exportJson: (): string => JSON.stringify(readLabels(), null, 2),
    /** Merge labels from JSON text. Returns how many valid labels were imported. */
    importJson: (text: string): number => {
      const parsed: unknown = JSON.parse(text)
      if (!parsed || typeof parsed !== 'object') throw new Error('Not a labels file')
      const next = { ...readLabels() }
      let count = 0
      for (const [addr, v] of Object.entries(parsed as Record<string, unknown>)) {
        const label = v as Partial<AddressLabel> | null
        if (isAddr(addr) && label && typeof label.name === 'string' && label.name.trim()) {
          next[addr.toLowerCase()] = {
            name: label.name.trim().slice(0, 80),
            dept: typeof label.dept === 'string' && label.dept.trim() ? label.dept.trim().slice(0, 60) : undefined,
          }
          count += 1
        }
      }
      writeLabels(next)
      return count
    },
  }
}

/* ── Leave notes (local only) ─────────────────────────────────────────── */
export const leaveNoteKey = (contract: string, streamId: bigint, start: bigint, end: bigint) =>
  `${contract.toLowerCase()}:${streamId}:${start}:${end}`

function readNotes(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(NOTE_KEY) ?? '{}')
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {}
  } catch {
    return {}
  }
}

export function getLeaveNote(key: string): string {
  return readNotes()[key] ?? ''
}

export function setLeaveNote(key: string, text: string) {
  const notes = readNotes()
  const value = text.trim().slice(0, 280)
  if (value) notes[key] = value
  else delete notes[key]
  try { localStorage.setItem(NOTE_KEY, JSON.stringify(notes)) } catch { /* ignore */ }
}
