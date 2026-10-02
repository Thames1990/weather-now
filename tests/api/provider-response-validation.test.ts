import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

async function callInvalidProviderRoute(
  routeName: 'weather' | 'geocode' | 'reverse-geocode' | 'ip-location',
  payload: unknown,
  query: Record<string, string>
) {
  vi.stubGlobal('defineEventHandler', (handler: unknown) => ({ handler }))
  vi.stubGlobal('defineCachedEventHandler', (handler: unknown) => ({ handler }))
  vi.stubGlobal('getQuery', () => query)
  vi.stubGlobal('$fetch', vi.fn().mockResolvedValue(payload))
  vi.stubGlobal('createError', (error: { statusCode: number; statusMessage: string }) =>
    Object.assign(new Error(error.statusMessage), error))

  let route: unknown
  switch (routeName) {
    case 'weather':
      route = (await import('../../server/api/weather.get')).default
      break
    case 'geocode':
      route = (await import('../../server/api/geocode.get')).default
      break
    case 'reverse-geocode':
      route = (await import('../../server/api/reverse-geocode.get')).default
      break
    case 'ip-location':
      route = (await import('../../server/api/ip-location.get')).default
      break
  }
  return (route as { handler: (event: unknown) => Promise<unknown> }).handler({})
}

describe('provider API routes', () => {
  it.each([
    ['weather', {}, { latitude: '52.52', longitude: '13.41' }],
    ['geocode', { results: [{ name: 'Berlin', latitude: 52.52, longitude: 181, timezone: 'Europe/Berlin' }] }, { name: 'Berlin' }],
    ['reverse-geocode', { unexpected: 'value' }, { latitude: '52.52', longitude: '13.41' }],
    ['ip-location', { city: 'Berlin', loc: 'invalid' }, {}]
  ] as const)('returns an upstream error for malformed %s data', async (routeName, payload, query) => {
    await expect(callInvalidProviderRoute(routeName, payload, query))
      .rejects.toMatchObject({ statusCode: 502, statusMessage: expect.stringContaining('Invalid') })
  })
})
