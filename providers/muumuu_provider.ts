import type { ApplicationService } from '@adonisjs/core/types'
import { MuumuuClient } from '#services/muumuu_client'
import env from '#start/env'

export default class MuumuuProvider {
  constructor(protected app: ApplicationService) {}

  register() {
    this.app.container.singleton(MuumuuClient, () => {
      return new MuumuuClient({
        baseUrl: env.get('MUUMUU_API_BASE_URL'),
        token: env.get('MUUMUU_API_TOKEN'),
      })
    })
  }
}
