import { BaseCommand, args, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import QRCode from 'qrcode'
import { DkitSigner } from '#services/dkit'

export default class DkitSign extends BaseCommand {
  static commandName = 'dkit:sign'
  static description = 'Sign a DKIT claim for a domain (optionally with marketplace URL)'
  static options: CommandOptions = { startApp: true }

  @args.string({ description: 'Domain fqdn (e.g., example.com)' })
  declare fqdn: string

  @flags.string({ description: 'Marketplace URL (recommended; e.g., SUZURI product URL)' })
  declare market?: string

  @flags.string({ description: 'DKIT selector', default: 'default' })
  declare selector: string

  @flags.string({ description: 'Verify URL origin (where /verify is hosted)' })
  declare verifyOrigin?: string

  @flags.string({ description: 'Output QR code PNG to this path' })
  declare qrOut?: string

  async run() {
    const signer = await this.app.container.make(DkitSigner)
    const claim = signer.signClaim({
      fqdn: this.fqdn,
      selector: this.selector,
      issuedAt: new Date().toISOString().slice(0, 10),
      market: this.market,
    })

    this.logger.success('Signed DKIT claim:')
    this.logger.info(`  ${claim}`)

    const origin = this.verifyOrigin ?? 'http://localhost:3333'
    const verifyUrl = `${origin}/verify?claim=${encodeURIComponent(claim)}`
    this.logger.info('')
    this.logger.info('Verify URL (to embed in QR / paste in browser):')
    this.logger.info(`  ${verifyUrl}`)

    if (this.qrOut) {
      await QRCode.toFile(this.qrOut, verifyUrl, { type: 'png', width: 512, margin: 2 })
      this.logger.success(`QR code saved to ${this.qrOut}`)
    } else {
      this.logger.info('')
      this.logger.info('Tip: pass --qr-out=./out.png to save the QR code as a PNG.')
    }
  }
}
