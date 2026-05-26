import { BaseCommand, args } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { DkitDnsVerifier } from '#services/dkit_dns_verifier'

export default class DkitVerifyCmd extends BaseCommand {
  static commandName = 'dkit:verify'
  static description = 'Verify a DKIT claim by looking up the public key in DNS'
  static options: CommandOptions = { startApp: false }

  @args.string({ description: 'DKIT claim string (in quotes)' })
  declare claim: string

  async run() {
    const verifier = new DkitDnsVerifier()
    const result = await verifier.verifyClaim(this.claim)

    switch (result.kind) {
      case 'valid':
        this.logger.success('✓ DKIT claim verified')
        this.logger.info(`  d (fqdn):      ${result.payload.fqdn}`)
        this.logger.info(`  s (selector):  ${result.payload.selector}`)
        this.logger.info(`  issued:        ${result.payload.issuedAt}`)
        if (result.payload.market) {
          this.logger.info(`  market URL:    ${result.payload.market}`)
        }
        break
      case 'public_key_not_found':
        this.logger.error(`✗ No DKIT public key TXT at ${result.lookup}`)
        this.exitCode = 1
        break
      case 'signature_mismatch':
        this.logger.error(`✗ Signature does not match published public key: ${result.reason}`)
        this.exitCode = 1
        break
      case 'malformed_claim':
        this.logger.error(`✗ Malformed claim: ${result.reason}`)
        this.exitCode = 1
        break
      case 'dns_error':
        this.logger.error(`✗ DNS error: ${result.reason}`)
        this.exitCode = 1
        break
    }
  }
}
