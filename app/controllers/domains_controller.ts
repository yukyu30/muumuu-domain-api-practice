import type { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import { MuumuuApiError, MuumuuClient } from '#services/muumuu_client'

type ViewError =
  | { kind: 'unauthorized'; message: string }
  | { kind: 'rate_limited'; retryAfter?: number; message: string }
  | { kind: 'not_found'; message: string }
  | { kind: 'upstream'; status: number; code: string; message: string }

@inject()
export default class DomainsController {
  constructor(private muumuu: MuumuuClient) {}

  async index({ view, response }: HttpContext) {
    try {
      const { data: domains, meta } = await this.muumuu.listDomains()
      return view.render('pages/domains/index', { domains, meta, error: null })
    } catch (err) {
      if (!(err instanceof MuumuuApiError)) throw err

      const error = this.toViewError(err)
      response.status(err.status)
      return view.render('pages/domains/index', {
        domains: [],
        meta: { total: 0, page: 1, 'page-size': 20 },
        error,
      })
    }
  }

  async show({ params, view, response }: HttpContext) {
    try {
      const domain = await this.muumuu.getDomain(params.id)
      return view.render('pages/domains/show', { domain, error: null })
    } catch (err) {
      if (!(err instanceof MuumuuApiError)) throw err

      const error = this.toViewError(err)
      response.status(err.status)
      return view.render('pages/domains/show', { domain: null, error })
    }
  }

  async tshirtSvg({ params, view, response }: HttpContext) {
    try {
      const domain = await this.muumuu.getDomain(params.id)
      const svg = await view.render('pages/domains/tshirt_svg', { domain })
      response.header('Content-Type', 'image/svg+xml; charset=utf-8')
      return svg
    } catch (err) {
      if (err instanceof MuumuuApiError && err.status === 404) {
        response.status(404)
        return ''
      }
      throw err
    }
  }

  private toViewError(err: MuumuuApiError): ViewError {
    if (err.status === 401) {
      return { kind: 'unauthorized', message: err.message }
    }
    if (err.status === 404) {
      return { kind: 'not_found', message: err.message }
    }
    if (err.status === 429) {
      return { kind: 'rate_limited', retryAfter: err.retryAfter, message: err.message }
    }
    return { kind: 'upstream', status: err.status, code: err.code, message: err.message }
  }
}
