import type { ApplicationService } from '@adonisjs/core/types'
import { DkitSigner } from '#services/dkit'
import { DkitDnsVerifier } from '#services/dkit_dns_verifier'
import env from '#start/env'

export default class DkitProvider {
  constructor(protected app: ApplicationService) {}

  register() {
    this.app.container.singleton(DkitSigner, () => {
      const key = env.get('DKIT_PRIVATE_KEY')
      if (!key) {
        throw new Error(
          'DKIT_PRIVATE_KEY is not set. Run `node ace dkit:keygen` and add the output to .env.'
        )
      }
      return new DkitSigner(key)
    })

    this.app.container.singleton(DkitDnsVerifier, () => new DkitDnsVerifier())
  }
}
