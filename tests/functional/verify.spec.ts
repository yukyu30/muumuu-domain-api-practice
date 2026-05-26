import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import { DkitDnsVerifier } from '#services/dkit_dns_verifier'
import { DkitSigner } from '#services/dkit'

function swapVerifier(stubRecords: Record<string, string[]>) {
  const resolver = async (name: string): Promise<string[][]> => {
    const txt = stubRecords[name]
    if (!txt) {
      const err = new Error(`queryTxt ENOTFOUND ${name}`) as NodeJS.ErrnoException
      err.code = 'ENOTFOUND'
      throw err
    }
    return txt.map((t) => [t])
  }
  app.container.swap(DkitDnsVerifier, () => new DkitDnsVerifier(resolver))
}

test.group('GET /verify', (group) => {
  group.each.teardown(() => {
    app.container.restore(DkitDnsVerifier)
  })

  test('claim 無しでアクセスすると 200 + 「QR から飛んできてください」案内', async ({
    client,
    assert,
  }) => {
    const response = await client.get('/verify')
    response.assertStatus(200)
    assert.include(response.text(), 'QR')
  })

  test('正しい claim + DNS に公開鍵あり → 200 + ✓ + market URL を表示', async ({
    client,
    assert,
  }) => {
    const { privateKey, publicKey } = DkitSigner.generateKeyPair()
    const signer = new DkitSigner(privateKey)
    const claim = signer.signClaim({
      fqdn: 'example.com',
      selector: 'default',
      issuedAt: '2026-05-27',
      market: 'https://suzuri.jp/example/products/123',
    })

    swapVerifier({
      'default._dkit.example.com': [`v=DKIT1; alg=ed25519; pk=${publicKey}`],
    })

    const response = await client.get('/verify').qs({ claim })

    response.assertStatus(200)
    const body = response.text()
    assert.include(body, 'example.com')
    assert.include(body, 'https://suzuri.jp/example/products/123')
    assert.include(body, '正規')
  })

  test('別の鍵で署名された claim → 200 + ✗ + 検証失敗メッセージ', async ({
    client,
    assert,
  }) => {
    const a = DkitSigner.generateKeyPair()
    const b = DkitSigner.generateKeyPair()
    const signer = new DkitSigner(a.privateKey)
    const claim = signer.signClaim({
      fqdn: 'example.com',
      selector: 'default',
      issuedAt: '2026-05-27',
    })

    swapVerifier({
      'default._dkit.example.com': [`v=DKIT1; alg=ed25519; pk=${b.publicKey}`],
    })

    const response = await client.get('/verify').qs({ claim })

    response.assertStatus(200)
    assert.include(response.text(), '検証に失敗')
  })

  test('DNS に公開鍵 TXT が無い → 200 + 「公開鍵が DNS にありません」', async ({
    client,
    assert,
  }) => {
    const { privateKey } = DkitSigner.generateKeyPair()
    const signer = new DkitSigner(privateKey)
    const claim = signer.signClaim({
      fqdn: 'example.com',
      selector: 'default',
      issuedAt: '2026-05-27',
    })

    swapVerifier({})

    const response = await client.get('/verify').qs({ claim })

    response.assertStatus(200)
    assert.include(response.text(), '公開鍵')
  })
})
