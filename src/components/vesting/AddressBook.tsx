/**
 * Address book: names and departments for wallet addresses. Stored only in this browser
 * (never on-chain). Import/export as JSON to move it between machines.
 */
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Trash2, Download, Upload, BookUser } from 'lucide-react'

import { Card, Label, PrimaryButton, GhostButton } from '../ui'
import { shortAddr } from '../../utils'
import { useLabels } from './labels'
import { downloadText } from './exportCsv'

const inputCls = 'w-full rounded-xl px-3 py-2 text-sm outline-none placeholder:text-[var(--subtle)]'
const inputStyle = { background: 'var(--surface-muted)', color: 'var(--ink)', border: '1px solid var(--border)' }

export default function AddressBook() {
  const { labels, setLabel, removeLabel, exportJson, importJson } = useLabels()
  const [addr, setAddr] = useState('')
  const [name, setName] = useState('')
  const [dept, setDept] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const entries = Object.entries(labels).sort((a, b) => a[1].name.localeCompare(b[1].name))
  const valid = /^0x[0-9a-fA-F]{40}$/.test(addr) && name.trim().length > 0

  async function onImport(file: File | undefined) {
    if (!file) return
    try {
      const n = importJson(await file.text())
      toast.success(`Imported ${n} label${n === 1 ? '' : 's'}`)
    } catch {
      toast.error('That file is not a valid address book')
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6 items-start">
      <Card className="p-5 flex flex-col gap-3">
        <div className="flex items-center gap-2"><BookUser size={15} style={{ color: 'var(--vest-accent)' }} /><Label>Add a name</Label></div>
        <input className={`${inputCls} font-mono text-xs`} style={inputStyle} placeholder="Wallet address 0x…" value={addr} onChange={e => setAddr(e.target.value.trim())} />
        <input className={inputCls} style={inputStyle} placeholder="Name or employee ID" value={name} onChange={e => setName(e.target.value)} />
        <input className={inputCls} style={inputStyle} placeholder="Department (optional)" value={dept} onChange={e => setDept(e.target.value)} />
        <PrimaryButton disabled={!valid} onClick={() => { setLabel(addr, { name, dept }); setAddr(''); setName(''); setDept('') }}>
          Save name
        </PrimaryButton>
        <p className="text-xs text-pretty" style={{ color: 'var(--subtle)' }}>
          Names stay in this browser only and are never written on-chain. Export a backup to use them on another computer.
        </p>
        <div className="flex gap-2">
          <GhostButton className="flex-1" disabled={entries.length === 0}
                       onClick={() => downloadText('racconpay-address-book.json', exportJson(), 'application/json')}>
            <Download size={13} /> Export
          </GhostButton>
          <GhostButton className="flex-1" onClick={() => fileRef.current?.click()}><Upload size={13} /> Import</GhostButton>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={e => void onImport(e.target.files?.[0])} />
        </div>
      </Card>

      <Card className="overflow-hidden">
        {entries.length === 0 ? (
          <p className="p-8 text-center text-sm" style={{ color: 'var(--muted)' }}>No names saved yet.</p>
        ) : entries.map(([a, l]) => (
          <div key={a} className="flex items-center justify-between gap-3 px-5 py-3 border-b border-[var(--border)] last:border-0">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>{l.name}</p>
              <p className="text-xs font-mono" style={{ color: 'var(--subtle)' }}>{shortAddr(a)}{l.dept ? ` · ${l.dept}` : ''}</p>
            </div>
            <button onClick={() => removeLabel(a)} aria-label={`Remove ${l.name}`} className="p-2 rounded-lg hover:bg-[var(--danger-muted)]" style={{ color: 'var(--danger)' }}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </Card>
    </div>
  )
}
