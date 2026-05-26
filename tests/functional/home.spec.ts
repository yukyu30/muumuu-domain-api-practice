import { test } from '@japa/runner'

test.group('GET /', () => {
  test('200 を返し、ドメイン一覧ページへのナビゲーションリンクを含む', async ({
    client,
    assert,
  }) => {
    const response = await client.get('/')

    response.assertStatus(200)
    const body = response.text()
    assert.include(body, 'href="/domains"')
    assert.include(body, 'あなたのドメイン一覧')
  })
})
