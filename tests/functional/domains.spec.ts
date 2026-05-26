import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import { MuumuuClient, type ListDomainsResponse } from '#services/muumuu_client'

class FakeMuumuuClient {
  constructor(private response: ListDomainsResponse) {}
  async listDomains(): Promise<ListDomainsResponse> {
    return this.response
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
})
