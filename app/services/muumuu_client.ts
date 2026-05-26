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

export type DnsRecordType =
  | 'A'
  | 'AAAA'
  | 'CNAME'
  | 'MX'
  | 'TXT'
  | 'NS'
  | 'ALIAS'
  | 'SRV'
  | 'CAA'

export type CreateDnsRecordInput = {
  fqdn: string
  type: DnsRecordType
  value: string
  ttl?: number
  priority?: number
}

export type DnsRecord = {
  id: number
  fqdn: string
  type: DnsRecordType
  value: string
  ttl: number
  priority?: number
  'created-at': string
  'updated-at': string
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

function isSingleDomainResponse(body: unknown): body is { data: Domain } {
  if (typeof body !== 'object' || body === null) return false
  const b = body as Record<string, unknown>
  return typeof b.data === 'object' && b.data !== null
}

function isDnsRecordResponse(body: unknown): body is { data: DnsRecord } {
  if (typeof body !== 'object' || body === null) return false
  const b = body as Record<string, unknown>
  return typeof b.data === 'object' && b.data !== null
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

  async getDomain(id: string): Promise<Domain> {
    const response = await this.fetcher(`${this.baseUrl}/me/domains/${encodeURIComponent(id)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    })
    if (!response.ok) {
      const errBody = (await response.json().catch(() => ({}))) as ApiErrorBody
      const retryAfterHeader = response.headers.get('Retry-After')
      throw new MuumuuApiError(
        response.status,
        errBody.error?.code ?? 'unknown',
        errBody.error?.message ?? response.statusText,
        retryAfterHeader ? Number(retryAfterHeader) : undefined
      )
    }
    const body = (await response.json().catch(() => null)) as unknown
    if (!isSingleDomainResponse(body)) {
      throw new MuumuuApiError(
        502,
        'invalid_response',
        'getDomain response is missing or malformed data field'
      )
    }
    return body.data
  }

  async createDnsRecord(domainId: string, input: CreateDnsRecordInput): Promise<DnsRecord> {
    const response = await this.fetcher(
      `${this.baseUrl}/me/domains/${encodeURIComponent(domainId)}/dns-records`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(input),
      }
    )
    if (!response.ok) {
      const errBody = (await response.json().catch(() => ({}))) as ApiErrorBody
      const retryAfterHeader = response.headers.get('Retry-After')
      throw new MuumuuApiError(
        response.status,
        errBody.error?.code ?? 'unknown',
        errBody.error?.message ?? response.statusText,
        retryAfterHeader ? Number(retryAfterHeader) : undefined
      )
    }
    const body = (await response.json().catch(() => null)) as unknown
    if (!isDnsRecordResponse(body)) {
      throw new MuumuuApiError(
        502,
        'invalid_response',
        'createDnsRecord response is missing or malformed data field'
      )
    }
    return body.data
  }
}
