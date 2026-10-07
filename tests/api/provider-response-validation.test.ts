import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

async function callProviderRoute(
  routeName: 'weather' | 'geocode' | 'reverse-geocode' | 'ip-location',
  payload: unknown,
  query: Record<string, string>,
  rejectRequest = false
) {
  vi.stubGlobal('defineEventHandler', (handler: unknown) => ({ handler }))
  vi.stubGlobal('defineCachedEventHandler', (handler: unknown) => ({ handler }))
  vi.stubGlobal('getQuery', () => query)
  vi.stubGlobal('$fetch', rejectRequest
    ? vi.fn().mockRejectedValue(new Error('Provider unavailable'))
    : vi.fn().mockResolvedValue(payload))
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
    await expect(callProviderRoute(routeName, payload, query))
      .rejects.toMatchObject({ statusCode: 502, statusMessage: expect.stringContaining('Invalid') })
  })

  it.each([
    ['weather', 'Upstream weather provider unavailable'],
    ['geocode', 'Upstream geocoding provider unavailable'],
    ['reverse-geocode', 'Upstream reverse-geocoding provider unavailable'],
    ['ip-location', 'Upstream IP location provider unavailable']
  ] as const)('maps %s request failures to the provider error contract', async (routeName, statusMessage) => {
    const query = routeName === 'weather' || routeName === 'reverse-geocode'
      ? { latitude: '52.52', longitude: '13.41' }
      : routeName === 'geocode'
        ? { name: 'Berlin' }
        : {}

    await expect(callProviderRoute(routeName, {}, query, true))
      .rejects.toMatchObject({ statusCode: 502, statusMessage })
  })

  it.each(['weather', 'reverse-geocode'] as const)('rejects invalid %s coordinates', async (routeName) => {
    await expect(callProviderRoute(routeName, {}, { latitude: '91', longitude: '13.41' }))
      .rejects.toMatchObject({
        statusCode: 400,
        statusMessage: 'latitude and longitude must be valid coordinates'
      })
  })
})
