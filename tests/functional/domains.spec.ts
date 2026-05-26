import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import {
  MuumuuApiError,
  MuumuuClient,
  type ListDomainsResponse,
} from '#services/muumuu_client'

class FakeMuumuuClient {
  constructor(private response: ListDomainsResponse) {}
  async listDomains(): Promise<ListDomainsResponse> {
    return this.response
  }
}

class ThrowingMuumuuClient {
  constructor(private error: MuumuuApiError) {}
  async listDomains(): Promise<ListDomainsResponse> {
    throw this.error
  }
  async getDomain(): Promise<never> {
    throw this.error
  }
}

const sampleDomain = {
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

class StubDomainClient {
  constructor(private domain: typeof sampleDomain) {}
  async listDomains(): Promise<ListDomainsResponse> {
    return { data: [this.domain], meta: { total: 1, page: 1, 'page-size': 20 } }
  }
  async getDomain(id: string): Promise<typeof sampleDomain> {
    if (id !== this.domain.id) {
      throw new MuumuuApiError(404, 'not_found', `domain ${id} not found`)
    }
    return this.domain
  }
}

test.group('GET /domains', (group) => {
  group.each.teardown(() => {
    app.container.restore(MuumuuClient)
  })

  test('200 を返し、HTML に各ドメインの fqdn と契約開始日が含まれる', async ({ client, assert }) => {
    const fake = new FakeMuumuuClient({
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
    })
    app.container.swap(MuumuuClient, () => fake as unknown as MuumuuClient)

    const response = await client.get('/domains')

    response.assertStatus(200)
    const body = response.text()
    assert.include(body, 'example.com')
    assert.include(body, '2025-01-15')
  })

  test('ドメインが 0 件のときは空状態メッセージを表示する', async ({ client, assert }) => {
    const fake = new FakeMuumuuClient({
      data: [],
      meta: { total: 0, page: 1, 'page-size': 20 },
    })
    app.container.swap(MuumuuClient, () => fake as unknown as MuumuuClient)

    const response = await client.get('/domains')

    response.assertStatus(200)
    assert.include(response.text(), 'ドメインがまだ登録されていません')
  })

  test('listDomains が 401 を投げたとき 401 + トークン要更新メッセージを返す', async ({
    client,
    assert,
  }) => {
    const throwing = new ThrowingMuumuuClient(
      new MuumuuApiError(401, 'unauthorized', 'invalid token')
    )
    app.container.swap(MuumuuClient, () => throwing as unknown as MuumuuClient)

    const response = await client.get('/domains')

    response.assertStatus(401)
    assert.include(response.text(), 'MUUMUU_API_TOKEN')
  })

  test('listDomains が 429 を投げたとき 429 + retryAfter 秒数を表示する', async ({
    client,
    assert,
  }) => {
    const throwing = new ThrowingMuumuuClient(
      new MuumuuApiError(429, 'rate_limited', 'too many requests', 30)
    )
    app.container.swap(MuumuuClient, () => throwing as unknown as MuumuuClient)

    const response = await client.get('/domains')

    response.assertStatus(429)
    assert.include(response.text(), '30')
    assert.include(response.text(), '再試行')
  })

  test('listDomains が 502 invalid_response を投げたとき 502 + 取得失敗メッセージを返す', async ({
    client,
    assert,
  }) => {
    const throwing = new ThrowingMuumuuClient(
      new MuumuuApiError(502, 'invalid_response', 'malformed response')
    )
    app.container.swap(MuumuuClient, () => throwing as unknown as MuumuuClient)

    const response = await client.get('/domains')

    response.assertStatus(502)
    assert.include(response.text(), 'ドメイン一覧の取得に失敗')
  })
})

test.group('GET /domains/:id', (group) => {
  group.each.teardown(() => {
    app.container.restore(MuumuuClient)
  })

  test('200 を返し、fqdn と契約開始日を含む詳細を表示する', async ({ client, assert }) => {
    const stub = new StubDomainClient(sampleDomain)
    app.container.swap(MuumuuClient, () => stub as unknown as MuumuuClient)

    const response = await client.get('/domains/MU00000001')

    response.assertStatus(200)
    const body = response.text()
    assert.include(body, 'example.com')
    assert.include(body, '2025-01-15')
  })

  test('未知の id では 404 + 見つかりません表示', async ({ client, assert }) => {
    const stub = new StubDomainClient(sampleDomain)
    app.container.swap(MuumuuClient, () => stub as unknown as MuumuuClient)

    const response = await client.get('/domains/MU99999999')

    response.assertStatus(404)
    assert.include(response.text(), '見つかりません')
  })
})
