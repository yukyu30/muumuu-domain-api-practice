import { resolveTxt as defaultResolveTxt } from 'node:dns/promises'
import { DkitVerifier, type DkitClaimPayload } from '#services/dkit'

export type TxtResolver = (name: string) => Promise<string[][]>

export type DkitDnsVerificationResult =
  | { kind: 'valid'; payload: DkitClaimPayload }
  | { kind: 'malformed_claim'; reason: string }
  | { kind: 'public_key_not_found'; lookup: string }
  | { kind: 'signature_mismatch'; reason: string }
  | { kind: 'dns_error'; reason: string }

function parseClaimFields(claim: string): Record<string, string> | null {
  const fields: Record<string, string> = {}
  const segments = claim.split(';').map((s) => s.trim()).filter(Boolean)
  for (const seg of segments) {
    const i = seg.indexOf('=')
    if (i <= 0) return null
    fields[seg.slice(0, i).trim()] = seg.slice(i + 1).trim()
  }
  return fields
}

function extractPublicKey(txtRecords: string[][]): string | null {
  for (const chunks of txtRecords) {
    const joined = chunks.join('')
    if (!joined.includes('v=DKIT1')) continue
    const m = joined.match(/pk=([A-Za-z0-9_-]+)/)
    if (m) return m[1]
  }
  return null
}

export class DkitDnsVerifier {
  constructor(private resolveTxt: TxtResolver = defaultResolveTxt) {}

  async verifyClaim(claim: string): Promise<DkitDnsVerificationResult> {
    const fields = parseClaimFields(claim)
    if (!fields) return { kind: 'malformed_claim', reason: 'cannot parse claim' }
    const { d: fqdn, s: selector } = fields
    if (!fqdn || !selector) {
      return { kind: 'malformed_claim', reason: 'missing d= or s=' }
    }

    const lookupName = `${selector}._dkit.${fqdn}`
    let txts: string[][]
    try {
      txts = await this.resolveTxt(lookupName)
    } catch (err) {
      const e = err as NodeJS.ErrnoException
      if (e.code === 'ENOTFOUND' || e.code === 'ENODATA') {
        return { kind: 'public_key_not_found', lookup: lookupName }
      }
      return { kind: 'dns_error', reason: e.message }
    }

    const publicKey = extractPublicKey(txts)
    if (!publicKey) {
      return { kind: 'public_key_not_found', lookup: lookupName }
    }

    const verifier = new DkitVerifier(publicKey)
    const result = verifier.verify(claim)
    if (result.valid) {
      return { kind: 'valid', payload: result.payload }
    }
    return { kind: 'signature_mismatch', reason: result.reason }
  }
}
