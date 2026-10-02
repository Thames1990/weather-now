import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

function globals(query: Record<string, string>, payload: unknown) {
  const fetch = vi.fn().mockResolvedValue(payload)
  vi.stubGlobal('getQuery', () => query)
  vi.stubGlobal('$fetch', fetch)
  vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
  vi.stubGlobal('defineCachedEventHandler', (handler: unknown, options: unknown) => ({ handler, options }))
  vi.stubGlobal('createError', (error: { statusMessage: string }) => Object.assign(new Error(error.statusMessage), error))
  return fetch
}

describe('favorite localization API contracts', () => {
  it('looks up a stable city ID in the requested language', async () => {
    const place = { id: 2886242, name: 'Köln', country: 'Deutschland', latitude: 50.93333, longitude: 6.95, timezone: 'Europe/Berlin' }
    const fetch = globals({ id: '2886242', language: 'de' }, place)
    const handler = (await import('../../server/api/geocode.get')).default
    expect(await handler({} as never)).toEqual({ results: [place] })
    expect(fetch).toHaveBeenCalledWith('https://geocoding-api.open-meteo.com/v1/get', {
      query: { id: 2886242, language: 'de', format: 'json' }
    })
  })

  it.each(['0', '-1', 'invalid', '1.5'])('rejects invalid IDs: %s', async (id) => {
    const fetch = globals({ id }, {})
    const handler = (await import('../../server/api/geocode.get')).default
    await expect(handler({} as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects malformed ID lookup responses', async () => {
    globals({ id: '2886242' }, {})
    const handler = (await import('../../server/api/geocode.get')).default
    await expect(handler({} as never)).rejects.toMatchObject({ statusCode: 502 })
  })

  it('includes the reverse-geocoding language in both query and cache identity', async () => {
    const query = { latitude: '50.93', longitude: '6.95', language: 'de' }
    const fetch = globals(query, { city: 'Köln', countryName: 'Deutschland' })
    const route = (await import('../../server/api/reverse-geocode.get')).default as unknown as {
      handler: (event: unknown) => Promise<unknown>
      options: { getKey: (event: unknown) => string }
    }
    expect(await route.handler({})).toEqual({ name: 'Köln', country: 'Deutschland' })
    expect(fetch).toHaveBeenCalledWith(expect.any(String), {
      query: { latitude: 50.93, longitude: 6.95, localityLanguage: 'de' }
    })
    const germanKey = route.options.getKey({})
    query.language = 'en'
    expect(route.options.getKey({})).not.toBe(germanKey)
  })
})
