export type DomainState =
  | 'active'
  | 'inactive'
  | 'pending-setup'
  | 'pending-transfer'
  | 'pending-bulk'

export type DomainContract = {
  id: string
  state: string
  term: number
  'start-date': string
  'end-date': string
}

export type Domain = {
  id: string
  sld: string
  tld: string
  fqdn: string
  state: DomainState
  'setup-state': string
  registrar: string
  'whois-proxy-enabled': boolean
  'auto-renew-enabled': boolean
  'is-japanese-domain': boolean
  contract: DomainContract
}

export type ListMeta = {
  total: number
  page: number
  'page-size': number
}

export type ListDomainsResponse = {
  data: Domain[]
  meta: ListMeta
}

export type MuumuuClientOptions = {
  baseUrl: string
  token: string
  fetcher?: typeof fetch
}

export class MuumuuApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly retryAfter?: number
  ) {
    super(message)
    this.name = 'MuumuuApiError'
  }
}

type ApiErrorBody = { error?: { code?: string; message?: string } }

function isListDomainsResponse(body: unknown): body is ListDomainsResponse {
  if (typeof body !== 'object' || body === null) return false
  const b = body as Record<string, unknown>
  if (!Array.isArray(b.data)) return false
  if (typeof b.meta !== 'object' || b.meta === null) return false
  return true
}

export class MuumuuClient {
  private baseUrl: string
  private token: string
  private fetcher: typeof fetch

  constructor(options: MuumuuClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.token = options.token
    this.fetcher = options.fetcher ?? fetch
  }

  async listDomains(): Promise<ListDomainsResponse> {
    const response = await this.fetcher(`${this.baseUrl}/me/domains`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    })
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as ApiErrorBody
      const retryAfterHeader = response.headers.get('Retry-After')
      throw new MuumuuApiError(
        response.status,
        body.error?.code ?? 'unknown',
        body.error?.message ?? response.statusText,
        retryAfterHeader ? Number(retryAfterHeader) : undefined
      )
    }
    const body = (await response.json().catch(() => null)) as unknown
    if (!isListDomainsResponse(body)) {
      throw new MuumuuApiError(
        502,
        'invalid_response',
        'listDomains response is missing or malformed data/meta fields'
      )
    }
    return body
  }
}
