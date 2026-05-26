import { test } from '@japa/runner'
import { DkitSigner, DkitVerifier } from '#services/dkit'

test.group('DkitSigner.generateKeyPair', () => {
  test('ed25519 の鍵ペア (private / public) を base64url 文字列で返す', ({ assert }) => {
    const { privateKey, publicKey } = DkitSigner.generateKeyPair()

    assert.isString(privateKey)
    assert.isString(publicKey)
    assert.match(privateKey, /^[A-Za-z0-9_-]+$/)
    assert.match(publicKey, /^[A-Za-z0-9_-]+$/)
    assert.notEqual(privateKey, publicKey)
    // ed25519 公開鍵は 32 bytes、base64url 表現で 43 文字程度
    assert.isAtLeast(publicKey.length, 40)
  })

  test('毎回別の鍵ペアを返す (ランダム性)', ({ assert }) => {
    const a = DkitSigner.generateKeyPair()
    const b = DkitSigner.generateKeyPair()
    assert.notEqual(a.privateKey, b.privateKey)
    assert.notEqual(a.publicKey, b.publicKey)
  })
})

test.group('DkitSigner#signClaim', () => {
  test('v=DKIT1 形式の claim 文字列 + sig= を返す', ({ assert }) => {
    const { privateKey } = DkitSigner.generateKeyPair()
    const signer = new DkitSigner(privateKey)

    const claim = signer.signClaim({
      fqdn: 'example.com',
      selector: 'default',
      designUrl: 'https://app/domains/MU00000001/tshirt.svg',
      sha256: 'abc123def456',
      issuedAt: '2026-05-27',
    })

    assert.include(claim, 'v=DKIT1')
    assert.include(claim, 'd=example.com')
    assert.include(claim, 's=default')
    assert.include(claim, 'design=https://app/domains/MU00000001/tshirt.svg')
    assert.include(claim, 'sha256=abc123def456')
    assert.include(claim, 'issued=2026-05-27')
    assert.match(claim, /sig=[A-Za-z0-9_-]+/)
  })
})

test.group('DkitSigner#signClaim with optional market field', () => {
  test('market URL を含めて署名し、verify でも payload.market を取り出せる', ({ assert }) => {
    const { privateKey, publicKey } = DkitSigner.generateKeyPair()
    const signer = new DkitSigner(privateKey)
    const verifier = new DkitVerifier(publicKey)

    const claim = signer.signClaim({
      fqdn: 'example.com',
      selector: 'default',
      designUrl: 'https://app/domains/MU/tshirt.svg',
      sha256: 'abc123',
      issuedAt: '2026-05-27',
      market: 'https://suzuri.jp/example/products/123',
    })

    assert.include(claim, 'market=https://suzuri.jp/example/products/123')

    const result = verifier.verify(claim)
    assert.isTrue(result.valid)
    if (result.valid) {
      assert.equal(result.payload.market, 'https://suzuri.jp/example/products/123')
    }
  })

  test('market は optional — 省略しても signClaim / verify が動く', ({ assert }) => {
    const { privateKey, publicKey } = DkitSigner.generateKeyPair()
    const signer = new DkitSigner(privateKey)
    const verifier = new DkitVerifier(publicKey)

    const claim = signer.signClaim({
      fqdn: 'example.com',
      selector: 'default',
      designUrl: 'https://app/domains/MU/tshirt.svg',
      sha256: 'abc123',
      issuedAt: '2026-05-27',
    })

    assert.notInclude(claim, 'market=')

    const result = verifier.verify(claim)
    assert.isTrue(result.valid)
    if (result.valid) {
      assert.isUndefined(result.payload.market)
    }
  })
})

test.group('DkitVerifier#verify', () => {
  test('同じドメイン鍵で署名された claim を valid=true で検証する', ({ assert }) => {
    const { privateKey, publicKey } = DkitSigner.generateKeyPair()
    const signer = new DkitSigner(privateKey)
    const verifier = new DkitVerifier(publicKey)

    const claim = signer.signClaim({
      fqdn: 'example.com',
      selector: 'default',
      designUrl: 'https://app/domains/MU00000001/tshirt.svg',
      sha256: 'abc123def456',
      issuedAt: '2026-05-27',
    })

    const result = verifier.verify(claim)

    assert.isTrue(result.valid)
    if (result.valid) {
      assert.equal(result.payload.fqdn, 'example.com')
      assert.equal(result.payload.selector, 'default')
      assert.equal(result.payload.sha256, 'abc123def456')
    }
  })

  test('claim 本文が改竄されたら valid=false を返す', ({ assert }) => {
    const { privateKey, publicKey } = DkitSigner.generateKeyPair()
    const signer = new DkitSigner(privateKey)
    const verifier = new DkitVerifier(publicKey)

    const original = signer.signClaim({
      fqdn: 'example.com',
      selector: 'default',
      designUrl: 'https://app/domains/MU00000001/tshirt.svg',
      sha256: 'abc123def456',
      issuedAt: '2026-05-27',
    })
    const tampered = original.replace('sha256=abc123def456', 'sha256=000000000000')

    const result = verifier.verify(tampered)
    assert.isFalse(result.valid)
  })

  test('別の鍵で署名された claim は valid=false', ({ assert }) => {
    const a = DkitSigner.generateKeyPair()
    const b = DkitSigner.generateKeyPair()
    const signer = new DkitSigner(a.privateKey)
    const verifier = new DkitVerifier(b.publicKey)

    const claim = signer.signClaim({
      fqdn: 'example.com',
      selector: 'default',
      designUrl: 'https://app/domains/MU00000001/tshirt.svg',
      sha256: 'abc123def456',
      issuedAt: '2026-05-27',
    })

    const result = verifier.verify(claim)
    assert.isFalse(result.valid)
  })
})
