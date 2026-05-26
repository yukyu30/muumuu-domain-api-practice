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

export class MuumuuClient {
  private baseUrl: string
  private token: string
  private fetcher: typeof fetch

  constructor(options: MuumuuClientOptions) {
    this.baseUrl = options.baseUrl
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
    return (await response.json()) as ListDomainsResponse
  }
}
