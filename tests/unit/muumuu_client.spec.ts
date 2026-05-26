import { test } from '@japa/runner'
import { MuumuuClient, MuumuuApiError } from '#services/muumuu_client'

type FetchCall = { url: string; init: RequestInit | undefined }

function createFakeFetcher(response: Response): { fetcher: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = []
  const fetcher: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init })
    return response.clone()
  }
  return { fetcher, calls }
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

test.group('MuumuuClient#listDomains', () => {
  test('Authorization: Bearer ヘッダ付きで GET /me/domains を呼ぶ', async ({ assert }) => {
    const { fetcher, calls } = createFakeFetcher(
      jsonResponse({ data: [], meta: { total: 0, page: 1, 'page-size': 20 } })
    )
    const client = new MuumuuClient({
      baseUrl: 'https://api-sandbox.muumuu-domain.com/api/v2',
      token: 'muu_pat_sandbox_test',
      fetcher,
    })

    await client.listDomains()

    assert.lengthOf(calls, 1)
    assert.equal(calls[0].url, 'https://api-sandbox.muumuu-domain.com/api/v2/me/domains')
    assert.equal(calls[0].init?.method, 'GET')
    const headers = new Headers(calls[0].init?.headers)
    assert.equal(headers.get('Authorization'), 'Bearer muu_pat_sandbox_test')
  })

  test('レスポンスの data 配列を Domain[] として返し、meta も含む', async ({ assert }) => {
    const apiBody = {
      data: [
        {
          id: 'MU00000001',
          sld: 'example',
          tld: 'com',
          fqdn: 'example.com',
          state: 'active',
          'setup-state': 'completed',
          registrar: 'muumuu',
          'whois-proxy-enabled': true,
          'auto-renew-enabled': true,
          'is-japanese-domain': false,
          contract: {
            id: 'CT00000001',
            state: 'active',
            term: 1,
            'start-date': '2025-01-15',
            'end-date': '2026-01-15',
          },
        },
      ],
      meta: { total: 1, page: 1, 'page-size': 20 },
    }
    const { fetcher } = createFakeFetcher(jsonResponse(apiBody))
    const client = new MuumuuClient({
      baseUrl: 'https://api-sandbox.muumuu-domain.com/api/v2',
      token: 'muu_pat_sandbox_test',
      fetcher,
    })

    const result = await client.listDomains()

    assert.lengthOf(result.data, 1)
    assert.equal(result.data[0].fqdn, 'example.com')
    assert.equal(result.data[0].id, 'MU00000001')
    assert.equal(result.data[0].state, 'active')
    assert.equal(result.data[0].contract['start-date'], '2025-01-15')
    assert.equal(result.meta.total, 1)
    assert.equal(result.meta.page, 1)
    assert.equal(result.meta['page-size'], 20)
  })

  test('401 のとき MuumuuApiError(401, "unauthorized") を投げる', async ({ assert }) => {
    const { fetcher } = createFakeFetcher(
      new Response(JSON.stringify({ error: { code: 'unauthorized', message: 'invalid token' } }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    const client = new MuumuuClient({
      baseUrl: 'https://api-sandbox.muumuu-domain.com/api/v2',
      token: 'muu_pat_sandbox_bad',
      fetcher,
    })

    try {
      await client.listDomains()
      assert.fail('expected MuumuuApiError to be thrown')
    } catch (err) {
      assert.instanceOf(err, MuumuuApiError)
      const e = err as MuumuuApiError
      assert.equal(e.status, 401)
      assert.equal(e.code, 'unauthorized')
      assert.equal(e.message, 'invalid token')
    }
  })

  test('baseUrl が末尾スラッシュ付きでも URL に二重スラッシュを作らない', async ({
    assert,
  }) => {
    const { fetcher, calls } = createFakeFetcher(
      jsonResponse({ data: [], meta: { total: 0, page: 1, 'page-size': 20 } })
    )
    const client = new MuumuuClient({
      baseUrl: 'https://api-sandbox.muumuu-domain.com/api/v2/',
      token: 'muu_pat_sandbox_test',
      fetcher,
    })

    await client.listDomains()

    assert.equal(calls[0].url, 'https://api-sandbox.muumuu-domain.com/api/v2/me/domains')
  })

  test('200 だが data フィールドが欠落したレスポンスは MuumuuApiError(502, "invalid_response") を投げる', async ({
    assert,
  }) => {
    const { fetcher } = createFakeFetcher(jsonResponse({ meta: { total: 0, page: 1, 'page-size': 20 } }))
    const client = new MuumuuClient({
      baseUrl: 'https://api-sandbox.muumuu-domain.com/api/v2',
      token: 'muu_pat_sandbox_test',
      fetcher,
    })

    try {
      await client.listDomains()
      assert.fail('expected MuumuuApiError to be thrown')
    } catch (err) {
      assert.instanceOf(err, MuumuuApiError)
      const e = err as MuumuuApiError
      assert.equal(e.status, 502)
      assert.equal(e.code, 'invalid_response')
    }
  })

  test('200 だが data が配列でないレスポンスは MuumuuApiError(502, "invalid_response") を投げる', async ({
    assert,
  }) => {
    const { fetcher } = createFakeFetcher(
      jsonResponse({ data: null, meta: { total: 0, page: 1, 'page-size': 20 } })
    )
    const client = new MuumuuClient({
      baseUrl: 'https://api-sandbox.muumuu-domain.com/api/v2',
      token: 'muu_pat_sandbox_test',
      fetcher,
    })

    try {
      await client.listDomains()
      assert.fail('expected MuumuuApiError to be thrown')
    } catch (err) {
      assert.instanceOf(err, MuumuuApiError)
      assert.equal((err as MuumuuApiError).status, 502)
    }
  })

  test('429 のとき Retry-After を retryAfter として保持した MuumuuApiError を投げる', async ({
    assert,
  }) => {
    const { fetcher } = createFakeFetcher(
      new Response(
        JSON.stringify({ error: { code: 'rate_limited', message: 'too many requests' } }),
        {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '30' },
        }
      )
    )
    const client = new MuumuuClient({
      baseUrl: 'https://api-sandbox.muumuu-domain.com/api/v2',
      token: 'muu_pat_sandbox_test',
      fetcher,
    })

    try {
      await client.listDomains()
      assert.fail('expected MuumuuApiError to be thrown')
    } catch (err) {
      assert.instanceOf(err, MuumuuApiError)
      const e = err as MuumuuApiError
      assert.equal(e.status, 429)
      assert.equal(e.code, 'rate_limited')
      assert.equal(e.retryAfter, 30)
    }
  })
})

const domainFixture = {
  id: 'MU00000001',
  sld: 'example',
  tld: 'com',
  fqdn: 'example.com',
  state: 'active' as const,
  'setup-state': 'completed',
  registrar: 'muumuu',
  'whois-proxy-enabled': true,
  'auto-renew-enabled': true,
  'is-japanese-domain': false,
  contract: {
    id: 'CT00000001',
    state: 'active',
    term: 1,
    'start-date': '2025-01-15',
    'end-date': '2026-01-15',
  },
}

test.group('MuumuuClient#getDomain', () => {
  test('Authorization: Bearer ヘッダ付きで GET /me/domains/{id} を呼ぶ', async ({ assert }) => {
    const { fetcher, calls } = createFakeFetcher(jsonResponse({ data: domainFixture }))
    const client = new MuumuuClient({
      baseUrl: 'https://api-sandbox.muumuu-domain.com/api/v2',
      token: 'muu_pat_sandbox_test',
      fetcher,
    })

    await client.getDomain('MU00000001')

    assert.lengthOf(calls, 1)
    assert.equal(
      calls[0].url,
      'https://api-sandbox.muumuu-domain.com/api/v2/me/domains/MU00000001'
    )
    assert.equal(calls[0].init?.method, 'GET')
    const headers = new Headers(calls[0].init?.headers)
    assert.equal(headers.get('Authorization'), 'Bearer muu_pat_sandbox_test')
  })

  test('レスポンスの data を Domain として返す', async ({ assert }) => {
    const { fetcher } = createFakeFetcher(jsonResponse({ data: domainFixture }))
    const client = new MuumuuClient({
      baseUrl: 'https://api-sandbox.muumuu-domain.com/api/v2',
      token: 'muu_pat_sandbox_test',
      fetcher,
    })

    const domain = await client.getDomain('MU00000001')

    assert.equal(domain.id, 'MU00000001')
    assert.equal(domain.fqdn, 'example.com')
    assert.equal(domain.contract['start-date'], '2025-01-15')
  })

  test('200 だが data フィールドが欠落したレスポンスは 502 invalid_response', async ({
    assert,
  }) => {
    const { fetcher } = createFakeFetcher(jsonResponse({}))
    const client = new MuumuuClient({
      baseUrl: 'https://api-sandbox.muumuu-domain.com/api/v2',
      token: 'muu_pat_sandbox_test',
      fetcher,
    })

    try {
      await client.getDomain('MU00000001')
      assert.fail('expected MuumuuApiError')
    } catch (err) {
      assert.instanceOf(err, MuumuuApiError)
      assert.equal((err as MuumuuApiError).status, 502)
      assert.equal((err as MuumuuApiError).code, 'invalid_response')
    }
  })

  test('404 のとき MuumuuApiError(404, "not_found") を投げる', async ({ assert }) => {
    const { fetcher } = createFakeFetcher(
      new Response(JSON.stringify({ error: { code: 'not_found', message: 'domain not found' } }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    const client = new MuumuuClient({
      baseUrl: 'https://api-sandbox.muumuu-domain.com/api/v2',
      token: 'muu_pat_sandbox_test',
      fetcher,
    })

    try {
      await client.getDomain('MU99999999')
      assert.fail('expected MuumuuApiError')
    } catch (err) {
      assert.instanceOf(err, MuumuuApiError)
      const e = err as MuumuuApiError
      assert.equal(e.status, 404)
      assert.equal(e.code, 'not_found')
    }
  })
})

const dnsRecordFixture = {
  id: 42,
  fqdn: '_tshirt-key.example.com.',
  type: 'TXT' as const,
  value: 'v=1; alg=ed25519; pk=Abc123',
  ttl: 3600,
  'created-at': '2026-05-27T15:00:00+09:00',
  'updated-at': '2026-05-27T15:00:00+09:00',
}

test.group('MuumuuClient#createDnsRecord', () => {
  test('Authorization: Bearer + JSON ボディで POST /me/domains/{id}/dns-records を呼ぶ', async ({
    assert,
  }) => {
    const { fetcher, calls } = createFakeFetcher(
      new Response(JSON.stringify({ data: dnsRecordFixture }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    const client = new MuumuuClient({
      baseUrl: 'https://api-sandbox.muumuu-domain.com/api/v2',
      token: 'muu_pat_sandbox_test',
      fetcher,
    })

    await client.createDnsRecord('MU00000001', {
      fqdn: '_tshirt-key.example.com.',
      type: 'TXT',
      value: 'v=1; alg=ed25519; pk=Abc123',
    })

    assert.lengthOf(calls, 1)
    assert.equal(
      calls[0].url,
      'https://api-sandbox.muumuu-domain.com/api/v2/me/domains/MU00000001/dns-records'
    )
    assert.equal(calls[0].init?.method, 'POST')
    const headers = new Headers(calls[0].init?.headers)
    assert.equal(headers.get('Authorization'), 'Bearer muu_pat_sandbox_test')
    assert.include(headers.get('Content-Type') ?? '', 'application/json')
    const body = JSON.parse(String(calls[0].init?.body))
    assert.equal(body.fqdn, '_tshirt-key.example.com.')
    assert.equal(body.type, 'TXT')
    assert.equal(body.value, 'v=1; alg=ed25519; pk=Abc123')
  })

  test('レスポンスの data を DnsRecord として返す', async ({ assert }) => {
    const { fetcher } = createFakeFetcher(
      new Response(JSON.stringify({ data: dnsRecordFixture }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    const client = new MuumuuClient({
      baseUrl: 'https://api-sandbox.muumuu-domain.com/api/v2',
      token: 'muu_pat_sandbox_test',
      fetcher,
    })

    const record = await client.createDnsRecord('MU00000001', {
      fqdn: '_tshirt-key.example.com.',
      type: 'TXT',
      value: 'v=1; alg=ed25519; pk=Abc123',
    })

    assert.equal(record.id, 42)
    assert.equal(record.fqdn, '_tshirt-key.example.com.')
    assert.equal(record.type, 'TXT')
  })

  test('409 のとき MuumuuApiError(409, "duplicate") を投げる', async ({ assert }) => {
    const { fetcher } = createFakeFetcher(
      new Response(
        JSON.stringify({ error: { code: 'duplicate', message: 'record already exists' } }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      )
    )
    const client = new MuumuuClient({
      baseUrl: 'https://api-sandbox.muumuu-domain.com/api/v2',
      token: 'muu_pat_sandbox_test',
      fetcher,
    })

    try {
      await client.createDnsRecord('MU00000001', {
        fqdn: '_tshirt-key.example.com.',
        type: 'TXT',
        value: 'v=1; ...',
      })
      assert.fail('expected MuumuuApiError')
    } catch (err) {
      assert.instanceOf(err, MuumuuApiError)
      const e = err as MuumuuApiError
      assert.equal(e.status, 409)
      assert.equal(e.code, 'duplicate')
    }
  })
})
