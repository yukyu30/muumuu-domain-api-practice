import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as cryptoSign,
  verify as cryptoVerify,
} from 'node:crypto'

const SUPPORTED_VERSION = 'DKIT1'

export type DkitClaimInput = {
  fqdn: string
  selector: string
  issuedAt: string
  market?: string
}

export type DkitClaimPayload = {
  version: string
  fqdn: string
  selector: string
  issuedAt: string
  market?: string
}

export type DkitVerificationResult =
  | { valid: true; payload: DkitClaimPayload }
  | { valid: false; reason: string }

function toBase64Url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(s: string): Buffer {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)
  return Buffer.from(padded, 'base64')
}

function rawEd25519PrivateKey(key: ReturnType<typeof generateKeyPairSync>['privateKey']): Buffer {
  const der = key.export({ type: 'pkcs8', format: 'der' })
  // PKCS8 for ed25519: last 32 bytes are the raw seed
  return der.subarray(der.length - 32)
}

function rawEd25519PublicKey(key: ReturnType<typeof generateKeyPairSync>['publicKey']): Buffer {
  const der = key.export({ type: 'spki', format: 'der' })
  // SPKI for ed25519: last 32 bytes are the raw public key
  return der.subarray(der.length - 32)
}

function buildPrivateKeyObject(rawSeed: Buffer) {
  const pkcs8Prefix = Buffer.from('302e020100300506032b657004220420', 'hex')
  const der = Buffer.concat([pkcs8Prefix, rawSeed])
  return createPrivateKey({ key: der, format: 'der', type: 'pkcs8' })
}

function buildPublicKeyObject(rawKey: Buffer) {
  const spkiPrefix = Buffer.from('302a300506032b6570032100', 'hex')
  const der = Buffer.concat([spkiPrefix, rawKey])
  return createPublicKey({ key: der, format: 'der', type: 'spki' })
}

function buildClaimBody(input: DkitClaimInput): string {
  const parts = [
    `v=${SUPPORTED_VERSION}`,
    `d=${input.fqdn}`,
    `s=${input.selector}`,
    `issued=${input.issuedAt}`,
  ]
  if (input.market) parts.push(`market=${input.market}`)
  return parts.join('; ')
}

function parseClaim(claim: string): { body: string; sig: string; fields: Record<string, string> } | null {
  const fields: Record<string, string> = {}
  const segments = claim.split(';').map((s) => s.trim()).filter(Boolean)
  for (const seg of segments) {
    const idx = seg.indexOf('=')
    if (idx < 0) return null
    const key = seg.slice(0, idx).trim()
    const value = seg.slice(idx + 1).trim()
    fields[key] = value
  }
  if (!fields.sig) return null
  const sig = fields.sig
  const bodyParts = segments.filter((s) => !s.startsWith('sig='))
  return { body: bodyParts.join('; '), sig, fields }
}

export class DkitSigner {
  static generateKeyPair(): { privateKey: string; publicKey: string } {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519')
    return {
      privateKey: toBase64Url(rawEd25519PrivateKey(privateKey)),
      publicKey: toBase64Url(rawEd25519PublicKey(publicKey)),
    }
  }

  static derivePublicKey(privateKeyBase64Url: string): string {
    const seed = fromBase64Url(privateKeyBase64Url)
    const keyObject = buildPrivateKeyObject(seed)
    const pubObject = createPublicKey(keyObject)
    return toBase64Url(rawEd25519PublicKey(pubObject))
  }

  constructor(private privateKeyBase64Url: string) {}

  signClaim(input: DkitClaimInput): string {
    const body = buildClaimBody(input)
    const seed = fromBase64Url(this.privateKeyBase64Url)
    const keyObject = buildPrivateKeyObject(seed)
    const sig = cryptoSign(null, Buffer.from(body, 'utf-8'), keyObject)
    return `${body}; sig=${toBase64Url(sig)}`
  }
}

export class DkitVerifier {
  constructor(private publicKeyBase64Url: string) {}

  verify(claim: string): DkitVerificationResult {
    const parsed = parseClaim(claim)
    if (!parsed) return { valid: false, reason: 'malformed claim' }
    if (parsed.fields.v !== SUPPORTED_VERSION) {
      return { valid: false, reason: `unsupported version: ${parsed.fields.v}` }
    }
    const required = ['d', 's', 'issued'] as const
    for (const k of required) {
      if (!parsed.fields[k]) return { valid: false, reason: `missing field: ${k}` }
    }

    const rawPub = fromBase64Url(this.publicKeyBase64Url)
    const pubObject = buildPublicKeyObject(rawPub)
    const sig = fromBase64Url(parsed.sig)
    const ok = cryptoVerify(null, Buffer.from(parsed.body, 'utf-8'), pubObject, sig)
    if (!ok) return { valid: false, reason: 'signature mismatch' }

    return {
      valid: true,
      payload: {
        version: parsed.fields.v,
        fqdn: parsed.fields.d,
        selector: parsed.fields.s,
        issuedAt: parsed.fields.issued,
        market: parsed.fields.market,
      },
    }
  }
}
