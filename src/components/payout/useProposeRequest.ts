/**
 * Creates an approval request on the multisig contract. This is the same `propose` call the Approvals page made,
 * with the same arguments: the recipient list, the two co-signers and a description. No USDC moves here; the
 * payment happens later, when both co-signers have approved and the proposer executes.
 */
import { useState } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { MULTISIG_ADDRESS } from '../../constants'
import { MULTISIG_ABI } from '../../abis'
import { friendlyTxError } from '../../lib/txError'
import { useRecordTx } from '../../lib/txlog'

export interface ProposeRecipient { addr: `0x${string}`; amount: bigint }

export function useProposeRequest(total: bigint) {
  const { address } = useAccount()
  const { writeContractAsync } = useWriteContract()
  const [hash, setHash] = useState<`0x${string}` | undefined>()
  const [signing, setSigning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { isSuccess: confirmed, isLoading: confirming } = useWaitForTransactionReceipt({ hash })

  useRecordTx({ address, hash, confirmed, kind: 'Approval', detail: 'Created payout request', amountRaw: total })

  const submit = async (recipients: ProposeRecipient[], coSigner1: `0x${string}`, coSigner2: `0x${string}`, description: string) => {
    setSigning(true); setError(null)
    try {
      const h = await writeContractAsync({
        address: MULTISIG_ADDRESS, abi: MULTISIG_ABI, functionName: 'propose',
        args: [recipients, coSigner1, coSigner2, description],
      })
      setHash(h)
    } catch (e) {
      setError(friendlyTxError(e))
    } finally {
      setSigning(false)
    }
  }

  return { submit, signing, confirming, confirmed, hash, error, clearError: () => setError(null) }
}
