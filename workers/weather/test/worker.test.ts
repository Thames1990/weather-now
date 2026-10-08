import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { handleRequest } from '../src/index'
import type { Env } from '../src/index'
import { UPSTREAM_TIMEOUT_MS } from '../src/upstream'
import { normalizeWeather } from '../../../shared/weather/normalize'

const timestamp = 1_790_000_000
const weather = {
  timezone: 'UTC', utc_offset_seconds: 0,
  current: {
    time: timestamp, temperature_2m: 20, relative_humidity_2m: 50, apparent_temperature: 19,
    is_day: 1, precipitation: 0, weather_code: 0, wind_speed_10m: 10, wind_direction_10m: 90
  },
  hourly: {
    time: [timestamp], temperature_2m: [20], apparent_temperature: [19],
    precipitation_probability: [0], precipitation: [0], weather_code: [0], wind_speed_10m: [10]
  },
  daily: {
    time: [timestamp], weather_code: [0], temperature_2m_max: [22], temperature_2m_min: [12],
    precipitation_probability_max: [10], precipitation_sum: [0], sunshine_duration: [36000],
    sunrise: [timestamp - 18000], sunset: [timestamp + 18000]
  }
}
const place = { id: 2950159, name: 'Berlin', country: 'Germany', latitude: 52.52, longitude: 13.41, timezone: 'Europe/Berlin' }
const fetchMock = vi.fn<typeof fetch>()
const clientLimit = vi.fn<Env['CLIENT_RATE_LIMITER']['limit']>()
const upstreamLimit = vi.fn<Env['UPSTREAM_RATE_LIMITER']['limit']>()
const env: Env = {
  CLIENT_RATE_LIMITER: { limit: clientLimit },
  UPSTREAM_RATE_LIMITER: { limit: upstreamLimit },
  CF_VERSION_METADATA: { id: 'test-version' }
}
const request = (path: string, init?: RequestInit) => new Request(`https://api.mohrworks.com${path}`, init)

beforeEach(() => {
  clientLimit.mockResolvedValue({ success: true })
  upstreamLimit.mockResolvedValue({ success: true })
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})

describe('Worker contract', () => {
  it('emits one allowlisted privacy-safe request summary', async () => {
    fetchMock.mockResolvedValue(Response.json(weather))
    await handleRequest(request('/weather?latitude=52.52&longitude=13.40'), env)

    expect(console.log).toHaveBeenCalledTimes(1)
    expect(console.error).not.toHaveBeenCalled()
    const summary = vi.mocked(console.log).mock.calls[0]?.[0]
    expect(Object.keys(summary)).toEqual([
      'event', 'route', 'method', 'status', 'code', 'duration_ms',
      'upstream_outcome', 'upstream_ms', 'version'
    ])
    expect(summary).toEqual({
      event: 'request',
      route: '/weather',
      method: 'GET',
      status: 200,
      code: null,
      duration_ms: expect.any(Number),
      upstream_outcome: 'ok',
      upstream_ms: expect.any(Number),
      version: 'test-version'
    })
    expect(JSON.stringify(summary)).not.toMatch(/52\.52|13\.40|latitude|longitude|api\.open-meteo\.com/)
  })

  it('returns minimal health without calling providers or rate limiters', async () => {
    const response = await handleRequest(request('/health'), env)
    expect(await response.json()).toEqual({ status: 'ok' })
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(clientLimit).not.toHaveBeenCalled()
    expect(console.log).toHaveBeenCalledTimes(1)
  })

  it('keeps expected 4xx responses out of the Issues error channel', async () => {
    clientLimit.mockResolvedValue({ success: false })
    expect((await handleRequest(request('/locations?q=A'), env)).status).toBe(400)
    expect((await handleRequest(request('/missing'), env)).status).toBe(404)
    expect((await handleRequest(request('/locations?q=Berlin'), env)).status).toBe(429)

    expect(console.error).not.toHaveBeenCalled()
    expect(console.log).toHaveBeenCalledTimes(3)
    expect(vi.mocked(console.log).mock.calls.map(([summary]) => summary)).toEqual([
      expect.objectContaining({ event: 'request', status: 400, code: 'invalid_request', upstream_outcome: 'none' }),
      expect.objectContaining({ event: 'request', status: 404, code: 'not_found', upstream_outcome: 'none' }),
      expect.objectContaining({ event: 'request', status: 429, code: 'rate_limited', upstream_outcome: 'none' })
    ])
  })

  it('logs unexpected failures with one safe grouping summary', async () => {
    const malformedRequest = request('/health')
    Object.defineProperty(malformedRequest, 'url', {
      get: () => { throw new Error('private location 52.52,13.40') }
    })
    const response = await handleRequest(malformedRequest, env)

    expect(response.status).toBe(500)
    expect(console.error).toHaveBeenCalledTimes(1)
    expect(console.log).not.toHaveBeenCalled()
    const summary = vi.mocked(console.error).mock.calls[0]?.[0]
    expect(summary).toEqual({
      event: 'request',
      route: 'other',
      method: 'unknown',
      status: 500,
      code: 'internal_error',
      duration_ms: expect.any(Number),
      upstream_outcome: 'none',
      upstream_ms: null,
      version: 'test-version'
    })
    expect(JSON.stringify(summary)).not.toMatch(/private|location|52\.52|13\.40/)
  })

  it('returns the existing normalized weather contract from a fixed provider', async () => {
    fetchMock.mockResolvedValue(Response.json(weather))
    const response = await handleRequest(request('/weather?latitude=52.52&longitude=13.40'), env)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(normalizeWeather(weather))
    const [url, options] = fetchMock.mock.calls[0]!
    const upstream = new URL(String(url))
    expect(upstream.origin + upstream.pathname).toBe('https://api.open-meteo.com/v1/forecast')
    expect(upstream.searchParams.get('forecast_days')).toBe('7')
    expect(upstream.searchParams.get('timeformat')).toBe('unixtime')
    expect(upstream.searchParams.get('longitude')).toBe('13.4')
    expect(options?.redirect).toBe('manual')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([{}, { generationtime_ms: 0.5 }, { results: [] }, { results: null }])('returns empty search results normally: %j', async (payload) => {
    fetchMock.mockResolvedValue(Response.json(payload))
    const response = await handleRequest(request('/locations?q=NoMatch'), env)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ results: [] })
  })

  it('normalizes location results and fixes language and count', async () => {
    fetchMock.mockResolvedValue(Response.json({ results: [place] }))
    const response = await handleRequest(request('/locations?q=%20Berlin%20'), env)
    expect(await response.json()).toEqual({ results: [place] })
    const upstream = new URL(String(fetchMock.mock.calls[0]![0]))
    expect(upstream.origin + upstream.pathname).toBe('https://geocoding-api.open-meteo.com/v1/search')
    expect(Object.fromEntries(upstream.searchParams)).toEqual({
      name: 'Berlin', count: '5', language: 'en', format: 'json'
    })
  })

  it.each([
    ['', { count: '5', language: 'en' }],
    ['&language=de', { count: '5', language: 'de' }],
    ['&language=en&count=100', { count: '100', language: 'en' }],
    ['&count=1', { count: '1', language: 'en' }]
  ])('serializes optional search parameters %s', async (suffix, expected) => {
    fetchMock.mockResolvedValue(Response.json({ results: [place] }))
    expect((await handleRequest(request(`/locations?q=Berlin${suffix}`), env)).status).toBe(200)
    const upstream = new URL(String(fetchMock.mock.calls[0]![0]))
    expect(Object.fromEntries(upstream.searchParams)).toEqual({ name: 'Berlin', format: 'json', ...expected })
  })

  it('bounds search results by the requested count', async () => {
    fetchMock.mockResolvedValue(Response.json({ results: Array.from({ length: 100 }, () => place) }))
    const response = await handleRequest(request('/locations?q=Berlin&count=100'), env)
    expect(response.status).toBe(200)
    expect((await response.json() as { results: unknown[] }).results).toHaveLength(100)
    fetchMock.mockResolvedValue(Response.json({ results: [place, place] }))
    expect((await handleRequest(request('/locations?q=Berlin&count=1'), env)).status).toBe(502)
  })

  it.each([
    ['/locations/2950159', 'en'],
    ['/locations/2950159?language=de', 'de']
  ])('looks up %s by ID and wraps it in the search contract', async (path, expectedLanguage) => {
    fetchMock.mockResolvedValue(Response.json({
      ...place, country: 'Deutschland', admin1: 'Land Berlin', elevation: 74, postcodes: ['10967'], feature_code: 'PPLC'
    }))
    const response = await handleRequest(request(path), env)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ results: [{ ...place, country: 'Deutschland', admin1: 'Land Berlin' }] })
    const upstream = new URL(String(fetchMock.mock.calls[0]![0]))
    expect(upstream.origin + upstream.pathname).toBe('https://geocoding-api.open-meteo.com/v1/get')
    expect(Object.fromEntries(upstream.searchParams)).toEqual({ id: '2950159', language: expectedLanguage, format: 'json' })
    expect(clientLimit).toHaveBeenCalledTimes(1)
    expect(upstreamLimit).toHaveBeenCalledTimes(1)
  })

  it('maps the provider unknown-ID response to 404', async () => {
    fetchMock.mockResolvedValue(Response.json({ reason: 'Location ID not found.', error: true }, { status: 400 }))
    const response = await handleRequest(request('/locations/999999999'), env)
    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ error: { code: 'location_not_found' } })
    expect(console.error).not.toHaveBeenCalled()
    expect(console.log).toHaveBeenCalledTimes(1)
    const summary = vi.mocked(console.log).mock.calls[0]?.[0]
    expect(summary).toMatchObject({
      event: 'request',
      route: '/locations/:id',
      status: 404,
      code: 'location_not_found',
      upstream_outcome: 'status',
      version: 'test-version'
    })
  })

  it.each([
    ['other provider 400 reason', () => Response.json({ reason: 'Parameter id is invalid', error: true }, { status: 400 })],
    ['non-JSON provider 400', () => new Response('Location ID not found.', { status: 400 })],
    ['provider 404', () => Response.json({ reason: 'Location ID not found.', error: true }, { status: 404 })]
  ])('maps %s on ID lookup to 502', async (_, responseFactory) => {
    fetchMock.mockResolvedValue(responseFactory())
    const response = await handleRequest(request('/locations/2950159'), env)
    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({ error: { code: 'upstream_status' } })
  })

  it.each([
    ['mismatched ID', { ...place, id: 1 }],
    ['missing ID', { name: 'Berlin', latitude: 52.52, longitude: 13.41, timezone: 'Europe/Berlin' }],
    ['search envelope', { results: [place] }],
    ['array', [place]],
    ['invalid location', { ...place, latitude: 100 }],
    ['provider error object', { error: true, reason: 'Location ID not found.' }]
  ])('rejects ID lookup payload with %s', async (_, payload) => {
    fetchMock.mockResolvedValue(Response.json(payload))
    const response = await handleRequest(request('/locations/2950159'), env)
    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({ error: { code: 'upstream_invalid' } })
  })

  it.each(['ab', 'a'.repeat(100)])('accepts search length boundary %s', async (query) => {
    fetchMock.mockResolvedValue(Response.json({}))
    expect((await handleRequest(request(`/locations?q=${query}`), env)).status).toBe(200)
  })

  it.each([
    '/weather', '/weather?latitude=&longitude=0', '/weather?latitude=NaN&longitude=0',
    '/weather?latitude=Infinity&longitude=0', '/weather?latitude=91&longitude=0',
    '/weather?latitude=0&longitude=-181', '/weather?latitude=0x1&longitude=0',
    '/weather?latitude=1e2&longitude=0', '/weather?latitude=0&latitude=1&longitude=0',
    '/weather?latitude=0&longitude=0&url=https://evil.example',
    '/locations', '/locations?q=', '/locations?q=A', '/locations?q=%00Berlin',
    `/locations?q=${'a'.repeat(101)}`, '/locations?q=Berlin&q=Paris',
    '/locations?q=Berlin&count=0', '/locations?q=Berlin&count=101', '/locations?q=Berlin&count=05',
    '/locations?q=Berlin&count=1.5', '/locations?q=Berlin&count=', '/locations?q=Berlin&count=5&count=6',
    '/locations?q=Berlin&language=fr', '/locations?q=Berlin&language=EN', '/locations?q=Berlin&language=',
    '/locations?q=Berlin&language=en&language=de', '/locations?q=Berlin&lang=de',
    '/locations/0', '/locations/-1', '/locations/1.5', '/locations/abc', '/locations/1e3', '/locations/0x10',
    '/locations/01', '/locations/9007199254740992', '/locations/12345678901234567', '/locations/%31',
    '/locations/2950159?language=fr', '/locations/2950159?id=1', '/locations/2950159?language=de&language=en',
    '/ip-location?ip=192.0.2.1', '/health?unknown=1'
  ])('rejects invalid query %s without upstream work', async (path) => {
    const response = await handleRequest(request(path), env)
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: { code: 'invalid_request' } })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([[-90, -180], [90, 180], [0, 0]])('accepts coordinate boundary %s, %s', async (latitude, longitude) => {
    fetchMock.mockResolvedValue(Response.json(weather))
    expect((await handleRequest(request(`/weather?latitude=${latitude}&longitude=${longitude}`), env)).status).toBe(200)
  })

  it('rejects unknown paths and unsupported methods', async () => {
    for (const path of ['/unknown', '/locations/', '/locations/1/extra', '/reverse-geocode', '/ip-location/']) {
      expect((await handleRequest(request(path), env)).status).toBe(404)
    }
    for (const path of ['/weather', '/locations/2950159', '/ip-location']) {
      for (const method of ['POST', 'PUT', 'DELETE', 'HEAD']) {
        const response = await handleRequest(request(path, { method }), env)
        expect(response.status).toBe(405)
        expect(response.headers.get('Allow')).toBe('GET, OPTIONS')
      }
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('Provider failures and deadlines', () => {
  it.each([301, 302, 307, 308, 400, 401, 403, 404, 500, 503])('maps provider status %s to safe 502 without retries', async (status) => {
    fetchMock.mockResolvedValue(new Response('private provider detail', { status }))
    const response = await handleRequest(request('/locations?q=Berlin'), env)
    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({ error: { code: 'upstream_status' } })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('maps provider 429 explicitly', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 429 }))
    const response = await handleRequest(request('/locations?q=Berlin'), env)
    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('60')
    expect(await response.json()).toMatchObject({ error: { code: 'upstream_rate_limited' } })
    expect(console.error).not.toHaveBeenCalled()
    expect(vi.mocked(console.log).mock.calls[0]?.[0]).toMatchObject({
      event: 'request', upstream_outcome: 'rate_limited', upstream_ms: expect.any(Number)
    })
  })

  it('does not expose transport exception details or request data in logs', async () => {
    fetchMock.mockRejectedValue(new Error('secret private URL'))
    const response = await handleRequest(request('/locations?q=Berlin'), env)
    expect(response.status).toBe(502)
    expect(await response.text()).not.toMatch(/secret|Berlin/)
    expect(console.error).toHaveBeenCalledTimes(1)
    const summary = vi.mocked(console.error).mock.calls[0]?.[0]
    expect(summary).toMatchObject({
      event: 'request',
      route: '/locations',
      status: 502,
      code: 'upstream_network',
      upstream_outcome: 'status'
    })
    expect(JSON.stringify(summary)).not.toMatch(/secret|private|Berlin|open-meteo|query/)
  })

  it.each([
    ['invalid JSON', () => new Response('{', { headers: { 'Content-Type': 'application/json' } })],
    ['wrong media type', () => new Response('{}')],
    ['JSONP media type', () => new Response('{}', { headers: { 'Content-Type': 'application/jsonp' } })],
    ['invalid location shape', () => Response.json({ results: [{}] })],
    ['provider error object', () => Response.json({ error: true, reason: 'bad request' })],
    ['unknown envelope', () => Response.json({ unexpected: true })],
    ['invalid provider metadata', () => Response.json({ generationtime_ms: 'bad' })],
    ['too many results', () => Response.json({ results: Array.from({ length: 6 }, () => place) })],
    ['oversized response', () => Response.json({ padding: 'x'.repeat(1_000_000) })]
  ])('rejects %s', async (_, responseFactory) => {
    fetchMock.mockResolvedValue(responseFactory())
    const response = await handleRequest(request('/locations?q=Berlin'), env)
    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({ error: { code: 'upstream_invalid' } })
    expect(vi.mocked(console.error).mock.calls[0]?.[0]).toMatchObject({
      event: 'request', upstream_outcome: 'invalid', upstream_ms: expect.any(Number)
    })
  })

  it('rejects malformed forecasts', async () => {
    fetchMock.mockResolvedValue(Response.json({ ...weather, hourly: { ...weather.hourly, time: [] } }))
    expect((await handleRequest(request('/weather?latitude=0&longitude=0'), env)).status).toBe(502)
  })

  it('maps interrupted body streams to a safe provider error', async () => {
    fetchMock.mockResolvedValue(new Response(new ReadableStream({
      start(controller) { controller.error(new Error('private stream failure')) }
    }), { headers: { 'Content-Type': 'application/json' } }))
    const response = await handleRequest(request('/locations?q=Berlin'), env)
    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({ error: { code: 'upstream_invalid' } })
  })

  it.each(['headers', 'body'])('bounds timeout including stalled %s', async (stage) => {
    vi.useFakeTimers()
    if (stage === 'headers') fetchMock.mockImplementation(() => new Promise(() => {}))
    else fetchMock.mockResolvedValue(new Response(new ReadableStream(), { headers: { 'Content-Type': 'application/json' } }))
    const pending = handleRequest(request('/locations?q=Berlin'), env)
    await vi.advanceTimersByTimeAsync(UPSTREAM_TIMEOUT_MS - 1)
    const signal = fetchMock.mock.calls[0]![1]!.signal
    expect(signal?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    const response = await pending
    expect(response.status).toBe(504)
    expect(await response.json()).toMatchObject({ error: { code: 'upstream_timeout' } })
    expect(vi.mocked(console.error).mock.calls[0]?.[0]).toMatchObject({
      event: 'request', upstream_outcome: 'timeout', upstream_ms: expect.any(Number)
    })
    expect(signal?.aborted).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

const withCf = (path: string, cf: unknown, init?: RequestInit) => {
  const incoming = request(path, init)
  Object.defineProperty(incoming, 'cf', { value: cf })
  return incoming
}
const berlinCf = { city: 'Berlin', region: 'Land Berlin', country: 'DE', latitude: '52.52437', longitude: '13.41053', asn: 64496 }

describe('IP location', () => {
  it('maps Cloudflare edge geolocation to the app IP location contract without upstream calls', async () => {
    const response = await handleRequest(withCf('/ip-location', berlinCf, { headers: { 'CF-Connecting-IP': '192.0.2.1' } }), env)
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toEqual({ name: 'Berlin', region: 'Land Berlin', country: 'DE', latitude: 52.52437, longitude: 13.41053 })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(clientLimit).toHaveBeenCalledWith({ key: '192.0.2.1' })
    expect(upstreamLimit).not.toHaveBeenCalled()
  })

  it('returns empty labels when only coordinates are known', async () => {
    const response = await handleRequest(withCf('/ip-location', { latitude: '-33.9', longitude: '151.2', city: ' ' }), env)
    expect(await response.json()).toEqual({ name: '', country: '', latitude: -33.9, longitude: 151.2 })
  })

  it.each([
    ['no cf object', undefined],
    ['missing coordinates', { city: 'Berlin', country: 'DE' }],
    ['missing longitude', { latitude: '52.5' }],
    ['numeric coordinates', { latitude: 52.5, longitude: 13.4 }],
    ['out-of-range coordinates', { latitude: '91', longitude: '0' }],
    ['non-decimal coordinates', { latitude: 'NaN', longitude: '1e2' }]
  ])('fails safely with %s and never logs location data', async (_, cf) => {
    const response = await handleRequest(withCf('/ip-location', cf, { headers: { 'CF-Connecting-IP': '192.0.2.1' } }), env)
    expect(response.status).toBe(503)
    const body = await response.text()
    expect(JSON.parse(body)).toMatchObject({ error: { code: 'ip_location_unavailable' } })
    expect(body).not.toMatch(/192\.0\.2\.1|Berlin|52\.5/)
    const summary = vi.mocked(console.error).mock.calls[0]?.[0]
    expect(summary).toMatchObject({
      event: 'request', route: '/ip-location', code: 'ip_location_unavailable', status: 503,
      upstream_outcome: 'none', upstream_ms: null
    })
  })

  it('is rate limited and fails closed per client', async () => {
    clientLimit.mockResolvedValue({ success: false })
    expect((await handleRequest(withCf('/ip-location', berlinCf), env)).status).toBe(429)
    clientLimit.mockRejectedValue(new Error('private binding detail'))
    expect((await handleRequest(withCf('/ip-location', berlinCf), env)).status).toBe(503)
  })

  it('allows only the production browser origin', async () => {
    const allowed = await handleRequest(withCf('/ip-location', berlinCf, { headers: { Origin: 'https://weather.mohrworks.com' } }), env)
    expect(allowed.status).toBe(200)
    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe('https://weather.mohrworks.com')
    const denied = await handleRequest(withCf('/ip-location', berlinCf, { headers: { Origin: 'https://evil.example' } }), env)
    expect(denied.status).toBe(403)
    expect(clientLimit).toHaveBeenCalledTimes(1)
  })
})

describe('Abuse protection and CORS', () => {
  it.each([
    ['client', '/locations?q=Berlin'], ['aggregate', '/locations?q=Berlin'],
    ['client', '/locations/2950159?language=de'], ['aggregate', '/locations/2950159?language=de']
  ])('rejects exhausted %s limiter before upstream fetch for %s', async (limiter, path) => {
    (limiter === 'client' ? clientLimit : upstreamLimit).mockResolvedValue({ success: false })
    const response = await handleRequest(request(path), env)
    expect(response.status).toBe(429)
    expect(await response.json()).toMatchObject({ error: { code: 'rate_limited' } })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('exposes the rate-limit cooldown only to the allowed browser origin', async () => {
    clientLimit.mockResolvedValue({ success: false })
    const allowed = await handleRequest(request('/locations?q=Berlin', {
      headers: { Origin: 'https://weather.mohrworks.com' }
    }), env)
    expect(allowed.status).toBe(429)
    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe('https://weather.mohrworks.com')
    expect(allowed.headers.get('Access-Control-Expose-Headers')).toBe('Retry-After')
    expect(allowed.headers.get('Retry-After')).toBe('60')
    expect(allowed.headers.get('Vary')).toBe('Origin')
    expect(allowed.headers.get('Cache-Control')).toBe('no-store')

    const denied = await handleRequest(request('/locations?q=Berlin', {
      headers: { Origin: 'https://evil.example' }
    }), env)
    expect(denied.status).toBe(403)
    expect(denied.headers.has('Access-Control-Allow-Origin')).toBe(false)
    expect(denied.headers.has('Access-Control-Expose-Headers')).toBe(false)
    expect(denied.headers.get('Vary')).toBe('Origin')
    expect(denied.headers.get('Cache-Control')).toBe('no-store')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fails closed when a limiter errors or bindings are missing', async () => {
    clientLimit.mockRejectedValue(new Error('private binding detail'))
    expect((await handleRequest(request('/locations?q=Berlin'), env)).status).toBe(503)
    expect((await handleRequest(request('/locations?q=Berlin'), {} as Env)).status).toBe(503)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fails closed when the aggregate limiter is unavailable', async () => {
    upstreamLimit.mockRejectedValue(new Error('private binding detail'))
    const response = await handleRequest(request('/locations?q=Berlin'), env)
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ error: { code: 'rate_limit_unavailable' } })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('uses the Cloudflare client IP, with a shared anonymous bucket when absent', async () => {
    fetchMock.mockResolvedValue(Response.json({}))
    await handleRequest(request('/locations?q=Berlin', { headers: { 'CF-Connecting-IP': '192.0.2.1', 'X-Forwarded-For': 'untrusted' } }), env)
    expect(clientLimit).toHaveBeenLastCalledWith({ key: '192.0.2.1' })
    await handleRequest(request('/locations?q=Berlin'), env)
    expect(clientLimit).toHaveBeenLastCalledWith({ key: 'anonymous' })
    expect(upstreamLimit).toHaveBeenLastCalledWith({ key: 'all-provider-requests' })
  })

  it('allows only the production browser origin, including safe error responses', async () => {
    const allowed = await handleRequest(request('/locations', { headers: { Origin: 'https://weather.mohrworks.com' } }), env)
    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe('https://weather.mohrworks.com')
    expect(allowed.headers.has('Access-Control-Allow-Credentials')).toBe(false)
    for (const origin of ['https://evil.example', 'null', 'http://localhost:3000']) {
      for (const path of ['/locations?q=Berlin', '/locations/2950159?language=de']) {
        const response = await handleRequest(request(path, { headers: { Origin: origin } }), env)
        expect(response.status).toBe(403)
        expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false)
      }
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('allows GET preflight only, without upstream or limiter calls', async () => {
    const headers = { Origin: 'https://weather.mohrworks.com', 'Access-Control-Request-Method': 'GET' }
    const response = await handleRequest(request('/weather', { method: 'OPTIONS', headers }), env)
    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET')
    for (const path of ['/locations/2950159', '/ip-location']) {
      expect((await handleRequest(request(path, { method: 'OPTIONS', headers }), env)).status).toBe(204)
    }
    expect((await handleRequest(request('/weather', { method: 'OPTIONS', headers: { ...headers, 'Access-Control-Request-Method': 'POST' } }), env)).status).toBe(403)
    expect((await handleRequest(request('/weather', { method: 'OPTIONS', headers: { ...headers, 'Access-Control-Request-Headers': 'Authorization' } }), env)).status).toBe(403)
    expect(clientLimit).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
