import { BaseCommand, args, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import QRCode from 'qrcode'
import { DkitSigner } from '#services/dkit'
import { MuumuuApiError, MuumuuClient } from '#services/muumuu_client'
import env from '#start/env'

export default class DkitCreate extends BaseCommand {
  static commandName = 'dkit:create'
  static description =
    'One-shot: publish DKIT public key TXT + sign claim + emit QR for the given fqdn'
  static options: CommandOptions = { startApp: true }

  @args.string({ description: 'Domain fqdn you own (e.g., yukyu.net)' })
  declare fqdn: string

  @flags.string({ description: 'Marketplace URL (e.g., SUZURI product URL)' })
  declare market?: string

  @flags.string({ description: 'DKIT selector', default: 'default' })
  declare selector: string

  @flags.string({ description: 'Verify URL origin (where /verify is hosted)' })
  declare verifyOrigin?: string

  @flags.string({ description: 'QR code PNG output path (default: ./dkit-<fqdn>-<unix>.png)' })
  declare qrOut?: string

  async run() {
    if (!env.get('DKIT_PRIVATE_KEY')) {
      this.logger.error('DKIT_PRIVATE_KEY is not set. Run `node ace dkit:keygen` first.')
      this.exitCode = 1
      return
    }

    const muumuu = await this.app.container.make(MuumuuClient)
    const signer = await this.app.container.make(DkitSigner)

    // [1/3] Resolve fqdn -> domain id
    this.logger.info(`[1/3] Resolving ${this.fqdn} from your Muumuu domains...`)
    let domainId: string
    try {
      const { data: domains } = await muumuu.listDomains()
      const found = domains.find((d) => d.fqdn === this.fqdn)
      if (!found) {
        this.logger.error(`Domain ${this.fqdn} is not in your Muumuu account.`)
        this.exitCode = 1
        return
      }
      domainId = found.id
      this.logger.success(`      Found: ${this.fqdn} (id=${domainId})`)
    } catch (err) {
      if (err instanceof MuumuuApiError) {
        this.logger.error(`Failed to list domains: ${err.status} ${err.code}`)
        this.exitCode = 1
        return
      }
      throw err
    }

    // [2/3] Publish public key TXT (skip if already exists)
    const recordFqdn = `${this.selector}._dkit.${this.fqdn}.`
    const value = `v=DKIT1; alg=ed25519; pk=${signer.publicKey}`
    this.logger.info(`[2/3] Publishing public key TXT at ${recordFqdn}...`)
    try {
      const created = await muumuu.createDnsRecord(domainId, {
        fqdn: recordFqdn,
        type: 'TXT',
        value,
      })
      this.logger.success(`      Published (record id=${created.id}, ttl=${created.ttl})`)
    } catch (err) {
      if (err instanceof MuumuuApiError && err.status === 409) {
        this.logger.info(`      Already exists. Skipping.`)
      } else if (err instanceof MuumuuApiError) {
        this.logger.error(`Failed to publish TXT: ${err.status} ${err.code} ${err.message}`)
        this.exitCode = 1
        return
      } else {
        throw err
      }
    }

    // [3/3] Sign claim + QR
    this.logger.info('[3/3] Signing DKIT claim and emitting QR...')
    const claim = signer.signClaim({
      fqdn: this.fqdn,
      selector: this.selector,
      issuedAt: new Date().toISOString().slice(0, 10),
      market: this.market,
    })
    const origin = this.verifyOrigin ?? 'http://localhost:3333'
    const verifyUrl = `${origin}/verify?claim=${encodeURIComponent(claim)}`
    const qrPath = this.qrOut ?? `./dkit-${this.fqdn}-${Date.now()}.png`
    await QRCode.toFile(qrPath, verifyUrl, { type: 'png', width: 512, margin: 2 })
    this.logger.success(`      Saved QR PNG to ${qrPath}`)

    this.logger.info('')
    this.logger.success('Done.')
    this.logger.info(`  Claim:      ${claim}`)
    this.logger.info(`  Verify URL: ${verifyUrl}`)
    this.logger.info(`  QR PNG:     ${qrPath}`)
    if (!this.market) {
      this.logger.warning('')
      this.logger.warning(
        '  --market was not provided. Re-run with --market=<SUZURI URL> once your product is live.'
      )
    }
  }
}
