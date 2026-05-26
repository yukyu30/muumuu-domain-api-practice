import { test } from '@japa/runner'
import { DkitDnsVerifier } from '#services/dkit_dns_verifier'
import { DkitSigner } from '#services/dkit'

function stubResolver(records: Record<string, string[]>) {
  return async (name: string): Promise<string[][]> => {
    const txt = records[name]
    if (!txt) {
      const err = new Error(`queryTxt ENOTFOUND ${name}`) as NodeJS.ErrnoException
      err.code = 'ENOTFOUND'
      throw err
    }
    return txt.map((t) => [t])
  }
}

test.group('DkitDnsVerifier#verifyClaim', () => {
  test('DNS から公開鍵を引いて、正しく署名された claim を valid=true で返す', async ({ assert }) => {
    const { privateKey, publicKey } = DkitSigner.generateKeyPair()
    const signer = new DkitSigner(privateKey)
    const claim = signer.signClaim({
      fqdn: 'example.com',
      selector: 'default',
      issuedAt: '2026-05-27',
      market: 'https://suzuri.jp/example/products/123',
    })

    const resolver = stubResolver({
      'default._dkit.example.com': [`v=DKIT1; alg=ed25519; pk=${publicKey}`],
    })
    const verifier = new DkitDnsVerifier(resolver)

    const result = await verifier.verifyClaim(claim)

    assert.equal(result.kind, 'valid')
    if (result.kind === 'valid') {
      assert.equal(result.payload.fqdn, 'example.com')
      assert.equal(result.payload.market, 'https://suzuri.jp/example/products/123')
    }
  })

  test('DNS に公開鍵 TXT が無いとき kind=public_key_not_found', async ({ assert }) => {
    const { privateKey } = DkitSigner.generateKeyPair()
    const signer = new DkitSigner(privateKey)
    const claim = signer.signClaim({
      fqdn: 'example.com',
      selector: 'default',
      issuedAt: '2026-05-27',
    })

    const resolver = stubResolver({})
    const verifier = new DkitDnsVerifier(resolver)

    const result = await verifier.verifyClaim(claim)
    assert.equal(result.kind, 'public_key_not_found')
  })

  test('別の公開鍵で署名されているとき kind=signature_mismatch', async ({ assert }) => {
    const a = DkitSigner.generateKeyPair()
    const b = DkitSigner.generateKeyPair()
    const signer = new DkitSigner(a.privateKey)
    const claim = signer.signClaim({
      fqdn: 'example.com',
      selector: 'default',
      issuedAt: '2026-05-27',
    })

    const resolver = stubResolver({
      'default._dkit.example.com': [`v=DKIT1; alg=ed25519; pk=${b.publicKey}`],
    })
    const verifier = new DkitDnsVerifier(resolver)

    const result = await verifier.verifyClaim(claim)
    assert.equal(result.kind, 'signature_mismatch')
  })

  test('claim 自体が壊れているとき kind=malformed_claim', async ({ assert }) => {
    const resolver = stubResolver({})
    const verifier = new DkitDnsVerifier(resolver)

    const result = await verifier.verifyClaim('not a valid claim')
    assert.equal(result.kind, 'malformed_claim')
  })
})
