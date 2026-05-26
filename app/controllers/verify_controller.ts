import type { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import { DkitDnsVerifier, type DkitDnsVerificationResult } from '#services/dkit_dns_verifier'

@inject()
export default class VerifyController {
  constructor(private dnsVerifier: DkitDnsVerifier) {}

  async show({ request, view }: HttpContext) {
    const claim = request.qs().claim
    if (!claim || typeof claim !== 'string') {
      return view.render('pages/verify/index', { result: null })
    }
    const result: DkitDnsVerificationResult = await this.dnsVerifier.verifyClaim(claim)
    return view.render('pages/verify/index', { result, claim })
  }
}
