import { BaseCommand, args, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { DkitSigner } from '#services/dkit'
import { MuumuuApiError, MuumuuClient } from '#services/muumuu_client'

export default class DkitPublish extends BaseCommand {
  static commandName = 'dkit:publish'
  static description = 'Publish DKIT public key to DNS TXT (<selector>._dkit.<fqdn>)'
  static options: CommandOptions = { startApp: true }

  @args.string({ description: 'Muumuu domain ID (e.g., MU00000001)' })
  declare domainId: string

  @flags.string({ description: 'Selector for DKIT public key', default: 'default' })
  declare selector: string

  async run() {
    const muumuu = await this.app.container.make(MuumuuClient)
    const signer = await this.app.container.make(DkitSigner)

    let fqdn: string
    try {
      const domain = await muumuu.getDomain(this.domainId)
      fqdn = domain.fqdn
    } catch (err) {
      if (err instanceof MuumuuApiError) {
        this.logger.error(`Failed to fetch domain ${this.domainId}: ${err.status} ${err.code}`)
        this.exitCode = 1
        return
      }
      throw err
    }

    const recordFqdn = `${this.selector}._dkit.${fqdn}.`
    const value = `v=DKIT1; alg=ed25519; pk=${signer.publicKey}`

    this.logger.info(`Publishing DKIT public key TXT:`)
    this.logger.info(`  fqdn:  ${recordFqdn}`)
    this.logger.info(`  value: ${value}`)

    try {
      const created = await muumuu.createDnsRecord(this.domainId, {
        fqdn: recordFqdn,
        type: 'TXT',
        value,
      })
      this.logger.success(`Published. DNS record id=${created.id}, ttl=${created.ttl}`)
      this.logger.info(`  Verify with: dig +short TXT ${recordFqdn.replace(/\.$/, '')}`)
    } catch (err) {
      if (err instanceof MuumuuApiError) {
        if (err.status === 409) {
          this.logger.warning(`TXT record already exists at ${recordFqdn}. Skipping.`)
          return
        }
        this.logger.error(`Failed to create DNS record: ${err.status} ${err.code} ${err.message}`)
        this.exitCode = 1
        return
      }
      throw err
    }
  }
}
