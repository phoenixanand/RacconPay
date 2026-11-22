/**
 * Bridge: move USDC and EURC to or from Arc Mainnet with the provider you are most comfortable with.
 * CCTP and Gateway are Circle's own routes. Third-party bridges are listed with a live status and only
 * become usable when they report a working Arc route. Mainnet, real funds. Nothing is sent without a click.
 */
import { useSearchParams } from 'react-router-dom'
import { Waypoints } from 'lucide-react'
import { PageHeader } from './ui'
import ProviderPicker from './bridge/ProviderPicker'
import CctpPanel from './bridge/CctpPanel'
import GatewayPanel from './bridge/GatewayPanel'
import AcrossPanel from './bridge/AcrossPanel'
import { useProviderStates } from '../bridge/probe'
import { providerById, type ProviderId } from '../bridge/providers'
import { normalizeDirection, type Direction } from '../bridge/chains'

export default function BridgePage() {
  const [params, setParams] = useSearchParams()
  const states = useProviderStates()
  const requested = providerById(params.get('via')).id
  // A provider that is not ready (for example a shared link to Across before it supports Arc) falls back to CCTP.
  const direction = normalizeDirection(params.get('from'), params.get('to'))
  // Across covers EVM chains only, so a direction that involves Solana uses CCTP instead.
  const involvesSolana = direction.from === 'solana' || direction.to === 'solana'
  const via: ProviderId = states[requested].status === 'ready' && !(requested === 'across' && involvesSolana) ? requested : 'cctp'

  const writeParams = (via: ProviderId, d: Direction) => {
    const next: Record<string, string> = { from: d.from, to: d.to }
    if (via !== 'cctp') next.via = via
    setParams(next, { replace: true })
  }
  const choose = (id: ProviderId) => writeParams(id, direction)
  const setDirection = (d: Direction) => writeParams(via, d)

  return (
    <div className="flex flex-col gap-6 animate-fade-up">
      <PageHeader
        icon={Waypoints}
        title="Bridge"
        subtitle="Move USDC and EURC to or from Arc. Pick the route you are comfortable with."
      />

      <ProviderPicker value={via} onChange={choose} states={states} />

      {via === 'cctp' && <CctpPanel key={`${direction.from}-${direction.to}`} direction={direction} onDirection={setDirection} />}
      {via === 'gateway' && <GatewayPanel key={`${direction.from}-${direction.to}`} direction={direction} onDirection={setDirection} />}
      {via === 'across' && <AcrossPanel key={`${direction.from}-${direction.to}`} direction={direction} onDirection={setDirection} />}

    </div>
  )
}
