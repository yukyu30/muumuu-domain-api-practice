import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { DkitSigner } from '#services/dkit'

export default class DkitKeygen extends BaseCommand {
  static commandName = 'dkit:keygen'
  static description = 'Generate a new DKIT ed25519 keypair (do this once per domain owner)'
  static options: CommandOptions = { startApp: false }

  async run() {
    const { privateKey, publicKey } = DkitSigner.generateKeyPair()
    this.logger.info('Generated DKIT keypair (ed25519)')
    this.logger.info('')
    this.logger.info('Add the following to your .env file:')
    this.logger.info('')
    this.logger.info(`  DKIT_PRIVATE_KEY=${privateKey}`)
    this.logger.info('')
    this.logger.info('Public key (will be published in the DNS TXT record):')
    this.logger.info('')
    this.logger.info(`  ${publicKey}`)
    this.logger.info('')
    this.logger.info('Next: `node ace dkit:publish <domain-id>` to publish the public key to DNS.')
  }
}
