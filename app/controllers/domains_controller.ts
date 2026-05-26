import type { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import { MuumuuClient } from '#services/muumuu_client'

@inject()
export default class DomainsController {
  constructor(private muumuu: MuumuuClient) {}

  async index({ view }: HttpContext) {
    const { data: domains, meta } = await this.muumuu.listDomains()
    return view.render('pages/domains/index', { domains, meta })
  }
}
